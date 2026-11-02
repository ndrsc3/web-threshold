/**
 * The sealed bundle: format, phrase folding and crypto, shared by `seal` (Node) and
 * the sealed element (browser). No node imports. Design: docs/plans/261102-v0.5-sealed-design.md.
 */

export const ITERATIONS = 600_000;
export const MAX_ITERATIONS = 5_000_000;
export const NORM = "fold1";
const PAD_TO = 256;

export interface Sealed {
  iv: string;
  ct: string;
}

export interface Bundle {
  v: 1;
  kdf: { iter: number; salt: string; norm: string };
  slots: Sealed[];
  inline: (Sealed & { pid: string })[];
}

export interface OpenEntry {
  k: string;
  type: string;
  pid?: string;
}

export interface SealedRecord {
  tier: string;
  open: Record<string, OpenEntry>;
  data?: unknown;
}

/** A bundle the element can't use. `code` goes out on `threshold-error`. */
export class BundleError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** How a typed phrase becomes the bytes that derive its key. Forgiving by design. */
export function fold1(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function toB64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

const buffer = (bytes: Uint8Array) => bytes as BufferSource;
const aes = (raw: Uint8Array) => crypto.subtle.importKey("raw", buffer(raw), "AES-GCM", false, ["encrypt", "decrypt"]);

/** The key a phrase opens slots with. One derivation per attempt, however many slots there are. */
export async function deriveKek(phrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(fold1(phrase)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: buffer(salt), iterations }, material, 256);
  return new Uint8Array(bits);
}

export async function encrypt(key: Uint8Array, plain: Uint8Array): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buffer(iv) }, await aes(key), buffer(plain));
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

/** Throws if the key is wrong: a failed tag is the only "wrong key" signal. */
export async function decrypt(key: Uint8Array, sealed: Sealed): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buffer(fromB64(sealed.iv)) },
    await aes(key),
    buffer(fromB64(sealed.ct)),
  );
  return new Uint8Array(plain);
}

/** JSON tolerates trailing spaces, so padding needs no framing. */
export function padRecord(record: SealedRecord): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / PAD_TO) * PAD_TO).fill(0x20);
  padded.set(bytes);
  return padded;
}

/** Every slot this key opens. Exactly one for a correct phrase; `seal` proves it. */
export async function openSlots(bundle: Bundle, kek: Uint8Array): Promise<SealedRecord[]> {
  const records: SealedRecord[] = [];
  for (const slot of bundle.slots) {
    try {
      records.push(JSON.parse(new TextDecoder().decode(await decrypt(kek, slot))) as SealedRecord);
    } catch {
      // Not this slot.
    }
  }
  return records;
}

export async function openPayload(bundle: Bundle, entry: OpenEntry): Promise<Uint8Array> {
  const sealed = bundle.inline.find((item) => item.pid === entry.pid);
  if (!sealed) throw new BundleError("payload-missing");
  return decrypt(fromB64(entry.k), sealed);
}

const isB64 = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);
const isSealed = (item: unknown) => isB64((item as Sealed | null)?.iv) && isB64((item as Sealed | null)?.ct);

/** Refuses anything it can't vouch for, rather than guessing. */
export function parseBundle(value: unknown): Bundle {
  const bundle = value as Partial<Bundle> | null;
  if (typeof bundle !== "object" || bundle === null) throw new BundleError("malformed-bundle");
  if (bundle.v !== 1) throw new BundleError("unsupported-version");
  const kdf = bundle.kdf;
  if (typeof kdf !== "object" || kdf === null || typeof kdf.salt !== "string") throw new BundleError("malformed-bundle");
  if (kdf.norm !== NORM) throw new BundleError("unsupported-norm");
  if (!Number.isInteger(kdf.iter) || kdf.iter < 1) throw new BundleError("malformed-bundle");
  if (kdf.iter > MAX_ITERATIONS) throw new BundleError("iterations-over-ceiling");
  if (!isB64(kdf.salt)) throw new BundleError("malformed-bundle");
  if (!Array.isArray(bundle.slots) || !bundle.slots.every(isSealed)) throw new BundleError("malformed-bundle");
  if (bundle.inline !== undefined && (!Array.isArray(bundle.inline) || !bundle.inline.every(isSealed))) {
    throw new BundleError("malformed-bundle");
  }
  return { ...(bundle as Bundle), inline: bundle.inline ?? [] };
}
