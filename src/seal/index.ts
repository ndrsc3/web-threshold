import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  ITERATIONS,
  NORM,
  deriveKek,
  encrypt,
  fold1,
  fromB64,
  openEntry,
  openSlots,
  padRecord,
  parseBundle,
  randomBytes,
  toB64,
  type Bundle,
  type OpenEntry,
  type SealedRecord,
} from "../gate/sealed-format.js";
import { EXTERNAL_SCRIPT, scan, tokensOf } from "./scan.js";
import { DEFAULT_SHELL, SHELL_MARKER, buildShell } from "./shell.js";

// Whatever its declared type, a payload that reads as text is scanned as text (j-2).
const asText = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};
const saysText = (type: string) => type.startsWith("text/") || type.endsWith("+xml") || type.endsWith("+json") || type === "application/json";
const isMarkup = (type: string) => type === "text/html" || type === "application/xhtml+xml" || type.endsWith("+xml") || type === "text/xml";
const WARN_FILE = 2 * 1024 * 1024;
const MAX_FILE = 10 * 1024 * 1024;
const WARN_SLOTS = 256;
const MAX_SLOTS = 1024;
const WEAK_BELOW = 14;
export const BUNDLE_PATH = join("s", "site.json");

export interface Door {
  tier: string;
  phrase: string;
  open: string[];
  data?: unknown;
}

export interface DoorsFile {
  /** No `from` means seal the built page already at `page`, in place. */
  payloads: Record<string, { from?: string; type: string; page?: string }>;
  doors: Door[];
  allowPublic: string[];
  /** Written onto shells. Pages of a site's own use the attribute. */
  remember?: "session";
}

export interface SealOptions {
  doors: string;
  out: string;
  publicFixture?: boolean;
  /** A shell template for sealed pages, holding the marker. */
  shell?: string;
  /** The sealed element's code, which shells inline. The CLI supplies its own. */
  element?: string;
  log?: (line: string) => void;
  /** Test seam: replaces the sealing step, so a bad sealer can be shown to be caught. */
  build?: typeof buildBundle;
  /** Test seam: the final rename, so a failure partway can be shown to leave the rerun guard (j-6). */
  rename?: typeof renameSync;
}

class SealRefusal extends Error {}

const real = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};

const isInside = (path: string, dir: string) => {
  const rel = relative(real(dir), real(path));
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

function unknownKeys(where: string, value: object, known: string[], errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) errors.push(`${where}: "${key}" isn't available yet, or isn't a known key`);
  }
}

