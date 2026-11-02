import { createHash } from "node:crypto";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { fold1 } from "../gate/sealed-format.js";

const TEXT = new Set([
  "html", "htm", "css", "js", "mjs", "cjs", "json", "txt", "xml", "svg", "md", "map", "webmanifest", "csv",
  "rss", "atom", "vtt", "srt", "ics",
]);
const BINARY = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "tif", "tiff", "ico", "bmp",
  "woff", "woff2", "ttf", "otf", "eot", "pdf",
  "mp3", "mp4", "m4v", "mov", "mkv", "webm", "ogg", "wav", "m4a", "aac", "flac",
  "wasm", "zip", "sealed",
]);
const RUN = 8;
// Scripts written without spaces: one "token" can hold a whole sentence, so these match inside tokens.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

export interface Target {
  /** How the report names it. Never the secret itself. */
  label: string;
  text: string;
}

export interface ScanInput {
  root: string;
  /** Files about to be written, checked as if they were already there. */
  staged: { file: string; text: string }[];
  targets: Target[];
  /** Checked as 8-token windows, or whole if shorter, and reported once per file. */
  payloads: Target[];
  allowPublic: string[];
  /** Secret source files: a public copy aborts. */
  sealed: { label: string; bytes: Uint8Array }[];
}

export interface ScanResult {
  aborts: string[];
  warns: string[];
  allowed: string[];
  counts: { text: number; compressed: number; binary: number };
}

const tokensOf = (folded: string) => [...folded.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => match[0]);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Linear on purpose: `/<[^>]*>/` goes quadratic on a `<` with no `>` after it. */
function stripTags(text: string, gap: string): string {
  let out = "";
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf("<", at);
    if (open === -1) break;
    const close = text.indexOf(">", open);
    if (close === -1) break;
    out += text.slice(at, open) + gap;
    at = close + 1;
  }
  return out + text.slice(at);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Undoes the escapes that hide text in JSON, source maps, scripts, URLs and HTML. */
function decodeEscapes(text: string): string {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[nrt]/g, " ")
    .replace(/\\(["'/\\])/g, "$1")
    .replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
      try {
        return decodeURIComponent(run);
      } catch {
        return run;
      }
    })
    .replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-z]+));/gi, (whole, dec?: string, hex?: string, name?: string) => {
      if (dec || hex) {
        const code = dec ? parseInt(dec, 10) : parseInt(hex!, 16);
        return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[name!.toLowerCase()] ?? whole;
    });
}

/** One view of a file: its folded text, and its tokens indexed for sequence lookup. */
class View {
  readonly folded: string;
  readonly #tokens: string[];
  readonly #where = new Map<string, number[]>();

  constructor(text: string) {
    this.folded = fold1(text);
    this.#tokens = tokensOf(this.folded);
    this.#tokens.forEach((token, index) => {
      const list = this.#where.get(token);
      if (list) list.push(index);
      else this.#where.set(token, [index]);
    });
  }

  has(needle: string[]): boolean {
    return (this.#where.get(needle[0]!) ?? []).some((start) => needle.every((token, offset) => this.#tokens[start + offset] === token));
  }
}

function viewsOf(text: string): View[] {
  const decoded = decodeEscapes(text);
  const bases = decoded === text ? [text] : [text, decoded];
  return bases.flatMap((base) => [new View(base), new View(stripTags(base, "")), new View(stripTags(base, " "))]);
}

function runsOf(text: string): string[][] {
  const tokens = tokensOf(fold1(stripTags(text, " ")));
  if (tokens.length <= RUN) return tokens.length > 0 ? [tokens] : [];
  return tokens.slice(0, tokens.length - RUN + 1).map((_, index) => tokens.slice(index, index + RUN));
}

