// @vitest-environment node
// A v1 bundle sealed once and kept. Every later version must still open it, or
// sites sealed earlier silently stop opening. Its phrase is public: a fixture.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveKek, fromB64, openEntry, openSlots, parseBundle } from "./sealed-format.js";

const bundle = parseBundle(JSON.parse(readFileSync(new URL("./__golden__/v1.json", import.meta.url), "utf8")));
// Served beside the bundle as /golden-note.sealed (scripts/build-demo.mjs).
const readNote = async (src: string) => {
  expect(src).toBe("/golden-note.sealed");
  return new Uint8Array(readFileSync(new URL("./__golden__/note.sealed", import.meta.url)));
};
const PHRASE = "σάς “μας” — café…";

describe("golden bundle v1", () => {
  it("is what it says", () => {
    expect(bundle.kdf).toMatchObject({ iter: 600_000, norm: "fold1" });
  });

  it.each([PHRASE, 'σας "μας" - cafe...', ' ΣΑΣ  "ΜΑΣ" - CAFÉ... '])("opens with %j", async (phrase) => {
    const [record, ...rest] = await openSlots(bundle, await deriveKek(phrase, fromB64(bundle.kdf.salt), bundle.kdf.iter));
    expect(rest).toEqual([]);
    expect(record!.tier).toBe("golden");
    expect(record!.data).toEqual({ n: 1, s: "σάς" });
    expect(new TextDecoder().decode(await openEntry(record!.open.note!, readNote))).toBe("golden note, κατώφλι\n");
  });

  it("stays shut otherwise", async () => {
    expect(await openSlots(bundle, await deriveKek("σασ μας - cafe...", fromB64(bundle.kdf.salt), bundle.kdf.iter))).toEqual([]);
  });
});
