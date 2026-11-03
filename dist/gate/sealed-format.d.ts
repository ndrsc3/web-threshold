/**
 * The sealed bundle: format, phrase folding and crypto, shared by `seal` (Node) and
 * the sealed element (browser). No node imports. Design: docs/plans/261102-v0.5-sealed-design.md.
 */
export declare const ITERATIONS = 600000;
export declare const MAX_ITERATIONS = 5000000;
export declare const NORM = "fold1";
export interface Sealed {
    iv: string;
    ct: string;
}
export interface Bundle {
    v: 1;
    kdf: {
        iter: number;
        salt: string;
        norm: string;
    };
    slots: Sealed[];
}
/** Every payload is its own file (j-9): where its raw ciphertext is, and the IV, so the file itself is pure ciphertext. */
export interface OpenEntry {
    k: string;
    type: string;
    src: string;
    iv: string;
}
export interface SealedRecord {
    tier: string;
    open: Record<string, OpenEntry>;
    data?: unknown;
}
/** A bundle the element can't use. `code` goes out on `threshold-error`. */
export declare class BundleError extends Error {
    readonly code: string;
    constructor(code: string);
}
/** How a typed phrase becomes the bytes that derive its key. Forgiving by design. */
export declare function fold1(text: string): string;
export declare function toB64(bytes: Uint8Array): string;
export declare function fromB64(text: string): Uint8Array;
export declare function randomBytes(length: number): Uint8Array;
/** The key a phrase opens slots with. One derivation per attempt, however many slots there are. */
export declare function deriveKek(phrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array>;
export declare function encrypt(key: Uint8Array, plain: Uint8Array): Promise<Sealed>;
/** Throws if the key is wrong: a failed tag is the only "wrong key" signal. */
export declare function decrypt(key: Uint8Array, sealed: Sealed): Promise<Uint8Array>;
/** `readFile` is how this side reaches a `.sealed` file. */
export declare function openEntry(entry: OpenEntry, readFile: (src: string) => Promise<Uint8Array>): Promise<Uint8Array>;
/** JSON tolerates trailing spaces, so padding needs no framing. */
export declare function padRecord(record: SealedRecord): Uint8Array;
/** Every slot this key opens. Exactly one for a correct phrase; `seal` proves it. */
export declare function openSlots(bundle: Bundle, kek: Uint8Array): Promise<SealedRecord[]>;
/** Refuses anything it can't vouch for, rather than guessing. */
export declare function parseBundle(value: unknown): Bundle;
