#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _tokens, _where;
import { statSync, realpathSync, readdirSync, readFileSync, existsSync, renameSync, lstatSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { relative, join, extname, dirname, resolve, sep, isAbsolute, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync, brotliDecompressSync } from "node:zlib";
const catalogue = [
  {
    name: "GPTBot",
    kind: "ai-training"
  },
  {
    name: "ClaudeBot",
    kind: "ai-training"
  },
  {
    name: "anthropic-ai",
    kind: "ai-training"
  },
  {
    name: "Google-Extended",
    kind: "ai-training"
  },
  {
    name: "Google-CloudVertexBot",
    kind: "ai-training"
  },
  {
    name: "Applebot-Extended",
    kind: "ai-training"
  },
  {
    name: "meta-externalagent",
    kind: "ai-training"
  },
  {
    name: "FacebookBot",
    kind: "ai-training"
  },
  {
    name: "CCBot",
    kind: "ai-training"
  },
  {
    name: "Bytespider",
    kind: "ai-training"
  },
  {
    name: "TikTokSpider",
    kind: "ai-training"
  },
  {
    name: "cohere-training-data-crawler",
    kind: "ai-training"
  },
  {
    name: "DeepSeekBot",
    kind: "ai-training"
  },
  {
    name: "AI2Bot",
    kind: "ai-training"
  },
  {
    name: "PanguBot",
    kind: "ai-training"
  },
  {
    name: "Timpibot",
    kind: "ai-training"
  },
  {
    name: "ImagesiftBot",
    kind: "ai-training"
  },
  {
    name: "Webzio-Extended",
    kind: "ai-training"
  },
  {
    name: "OAI-SearchBot",
    kind: "ai-search"
  },
  {
    name: "Claude-SearchBot",
    kind: "ai-search"
  },
  {
    name: "PerplexityBot",
    kind: "ai-search"
  },
  {
    name: "Amzn-SearchBot",
    kind: "ai-search"
  },
  {
    name: "AzureAI-SearchBot",
    kind: "ai-search"
  },
  {
    name: "ExaSearchBot",
    kind: "ai-search"
  },
  {
    name: "GrokBot",
    kind: "ai-search"
  },
  {
    name: "Kimi-SearchBot",
    kind: "ai-search"
  },
  {
    name: "YouBot",
    kind: "ai-search"
  },
  {
    name: "ChatGPT-User",
    kind: "ai-user"
  },
  {
    name: "Claude-User",
    kind: "ai-user"
  },
  {
    name: "Perplexity-User",
    kind: "ai-user"
  },
  {
    name: "MistralAI-User",
    kind: "ai-user"
  },
  {
    name: "meta-externalfetcher",
    kind: "ai-user"
  },
  {
    name: "Amzn-User",
    kind: "ai-user"
  },
  {
    name: "Kimi-User",
    kind: "ai-user"
  },
  {
    name: "Manus-User",
    kind: "ai-user"
  },
  {
    name: "kagi-fetcher",
    kind: "ai-user"
  },
  {
    name: "Googlebot",
    kind: "search-engine"
  },
  {
    name: "Bingbot",
    kind: "search-engine"
  },
  {
    name: "Applebot",
    kind: "search-engine"
  },
  {
    name: "DuckDuckBot",
    kind: "search-engine"
  },
  {
    name: "Bravebot",
    kind: "search-engine"
  },
  {
    name: "YandexBot",
    kind: "search-engine"
  },
  {
    name: "Baiduspider",
    kind: "search-engine"
  }
];
const BOTS = catalogue;
const BLOCKED_KINDS = {
  open: [],
  "block-ai-training": ["ai-training"],
  "block-all-ai": ["ai-training", "ai-search"],
  "search-engines-only": ["ai-training", "ai-search", "ai-user"]
};
class ThresholdConfigError extends Error {
  constructor() {
    super(...arguments);
    __publicField(this, "name", "ThresholdConfigError");
  }
}
function hasStarGroup(extra) {
  return directives(extra).some((d) => /^user-agent\s*:\s*\*$/i.test(d));
}
function directives(text) {
  return text.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean);
}
function canonicalNames(field, names, errors) {
  if (names === void 0) return [];
  if (!Array.isArray(names)) {
    errors.push(`bots.${field} must be a list of bot names`);
    return [];
  }
  const found = [];
  for (const name of names) {
    const bot = BOTS.find((b) => b.name.toLowerCase() === String(name).toLowerCase());
    if (bot) found.push(bot.name);
    else errors.push(`bots.${field}: "${String(name)}" is not in the catalogue; add it through extra as its own group`);
  }
  return found;
}
function unknownKeys$1(where, value, known, errors) {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) errors.push(`unknown key ${where}${key}`);
  }
}
function resolvePolicy(config) {
  const errors = [];
  if (typeof config !== "object" || config === null) {
    throw new ThresholdConfigError("the config must be an object");
  }
  const { bots, extra } = config;
  unknownKeys$1("", config, ["bots", "extra"], errors);
  if (typeof bots !== "object" || bots === null) {
    errors.push("bots.preset is required");
    throw new ThresholdConfigError(errors.join("\n"));
  }
  unknownKeys$1("bots.", bots, ["preset", "allow", "block"], errors);
  const raw = bots;
  const preset = raw.preset;
  if (raw.preset === void 0) errors.push("bots.preset is required");
  else if (!Object.keys(BLOCKED_KINDS).includes(String(raw.preset))) {
    errors.push(`unknown preset "${String(raw.preset)}"; use ${Object.keys(BLOCKED_KINDS).join(", ")}`);
  }
  const allow = canonicalNames("allow", raw.allow, errors);
  const block = canonicalNames("block", raw.block, errors);
  for (const name of allow) {
    if (block.includes(name)) errors.push(`"${name}" is in both bots.allow and bots.block`);
  }
  if (extra !== void 0) {
    if (typeof extra !== "string") {
      errors.push("extra must be a string");
    } else {
      const first = directives(extra).find((d) => !/^sitemap\s*:/i.test(d));
      if (first !== void 0 && !/^user-agent\s*:/i.test(first)) {
        errors.push(`extra must start its rules with a User-agent line, not "${first}"`);
      }
      if (preset === "search-engines-only" && hasStarGroup(extra)) {
        errors.push("extra can't have a User-agent: * group under search-engines-only");
      }
    }
  }
  if (errors.length > 0) throw new ThresholdConfigError(errors.join("\n"));
  const kinds = BLOCKED_KINDS[preset];
  const inPreset = BOTS.filter((b) => kinds.includes(b.kind)).map((b) => b.name);
  const blocked = [.../* @__PURE__ */ new Set([...inPreset, ...block])].filter((name) => !allow.includes(name));
  const allowed = preset === "search-engines-only" ? [.../* @__PURE__ */ new Set([...BOTS.filter((b) => b.kind === "search-engine").map((b) => b.name), ...allow])].filter(
    (name) => !block.includes(name)
  ) : [];
  return { preset, blocked, allowed, extra };
}
const GENERATED_HEADER = "# Generated by web-threshold";
function group(names, rule) {
  return [...names.map((name) => `User-agent: ${name}`), rule].join("\n");
}
function generateRobots(config) {
  const { preset, blocked, allowed, extra } = resolvePolicy(config);
  const groups = [];
  if (preset === "search-engines-only") {
    groups.push(group(["*"], "Disallow: /"));
    if (allowed.length > 0) groups.push(group(allowed, "Allow: /"));
  } else if (preset === "open" && !(extra !== void 0 && hasStarGroup(extra))) {
    groups.push(group(["*"], "Allow: /"));
  }
  if (preset !== "search-engines-only" && blocked.length > 0) {
    groups.push(group(blocked, "Disallow: /"));
  }
  const generated = groups.join("\n\n");
  if (extra === void 0) return `${GENERATED_HEADER}
${generated}
`;
  return generated ? `${GENERATED_HEADER}
${generated}

${extra}` : `${GENERATED_HEADER}
${extra}`;
}
const ITERATIONS = 6e5;
const MAX_ITERATIONS = 5e6;
const NORM = "fold1";
const PAD_TO = 256;
class BundleError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function fold1(text) {
  return text.normalize("NFD").replace(new RegExp("\\p{M}", "gu"), "").normalize("NFC").replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/\s+/g, " ").trim().toLowerCase();
}
function toB64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64(text) {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}
const buffer = (bytes) => bytes;
const aes = (raw) => crypto.subtle.importKey("raw", buffer(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
async function deriveKek(phrase, salt, iterations) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(fold1(phrase)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: buffer(salt), iterations }, material, 256);
  return new Uint8Array(bits);
}
async function encrypt(key, plain) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buffer(iv) }, await aes(key), buffer(plain));
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}
async function decrypt(key, sealed) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buffer(fromB64(sealed.iv)) },
    await aes(key),
    buffer(fromB64(sealed.ct))
  );
  return new Uint8Array(plain);
}
async function openEntry(entry, readFile) {
  if (typeof entry.src !== "string" || typeof entry.iv !== "string") throw new BundleError("payload-missing");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buffer(fromB64(entry.iv)) },
    await aes(fromB64(entry.k)),
    buffer(await readFile(entry.src))
  );
  return new Uint8Array(plain);
}
function padRecord(record) {
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / PAD_TO) * PAD_TO).fill(32);
  padded.set(bytes);
  return padded;
}
async function openSlots(bundle, kek) {
  const records = [];
  for (const slot of bundle.slots) {
    try {
      records.push(JSON.parse(new TextDecoder().decode(await decrypt(kek, slot))));
    } catch {
    }
  }
  return records;
}
const isB64 = (value) => typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);
const isSealed = (item) => isB64(item == null ? void 0 : item.iv) && isB64(item == null ? void 0 : item.ct);
function parseBundle(value) {
  const bundle = value;
  if (typeof bundle !== "object" || bundle === null) throw new BundleError("malformed-bundle");
  if (bundle.v !== 1) throw new BundleError("unsupported-version");
  const kdf = bundle.kdf;
  if (typeof kdf !== "object" || kdf === null || typeof kdf.salt !== "string") throw new BundleError("malformed-bundle");
  if (kdf.norm !== NORM) throw new BundleError("unsupported-norm");
  if (!Number.isInteger(kdf.iter) || kdf.iter < 1) throw new BundleError("malformed-bundle");
  if (kdf.iter > MAX_ITERATIONS) throw new BundleError("iterations-over-ceiling");
  if (!isB64(kdf.salt)) throw new BundleError("malformed-bundle");
  if (!Array.isArray(bundle.slots) || !bundle.slots.every(isSealed)) throw new BundleError("malformed-bundle");
  return bundle;
}
const TEXT = /* @__PURE__ */ new Set([
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "cjs",
  "json",
  "txt",
  "xml",
  "svg",
  "md",
  "map",
  "webmanifest",
  "csv",
  "rss",
  "atom",
  "vtt",
  "srt",
  "ics"
]);
const BINARY = /* @__PURE__ */ new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "heic",
  "tif",
  "tiff",
  "ico",
  "bmp",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "pdf",
  "mp3",
  "mp4",
  "m4v",
  "mov",
  "mkv",
  "webm",
  "ogg",
  "wav",
  "m4a",
  "aac",
  "flac",
  "wasm",
  "zip",
  "sealed"
]);
const RUN = 8;
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const tokensOf = (folded) => [...folded.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => match[0]);
const EXTERNAL_SCRIPT = /<script\b[^>]{0,500}\bsrc\s*=\s*["']?(https?:)?\/\//i;
const INVISIBLE = /[­​-‍⁠﻿]/g;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function stripTags(text, gap) {
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
function withoutCode(text) {
  var _a;
  const lower = text.toLowerCase();
  const opening = /<(script|style)(?=[\s>])/g;
  let out = "";
  let at = 0;
  for (let match = opening.exec(lower); match; match = opening.exec(lower)) {
    const tagEnd = lower.indexOf(">", match.index);
    if (tagEnd === -1) break;
    if (match[1] === "script") {
      const type = (_a = /\btype\s*=\s*["']?([^"'\s>]+)/.exec(lower.slice(match.index, tagEnd))) == null ? void 0 : _a[1];
      if (type && type !== "module" && !type.includes("javascript")) continue;
    }
    const end = lower.indexOf(`</${match[1]}`, tagEnd);
    if (end === -1) break;
    out += `${text.slice(at, match.index)} `;
    const close = lower.indexOf(">", end);
    at = close === -1 ? text.length : close + 1;
    opening.lastIndex = at;
  }
  return out + text.slice(at);
}
function attributeTexts(text) {
  const values = text.matchAll(/\b(?:alt|title|content|aria-label|placeholder|value)\s*=\s*(?:"([^"]{1,5000})"|'([^']{1,5000})')/gi);
  return [...values].map((match) => match[1] ?? match[2] ?? "").filter((value) => tokensOf(fold1(value)).length >= RUN);
}
const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  szlig: "ß",
  aelig: "æ",
  oelig: "œ",
  oslash: "ø",
  eth: "ð",
  thorn: "þ"
};
const ACCENTED = /^([a-z])(acute|grave|circ|tilde|uml|ring|cedil|caron)$/i;
const codePoint = (whole, code) => code <= 1114111 ? String.fromCodePoint(code) : whole;
function decodeEscapes(text) {
  return text.replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (whole, hex) => codePoint(whole, parseInt(hex, 16))).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\[nrt]/g, " ").replace(/\\(["'/\\])/g, "$1").replace(/(?:%[0-9a-fA-F]{2})+/g, (run2) => {
    try {
      return decodeURIComponent(run2);
    } catch {
      return run2;
    }
  }).replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-z]+));/gi, (whole, dec, hex, name) => {
    var _a;
    if (dec || hex) return codePoint(whole, dec ? parseInt(dec, 10) : parseInt(hex, 16));
    return ENTITIES[name.toLowerCase()] ?? ((_a = ACCENTED.exec(name)) == null ? void 0 : _a[1]) ?? whole;
  });
}
class View {
  constructor(text) {
    __publicField(this, "folded");
    __privateAdd(this, _tokens);
    __privateAdd(this, _where, /* @__PURE__ */ new Map());
    this.folded = fold1(text.replace(INVISIBLE, ""));
    __privateSet(this, _tokens, tokensOf(this.folded));
    __privateGet(this, _tokens).forEach((token, index) => {
      const list = __privateGet(this, _where).get(token);
      if (list) list.push(index);
      else __privateGet(this, _where).set(token, [index]);
    });
  }
  has(needle) {
    return (__privateGet(this, _where).get(needle[0]) ?? []).some((start) => needle.every((token, offset) => __privateGet(this, _tokens)[start + offset] === token));
  }
  /** Every run of `length` tokens, joined by spaces. */
  *runs(length) {
    for (let index = 0; index + length <= __privateGet(this, _tokens).length; index++) yield __privateGet(this, _tokens).slice(index, index + length).join(" ");
  }
}
_tokens = new WeakMap();
_where = new WeakMap();
function viewsOf(text) {
  const decoded = decodeEscapes(text);
  const bases = decoded === text ? [text] : [text, decoded];
  return bases.flatMap((base) => [new View(base), new View(stripTags(base, "")), new View(stripTags(base, " "))]);
}
function windows(tokens) {
  if (tokens.length <= RUN) return tokens.length > 0 ? [tokens] : [];
  const step = tokens.length > 2e4 ? RUN : 1;
  const runs = [];
  for (let index = 0; index + RUN <= tokens.length; index += step) runs.push(tokens.slice(index, index + RUN));
  return runs;
}
function runsOf(text, markup) {
  const decoded = decodeEscapes(text).replace(INVISIBLE, "");
  return (decoded === text ? [text] : [text, decoded]).flatMap(
    (base) => markup ? [
      ...windows(tokensOf(fold1(stripTags(withoutCode(base), " ")))),
      ...attributeTexts(base).flatMap((value) => windows(tokensOf(fold1(value))))
    ] : windows(tokensOf(fold1(base)))
  );
}
function scan(input) {
  const result = { aborts: [], warns: [], allowed: [], counts: { text: 0, compressed: 0, binary: 0 } };
  const allow = new Set(input.allowPublic.map(fold1));
  const allowedTokens = input.allowPublic.map((item) => tokensOf(fold1(item)).join(" ")).filter(Boolean);
  const runAllowed = (run2) => allowedTokens.some((entry) => ` ${entry} `.includes(` ${run2.join(" ")} `));
  const pathAllowed = (tokens) => allowedTokens.some((entry) => tokens === entry || tokens.startsWith(`${entry} `) || entry.startsWith(`${tokens} `));
  const needles = input.targets.flatMap((target) => {
    const folded = fold1(target.text);
    if (!folded) return [];
    if (allow.has(folded) || target.path && pathAllowed(tokensOf(folded).join(" "))) {
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
    return [{ label: payload.label, runs: runsOf(payload.text, payload.markup ?? false).filter((run2) => !runAllowed(run2)) }];
  });
  const runIndex = /* @__PURE__ */ new Map();
  payloads.forEach((payload, owner) => {
    for (const run2 of payload.runs) {
      const byText = runIndex.get(run2.length) ?? runIndex.set(run2.length, /* @__PURE__ */ new Map()).get(run2.length);
      const key = run2.join(" ");
      (byText.get(key) ?? byText.set(key, /* @__PURE__ */ new Set()).get(key)).add(owner);
    }
  });
  const sealedSizes = new Set(input.sealed.map((item) => item.bytes.length));
  const sealedHashes = new Map(input.sealed.map((item) => [sha256(item.bytes), item.label]));
  const check = (file, text) => {
    const views = viewsOf(text);
    const found = (tokens) => views.some((view) => view.has(tokens));
    const report = (label, aborts) => (aborts ? result.aborts : result.warns).push(`${label} appears in ${file}`);
    for (const needle of needles) {
      const substring = needle.tokens.length === 0 || UNSPACED.test(needle.folded);
      const hit = needle.tokens.length > 0 && found(needle.tokens) || substring && views.some((view) => view.folded.includes(needle.folded));
      if (hit) report(needle.label, needle.tokens.length >= 3 || needle.folded.length >= 16);
    }
    const hits = /* @__PURE__ */ new Map();
    for (const [length, byText] of runIndex) {
      for (const view of views) {
        for (const run2 of view.runs(length)) {
          for (const owner of byText.get(run2) ?? []) hits.set(owner, hits.get(owner) === true || length >= 3 || run2.length >= 16);
        }
      }
    }
    for (const [owner, aborts] of hits) report(payloads[owner].label, aborts);
    if (/<web-threshold\b[^>]{0,500}\bsealed\b/.test(text) && EXTERNAL_SCRIPT.test(text)) {
      result.warns.push(`${file} loads an external script beside a sealed gate; that script can see phrases and content`);
    }
  };
  const replaced = new Set(input.replaced ?? []);
  const visit = (path, seen) => {
    const file = relative(input.root, path);
    if (replaced.has(file)) return;
    let size;
    try {
      const stat = statSync(path);
      if (stat.isDirectory()) {
        const real2 = realpathSync(path);
        if (seen.has(real2)) return;
        seen.add(real2);
        for (const name of readdirSync(path)) visit(join(path, name), seen);
        return;
      }
      size = stat.size;
    } catch (err) {
      result.aborts.push(`${file} can't be read (${err.code ?? "error"}), so it can't be checked`);
      return;
    }
    const ext = extname(path).slice(1).toLowerCase();
    const isText = TEXT.has(ext) || ext === "";
    const isCompressed = ext === "gz" || ext === "br";
    if (!isText && !isCompressed && !BINARY.has(ext)) {
      result.aborts.push(`${file} has an unknown file type, so it can't be checked`);
      return;
    }
    check(`a file name in ${dirname(file) === "." ? "the top folder" : dirname(file)}`, file);
    try {
      const bytes = isText || isCompressed || sealedSizes.has(size) ? readFileSync(path) : null;
      const copied = bytes && sealedSizes.has(size) ? sealedHashes.get(sha256(bytes)) : void 0;
      if (copied) result.aborts.push(`${file} is a public copy of ${copied}`);
      if (isCompressed) {
        result.counts.compressed++;
        const inner = ext === "gz" ? gunzipSync(bytes) : brotliDecompressSync(bytes);
        const packed = sealedSizes.has(inner.length) ? sealedHashes.get(sha256(inner)) : void 0;
        if (packed) result.aborts.push(`${file} is a compressed public copy of ${packed}`);
        check(file, inner.toString("utf8"));
      } else if (isText) {
        result.counts.text++;
        check(file, bytes.toString("utf8"));
      } else {
        result.counts.binary++;
      }
    } catch (err) {
      const code = err.code ?? "error";
      result.aborts.push(`${file} can't be read or decompressed (${code}), so it can't be checked`);
    }
  };
  visit(input.root, /* @__PURE__ */ new Set());
  for (const staged of input.staged) check(staged.file, staged.text);
  return result;
}
const SHELL_MARKER = "<!--web-threshold-->";
const DEFAULT_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Enter</title>
    <style>
      body { font-family: Georgia, "Times New Roman", serif; max-width: 34rem; margin: 0 auto; padding: 4rem 1rem; background: #fff; color: #222; }
      web-threshold[busy] { opacity: 0.5; }
    </style>
  </head>
  <body>
    <noscript>This page opens with a phrase, which needs JavaScript.</noscript>
    ${SHELL_MARKER}
  </body>
</html>
`;
const HANDLER = `const gate = document.querySelector("web-threshold");
let opening = false;
gate.addEventListener("tier-unlocked", async ({ detail }) => {
  const name = gate.dataset.open;
  if (opening || !detail.names.includes(name)) return;
  opening = true;
  try {
    const html = await (await detail.open(name)).text();
    document.open();
    document.write(html);
    document.close();
  } catch {
    opening = false; // the element has emitted threshold-error, and the door can be tried again
  }
});`;
const attr = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const inScript = (text) => text.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
function buildShell(template, bundlePath, payloadName, element, remember) {
  const parts = template.split(SHELL_MARKER);
  if (parts.length !== 2) throw new Error(`the shell must contain ${SHELL_MARKER} exactly once`);
  const memory = remember ? ` remember="${attr(remember)}"` : "";
  const gate = (code) => [
    `<web-threshold sealed="${attr(bundlePath)}" data-open="${attr(payloadName)}"${memory} label="Enter the phrase" button="Enter"></web-threshold>`,
    `<script type="module">${code}
{${HANDLER}}<\/script>`
  ].join("\n");
  return {
    html: parts[0] + gate(inScript(element)) + parts[1],
    publicText: parts[0] + gate("") + parts[1]
  };
}
const asText = (bytes) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};
const saysText = (type) => type.startsWith("text/") || type.endsWith("+xml") || type.endsWith("+json") || type === "application/json";
const isMarkup = (type) => type === "text/html" || type === "application/xhtml+xml" || type.endsWith("+xml") || type === "text/xml";
const WARN_FILE = 2 * 1024 * 1024;
const MAX_FILE = 10 * 1024 * 1024;
const WARN_SLOTS = 256;
const MAX_SLOTS = 1024;
const WEAK_BELOW = 14;
const BUNDLE_PATH = join("s", "site.json");
class SealRefusal extends Error {
}
const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};
const isInside = (path, dir) => {
  const rel = relative(real(dir), real(path));
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
function unknownKeys(where, value, known, errors) {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) errors.push(`${where}: "${key}" isn't available yet, or isn't a known key`);
  }
}
function validateDoors(raw) {
  const errors = [];
  if (typeof raw !== "object" || raw === null) throw new SealRefusal("the doors file must be a JSON object");
  const file = raw;
  unknownKeys("doors file", file, ["payloads", "doors", "allowPublic", "remember"], errors);
  if (file.remember !== void 0 && file.remember !== "session") errors.push('remember can only be "session"');
  const payloads = typeof file.payloads === "object" && file.payloads !== null ? file.payloads : {};
  const seenPages = /* @__PURE__ */ new Set();
  for (const [name, payload] of Object.entries(payloads)) {
    if (typeof payload !== "object" || payload === null) {
      errors.push(`payload ${name}: must be an object`);
      continue;
    }
    unknownKeys(`payload ${name}`, payload, ["from", "type", "page"], errors);
    if (typeof payload.from !== "string" && !(payload.from === void 0 && payload.page !== void 0)) {
      errors.push(`payload ${name}: needs a "from" path, or a "page" to seal in place`);
    }
    if (typeof payload.type !== "string") errors.push(`payload ${name}: needs a "type"`);
    else if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(payload.type)) errors.push(`payload ${name}: "${payload.type}" isn't a media type`);
    else payload.type = payload.type.toLowerCase();
    if (payload.page !== void 0) {
      const segments = typeof payload.page === "string" ? payload.page.split("/") : [];
      const safe = segments.length > 0 && segments.every((part) => part !== "" && part !== "." && part !== ".." && !part.includes("\\"));
      if (!safe || !String(payload.page).endsWith(".html")) errors.push(`payload ${name}: "page" must be a relative path to an .html file inside --out`);
      else if (seenPages.has(String(payload.page).toLowerCase())) errors.push(`payload ${name}: another payload already uses that page`);
      seenPages.add(String(payload.page).toLowerCase());
      if (payload.type !== "text/html") errors.push(`payload ${name}: a page must be text/html`);
    }
  }
  const doors = Array.isArray(file.doors) ? file.doors : [];
  if (doors.length === 0) errors.push("the doors file needs at least one door");
  if (doors.length > MAX_SLOTS) errors.push(`${doors.length} doors is over the limit of ${MAX_SLOTS}`);
  const seen = /* @__PURE__ */ new Set();
  const opened = /* @__PURE__ */ new Set();
  doors.forEach((door, index) => {
    if (typeof door !== "object" || door === null) {
      errors.push(`door #${index + 1}: must be an object`);
      return;
    }
    const tier = typeof door.tier === "string" && door.tier ? door.tier : null;
    const name = tier ? `door ${tier}` : `door #${index + 1}`;
    if (!tier) errors.push(`${name}: needs a tier`);
    unknownKeys(name, door, ["tier", "phrase", "open", "data"], errors);
    const folded = typeof door.phrase === "string" ? fold1(door.phrase) : "";
    if (!folded) errors.push(`${name}: needs a phrase that isn't empty`);
    else if (seen.has(folded)) errors.push(`${name}: has the same phrase as an earlier door, once case and accents are ignored`);
    seen.add(folded);
    if (!Array.isArray(door.open)) errors.push(`${name}: needs an "open" list`);
    else {
      for (const payload of door.open) {
        if (!Object.hasOwn(payloads, String(payload))) errors.push(`${name}: opens unknown payload "${String(payload)}"`);
        opened.add(String(payload));
      }
    }
  });
  const allowPublic = file.allowPublic ?? [];
  if (!Array.isArray(allowPublic) || allowPublic.some((item) => typeof item !== "string")) {
    errors.push("allowPublic must be a list of strings");
  }
  for (const [name, payload] of Object.entries(payloads)) {
    if ((payload == null ? void 0 : payload.page) !== void 0 && !opened.has(name)) errors.push(`payload ${name}: no door opens this page, so its shell would be a dead end`);
  }
  if (errors.length > 0) throw new SealRefusal(errors.join("\n"));
  return { payloads, doors, allowPublic, ...file.remember ? { remember: file.remember } : {} };
}
function confine(out, target) {
  try {
    if (lstatSync(join(out, target)).isSymbolicLink()) throw new SealRefusal(`${target} is a symlink, and writing through it could leave --out`);
  } catch (err) {
    if (err instanceof SealRefusal) throw err;
  }
  let ancestor = dirname(join(out, target));
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (!isInside(ancestor, out)) throw new SealRefusal(`${target} would be written outside --out, through a symlink`);
  if (!statSync(ancestor).isDirectory()) throw new SealRefusal(`${target} needs a folder where ${relative(out, ancestor)} is a file`);
}
function gitState(path) {
  const file = real(path);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"].includes(key)));
  const git = (...args) => execFileSync("git", ["-C", dirname(file), ...args], { stdio: "ignore", env });
  try {
    git("rev-parse", "--is-inside-work-tree");
  } catch {
    return "not checked";
  }
  try {
    git("ls-files", "--error-unmatch", basename(file));
    return "tracked";
  } catch (err) {
    return err.status === 1 ? "untracked" : "not checked";
  }
}
async function buildBundle(file, contents) {
  const salt = randomBytes(16);
  const files = /* @__PURE__ */ new Map();
  const entries = /* @__PURE__ */ new Map();
  for (const [name, { type }] of Object.entries(file.payloads)) {
    const key = randomBytes(32);
    const sealed = await encrypt(key, contents.get(name));
    const path = `s/${toB64(randomBytes(12))}.sealed`;
    files.set(path, fromB64(sealed.ct));
    entries.set(name, { k: toB64(key), type, iv: sealed.iv, src: `/${path}` });
  }
  const slots = [];
  for (const door of file.doors) {
    const record = {
      tier: door.tier,
      open: Object.fromEntries(door.open.map((name) => [name, entries.get(name)])),
      ...door.data === void 0 ? {} : { data: door.data }
    };
    slots.push(await encrypt(await deriveKek(door.phrase, salt, ITERATIONS), padRecord(record)));
  }
  for (let index = slots.length - 1; index > 0; index--) {
    const other = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
    [slots[index], slots[other]] = [slots[other], slots[index]];
  }
  return { bundle: { v: 1, kdf: { iter: ITERATIONS, salt: toB64(salt), norm: NORM }, slots }, files };
}
const SEALED_FILE = /^s\/[A-Za-z0-9_-]+\.sealed$/;
async function verifyBundle(bundle, file, contents, files = /* @__PURE__ */ new Map()) {
  const read = /* @__PURE__ */ new Set();
  const readFile = async (src) => {
    const path = src.replace(/^\//, "");
    const bytes = files.get(path);
    if (!bytes) throw new SealRefusal(`read-back: ${src} wasn't written`);
    read.add(path);
    return bytes;
  };
  for (const path of files.keys()) {
    if (!SEALED_FILE.test(path)) throw new SealRefusal("read-back: a sealed file has an unexpected path");
  }
  const salt = fromB64(bundle.kdf.salt);
  const keys = /* @__PURE__ */ new Map();
  for (const door of file.doors) {
    const records = await openSlots(bundle, await deriveKek(door.phrase, salt, bundle.kdf.iter));
    if (records.length !== 1) throw new SealRefusal(`read-back: door ${door.tier} opened ${records.length} slots`);
    const record = records[0];
    if (record.tier !== door.tier) throw new SealRefusal(`read-back: door ${door.tier} opened another door's record`);
    if (JSON.stringify(record.data) !== JSON.stringify(door.data)) throw new SealRefusal(`read-back: door ${door.tier} has different data`);
    const opened2 = Object.keys(record.open).sort();
    if (JSON.stringify(opened2) !== JSON.stringify([...door.open].sort())) {
      throw new SealRefusal(`read-back: door ${door.tier} doesn't open exactly its declared payloads`);
    }
    for (const name of opened2) {
      const entry = record.open[name];
      const plain = await openEntry(entry, readFile);
      if (Buffer.compare(Buffer.from(plain), Buffer.from(contents.get(name))) !== 0) {
        throw new SealRefusal(`read-back: payload ${name} isn't byte-identical through door ${door.tier}`);
      }
      const owner = keys.get(entry.k);
      if (owner && owner !== name) throw new SealRefusal(`read-back: payloads ${owner} and ${name} share a key`);
      keys.set(entry.k, name);
    }
  }
  const stray = await openSlots(bundle, await deriveKek(toB64(randomBytes(24)), salt, bundle.kdf.iter));
  if (stray.length > 0) throw new SealRefusal("read-back: a random phrase opened a slot");
  const opened = new Set(file.doors.flatMap((door) => door.open));
  const unopened = Object.keys(file.payloads).filter((name) => !opened.has(name)).length;
  if (files.size > read.size + unopened) throw new SealRefusal("read-back: a sealed file no door opens");
}
function commit(out, files, rename = renameSync) {
  const staged = [];
  const cleanUp = () => {
    for (const { temp } of staged) rmSync(temp, { force: true });
  };
  try {
    for (const [path, content] of files) {
      const target = join(out, path);
      mkdirSync(dirname(target), { recursive: true });
      const temp = join(dirname(target), `.seal-${toB64(randomBytes(9))}`);
      staged.push({ temp, target });
      writeFileSync(temp, content);
    }
  } catch (err) {
    cleanUp();
    const { code, path } = err;
    throw new SealRefusal(`couldn't write ${path ? relative(out, path) : "the output"} (${code ?? "error"}). Nothing in --out was replaced`);
  }
  try {
    for (const { temp, target } of staged) rename(temp, target);
  } catch (err) {
    cleanUp();
    throw new SealRefusal(`writing stopped partway (${err.code ?? "error"}), so --out is partly sealed. Rebuild the site before sealing again`);
  }
}
async function sealInner(options, log) {
  const out = resolve(options.out);
  const doorsPath = resolve(options.doors);
  if (!existsSync(out)) throw new SealRefusal(`--out ${options.out} doesn't exist`);
  if (isInside(doorsPath, out)) throw new SealRefusal("the doors file is a secret, and it's inside --out");
  if (!existsSync(doorsPath)) throw new SealRefusal(`no doors file at ${options.doors}`);
  if (existsSync(join(out, BUNDLE_PATH))) throw new SealRefusal(`${BUNDLE_PATH} is already in --out; rebuild the site first`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(doorsPath, "utf8"));
  } catch {
    throw new SealRefusal("the doors file isn't valid JSON");
  }
  const file = validateDoors(raw);
  if (file.doors.length > WARN_SLOTS) log(`warning: ${file.doors.length} doors adds about ${Math.round(file.doors.length * 737 / 1024)} KB`);
  const contents = /* @__PURE__ */ new Map();
  const sealed = [{ label: "the doors file", bytes: readFileSync(doorsPath) }];
  const sources = [doorsPath];
  const inPlace = [];
  for (const [name, payload] of Object.entries(file.payloads)) {
    if (payload.from === void 0) inPlace.push(payload.page);
    const shown = payload.from ?? payload.page;
    const from = payload.from === void 0 ? join(out, payload.page) : resolve(dirname(doorsPath), payload.from);
    if (payload.from !== void 0 && isInside(from, out)) throw new SealRefusal(`payload ${name}: its source is inside --out`);
    if (!existsSync(from)) throw new SealRefusal(`payload ${name}: no file at ${shown}`);
    if (!statSync(from).isFile()) throw new SealRefusal(`payload ${name}: ${shown} isn't a file`);
    const bytes = readFileSync(from);
    if (payload.page !== void 0 && /<web-threshold\b[^>]{0,500}\bsealed\b[^>]{0,500}\bdata-open\b/.test(bytes.toString("utf8"))) {
      throw new SealRefusal(`payload ${name}: ${shown} is already a shell from an earlier run. Rebuild the site first`);
    }
    if (bytes.length > MAX_FILE) throw new SealRefusal(`payload ${name}: over the 10 MiB limit`);
    if (bytes.length > WARN_FILE) log(`warning: payload ${name} is over 2 MiB, which a phone holds twice in memory while opening it`);
    if (payload.from !== void 0 && payload.page !== void 0 && existsSync(join(out, payload.page))) {
      throw new SealRefusal(`payload ${name}: ${payload.page} is already in --out, and a shell would replace it. Leave out "from" to seal it in place`);
    }
    if (payload.page !== void 0) confine(out, payload.page);
    if (saysText(payload.type) && asText(bytes) === null) {
      log(`warning: payload ${name} isn't valid UTF-8, so the leak check can't read it and browsers may garble it`);
    }
    if (payload.page !== void 0 && EXTERNAL_SCRIPT.test(bytes.toString("utf8"))) {
      log(`warning: payload ${name} loads an external script, which can see what its door opens`);
    }
    contents.set(name, bytes);
    sealed.push({ label: `payload ${name}`, bytes });
    sources.push(from);
  }
  const states = sources.map(gitState);
  if (states.includes("tracked") && !options.publicFixture) {
    throw new SealRefusal("the doors file or a payload source is tracked by git, so its secrets are in history. Untrack it, or pass --public-fixture if it's meant to be public");
  }
  const gitSummary = states.includes("not checked") ? "not checked" : states.includes("tracked") ? "tracked, allowed by --public-fixture" : "untracked";
  for (const door of file.doors) {
    if (fold1(door.phrase).length < WEAK_BELOW) log(`warning: door ${door.tier} has a weak phrase`);
  }
  const built = await (options.build ?? buildBundle)(file, contents);
  const json = JSON.stringify(built.bundle);
  await verifyBundle(parseBundle(JSON.parse(json)), file, contents, built.files);
  const pages = Object.entries(file.payloads).filter(([, payload]) => payload.page !== void 0);
  const template = options.shell ? readFileSync(resolve(options.shell), "utf8") : DEFAULT_SHELL;
  if (pages.length > 0 && !options.element) throw new SealRefusal("sealed pages need the built element: run `npm run build` in web-threshold");
  if (pages.length > 0 && template.split(SHELL_MARKER).length !== 2) throw new SealRefusal(`the shell must contain ${SHELL_MARKER} exactly once`);
  const shells = pages.map(([name, payload]) => ({ path: payload.page, ...buildShell(template, `/${BUNDLE_PATH}`, name, options.element ?? "", file.remember) }));
  confine(out, BUNDLE_PATH);
  for (const path of built.files.keys()) confine(out, path);
  const dataStrings = (value) => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(dataStrings);
    const prose = (key) => tokensOf(fold1(key)).length >= 3;
    if (typeof value === "object" && value !== null) {
      return Object.entries(value).flatMap(([key, item]) => [...prose(key) ? [key] : [], ...dataStrings(item)]);
    }
    return [];
  };
  const addresses = (page) => {
    if (basename(page) === "index.html") return dirname(page) === "." ? [page] : [page, dirname(page)];
    return [page, page.replace(/\.html$/, "")];
  };
  const result = scan({
    root: out,
    replaced: inPlace,
    staged: [{ file: BUNDLE_PATH, text: json }, ...shells.map((shell) => ({ file: shell.path, text: shell.publicText }))],
    targets: [
      ...file.doors.flatMap((door) => [
        { label: `the phrase of door ${door.tier}`, text: door.phrase },
        ...dataStrings(door.data).map((text) => ({ label: `a data value of door ${door.tier}`, text }))
      ]),
      // A page sealed in place keeps its known address: only a hidden page's address is a secret.
      ...pages.filter(([, payload]) => payload.from !== void 0).flatMap(([name, payload]) => addresses(payload.page).map((text) => ({ label: `the path of payload ${name}`, text, path: true })))
    ],
    payloads: [...contents].flatMap(([name, bytes]) => {
      const text = asText(bytes);
      return text === null ? [] : [{ label: `text of payload ${name}`, text, markup: isMarkup(file.payloads[name].type) }];
    }),
    allowPublic: file.allowPublic,
    sealed
  });
  for (const warn of result.warns) log(`warning: ${warn}`);
  if (result.aborts.length > 0) throw new SealRefusal(`found in public output, nothing written:
${result.aborts.join("\n")}`);
  commit(out, [
    [BUNDLE_PATH, json],
    ...built.files,
    ...shells.map((shell) => [shell.path, shell.html])
  ], options.rename);
  log(`sealed ${file.doors.length} doors, ${contents.size} payloads into ${BUNDLE_PATH}, ${built.files.size} files, ${shells.length} pages`);
  log(`scanned ${result.counts.text} text, ${result.counts.compressed} compressed, ${result.counts.binary} binary files`);
  log(`git: ${gitSummary}`);
  if (result.allowed.length > 0) log(`allowed public: ${result.allowed.join(", ")}`);
}
async function seal(options) {
  const log = options.log ?? console.error;
  try {
    await sealInner(options, log);
    return 0;
  } catch (err) {
    if (err instanceof SealRefusal) log(err.message);
    else {
      const { code, path } = err;
      log(`seal failed: ${code ?? (err instanceof Error ? err.name : "unknown error")}${path ? ` at ${path}` : ""}`);
    }
    return 1;
  }
}
const CONFIG = "threshold.config.ts";
const OUT = join("public", "robots.txt");
const USAGE = "usage: web-threshold robots\n       web-threshold seal --doors <file> --out <dir> [--shell <file>] [--public-fixture]";
function loadFailure(err) {
  const code = err.code;
  if (code === "ERR_UNKNOWN_FILE_EXTENSION") {
    return `this Node can't load ${CONFIG}; it needs a Node with type stripping turned on (Node 24 has it)`;
  }
  if (err instanceof SyntaxError) {
    return `${CONFIG} didn't load as an ES module (${err.message}); check "type" in the site's package.json is not "commonjs"`;
  }
  return `${CONFIG} didn't load: ${err instanceof Error ? err.message : String(err)}`;
}
async function robots(cwd, log) {
  const configPath = join(cwd, CONFIG);
  if (!existsSync(configPath)) {
    log(`no ${CONFIG} in ${cwd}`);
    return 1;
  }
  let config;
  try {
    config = (await import(pathToFileURL(configPath).href)).default;
  } catch (err) {
    const invalid = (err == null ? void 0 : err.name) === "ThresholdConfigError";
    log(invalid ? `${CONFIG}:
${err.message}` : loadFailure(err));
    return 1;
  }
  if (config === void 0) {
    log(`${CONFIG} has no default export`);
    return 1;
  }
  let text;
  try {
    text = generateRobots(config);
  } catch (err) {
    log(`${CONFIG}:
${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const outPath = join(cwd, OUT);
  if (existsSync(outPath) && !readFileSync(outPath, "utf8").startsWith(GENERATED_HEADER)) {
    log(`${OUT} wasn't generated by web-threshold, so it stays. To replace it: git rm ${OUT}, moving any rules you need into extra`);
    return 1;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text);
  log(`wrote ${OUT}`);
  return 0;
}
function sealArgs(args) {
  const parsed = { publicFixture: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--public-fixture") parsed.publicFixture = true;
    else if (arg === "--doors" || arg === "--out" || arg === "--shell") {
      const value = args[++index];
      if (value === void 0) return null;
      parsed[arg.slice(2)] = value;
    } else return null;
  }
  return parsed.doors && parsed.out ? parsed : null;
}
function builtElement() {
  const url = new URL("./web-threshold-sealed.js", import.meta.url);
  return url.protocol === "file:" && existsSync(url) ? readFileSync(url, "utf8") : void 0;
}
function runSeal(options, cwd, log) {
  return seal({
    doors: resolve(cwd, options.doors),
    out: resolve(cwd, options.out),
    publicFixture: options.publicFixture,
    log,
    ...options.shell ? { shell: resolve(cwd, options.shell) } : {},
    ...builtElement() ? { element: builtElement() } : {}
  });
}
async function run(args, cwd, log = console.error) {
  if (args.length === 1 && args[0] === "robots") return robots(cwd, log);
  if (args[0] === "seal") {
    const options = sealArgs(args.slice(1));
    if (options) return runSeal(options, cwd, log);
  }
  log(USAGE);
  return 1;
}
void run(process.argv.slice(2), process.cwd()).then((code) => {
  process.exitCode = code;
});