/** Refuses any door file it can't fully honour, naming tiers and never phrases. */
export function validateDoors(raw: unknown): DoorsFile {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) throw new SealRefusal("the doors file must be a JSON object");
  const file = raw as { payloads?: unknown; doors?: unknown; allowPublic?: unknown; remember?: unknown };
  unknownKeys("doors file", file, ["payloads", "doors", "allowPublic", "remember"], errors);
  if (file.remember !== undefined && file.remember !== "session") errors.push('remember can only be "session"');

  const payloads = (typeof file.payloads === "object" && file.payloads !== null ? file.payloads : {}) as Record<string, Record<string, unknown>>;
  const seenPages = new Set<string>();
  for (const [name, payload] of Object.entries(payloads)) {
    if (typeof payload !== "object" || payload === null) {
      errors.push(`payload ${name}: must be an object`);
      continue;
    }
    unknownKeys(`payload ${name}`, payload, ["from", "type", "page"], errors);
    if (typeof payload.from !== "string" && !(payload.from === undefined && payload.page !== undefined)) {
      errors.push(`payload ${name}: needs a "from" path, or a "page" to seal in place`);
    }
    if (typeof payload.type !== "string") errors.push(`payload ${name}: needs a "type"`);
    else if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(payload.type)) errors.push(`payload ${name}: "${payload.type}" isn't a media type`);
    else payload.type = payload.type.toLowerCase();
    if (payload.page !== undefined) {
      const segments = typeof payload.page === "string" ? payload.page.split("/") : [];
      const safe = segments.length > 0 && segments.every((part) => part !== "" && part !== "." && part !== ".." && !part.includes("\\"));
      if (!safe || !String(payload.page).endsWith(".html")) errors.push(`payload ${name}: "page" must be a relative path to an .html file inside --out`);
      // Ignoring case: on many disks, Room/ and room/ are one folder.
      else if (seenPages.has(String(payload.page).toLowerCase())) errors.push(`payload ${name}: another payload already uses that page`);
      seenPages.add(String(payload.page).toLowerCase());
      if (payload.type !== "text/html") errors.push(`payload ${name}: a page must be text/html`);
    }
  }

  const doors = Array.isArray(file.doors) ? (file.doors as Record<string, unknown>[]) : [];
  if (doors.length === 0) errors.push("the doors file needs at least one door");
  if (doors.length > MAX_SLOTS) errors.push(`${doors.length} doors is over the limit of ${MAX_SLOTS}`);
  const seen = new Set<string>();
  const opened = new Set<string>();
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
    if (payload?.page !== undefined && !opened.has(name)) errors.push(`payload ${name}: no door opens this page, so its shell would be a dead end`);
  }
  if (errors.length > 0) throw new SealRefusal(errors.join("\n"));
  return { payloads, doors, allowPublic, ...(file.remember ? { remember: file.remember } : {}) } as unknown as DoorsFile;
}

/** A write target must land inside --out, whatever symlinks are on the way, and its folders must be folders. */
function confine(out: string, target: string): void {
  try {
    if (lstatSync(join(out, target)).isSymbolicLink()) throw new SealRefusal(`${target} is a symlink, and writing through it could leave --out`);
  } catch (err) {
    if (err instanceof SealRefusal) throw err;
    // Not there yet, which is fine.
  }
  let ancestor = dirname(join(out, target));
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (!isInside(ancestor, out)) throw new SealRefusal(`${target} would be written outside --out, through a symlink`);
  if (!statSync(ancestor).isDirectory()) throw new SealRefusal(`${target} needs a folder where ${relative(out, ancestor)} is a file`);
}

/** "tracked", "untracked", or "not checked" when git can't say. */
function gitState(path: string): "tracked" | "untracked" | "not checked" {
  const file = real(path);
  // A git hook sets these, and they'd point the check at the wrong repository.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"].includes(key)));
  const git = (...args: string[]) => execFileSync("git", ["-C", dirname(file), ...args], { stdio: "ignore", env });
  try {
    git("rev-parse", "--is-inside-work-tree");
  } catch {
    return "not checked";
  }
  try {
    git("ls-files", "--error-unmatch", basename(file));
    return "tracked";
  } catch (err) {
    // Exit 1 is git's answer. Anything else means it couldn't say.
    return (err as { status?: number }).status === 1 ? "untracked" : "not checked";
  }
}

export interface Built {
  bundle: Bundle;
  /** Payloads: path inside --out to raw ciphertext. */
  files: Map<string, Uint8Array>;
}

