import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  ITERATIONS,
  NORM,
  deriveKek,
  encrypt,
  fold1,
  fromB64,
  openPayload,
  openSlots,
  padRecord,
  parseBundle,
  randomBytes,
  toB64,
  type Bundle,
  type OpenEntry,
  type SealedRecord,
} from "../gate/sealed-format.js";
import { scan } from "./scan.js";

const TEXT_TYPES = new Set(["text/html", "text/plain", "text/css", "text/markdown", "application/json", "image/svg+xml"]);
const MAX_INLINE = 64 * 1024;
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
  payloads: Record<string, { from: string; type: string }>;
  doors: Door[];
  allowPublic: string[];
}

export interface SealOptions {
  doors: string;
  out: string;
  publicFixture?: boolean;
  log?: (line: string) => void;
  /** Test seam: replaces the sealing step, so a bad sealer can be shown to be caught. */
  build?: typeof buildBundle;
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
  const file = raw as { payloads?: unknown; doors?: unknown; allowPublic?: unknown };
  unknownKeys("doors file", file, ["payloads", "doors", "allowPublic"], errors);

  const payloads = (typeof file.payloads === "object" && file.payloads !== null ? file.payloads : {}) as Record<string, Record<string, unknown>>;
  for (const [name, payload] of Object.entries(payloads)) {
    if (typeof payload !== "object" || payload === null) {
      errors.push(`payload ${name}: must be an object`);
      continue;
    }
    unknownKeys(`payload ${name}`, payload, ["from", "type"], errors);
    if (typeof payload.from !== "string") errors.push(`payload ${name}: needs a "from" path`);
    if (typeof payload.type !== "string") errors.push(`payload ${name}: needs a "type"`);
    else if (!TEXT_TYPES.has(payload.type)) errors.push(`payload ${name}: binary type ${payload.type} isn't available yet`);
  }

  const doors = Array.isArray(file.doors) ? (file.doors as Record<string, unknown>[]) : [];
  if (doors.length === 0) errors.push("the doors file needs at least one door");
  if (doors.length > MAX_SLOTS) errors.push(`${doors.length} doors is over the limit of ${MAX_SLOTS}`);
  const seen = new Set<string>();
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
      }
    }
  });

  const allowPublic = file.allowPublic ?? [];
  if (!Array.isArray(allowPublic) || allowPublic.some((item) => typeof item !== "string")) {
    errors.push("allowPublic must be a list of strings");
  }
  if (errors.length > 0) throw new SealRefusal(errors.join("\n"));
  return { payloads, doors, allowPublic } as unknown as DoorsFile;
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

export async function buildBundle(file: DoorsFile, contents: Map<string, Uint8Array>): Promise<Bundle> {
  const salt = randomBytes(16);
  const inline: Bundle["inline"] = [];
  const entries = new Map<string, OpenEntry>();
  for (const [name, { type }] of Object.entries(file.payloads)) {
    const key = randomBytes(32);
    const pid = toB64(randomBytes(9));
    inline.push({ pid, ...(await encrypt(key, contents.get(name)!)) });
    entries.set(name, { k: toB64(key), type, pid });
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
  // Payload order must not reveal payload order either.
  inline.sort((a, b) => (a.pid < b.pid ? -1 : 1));
  return { v: 1, kdf: { iter: ITERATIONS, salt: toB64(salt), norm: NORM }, slots, inline };
}

/** Each phrase opens exactly its declared payloads, byte-identical, and nothing else does. */
export async function verifyBundle(bundle: Bundle, file: DoorsFile, contents: Map<string, Uint8Array>): Promise<void> {
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
      const plain = await openPayload(bundle, entry);
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
  for (const [name, payload] of Object.entries(file.payloads)) {
    const from = resolve(dirname(doorsPath), payload.from);
    if (isInside(from, out)) throw new SealRefusal(`payload ${name}: its source is inside --out`);
    if (!existsSync(from)) throw new SealRefusal(`payload ${name}: no file at ${payload.from}`);
    if (!statSync(from).isFile()) throw new SealRefusal(`payload ${name}: ${payload.from} isn't a file`);
    const bytes = readFileSync(from);
    if (bytes.length > MAX_INLINE) throw new SealRefusal(`payload ${name}: text over 64 KiB isn't available yet`);
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

  const bundle = await (options.build ?? buildBundle)(file, contents);
  const json = JSON.stringify(bundle);
  await verifyBundle(parseBundle(JSON.parse(json)), file, contents);

  const dataStrings = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(dataStrings);
    if (typeof value === "object" && value !== null) return Object.values(value).flatMap(dataStrings);
    return [];
  };
  // The bundle is checked before it exists on disk, so a refusal leaves nothing behind.
  const result = scan({
    root: out,
    staged: [{ file: BUNDLE_PATH, text: json }],
    targets: file.doors.flatMap((door) => [
      { label: `the phrase of door ${door.tier}`, text: door.phrase },
      ...dataStrings(door.data).map((text) => ({ label: `a data value of door ${door.tier}`, text })),
    ]),
    payloads: [...contents].map(([name, bytes]) => ({ label: `text of payload ${name}`, text: Buffer.from(bytes).toString("utf8") })),
    allowPublic: file.allowPublic,
    sealed,
  });

  for (const warn of result.warns) log(`warning: ${warn}`);
  if (result.aborts.length > 0) throw new SealRefusal(`found in public output, nothing written:\n${result.aborts.join("\n")}`);

  mkdirSync(join(out, "s"), { recursive: true });
  writeFileSync(join(out, BUNDLE_PATH), json);
  log(`sealed ${file.doors.length} doors, ${contents.size} payloads into ${BUNDLE_PATH}`);
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