/** One rule: a hit of 3+ tokens or 16+ characters aborts; a shorter hit warns. */
export function scan(input: ScanInput): ScanResult {
  const result: ScanResult = { aborts: [], warns: [], allowed: [], counts: { text: 0, compressed: 0, binary: 0 } };
  const allow = new Set(input.allowPublic.map(fold1));
  const allowedTokens = new Set(input.allowPublic.map((item) => tokensOf(fold1(item)).join(" ")));

  const needles = input.targets.flatMap((target) => {
    const folded = fold1(target.text);
    if (allow.has(folded)) {
      result.allowed.push(target.label);
      return [];
    }
    return [{ label: target.label, folded, tokens: tokensOf(folded) }];
  });
  const payloads = input.payloads.flatMap((payload) => {
    if (allow.has(fold1(payload.text))) {
      result.allowed.push(payload.label);
      return [];
    }
    return [{ label: payload.label, runs: runsOf(payload.text).filter((run) => !allowedTokens.has(run.join(" "))) }];
  });

  const sealedSizes = new Set(input.sealed.map((item) => item.bytes.length));
  const sealedHashes = new Map(input.sealed.map((item) => [sha256(item.bytes), item.label]));

  // Each file is checked and dropped here, so a large site stays in memory one file at a time.
  const check = (file: string, text: string) => {
    const views = viewsOf(text);
    const found = (tokens: string[]) => views.some((view) => view.has(tokens));
    const report = (label: string, aborts: boolean) => (aborts ? result.aborts : result.warns).push(`${label} appears in ${file}`);

    for (const needle of needles) {
      // No tokens to match (symbols, emoji), or written without spaces: match the text itself.
      const substring = needle.tokens.length === 0 || UNSPACED.test(needle.folded);
      const hit = (needle.tokens.length > 0 && found(needle.tokens)) || (substring && views.some((view) => view.folded.includes(needle.folded)));
      if (hit) report(needle.label, needle.tokens.length >= 3 || needle.folded.length >= 16);
    }
    for (const payload of payloads) {
      const run = payload.runs.find(found);
      if (run) report(payload.label, run.length >= 3 || run.join(" ").length >= 16);
    }
    if (/<web-threshold\b[^>]{0,500}\bsealed\b/.test(text) && /<script\b[^>]{0,500}\bsrc\s*=\s*["']?(https?:)?\/\//i.test(text)) {
      result.warns.push(`${file} loads an external script beside a sealed gate; that script can see phrases and content`);
    }
  };

  const visit = (path: string, seen: Set<string>): void => {
    const file = relative(input.root, path);
    let size: number;
    try {
      const stat = statSync(path); // follows symlinks: their targets are published too
      if (stat.isDirectory()) {
        const real = realpathSync(path);
        if (seen.has(real)) return;
        seen.add(real);
        for (const name of readdirSync(path)) visit(join(path, name), seen);
        return;
      }
      size = stat.size;
    } catch (err) {
      result.aborts.push(`${file} can't be read (${(err as NodeJS.ErrnoException).code ?? "error"}), so it can't be checked`);
      return;
    }

    const ext = extname(path).slice(1).toLowerCase();
    const isText = TEXT.has(ext) || ext === "";
    const isCompressed = ext === "gz" || ext === "br";
    if (!isText && !isCompressed && !BINARY.has(ext)) {
      result.aborts.push(`${file} has an unknown file type, so it can't be checked`);
      return;
    }

    try {
      // Only a file the same size as a secret can be a copy of it, so a huge video is never read.
      const bytes = isText || isCompressed || sealedSizes.has(size) ? readFileSync(path) : null;
      const copied = bytes && sealedSizes.has(size) ? sealedHashes.get(sha256(bytes)) : undefined;
      if (copied) result.aborts.push(`${file} is a public copy of ${copied}`);

      if (isCompressed) {
        result.counts.compressed++;
        check(file, (ext === "gz" ? gunzipSync(bytes!) : brotliDecompressSync(bytes!)).toString("utf8"));
      } else if (isText) {
        result.counts.text++;
        check(file, bytes!.toString("utf8"));
      } else {
        result.counts.binary++;
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "error";
      result.aborts.push(`${file} can't be read or decompressed (${code}), so it can't be checked`);
    }
  };

  visit(input.root, new Set());
  for (const staged of input.staged) check(staged.file, staged.text);
  return result;
}