export async function buildBundle(file: DoorsFile, contents: Map<string, Uint8Array>): Promise<Built> {
  // Every payload is its own file (j-9): the bundle stays small, and a page opens only what it asks for.
  const salt = randomBytes(16);
  const files = new Map<string, Uint8Array>();
  const entries = new Map<string, OpenEntry>();
  for (const [name, { type }] of Object.entries(file.payloads)) {
    const key = randomBytes(32);
    const sealed = await encrypt(key, contents.get(name)!);
    // A random name, listed only inside the records of doors that open it.
    const path = `s/${toB64(randomBytes(12))}.sealed`;
    files.set(path, fromB64(sealed.ct));
    entries.set(name, { k: toB64(key), type, iv: sealed.iv, src: `/${path}` });
  }

  const slots: Bundle["slots"] = [];
  for (const door of file.doors) {
    const record: SealedRecord = {
      tier: door.tier,
      open: Object.fromEntries(door.open.map((name) => [name, entries.get(name)!])),
      ...(door.data === undefined ? {} : { data: door.data }),
    };
    slots.push(await encrypt(await deriveKek(door.phrase, salt, ITERATIONS), padRecord(record)));
  }
  // Slot order must not reveal door order.
  for (let index = slots.length - 1; index > 0; index--) {
    const other = crypto.getRandomValues(new Uint32Array(1))[0]! % (index + 1);
    [slots[index], slots[other]] = [slots[other]!, slots[index]!];
  }
  return { bundle: { v: 1, kdf: { iter: ITERATIONS, salt: toB64(salt), norm: NORM }, slots }, files };
}

/** Each phrase opens exactly its declared payloads, byte-identical, and nothing else does. */
const SEALED_FILE = /^s\/[A-Za-z0-9_-]+\.sealed$/;

export async function verifyBundle(
  bundle: Bundle,
  file: DoorsFile,
  contents: Map<string, Uint8Array>,
  files: Map<string, Uint8Array> = new Map(),
): Promise<void> {
  const read = new Set<string>();
  const readFile = async (src: string) => {
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
  const keys = new Map<string, string>();
  for (const door of file.doors) {
    const records = await openSlots(bundle, await deriveKek(door.phrase, salt, bundle.kdf.iter));
    if (records.length !== 1) throw new SealRefusal(`read-back: door ${door.tier} opened ${records.length} slots`);
    const record = records[0]!;
    if (record.tier !== door.tier) throw new SealRefusal(`read-back: door ${door.tier} opened another door's record`);
    if (JSON.stringify(record.data) !== JSON.stringify(door.data)) throw new SealRefusal(`read-back: door ${door.tier} has different data`);

    const opened = Object.keys(record.open).sort();
    if (JSON.stringify(opened) !== JSON.stringify([...door.open].sort())) {
      throw new SealRefusal(`read-back: door ${door.tier} doesn't open exactly its declared payloads`);
    }
    for (const name of opened) {
      const entry = record.open[name]!;
      const plain = await openEntry(entry, readFile);
      if (Buffer.compare(Buffer.from(plain), Buffer.from(contents.get(name)!)) !== 0) {
        throw new SealRefusal(`read-back: payload ${name} isn't byte-identical through door ${door.tier}`);
      }
      const owner = keys.get(entry.k);
      if (owner && owner !== name) throw new SealRefusal(`read-back: payloads ${owner} and ${name} share a key`);
      keys.set(entry.k, name);
    }
  }
  const stray = await openSlots(bundle, await deriveKek(toB64(randomBytes(24)), salt, bundle.kdf.iter));
  if (stray.length > 0) throw new SealRefusal("read-back: a random phrase opened a slot");
  // Doors read what they open. A file left over is one the check above never decrypted.
  const opened = new Set(file.doors.flatMap((door) => door.open));
  const unopened = Object.keys(file.payloads).filter((name) => !opened.has(name)).length;
  if (files.size > read.size + unopened) throw new SealRefusal("read-back: a sealed file no door opens");
}

/** Every file is fully written beside its target before any target changes. */
function commit(out: string, files: [string, string | Uint8Array][], rename: typeof renameSync = renameSync): void {
  const staged: { temp: string; target: string }[] = [];
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
    const { code, path } = err as NodeJS.ErrnoException;
    throw new SealRefusal(`couldn't write ${path ? relative(out, path) : "the output"} (${code ?? "error"}). Nothing in --out was replaced`);
  }
  try {
    for (const { temp, target } of staged) rename(temp, target);
  } catch (err) {
    cleanUp();
    throw new SealRefusal(`writing stopped partway (${(err as NodeJS.ErrnoException).code ?? "error"}), so --out is partly sealed. Rebuild the site before sealing again`);
  }
}

async function sealInner(options: SealOptions, log: (line: string) => void): Promise<void> {
  const out = resolve(options.out);
  const doorsPath = resolve(options.doors);
  if (!existsSync(out)) throw new SealRefusal(`--out ${options.out} doesn't exist`);
  if (isInside(doorsPath, out)) throw new SealRefusal("the doors file is a secret, and it's inside --out");
  if (!existsSync(doorsPath)) throw new SealRefusal(`no doors file at ${options.doors}`);
  if (existsSync(join(out, BUNDLE_PATH))) throw new SealRefusal(`${BUNDLE_PATH} is already in --out; rebuild the site first`);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(doorsPath, "utf8"));
  } catch {
    // Not the parser's message: it can quote the file, and the file holds phrases.
    throw new SealRefusal("the doors file isn't valid JSON");
  }
  const file = validateDoors(raw);
  if (file.doors.length > WARN_SLOTS) log(`warning: ${file.doors.length} doors adds about ${Math.round((file.doors.length * 737) / 1024)} KB`);

  const contents = new Map<string, Uint8Array>();
  const sealed = [{ label: "the doors file", bytes: readFileSync(doorsPath) as Uint8Array }];
  const sources: string[] = [doorsPath];
  const inPlace: string[] = [];
  for (const [name, payload] of Object.entries(file.payloads)) {
    if (payload.from === undefined) inPlace.push(payload.page!);
    const shown = payload.from ?? payload.page!;
    const from = payload.from === undefined ? join(out, payload.page!) : resolve(dirname(doorsPath), payload.from);
    if (payload.from !== undefined && isInside(from, out)) throw new SealRefusal(`payload ${name}: its source is inside --out`);
    if (!existsSync(from)) throw new SealRefusal(`payload ${name}: no file at ${shown}`);
    if (!statSync(from).isFile()) throw new SealRefusal(`payload ${name}: ${shown} isn't a file`);
    const bytes = readFileSync(from);
    // A leftover shell sealed as a page would open a shell, for ever. It can only come from an earlier run.
    if (payload.page !== undefined && /<web-threshold\b[^>]{0,500}\bsealed\b[^>]{0,500}\bdata-open\b/.test(bytes.toString("utf8"))) {
      throw new SealRefusal(`payload ${name}: ${shown} is already a shell from an earlier run. Rebuild the site first`);
    }
    if (bytes.length > MAX_FILE) throw new SealRefusal(`payload ${name}: over the 10 MiB limit`);
    if (bytes.length > WARN_FILE) log(`warning: payload ${name} is over 2 MiB, which a phone holds twice in memory while opening it`);
    if (payload.from !== undefined && payload.page !== undefined && existsSync(join(out, payload.page))) {
      throw new SealRefusal(`payload ${name}: ${payload.page} is already in --out, and a shell would replace it. Leave out "from" to seal it in place`);
    }
    if (payload.page !== undefined) confine(out, payload.page);
    if (saysText(payload.type) && asText(bytes) === null) {
      log(`warning: payload ${name} isn't valid UTF-8, so the leak check can't read it and browsers may garble it`);
    }
    // Once the page opens, such a script runs beside the door's key (j-12).
    if (payload.page !== undefined && EXTERNAL_SCRIPT.test(bytes.toString("utf8"))) {
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

  // A sealed page's public stand-in: its text comes from the bundle, never the source.
  const pages = Object.entries(file.payloads).filter(([, payload]) => payload.page !== undefined);
  const template = options.shell ? readFileSync(resolve(options.shell), "utf8") : DEFAULT_SHELL;
  if (pages.length > 0 && !options.element) throw new SealRefusal("sealed pages need the built element: run `npm run build` in web-threshold");
  if (pages.length > 0 && template.split(SHELL_MARKER).length !== 2) throw new SealRefusal(`the shell must contain ${SHELL_MARKER} exactly once`);
  const shells = pages.map(([name, payload]) => ({ path: payload.page!, ...buildShell(template, `/${BUNDLE_PATH}`, name, options.element ?? "", file.remember) }));
  confine(out, BUNDLE_PATH);
  for (const path of built.files.keys()) confine(out, path);

  const dataStrings = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(dataStrings);
    // A key written as prose ships inside the record and is a secret too (j-10). Short keys such as
    // `theme` are the handler's public vocabulary, and would warn on every build.
    // Words as the scan counts them, so `the-hidden-room` is three (k-3).
    const prose = (key: string) => tokensOf(fold1(key)).length >= 3;
    if (typeof value === "object" && value !== null) {
      return Object.entries(value).flatMap(([key, item]) => [...(prose(key) ? [key] : []), ...dataStrings(item)]);
    }
    return [];
  };
  // A page's addresses: as a file, as a folder (folder/index.html), and without .html, as hosts with clean URLs serve it (j-13).
  const addresses = (page: string): string[] => {
    if (basename(page) === "index.html") return dirname(page) === "." ? [page] : [page, dirname(page)];
    return [page, page.replace(/\.html$/, "")];
  };
  // The bundle is checked before it exists on disk, so a refusal leaves nothing behind.
  const result = scan({
    root: out,
    replaced: inPlace,
    staged: [{ file: BUNDLE_PATH, text: json }, ...shells.map((shell) => ({ file: shell.path, text: shell.publicText }))],
    targets: [
      ...file.doors.flatMap((door) => [
        { label: `the phrase of door ${door.tier}`, text: door.phrase },
        ...dataStrings(door.data).map((text) => ({ label: `a data value of door ${door.tier}`, text })),
      ]),
      // A page sealed in place keeps its known address: only a hidden page's address is a secret.
      ...pages
        .filter(([, payload]) => payload.from !== undefined)
        .flatMap(([name, payload]) => addresses(payload.page!).map((text) => ({ label: `the path of payload ${name}`, text, path: true }))),
    ],
    payloads: [...contents].flatMap(([name, bytes]) => {
      const text = asText(bytes);
      return text === null ? [] : [{ label: `text of payload ${name}`, text, markup: isMarkup(file.payloads[name]!.type) }];
    }),
    allowPublic: file.allowPublic,
    sealed,
  });

  for (const warn of result.warns) log(`warning: ${warn}`);
  if (result.aborts.length > 0) throw new SealRefusal(`found in public output, nothing written:\n${result.aborts.join("\n")}`);

  // The bundle goes first: if anything after it fails, the rerun guard says to rebuild.
  commit(out, [
    [BUNDLE_PATH, json],
    ...built.files,
    ...shells.map((shell): [string, string] => [shell.path, shell.html]),
  ], options.rename);
  log(`sealed ${file.doors.length} doors, ${contents.size} payloads into ${BUNDLE_PATH}, ${built.files.size} files, ${shells.length} pages`);
  log(`scanned ${result.counts.text} text, ${result.counts.compressed} compressed, ${result.counts.binary} binary files`);
  log(`git: ${gitSummary}`);
  if (result.allowed.length > 0) log(`allowed public: ${result.allowed.join(", ")}`);
}

/** Returns the process exit code. */
export async function seal(options: SealOptions): Promise<number> {
  const log = options.log ?? console.error;
  try {
    await sealInner(options, log);
    return 0;
  } catch (err) {
    if (err instanceof SealRefusal) log(err.message);
    else {
      // Code and path only: a message could quote the doors file.
      const { code, path } = err as NodeJS.ErrnoException;
      log(`seal failed: ${code ?? (err instanceof Error ? err.name : "unknown error")}${path ? ` at ${path}` : ""}`);
    }
    return 1;
  }
}
