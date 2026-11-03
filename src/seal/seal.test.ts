// @vitest-environment node
import { execFileSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, ftruncateSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync, type PathLike } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { run } from "../cli/run.js";
import { deriveKek, encrypt, fromB64, openEntry, openSlots, padRecord, randomBytes, toB64, type Bundle } from "../gate/sealed-format.js";
import { BUNDLE_PATH, buildBundle, seal, verifyBundle, type DoorsFile } from "./index.js";
import { HANDLER } from "./shell.js";

const CANARY = "zorvex quillan mibbet"; // three tokens: aborts
const STRONG = "the marble quietly unfolds at dusk";
let dir: string;
let out: string;
let lines: string[];

const doorsPath = () => join(dir, "doors.json");
function write(doors: object): void {
  writeFileSync(doorsPath(), JSON.stringify(doors));
}
function site(files: Record<string, string | Uint8Array>): void {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(out, name, ".."), { recursive: true });
    writeFileSync(join(out, name), content);
  }
}
function source(name: string, text: string): string {
  writeFileSync(join(dir, name), text);
  return name;
}
const go = (extra: object = {}) => seal({ doors: doorsPath(), out, log: (line) => lines.push(line), ...extra });
const written = () => JSON.parse(readFileSync(join(out, BUNDLE_PATH), "utf8")) as Bundle;
const report = () => lines.join("\n");

function basic(phrase = STRONG, data?: unknown): object {
  return {
    payloads: { note: { from: source("note.html", "<p>A hidden note for finders</p>"), type: "text/html" } },
    doors: [{ tier: "fox", phrase, open: ["note"], ...(data === undefined ? {} : { data }) }],
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "seal-"));
  out = join(dir, "dist");
  mkdirSync(out);
  lines = [];
});

describe("a good run", () => {
  it("writes a bundle that opens with the phrase", async () => {
    write(basic());
    site({ "index.html": "<html><body>public</body></html>" });
    expect(await go()).toBe(0);
    const bundle = written();
    expect(bundle.kdf).toMatchObject({ iter: 600_000, norm: "fold1" });
    const [record] = await openSlots(bundle, await deriveKek(STRONG, fromB64(bundle.kdf.salt), bundle.kdf.iter));
    const plain = await openEntry(record!.open.note!, async (src) => new Uint8Array(readFileSync(join(out, src))));
    expect(new TextDecoder().decode(plain)).toContain("hidden note");
    expect(report()).toContain("sealed 1 doors");
    expect(report()).toMatch(/git: (not checked|untracked)/);
  });

  it("leaves no secret in the output or the log", async () => {
    write(basic(STRONG, { route: "/s/secret-route-value/" }));
    expect(await go()).toBe(0);
    const text = readFileSync(join(out, BUNDLE_PATH), "utf8");
    for (const secret of [STRONG, "hidden", "secret-route-value", "fox"]) expect(text).not.toContain(secret);
    expect(report()).not.toContain(STRONG);
    expect(report()).not.toContain("secret-route-value");
  });

  it("leaves no temporary files beside --out", async () => {
    write(basic());
    await go();
    const names = execFileSync("ls", ["-A", dir]).toString();
    expect(names).not.toContain(".seal-");
  });
});

describe("config and mapping: one entry plus a rebuild", () => {
  const twoDoors = () => ({
    payloads: { note: { from: source("note.html", "<p>hidden note words</p>"), type: "text/html" } },
    doors: [
      { tier: "fox", phrase: STRONG, open: ["note"] },
      { tier: "owl", phrase: "an owl keeps the second door", open: [] },
    ],
  });
  const opens = async (bundle: Bundle, phrase: string) =>
    (await openSlots(bundle, await deriveKek(phrase, fromB64(bundle.kdf.salt), bundle.kdf.iter))).map((r) => r.tier);
  const rebuild = async (doors: object) => {
    out = join(dir, `dist-${Math.random()}`);
    mkdirSync(out);
    write(doors);
    expect(await go()).toBe(0);
    return written();
  };

  it("adds a door", async () => {
    const bundle = await rebuild(twoDoors());
    expect(await opens(bundle, "an owl keeps the second door")).toEqual(["owl"]);
    expect(await opens(bundle, STRONG)).toEqual(["fox"]);
  });

  it("removes a door: its phrase is silent against the new build", async () => {
    const doors = twoDoors();
    doors.doors.pop();
    const bundle = await rebuild(doors);
    expect(await opens(bundle, "an owl keeps the second door")).toEqual([]);
    expect(await opens(bundle, STRONG)).toEqual(["fox"]);
  });

  it("changes a door's phrase", async () => {
    const doors = twoDoors();
    doors.doors[1]!.phrase = "the owl moved to another door";
    const bundle = await rebuild(doors);
    expect(await opens(bundle, "an owl keeps the second door")).toEqual([]);
    expect(await opens(bundle, "the owl moved to another door")).toEqual(["owl"]);
  });

  it("uses a fresh salt each build", async () => {
    const first = await rebuild(twoDoors());
    const second = await rebuild(twoDoors());
    expect(first.kdf.salt).not.toBe(second.kdf.salt);
  });
});

describe("scan: abort, exit non-zero, nothing written", () => {
  const plants: [string, Record<string, string | Uint8Array>][] = [
    ["body text", { "a.html": `<p>${CANARY}</p>` }],
    ["meta content", { "a.html": `<meta name="description" content="${CANARY}">` }],
    ["alt", { "a.html": `<img alt="${CANARY}" src="x.png">` }],
    ["href", { "a.html": `<a href="/${CANARY.replace(/ /g, "-")}/">x</a>` }],
    ["an inline script", { "a.html": `<script>el.secrets = { "${CANARY}": "fox" };</script>` }],
    ["split across tags", { "a.html": `<p>zorvex <b>quillan</b> mibbet</p>` }],
    ["split inside a word by a tag", { "a.html": `<p>zor<b>vex</b> quillan mibbet</p>` }],
    ["a .gz", { "a.html.gz": gzipSync(`<p>${CANARY}</p>`) }],
    ["a .br", { "a.html.br": brotliCompressSync(`<p>${CANARY}</p>`) }],
    ["a .map", { "a.js.map": JSON.stringify({ sourcesContent: [CANARY] }) }],
    ["upper case with accents", { "a.txt": "ZÓRVEX QUILLÁN MIBBET" }],
    ["a file with no extension", { CNAME: CANARY }],
  ];

  it.each(plants)("a phrase in %s", async (_label, files) => {
    write(basic(CANARY));
    site(files);
    expect(await go()).toBe(1);
    expect(report()).toContain("the phrase of door fox appears in");
    expect(report()).not.toContain(CANARY);
    expect(existsSync(join(out, BUNDLE_PATH))).toBe(false);
  });

  it("a Greek phrase planted in capitals", async () => {
    write(basic("σάς μας ζάρι"));
    site({ "a.html": "<p>ΣΑΣ ΜΑΣ ΖΑΡΙ</p>" });
    expect(await go()).toBe(1);
  });

  it("curly quotes against a straight-quoted phrase", async () => {
    write(basic("don't open this door"));
    site({ "a.html": "<p>don’t open this door</p>" });
    expect(await go()).toBe(1);
  });

  it("a single token of 16+ characters", async () => {
    write(basic(STRONG, { key: "xK9qZ2mPvL7w4RtY" }));
    site({ "a.js": 'const k = "xK9qZ2mPvL7w4RtY";' });
    expect(await go()).toBe(1);
    expect(report()).toContain("a data value of door fox appears in a.js");
    expect(report()).not.toContain("xK9qZ2mPvL7w4RtY");
  });

  it("a long route in a link", async () => {
    write(basic(STRONG, { route: "/s/x7f3a9b2c4d1e8f6/" }));
    site({ "a.html": '<a href="/s/x7f3a9b2c4d1e8f6/">x</a>' });
    expect(await go()).toBe(1);
  });

  it("8 tokens of a payload", async () => {
    write({
      payloads: { note: { from: source("long.txt", "one two three four five six seven eight nine ten"), type: "text/plain" } },
      doors: [{ tier: "fox", phrase: STRONG, open: ["note"] }],
    });
    site({ "a.html": "<p>three four five six seven eight nine ten</p>" });
    expect(await go()).toBe(1);
    expect(report()).toContain("text of payload note appears in a.html");
  });

  it("a whole short payload", async () => {
    write({
      payloads: { note: { from: source("s.txt", "a short hidden note"), type: "text/plain" } },
      doors: [{ tier: "fox", phrase: STRONG, open: ["note"] }],
    });
    site({ "a.html": "<p>a short hidden note</p>" });
    expect(await go()).toBe(1);
  });

  it("a public copy of a sealed file", async () => {
    write(basic());
    site({ "copy.png": readFileSync(join(dir, "note.html")) });
    expect(await go()).toBe(1);
    expect(report()).toContain("public copy of payload note");
  });

  it("an unknown file type", async () => {
    write(basic());
    site({ "a.xyz": "hello" });
    expect(await go()).toBe(1);
    expect(report()).toContain("unknown file type");
  });

  it("a corrupt .gz", async () => {
    write(basic());
    site({ "a.gz": "not gzip" });
    expect(await go()).toBe(1);
  });
});

describe("scan: warn, exit 0", () => {
  it("a short weak phrase in public text, by tier and without the phrase", async () => {
    write(basic("form"));
    site({ "a.html": "<form>hello</form>" });
    expect(await go()).toBe(0);
    expect(report()).toContain("warning: door fox has a weak phrase");
    expect(report()).toContain("warning: the phrase of door fox appears in a.html");
    expect(report()).not.toMatch(/\bform\b/);
  });

  it("a route of one short token", async () => {
    write(basic(STRONG, { route: "/x/" }));
    site({ "a.html": '<a href="/x/">x</a>' });
    expect(await go()).toBe(0);
    expect(report()).toContain("a data value of door fox appears in a.html");
  });

  it("an external script beside a sealed gate", async () => {
    write(basic());
    site({ "a.html": '<web-threshold sealed="#b"></web-threshold><script src="https://cdn.example/x.js"></script>' });
    expect(await go()).toBe(0);
    expect(report()).toContain("external script");
  });

  it("no warning for ordinary pages", async () => {
    write(basic());
    site({ "a.html": '<script src="https://cdn.example/x.js"></script>' });
    expect(await go()).toBe(0);
    expect(report()).not.toContain("external script");
  });
});

describe("scan: carve-outs", () => {
  it("allowPublic exempts an exact target and prints it", async () => {
    write({ ...basic(CANARY), allowPublic: [CANARY] });
    site({ "a.html": `<p>${CANARY}</p>` });
    expect(await go()).toBe(0);
    expect(report()).toContain("allowed public: the phrase of door fox");
  });

  it("allowPublic doesn't exempt anything else", async () => {
    write({ ...basic(CANARY), allowPublic: ["something else entirely"] });
    site({ "a.html": `<p>${CANARY}</p>` });
    expect(await go()).toBe(1);
  });
  it("covers a payload's whole text", async () => {
    write({
      payloads: { note: { from: source("s.txt", "shared footer of the site"), type: "text/plain" } },
      doors: [{ tier: "fox", phrase: STRONG, open: ["note"] }],
      allowPublic: ["shared footer of the site"],
    });
    site({ "a.html": "<p>shared footer of the site</p>" });
    expect(await go()).toBe(0);
    expect(report()).toContain("allowed public: text of payload note");
  });

  it("covers an exact 8-token run of a payload", async () => {
    const run = "one two three four five six seven eight";
    write({
      payloads: { note: { from: source("s.txt", `${run} and then more hidden words`), type: "text/plain" } },
      doors: [{ tier: "fox", phrase: STRONG, open: ["note"] }],
      allowPublic: [run],
    });
    site({ "a.html": `<p>${run}</p>` });
    expect(await go()).toBe(0);
  });
});

describe("doors file refusals", () => {
  const refused: [string, () => object, RegExp][] = [
    ["no doors", () => ({ payloads: {}, doors: [] }), /at least one door/],
    ["an unknown key", () => ({ ...basic(), decoys: 16 }), /decoys/],
    ["an unknown door key", () => ({ payloads: {}, doors: [{ tier: "a", phrase: STRONG, open: [], hint: true }] }), /hint/],
    ["no tier", () => ({ payloads: {}, doors: [{ phrase: STRONG, open: [] }] }), /needs a tier/],
    ["an empty phrase", () => ({ payloads: {}, doors: [{ tier: "a", phrase: "   ", open: [] }] }), /door a: needs a phrase/],
    ["a phrase that isn't text", () => ({ payloads: {}, doors: [{ tier: "a", phrase: { env: "X" }, open: [] }] }), /needs a phrase/],
    ["no open list", () => ({ payloads: {}, doors: [{ tier: "a", phrase: STRONG }] }), /needs an "open" list/],
    ["an unknown payload", () => ({ payloads: {}, doors: [{ tier: "a", phrase: STRONG, open: ["nope"] }] }), /unknown payload "nope"/],
    ["duplicates by case", () => ({ payloads: {}, doors: [{ tier: "a", phrase: "Same Phrase Here", open: [] }, { tier: "b", phrase: "same  phrase here", open: [] }] }), /door b: has the same phrase/],
    ["duplicates by accent only", () => ({ payloads: {}, doors: [{ tier: "a", phrase: "el año pasado aquí", open: [] }, { tier: "b", phrase: "el ano pasado aqui", open: [] }] }), /door b: has the same phrase/],
    ["allowPublic that isn't strings", () => ({ ...basic(), allowPublic: [1] }), /allowPublic/],
  ];

  it.each(refused)("refuses %s", async (_label, doors, message) => {
    write(doors());
    expect(await go()).toBe(1);
    expect(report()).toMatch(message);
    expect(existsSync(join(out, BUNDLE_PATH))).toBe(false);
  });

  it("never prints a phrase when refusing", async () => {
    write({ payloads: {}, doors: [{ tier: "a", phrase: STRONG, open: ["nope"] }, { tier: "b", phrase: STRONG, open: [] }] });
    expect(await go()).toBe(1);
    expect(report()).not.toContain(STRONG);
  });

  it("refuses unparseable JSON without quoting it", async () => {
    writeFileSync(doorsPath(), `{ "phrase": "${STRONG}" `);
    expect(await go()).toBe(1);
    expect(report()).toContain("isn't valid JSON");
    expect(report()).not.toContain(STRONG);
  });

  it("refuses a missing doors file", async () => {
    expect(await go()).toBe(1);
    expect(report()).toContain("no doors file");
  });
});

describe("path refusals", () => {
  it("a doors file inside --out", async () => {
    write(basic());
    const inside = join(out, "doors.json");
    writeFileSync(inside, readFileSync(doorsPath()));
    expect(await seal({ doors: inside, out, log: (l) => lines.push(l) })).toBe(1);
    expect(report()).toContain("the doors file is a secret, and it's inside --out");
  });

  it("a source inside --out", async () => {
    site({ "note.html": "<p>hello</p>" });
    write({ payloads: { n: { from: "dist/note.html", type: "text/html" } }, doors: [{ tier: "a", phrase: STRONG, open: ["n"] }] });
    expect(await go()).toBe(1);
    expect(report()).toContain("its source is inside --out");
  });

  it("a missing source", async () => {
    write({ payloads: { n: { from: "nope.html", type: "text/html" } }, doors: [{ tier: "a", phrase: STRONG, open: ["n"] }] });
    expect(await go()).toBe(1);
  });

  it("a missing --out", async () => {
    write(basic());
    expect(await seal({ doors: doorsPath(), out: join(dir, "nope"), log: (l) => lines.push(l) })).toBe(1);
  });

  it("a rerun: a bundle already in --out", async () => {
    write(basic());
    expect(await go()).toBe(0);
    expect(await go()).toBe(1);
    expect(report()).toContain("already in --out");
  });
});

describe("git", () => {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { stdio: "ignore" });

  it("refuses a tracked doors file", async () => {
    git("init", "-q");
    write(basic());
    git("add", "doors.json");
    expect(await go()).toBe(1);
    expect(report()).toContain("tracked by git");
    expect(existsSync(join(out, BUNDLE_PATH))).toBe(false);
  });

  it("refuses a tracked source", async () => {
    git("init", "-q");
    write(basic());
    git("add", "note.html");
    expect(await go()).toBe(1);
  });

  it("allows it with --public-fixture, and says so", async () => {
    git("init", "-q");
    write(basic());
    git("add", "doors.json");
    expect(await go({ publicFixture: true })).toBe(0);
    expect(report()).toContain("git: tracked, allowed by --public-fixture");
  });

  it("says untracked when it is", async () => {
    git("init", "-q");
    write(basic());
    expect(await go()).toBe(0);
    expect(report()).toContain("git: untracked");
  });
});

describe("read-back catches a bad sealer", () => {
  const file: DoorsFile = {
    payloads: { a: { from: "a", type: "text/plain" }, b: { from: "b", type: "text/plain" } },
    doors: [
      { tier: "one", phrase: "first door phrase", open: ["a"] },
      { tier: "two", phrase: "second door phrase", open: ["b"] },
    ],
    allowPublic: [],
  };
  const contents = new Map([["a", new TextEncoder().encode("aaa")], ["b", new TextEncoder().encode("bbb")]]);
  // Sealed by `sealed`, checked against the real doors file and contents, with the files it wrote.
  const check = async (sealed: DoorsFile, c: Map<string, Uint8Array>) => {
    const { bundle, files } = await buildBundle(sealed, c);
    return [bundle, file, contents, files] as const;
  };

  it("passes a good bundle", async () => {
    await expect(verifyBundle(...(await check(file, contents)))).resolves.toBeUndefined();
  });

  it("a record holding an undeclared key", async () => {
    const wider: DoorsFile = { ...file, doors: [{ tier: "one", phrase: "first door phrase", open: ["a", "b"] }, file.doors[1]!] };
    await expect(verifyBundle(...(await check(wider, contents)))).rejects.toThrow(/exactly its declared/);
  });

  it("different content", async () => {
    const other = new Map(contents).set("a", new TextEncoder().encode("xxx"));
    await expect(verifyBundle(...(await check(file, other)))).rejects.toThrow(/byte-identical/);
  });

  it("corrupted ciphertext", async () => {
    const { bundle, files } = await buildBundle(file, contents);
    bundle.slots[0]!.ct = bundle.slots[0]!.ct.replace(/^./, (c) => (c === "A" ? "B" : "A"));
    await expect(verifyBundle(bundle, file, contents, files)).rejects.toThrow(/opened 0 slots/);
  });

  it("swapped tiers", async () => {
    const swapped: DoorsFile = { ...file, doors: [{ ...file.doors[0]!, tier: "two" }, { ...file.doors[1]!, tier: "one" }] };
    await expect(verifyBundle(...(await check(swapped, contents)))).rejects.toThrow(/another door's record/);
  });

  it("two payloads sharing a key", async () => {
    const salt = randomBytes(16);
    const key = randomBytes(32);
    const slots: Bundle["slots"] = [];
    const files = new Map<string, Uint8Array>();
    for (const door of file.doors) {
      const name = door.open[0]!;
      const sealed = await encrypt(key, contents.get(name)!);
      files.set(`s/${name}.sealed`, fromB64(sealed.ct));
      const open = { [name]: { k: toB64(key), type: "text/plain", iv: sealed.iv, src: `/s/${name}.sealed` } };
      slots.push(await encrypt(await deriveKek(door.phrase, salt, 10), padRecord({ tier: door.tier, open })));
    }
    const bundle: Bundle = { v: 1, kdf: { iter: 10, salt: toB64(salt), norm: "fold1" }, slots };
    await expect(verifyBundle(bundle, file, contents, files)).rejects.toThrow(/share a key/);
  });

  it("a slot that any phrase opens", async () => {
    const { bundle, files } = await buildBundle(file, contents);
    const extra = await encrypt(await deriveKek("first door phrase", fromB64(bundle.kdf.salt), bundle.kdf.iter), padRecord({ tier: "one", open: {} }));
    bundle.slots.push(extra);
    await expect(verifyBundle(bundle, file, contents, files)).rejects.toThrow(/opened 2 slots/);
  });

  it("a real run stops on a bad sealer, writing nothing", async () => {
    write(basic());
    const broken = async (doors: DoorsFile, c: Map<string, Uint8Array>) => {
      const built = await buildBundle(doors, c);
      built.bundle.slots = [];
      return built;
    };
    expect(await go({ build: broken })).toBe(1);
    expect(report()).toContain("read-back: door fox opened 0 slots");
    expect(existsSync(join(out, BUNDLE_PATH))).toBe(false);
  });

  it("a sealer writing plaintext is stopped, by read-back or by the scan", async () => {
    write(basic());
    const leaky = async (doors: DoorsFile, c: Map<string, Uint8Array>) => {
      const built = await buildBundle(doors, c);
      return { ...built, bundle: { ...built.bundle, leak: new TextDecoder().decode(c.get("note")!) } as Bundle };
    };
    expect(await go({ build: leaky })).toBe(1);
    expect(report()).toContain("text of payload note appears in");
    expect(existsSync(join(out, BUNDLE_PATH))).toBe(false);
  });
});

describe("limits", () => {
  it("refuses over 1,024 doors", async () => {
    const doors = Array.from({ length: 1025 }, (_, i) => ({ tier: `t${i}`, phrase: `phrase number ${i} here`, open: [] }));
    write({ payloads: {}, doors });
    expect(await go()).toBe(1);
    expect(report()).toContain("over the limit");
  });
});

describe("web-threshold seal", () => {
  const cli = (...args: string[]) => run(["seal", ...args], dir, (line) => lines.push(line));

  it("seals from the command line", async () => {
    write(basic());
    expect(await cli("--doors", "doors.json", "--out", "dist")).toBe(0);
    expect(existsSync(join(out, BUNDLE_PATH))).toBe(true);
  });

  it.each([[[]], [["--doors", "doors.json"]], [["--doors", "doors.json", "--out"]], [["--doors", "doors.json", "--out", "dist", "--phrase", "x"]], [["--doors", "doors.json", "--out", "dist", "--shell"]]])(
    "refuses arguments %j",
    async (args) => {
      write(basic());
      expect(await cli(...args)).toBe(1);
      expect(report()).toContain("usage");
      expect(existsSync(join(out, BUNDLE_PATH))).toBe(false);
    },
  );
});

describe("escaped text (g-1)", () => {
  const poem = "violets under\nthe third stone\nkeep their counsel\nuntil the frost";
  const withPoem = () => ({
    payloads: { note: { from: source("poem.txt", poem), type: "text/plain" } },
    doors: [{ tier: "fox", phrase: STRONG, open: ["note"] }],
  });

  it.each([
    ["JSON", () => ({ "search-index.json": JSON.stringify({ body: poem }) })],
    ["a source map", () => ({ "app.js.map": JSON.stringify({ sourcesContent: [poem] }) })],
    ["a script string", () => ({ "app.js": `const s = ${JSON.stringify(poem)};` })],
    ["\\u escapes", () => ({ "a.json": JSON.stringify(poem).replace(/ /g, "\\u0020") })],
    ["a URL", () => ({ "a.html": `<a href="/s?q=${encodeURIComponent(poem)}">x</a>` })],
    ["HTML entities", () => ({ "a.html": `<p>${poem.replace(/ /g, "&#32;").replace(/\n/g, "&nbsp;")}</p>` })],
  ])("a multi-line payload in %s aborts", async (_label, files) => {
    write(withPoem());
    site(files());
    expect(await go()).toBe(1);
    expect(report()).toContain("text of payload note appears in");
    expect(existsSync(join(out, BUNDLE_PATH))).toBe(false);
  });

  it("a multi-line data string in a script aborts", async () => {
    write(basic(STRONG, { line: "first line here\nsecond line there" }));
    site({ "app.js": `const s = ${JSON.stringify("first line here\nsecond line there")};` });
    expect(await go()).toBe(1);
  });

  it("a phrase in a query string aborts", async () => {
    write(basic());
    site({ "a.html": `<a href="/?q=${encodeURIComponent(STRONG)}">x</a>` });
    expect(await go()).toBe(1);
  });

  it("a bad escape doesn't crash the scan", async () => {
    write(basic());
    site({ "a.html": "100%zz &#99999999; %E0%A4%A \\u12" });
    expect(await go()).toBe(0);
  });
});

describe("the doors file in public output (g-2)", () => {
  it("a bundler's copy aborts, even with short phrases", async () => {
    write(basic("short"));
    site({ "doors.json": readFileSync(doorsPath()) });
    expect(await go()).toBe(1);
    expect(report()).toContain("doors.json is a public copy of the doors file");
  });

  it("a doors file reached through a symlinked --out", async () => {
    write(basic());
    const inside = join(out, "secret.json");
    writeFileSync(inside, readFileSync(doorsPath()));
    const link = join(dir, "link");
    symlinkSync(out, link);
    expect(await seal({ doors: inside, out: link, log: (l) => lines.push(l) })).toBe(1);
    expect(report()).toContain("the doors file is a secret");
  });

  it("a name that starts with two dots is still inside", async () => {
    write(basic());
    const inside = join(out, "..doors.json");
    writeFileSync(inside, readFileSync(doorsPath()));
    expect(await seal({ doors: inside, out, log: (l) => lines.push(l) })).toBe(1);
    expect(report()).toContain("the doors file is a secret");
  });
});

describe("large sites (g-5, g-6)", () => {
  it("doesn't read a huge binary", async () => {
    write(basic());
    const fd = openSync(join(out, "film.mp4"), "w");
    ftruncateSync(fd, 3 * 1024 ** 3);
    closeSync(fd);
    expect(await go()).toBe(0);
    expect(report()).toContain("1 binary");
  });

  it("stays linear on a < with no >", async () => {
    write(basic());
    site({ "a.csv": "a<b ".repeat(250_000) });
    const started = Date.now();
    expect(await go()).toBe(0);
    expect(Date.now() - started).toBeLessThan(20_000);
  }, 30_000);

  it("takes feeds and captions", async () => {
    write(basic());
    site({ "feed.rss": "<rss/>", "feed.atom": "<feed/>", "a.vtt": "WEBVTT", "clip.mov": "x" });
    expect(await go()).toBe(0);
  });
});

describe("real failures say what happened (g-7)", () => {
  it("a dangling symlink aborts, naming it", async () => {
    write(basic());
    symlinkSync(join(dir, "gone"), join(out, "dangling.html"));
    expect(await go()).toBe(1);
    expect(report()).toContain("dangling.html can't be read (ENOENT)");
  });

  it("follows a directory symlink, and scans through it", async () => {
    write(basic(CANARY));
    const other = join(dir, "other");
    mkdirSync(other);
    writeFileSync(join(other, "a.html"), `<p>${CANARY}</p>`);
    symlinkSync(other, join(out, "linked"));
    expect(await go()).toBe(1);
    expect(report()).toContain("appears in linked/a.html");
  });

  it("survives a symlink loop", async () => {
    write(basic());
    symlinkSync(out, join(out, "loop"));
    expect(await go()).toBe(0);
  });

  it("an s that's a file names the problem, and leaves nothing behind", async () => {
    write(basic());
    site({ s: "a file" });
    expect(await go()).toBe(1);
    expect(report()).toContain("is a file");
  });

  it("a from that's a directory is refused by name", async () => {
    mkdirSync(join(dir, "adir"));
    write({ payloads: { n: { from: "adir", type: "text/plain" } }, doors: [{ tier: "a", phrase: STRONG, open: ["n"] }] });
    expect(await go()).toBe(1);
    expect(report()).toContain("adir isn't a file");
  });

  it.each([[{ payloads: {}, doors: [null] }], [{ payloads: { a: null }, doors: [{ tier: "a", phrase: STRONG, open: [] }] }]])("refuses %j", async (doors) => {
    write(doors);
    expect(await go()).toBe(1);
    expect(report()).toContain("must be an object");
  });

  it("writes nothing beside --out", async () => {
    write(basic());
    await go();
    expect(execFileSync("ls", ["-A", out]).toString().trim()).toBe("s");
  });
});

describe("the git check doesn't fail open (g-8)", () => {
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { stdio: "ignore" });

  it("ignores GIT_DIR from a hook", async () => {
    git("init", "-q");
    write(basic());
    git("add", "doors.json");
    const elsewhere = mkdtempSync(join(tmpdir(), "elsewhere-"));
    execFileSync("git", ["-C", elsewhere, "init", "-q"]);
    process.env.GIT_DIR = join(elsewhere, ".git");
    try {
      expect(await go()).toBe(1);
    } finally {
      delete process.env.GIT_DIR;
    }
    expect(report()).toContain("tracked by git");
  });

  it("sees through a symlink to a tracked file", async () => {
    git("init", "-q");
    write(basic());
    git("add", "note.html");
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    symlinkSync(join(dir, "note.html"), join(outside, "note.html"));
    writeFileSync(doorsPath(), JSON.stringify({
      payloads: { note: { from: join(outside, "note.html"), type: "text/html" } },
      doors: [{ tier: "fox", phrase: STRONG, open: ["note"] }],
    }));
    expect(await go()).toBe(1);
    expect(report()).toContain("tracked by git");
  });
});

describe("phrases the token rule can't see (g-9)", () => {
  it.each(["\u{1F525}\u{1F525}\u{1F525}", ":-)"])("%s warns when it's public", async (phrase) => {
    write(basic(phrase));
    site({ "a.html": `<p>look ${phrase} here</p>` });
    expect(await go()).toBe(0);
    expect(report()).toContain("the phrase of door fox appears in a.html");
  });

  it("unspaced Japanese inside a sentence warns", async () => {
    write(basic("門を開けて"));
    site({ "a.html": "<p>彼は門を開けて入った</p>" });
    expect(await go()).toBe(0);
    expect(report()).toContain("the phrase of door fox appears in a.html");
  });

  it("a long unspaced phrase aborts", async () => {
    const phrase = "門を開けて庭の奥まで歩いて行くと古い井戸がある";
    write(basic(phrase));
    site({ "a.html": `<p>彼は${phrase}と言った</p>` });
    expect(await go()).toBe(1);
  });
});

describe("URL-loaded payloads", () => {
  const PNG = Buffer.from("89504e470d0a1a0a", "hex");
  const image = (size = 2000) => Buffer.concat([PNG, randomBytes(size)]);
  const sealedFiles = () => execFileSync("ls", [join(out, "s")]).toString().split("\n").filter((name) => name.endsWith(".sealed"));
  const readFromOut = async (src: string) => new Uint8Array(readFileSync(join(out, src)));
  const openWith = async (phrase: string) => {
    const bundle = written();
    const [record] = await openSlots(bundle, await deriveKek(phrase, fromB64(bundle.kdf.salt), bundle.kdf.iter));
    return { bundle, record: record! };
  };

  it("writes an image as pure ciphertext at a random name that opens with the phrase", async () => {
    const bytes = image();
    writeFileSync(join(dir, "moth.png"), bytes);
    write({ payloads: { moth: { from: "moth.png", type: "image/png" } }, doors: [{ tier: "moth", phrase: STRONG, open: ["moth"] }] });
    expect(await go()).toBe(0);
    const [name] = sealedFiles();
    expect(name).not.toContain("moth");
    const file = readFileSync(join(out, "s", name!));
    expect(file.includes(PNG)).toBe(false);
    expect(file.length).toBe(bytes.length + 16); // the data and the tag, nothing else
    const { bundle, record } = await openWith(STRONG);
    const entry = record.open.moth!;
    expect(entry.src).toBe(`/s/${name}`);
    expect(Buffer.compare(Buffer.from(await openEntry(entry, readFromOut)), bytes)).toBe(0);
  });

  it("doesn't name the file anywhere public", async () => {
    writeFileSync(join(dir, "moth.png"), image());
    write({ payloads: { moth: { from: "moth.png", type: "image/png" } }, doors: [{ tier: "moth", phrase: STRONG, open: ["moth"] }] });
    expect(await go()).toBe(0);
    expect(readFileSync(join(out, BUNDLE_PATH), "utf8")).not.toContain(sealedFiles()[0]!);
    expect(report()).not.toContain(sealedFiles()[0]!);
  });

  it("writes every payload to its own file, keeping the bundle free of them (j-9)", async () => {
    write({
      payloads: {
        small: { from: source("small.txt", "little words here"), type: "text/plain" },
        big: { from: source("big.txt", "lorem ".repeat(12_000)), type: "text/plain" },
      },
      doors: [{ tier: "a", phrase: STRONG, open: ["small", "big"] }],
    });
    expect(await go()).toBe(0);
    expect(Object.keys(written())).toEqual(["v", "kdf", "slots"]);
    expect(sealedFiles()).toHaveLength(2);
  });

  it("scans the text of a payload in a file", async () => {
    const text = Array.from({ length: 12_000 }, (_, i) => `word${i}`).join(" ");
    write({ payloads: { big: { from: source("big.txt", text), type: "text/plain" } }, doors: [{ tier: "a", phrase: STRONG, open: ["big"] }] });
    site({ "a.html": `<p>${text.split(" ").slice(500, 516).join(" ")}</p>` });
    expect(await go()).toBe(1);
    expect(report()).toContain("text of payload big appears in a.html");
  });

  it("finds a long leak in a very long text, which steps by whole windows", async () => {
    const text = Array.from({ length: 30_000 }, (_, i) => `w${i}`).join(" ");
    writeFileSync(join(dir, "long.txt"), text);
    write({ payloads: { big: { from: "long.txt", type: "text/plain" } }, doors: [{ tier: "a", phrase: STRONG, open: ["big"] }] });
    site({ "a.html": `<p>${text.split(" ").slice(1003, 1019).join(" ")}</p>` });
    expect(await go()).toBe(1);
  });

  it("aborts on a public copy of an image", async () => {
    const bytes = image();
    writeFileSync(join(dir, "moth.png"), bytes);
    write({ payloads: { moth: { from: "moth.png", type: "image/png" } }, doors: [{ tier: "a", phrase: STRONG, open: ["moth"] }] });
    site({ "copy.webp": bytes });
    expect(await go()).toBe(1);
    expect(report()).toContain("public copy of payload moth");
  });

  it("warns over 2 MiB and aborts over 10 MiB", async () => {
    writeFileSync(join(dir, "m.bin"), Buffer.alloc(2 * 1024 * 1024 + 1, 1));
    write({ payloads: { m: { from: "m.bin", type: "video/mp4" } }, doors: [{ tier: "a", phrase: STRONG, open: ["m"] }] });
    expect(await go()).toBe(0);
    expect(report()).toContain("over 2 MiB");

    out = join(dir, "dist2");
    mkdirSync(out);
    writeFileSync(join(dir, "m.bin"), Buffer.alloc(10 * 1024 * 1024 + 1, 1));
    expect(await go()).toBe(1);
    expect(report()).toContain("over the 10 MiB limit");
    expect(existsSync(join(out, "s"))).toBe(false);
  });

  it("refuses something that isn't a media type", async () => {
    write({ payloads: { a: { from: "x", type: "not a type" } }, doors: [{ tier: "a", phrase: STRONG, open: ["a"] }] });
    expect(await go()).toBe(1);
    expect(report()).toContain("isn't a media type");
  });

  it("read-back catches a file that was never written", async () => {
    writeFileSync(join(dir, "moth.png"), image());
    write({ payloads: { moth: { from: "moth.png", type: "image/png" } }, doors: [{ tier: "a", phrase: STRONG, open: ["moth"] }] });
    const dropped = async (doors: DoorsFile, c: Map<string, Uint8Array>) => ({ ...(await buildBundle(doors, c)), files: new Map() });
    expect(await go({ build: dropped })).toBe(1);
    expect(report()).toContain("wasn't written");
    expect(existsSync(join(out, BUNDLE_PATH))).toBe(false);
  });

  it("read-back catches altered ciphertext in a file", async () => {
    writeFileSync(join(dir, "moth.png"), image());
    write({ payloads: { moth: { from: "moth.png", type: "image/png" } }, doors: [{ tier: "a", phrase: STRONG, open: ["moth"] }] });
    const altered = async (doors: DoorsFile, c: Map<string, Uint8Array>) => {
      const built = await buildBundle(doors, c);
      for (const bytes of built.files.values()) bytes[0]! ^= 1;
      return built;
    };
    expect(await go({ build: altered })).toBe(1);
  });
});

describe("sealed pages", () => {
  const ELEMENT = `class Fake {} /* element code with its own </script> words about form and label */`;
  const secret = "<h1>The inner room</h1><p>Only a door brings you to this quiet place behind the wall.</p>";
  const doors = (page = "s/room-7f3a9b/index.html") => ({
    payloads: { room: { from: source("room.html", secret), type: "text/html", page } },
    doors: [{ tier: "keeper", phrase: STRONG, open: ["room"] }],
  });
  const seal2 = (extra: object = {}) => go({ element: ELEMENT, ...extra });
  const shellPath = () => join(out, "s/room-7f3a9b/index.html");

  it("writes a shell holding the door, and not the page", async () => {
    write(doors());
    expect(await seal2()).toBe(0);
    const html = readFileSync(shellPath(), "utf8");
    expect(html).toContain('<web-threshold sealed="/s/site.json" data-open="room"');
    expect(html).not.toContain('"slots"');
    expect(html).not.toContain("inner room");
    expect(html).not.toContain("quiet place");
    expect(report()).toContain("1 pages");
  });

  it("the site bundle opens the page, from its own file", async () => {
    write(doors());
    await seal2();
    const bundle = written();
    const [record] = await openSlots(bundle, await deriveKek(STRONG, fromB64(bundle.kdf.salt), bundle.kdf.iter));
    const plain = await openEntry(record!.open.room!, async (src) => new Uint8Array(readFileSync(join(out, src))));
    expect(new TextDecoder().decode(plain)).toBe(secret);
  });

  it("stays small however many pages there are", async () => {
    const payloads: Record<string, object> = {};
    const list = Array.from({ length: 8 }, (_, i) => `p${i}`);
    for (const name of list) payloads[name] = { from: source(`${name}.html`, `<p>page ${name} ${"lorem ipsum ".repeat(2000)}</p>`), type: "text/html", page: `s/${name}/index.html` };
    write({ payloads, doors: [{ tier: "k", phrase: STRONG, open: list }], allowPublic: [] });
    expect(await seal2()).toBe(0);
    expect(readFileSync(join(out, "s/p0/index.html")).length).toBeLessThan(5000);
    expect(readFileSync(join(out, BUNDLE_PATH)).length).toBeLessThan(5000);
  });

  it("inlines the element so its text can't close the script", async () => {
    write(doors());
    await seal2();
    const html = readFileSync(shellPath(), "utf8");
    expect(html).toContain("class Fake");
    expect(html).toContain("its own <\\/script> words");
  });

  it("doesn't count the element's own words as a leak", async () => {
    write({ ...doors(), doors: [{ tier: "keeper", phrase: "its own words about form", open: ["room"] }] });
    expect(await seal2({ element: "/* its own words about form */" })).toBe(0);
  });

  it("still scans the shell: a template holding a secret aborts", async () => {
    write(doors());
    writeFileSync(join(dir, "shell.html"), `<p>${STRONG}</p><!--web-threshold-->`);
    expect(await seal2({ shell: join(dir, "shell.html") })).toBe(1);
    expect(report()).toContain("the phrase of door keeper appears in s/room-7f3a9b/index.html");
    expect(existsSync(shellPath())).toBe(false);
  });

  it("uses a custom shell", async () => {
    write(doors());
    writeFileSync(join(dir, "shell.html"), `<html><title>Mine</title><!--web-threshold--></html>`);
    expect(await seal2({ shell: join(dir, "shell.html") })).toBe(0);
    expect(readFileSync(shellPath(), "utf8")).toContain("<title>Mine</title>");
  });

  it.each(["<html></html>", "<!--web-threshold--><!--web-threshold-->"])("refuses a shell without exactly one marker: %s", async (template) => {
    write(doors());
    writeFileSync(join(dir, "shell.html"), template);
    expect(await seal2({ shell: join(dir, "shell.html") })).toBe(1);
    expect(report()).toContain("exactly once");
  });

  it("aborts when a public page links to the sealed path", async () => {
    write(doors("s/room-with-a-long-name-7f3a9b/index.html"));
    site({ "a.html": '<a href="/s/room-with-a-long-name-7f3a9b/">in</a>' });
    expect(await seal2()).toBe(1);
    expect(report()).toContain("the path of payload room appears in a.html");
  });

  it("refuses to replace a real file", async () => {
    write(doors());
    site({ "s/room-7f3a9b/index.html": "<p>already here</p>" });
    expect(await seal2()).toBe(1);
    expect(report()).toContain("already in --out");
    expect(report()).toContain("seal it in place");
    expect(readFileSync(shellPath(), "utf8")).toBe("<p>already here</p>");
  });

  it("a sealed page may share a stylesheet and scripts with the public site", async () => {
    const css = "body { font-family: Georgia, Times New Roman, serif; max-width: 34rem; margin: 0 auto; padding: 3rem 1rem; }";
    const js = "function shared(one, two, three, four, five, six, seven, eight) { return one + two; }";
    const page = `<html><style>${css}</style><script>${js}</script><body>${secret}</body></html>`;
    write({ payloads: { room: { from: source("r.html", page), type: "text/html", page: "s/room-7f3a9b/index.html" } }, doors: [{ tier: "keeper", phrase: STRONG, open: ["room"] }] });
    site({ "a.html": `<style>${css}</style><script>${js}</script><p>public</p>` });
    expect(await seal2()).toBe(0);
  });

  it("the page's words still abort, around its style block", async () => {
    const page = `<html><style>a { color: red }</style><body>${secret}</body></html>`;
    write({ payloads: { room: { from: source("r.html", page), type: "text/html", page: "s/room-7f3a9b/index.html" } }, doors: [{ tier: "keeper", phrase: STRONG, open: ["room"] }] });
    site({ "a.html": "<p>Only a door brings you to this quiet place</p>" });
    expect(await seal2()).toBe(1);
  });

  it("a style with no end doesn't hide the rest of a page's text, or hang", async () => {
    const page = `<html><style>${"a{}".repeat(2_000)}${secret}`;
    write({ payloads: { room: { from: source("r.html", page), type: "text/html", page: "s/room-7f3a9b/index.html" } }, doors: [{ tier: "keeper", phrase: STRONG, open: ["room"] }] });
    site({ "a.html": "<p>Only a door brings you to this quiet place</p>" });
    expect(await seal2()).toBe(1);
  });

  it("names a dead-end page", async () => {
    write({ payloads: { room: { from: source("r.html", secret), type: "text/html", page: "s/r/index.html" } }, doors: [{ tier: "k", phrase: STRONG, open: [] }] });
    expect(await seal2()).toBe(1);
    expect(report()).toContain("no door opens this page");
  });

  it("refuses two pages differing only by case", async () => {
    write({
      payloads: {
        a: { from: source("a.html", "a"), type: "text/html", page: "room/index.html" },
        b: { from: source("b.html", "b"), type: "text/html", page: "Room/index.html" },
      },
      doors: [{ tier: "t", phrase: STRONG, open: ["a", "b"] }],
    });
    expect(await seal2()).toBe(1);
    expect(report()).toContain("another payload already uses that page");
  });

  it("refuses a page whose folder is a file, before writing anything", async () => {
    write(doors("about.html/x.html"));
    site({ "about.html": "<p>about</p>" });
    expect(await seal2()).toBe(1);
    expect(report()).toContain("is a file");
    expect(existsSync(join(out, "s"))).toBe(false);
  });

  it("targets the full address of a page that isn't an index", async () => {
    write(doors("rooms/secret-vault-long-name-7f3a9b.html"));
    site({ "a.html": '<a href="/rooms/secret-vault-long-name-7f3a9b.html">in</a>' });
    expect(await seal2()).toBe(1);
    expect(report()).toContain("the path of payload room appears in a.html");
  });

  it("doesn't warn on a common folder word", async () => {
    write(doors("rooms/secret-vault-7f3a9b.html"));
    site({ "a.html": "<p>we have many rooms</p>" });
    expect(await seal2()).toBe(0);
    expect(report()).not.toContain("the path of payload");
  });

  it.each(["/s/room-with-a-long-name-7f3a9b/", "s/room-with-a-long-name-7f3a9b/index.html", "s/room-with-a-long-name-7f3a9b"])("allowPublic takes the address as %s", async (spelling) => {
    write({ ...doors("s/room-with-a-long-name-7f3a9b/index.html"), allowPublic: [spelling] });
    site({ "a.html": '<a href="/s/room-with-a-long-name-7f3a9b/">in</a>' });
    expect(await seal2()).toBe(0);
    expect(report()).toContain("allowed public: the path of payload room");
  });

  it("allowPublic takes a whole footer, longer than a window", async () => {
    const footer = "made with care in the high desert by people who love this place and everyone in it";
    const page = `<p>${secret}</p><footer>${footer}</footer>`;
    write({ payloads: { room: { from: source("r.html", page), type: "text/html", page: "s/r/index.html" } }, doors: [{ tier: "k", phrase: STRONG, open: ["room"] }], allowPublic: [footer] });
    site({ "a.html": `<footer>${footer}</footer>` });
    expect(await seal2()).toBe(0);
  });

  it("refuses without a built element", async () => {
    write(doors());
    expect(await go()).toBe(1);
    expect(report()).toContain("need the built element");
  });

  const badPages: [string, unknown][] = [
    ["an absolute path", "/etc/index.html"],
    ["a path climbing out", "../../index.html"],
    ["a hidden climb", "s/../../index.html"],
    ["a backslash", "s\\..\\index.html"],
    ["no .html", "s/room/"],
    ["not a string", 3],
  ];
  it.each(badPages)("refuses %s", async (_label, page) => {
    write(doors(page as string));
    expect(await seal2()).toBe(1);
    expect(report()).toContain('"page" must be a relative path');
  });

  it("refuses two payloads on one page, and a page that isn't HTML", async () => {
    write({
      payloads: {
        a: { from: source("a.html", "a"), type: "text/html", page: "s/p/index.html" },
        b: { from: source("b.html", "b"), type: "text/plain", page: "s/p/index.html" },
      },
      doors: [{ tier: "t", phrase: STRONG, open: ["a", "b"] }],
    });
    expect(await seal2()).toBe(1);
    expect(report()).toContain("another payload already uses that page");
    expect(report()).toContain("a page must be text/html");
  });
});

describe("writes stay inside --out (h-1)", () => {
  const room = () => ({ from: source("r.html", "<p>some sealed page words here</p>"), type: "text/html" });

  it("refuses a page through a symlinked folder", async () => {
    const elsewhere = join(dir, "elsewhere");
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(out, "rooms"));
    write({ payloads: { room: { ...room(), page: "rooms/x/index.html" } }, doors: [{ tier: "k", phrase: STRONG, open: ["room"] }] });
    expect(await go({ element: "/* e */" })).toBe(1);
    expect(report()).toContain("outside --out");
    expect(execFileSync("ls", ["-A", elsewhere]).toString()).toBe("");
  });

  it("refuses an s that's a symlink out", async () => {
    const elsewhere = join(dir, "elsewhere");
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(out, "s"));
    write(basic());
    expect(await go()).toBe(1);
    expect(report()).toContain("outside --out");
    expect(execFileSync("ls", ["-A", elsewhere]).toString()).toBe("");
  });

  it("allows a symlink that stays inside", async () => {
    mkdirSync(join(out, "real"));
    symlinkSync(join(out, "real"), join(out, "rooms"));
    write({ payloads: { room: { ...room(), page: "rooms/x/index.html" } }, doors: [{ tier: "k", phrase: STRONG, open: ["room"] }] });
    expect(await go({ element: "/* e */" })).toBe(0);
    expect(existsSync(join(out, "real/x/index.html"))).toBe(true);
  });

  it("read-back refuses a sealed file with a bad path", async () => {
    writeFileSync(join(dir, "m.png"), randomBytes(100));
    write({ payloads: { m: { from: "m.png", type: "image/png" } }, doors: [{ tier: "k", phrase: STRONG, open: ["m"] }] });
    const escaping = async (doors: DoorsFile, c: Map<string, Uint8Array>) => {
      const built = await buildBundle(doors, c);
      built.files.set("../escaped.sealed", new Uint8Array(1));
      return built;
    };
    expect(await go({ build: escaping })).toBe(1);
    expect(report()).toContain("unexpected path");
    expect(existsSync(join(dir, "escaped.sealed"))).toBe(false);
  });

  it("read-back refuses a sealed file no door opens", async () => {
    writeFileSync(join(dir, "m.png"), randomBytes(100));
    write({ payloads: { m: { from: "m.png", type: "image/png" } }, doors: [{ tier: "k", phrase: STRONG, open: ["m"] }] });
    const extra = async (doors: DoorsFile, c: Map<string, Uint8Array>) => {
      const built = await buildBundle(doors, c);
      built.files.set("s/extra.sealed", new TextEncoder().encode("plain secret text"));
      return built;
    };
    expect(await go({ build: extra })).toBe(1);
    expect(report()).toContain("no door opens");
  });
});

describe("payload text the scan must keep (h-2, h-6, h-10)", () => {
  const WORDS = "forty quiet words about a hidden garden that nobody has been told about yet at all";
  const payload = (text: string, type = "text/html") => ({ payloads: { n: { from: source("n.txt", text), type } }, doors: [{ tier: "k", phrase: STRONG, open: ["n"] }] });

  it.each([
    ["a custom element starting with style", `<styled-note>${WORDS}</styled-note><style>b{}</style>`],
    ["a custom element starting with script", `<scripture-note>${WORDS}</scripture-note><script>x</script>`],
    ["a JSON data block", `<script type="application/json">${JSON.stringify({ t: WORDS })}</script>`],
    ["an alt", `<img alt="${WORDS}" src="x.png">`],
    ["a meta description", `<meta name="description" content="${WORDS}">`],
  ])("%s", async (_label, text) => {
    write(payload(text));
    site({ "a.html": `<p>${WORDS}</p>` });
    expect(await go()).toBe(1);
    expect(report()).toContain("text of payload n appears in a.html");
  });

  it("plain text with < and > isn't read as tags", async () => {
    write(payload(`if a < b then ${WORDS} and c > d`, "text/plain"));
    site({ "a.html": `<p>${WORDS}</p>` });
    expect(await go()).toBe(1);
  });

  it.each(["TEXT/HTML", "application/xhtml+xml", "text/csv", "application/ld+json"])("scans a %s payload", async (type) => {
    write(payload(`<div>${WORDS}</div>`, type));
    site({ "a.html": `<p>${WORDS}</p>` });
    expect(await go()).toBe(1);
    expect(report()).toContain("text of payload n appears in a.html");
  });

  it("warns when text isn't UTF-8", async () => {
    writeFileSync(join(dir, "latin.txt"), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    write({ payloads: { n: { from: "latin.txt", type: "text/plain" } }, doors: [{ tier: "k", phrase: STRONG, open: ["n"] }] });
    expect(await go()).toBe(0);
    expect(report()).toContain("isn't valid UTF-8");
  });
});

describe("the shell's handler (h-7)", () => {
  async function runHandler(open: () => Promise<Blob>) {
    let writes = 0;
    let listener!: (e: { detail: object }) => Promise<void>;
    const gate = { dataset: { open: "room" }, addEventListener: (_: string, l: typeof listener) => (listener = l) };
    const document = { querySelector: () => gate, open() {}, write: () => writes++, close() {} };
    new Function("document", HANDLER)(document);
    const detail = { names: ["room"], open };
    return { fire: () => listener({ detail }), writes: () => writes };
  }

  it("writes once, however many times the door opens", async () => {
    let finish!: (b: Blob) => void;
    const slow = new Promise<Blob>((done) => (finish = done));
    const h = await runHandler(() => slow);
    const first = h.fire();
    const second = h.fire();
    finish(new Blob(["<p>x</p>"]));
    await Promise.all([first, second]);
    await h.fire();
    expect(h.writes()).toBe(1);
  });

  it("can try again after a failed open", async () => {
    let fail = true;
    const h = await runHandler(async () => {
      if (fail) throw new Error("no");
      return new Blob(["<p>x</p>"]);
    });
    await h.fire();
    expect(h.writes()).toBe(0);
    fail = false;
    await h.fire();
    expect(h.writes()).toBe(1);
  });
});

describe("sealing built pages in place", () => {
  const SECRET = "<html><body><h1>Members only</h1><p>Words nobody should read in the public source of this page.</p></body></html>";
  const doors = () => ({
    payloads: {
      about: { type: "text/html", page: "pages/about.html" },
      faq: { type: "text/html", page: "pages/faq.html" },
    },
    doors: [{ tier: "site", phrase: STRONG, open: ["about", "faq"] }],
  });
  const built = () => site({ "pages/about.html": SECRET, "pages/faq.html": SECRET.replace("Members", "Folks"), "index.html": "<p>the front</p>" });
  const run = (extra: object = {}) => go({ element: "/* e */", ...extra });

  it("replaces each page with a shell, and the page opens from its file", async () => {
    built();
    write(doors());
    expect(await run()).toBe(0);
    const shell = readFileSync(join(out, "pages/about.html"), "utf8");
    expect(shell).toContain("<web-threshold");
    expect(shell).not.toContain("Members only");
    const bundle = written();
    const [record] = await openSlots(bundle, await deriveKek(STRONG, fromB64(bundle.kdf.salt), bundle.kdf.iter));
    const plain = await openEntry(record!.open.about!, async (src) => new Uint8Array(readFileSync(join(out, src))));
    expect(new TextDecoder().decode(plain)).toBe(SECRET);
  });

  it("doesn't count the page itself as a leak, or a public copy", async () => {
    built();
    write(doors());
    expect(await run()).toBe(0);
    expect(report()).not.toContain("public copy");
  });

  it("still aborts on the page's text in a public file", async () => {
    built();
    site({ "other.html": "<p>Words nobody should read in the public source of this page.</p>" });
    write(doors());
    expect(await run()).toBe(1);
    expect(report()).toContain("appears in other.html");
    expect(readFileSync(join(out, "pages/about.html"), "utf8")).toBe(SECRET);
  });

  it("aborts on an unlisted copy of a page", async () => {
    built();
    site({ "backup.html": SECRET });
    write(doors());
    expect(await run()).toBe(1);
    expect(report()).toContain("backup.html is a public copy");
  });

  it("doesn't treat the known address as a secret", async () => {
    built();
    site({ "index.html": '<a href="/pages/about.html">about</a>' });
    write(doors());
    expect(await run()).toBe(0);
    expect(report()).not.toContain("the path of payload");
  });

  it("refuses a page that isn't there", async () => {
    write(doors());
    expect(await run()).toBe(1);
    expect(report()).toContain("no file at pages/about.html");
  });

  it("refuses a page through a symlink out, without touching it", async () => {
    const elsewhere = join(dir, "elsewhere");
    mkdirSync(elsewhere);
    writeFileSync(join(elsewhere, "about.html"), SECRET);
    symlinkSync(elsewhere, join(out, "pages"));
    write({ payloads: { about: { type: "text/html", page: "pages/about.html" } }, doors: [{ tier: "site", phrase: STRONG, open: ["about"] }] });
    expect(await run()).toBe(1);
    expect(report()).toContain("outside --out");
    expect(readFileSync(join(elsewhere, "about.html"), "utf8")).toBe(SECRET);
  });

  it("refuses to overwrite a page tracked by git", async () => {
    execFileSync("git", ["-C", dir, "init", "-q"], { stdio: "ignore" });
    built();
    write(doors());
    execFileSync("git", ["-C", dir, "add", "dist/pages/about.html"], { stdio: "ignore" });
    expect(await run()).toBe(1);
    expect(report()).toContain("tracked by git");
    expect(readFileSync(join(out, "pages/about.html"), "utf8")).toBe(SECRET);
  });

  it("needs a page or a from", async () => {
    write({ payloads: { a: { type: "text/plain" } }, doors: [{ tier: "t", phrase: STRONG, open: ["a"] }] });
    expect(await run()).toBe(1);
    expect(report()).toContain('needs a "from" path, or a "page"');
  });
});

describe("remember in the doors file", () => {
  const page = () => ({ payloads: { p: { from: source("p.html", "<p>x</p>"), type: "text/html", page: "s/p/index.html" } }, doors: [{ tier: "t", phrase: STRONG, open: ["p"] }] });

  it("writes it onto shells", async () => {
    write({ ...page(), remember: "session" });
    expect(await go({ element: "/* e */" })).toBe(0);
    expect(readFileSync(join(out, "s/p/index.html"), "utf8")).toContain('remember="session"');
  });

  it("leaves it off by default", async () => {
    write(page());
    expect(await go({ element: "/* e */" })).toBe(0);
    expect(readFileSync(join(out, "s/p/index.html"), "utf8")).not.toContain("remember=");
  });

  it("refuses another value", async () => {
    write({ ...page(), remember: "forever" });
    expect(await go({ element: "/* e */" })).toBe(1);
    expect(report()).toContain('remember can only be "session"');
  });
});

describe("in-place safety (i-1, i-2)", () => {
  const SECRET = "<html><body><p>Words nobody should read in the public source of this page.</p></body></html>";
  const one = () => ({ payloads: { p: { type: "text/html", page: "page.html" } }, doors: [{ tier: "t", phrase: STRONG, open: ["p"] }] });
  const run = () => go({ element: "/* e */" });

  it("refuses a page that's a symlink, leaving its target alone", async () => {
    const outside = join(dir, "outside.html");
    writeFileSync(outside, SECRET);
    symlinkSync(outside, join(out, "page.html"));
    write(one());
    expect(await run()).toBe(1);
    expect(report()).toContain("page.html is a symlink");
    expect(readFileSync(outside, "utf8")).toBe(SECRET);
  });

  it("replaces a hard link's name, not the file it shares", async () => {
    const outside = join(dir, "outside.html");
    writeFileSync(outside, SECRET);
    linkSync(outside, join(out, "page.html"));
    write(one());
    expect(await run()).toBe(0);
    expect(readFileSync(outside, "utf8")).toBe(SECRET);
    expect(readFileSync(join(out, "page.html"), "utf8")).toContain("<web-threshold");
  });

  it("refuses to seal its own shell, after the bundle is gone", async () => {
    site({ "page.html": SECRET });
    write(one());
    expect(await run()).toBe(0);
    rmSync(join(out, "s"), { recursive: true });
    expect(await run()).toBe(1);
    expect(report()).toContain("already a shell from an earlier run");
  });

  it("a read-only page doesn't stop the run or leave it half done", async () => {
    site({ "page.html": SECRET, "two.html": SECRET.replace("nobody", "somebody") });
    chmodSync(join(out, "page.html"), 0o444);
    write({ payloads: { p: { type: "text/html", page: "page.html" }, q: { type: "text/html", page: "two.html" } }, doors: [{ tier: "t", phrase: STRONG, open: ["p", "q"] }] });
    expect(await run()).toBe(0);
    expect(readFileSync(join(out, "two.html"), "utf8")).toContain("<web-threshold");
    expect(readFileSync(join(out, "page.html"), "utf8")).toContain("<web-threshold");
  });

  it("a folder it can't write to changes nothing, and says so", async () => {
    site({ "one.html": SECRET, "locked/two.html": SECRET.replace("nobody", "somebody") });
    write({ payloads: { p: { type: "text/html", page: "one.html" }, q: { type: "text/html", page: "locked/two.html" } }, doors: [{ tier: "t", phrase: STRONG, open: ["p", "q"] }] });
    chmodSync(join(out, "locked"), 0o555);
    try {
      expect(await run()).toBe(1);
    } finally {
      chmodSync(join(out, "locked"), 0o755);
    }
    expect(report()).toContain("Nothing in --out was replaced");
    expect(readFileSync(join(out, "one.html"), "utf8")).toBe(SECRET);
    expect(existsSync(join(out, BUNDLE_PATH))).toBe(false);
    expect(execFileSync("find", [out, "-name", ".seal-*"]).toString()).toBe("");
  });

  it("leaves no temporary files after a good run", async () => {
    site({ "page.html": SECRET });
    write(one());
    expect(await run()).toBe(0);
    expect(execFileSync("find", [out, "-name", ".seal-*"]).toString()).toBe("");
  });
});

describe("pass j: leaks and guards", () => {
  const page = (body: string, title = "t") => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
  const SECRET = "the vault code is under the third stone beside the old mill wheel";
  const temps = () => execFileSync("find", [out, "-name", ".seal-*"]).toString();

  it.each([
    ["&rsquo;", "the fox's den is here", "<p>the fox&rsquo;s den is here</p>"],
    ["&ntilde;", "el señor de la finka", "<p>el se&ntilde;or de la finka</p>"],
    ["&eacute;", "cafétéria générale du port", "<p>caf&eacute;t&eacute;ria g&eacute;n&eacute;rale du port</p>"],
    ["&shy;", STRONG, `<p>${STRONG.replace("quietly", "qui&shy;etly")}</p>`],
    // Invisible characters a hyphenator or editor inserts, in every spelling (k-1).
    ["&#173;", STRONG, `<p>${STRONG.replace("quietly", "qui&#173;etly")}</p>`],
    ["&#xAD;", STRONG, `<p>${STRONG.replace("quietly", "qui&#xAD;etly")}</p>`],
    ["a literal soft hyphen", STRONG, `<p>${STRONG.replace("quietly", "qui­etly")}</p>`],
    ["a JS \\u00AD", STRONG, `<script>const s = "${STRONG.replace("quietly", "qui\\u00ADetly")}";</script>`],
    ["a zero-width space", STRONG, `<p>${STRONG.replace("quietly", "qui​etly")}</p>`],
    ["a zero-width joiner", STRONG, `<p>${STRONG.replace("quietly", "qui‍etly")}</p>`],
    ["a word joiner", STRONG, `<p>${STRONG.replace("quietly", "qui⁠etly")}</p>`],
  ])("a phrase written with %s aborts (j-1)", async (_label, phrase, body) => {
    write(basic(phrase));
    site({ "index.html": page(body) });
    expect(await go()).toBe(1);
    expect(report()).toContain("the phrase of door fox appears in index.html");
  });

  it.each([
    ["\\xF1", 'const a="el se\\xF1or de la finka";'],
    ["\\u{f1}", 'const a="el se\\u{f1}or de la finka";'],
  ])("a phrase in a script written with %s aborts (j-1)", async (_label, code) => {
    write(basic("el señor de la finka"));
    site({ "app.js": code });
    expect(await go()).toBe(1);
    expect(report()).toContain("the phrase of door fox appears in app.js");
  });

  it("payload text written with entities is found in a decoded copy (j-1)", async () => {
    const words = Array.from({ length: 60 }, (_, i) => (i % 6 === 5 ? `don&rsquo;t${i}` : `word${i}`)).join(" ");
    write({ payloads: { s: { from: source("s.html", `<p>${words}</p>`), type: "text/html" } }, doors: [{ tier: "a", phrase: STRONG, open: ["s"] }] });
    site({ "feed.json": JSON.stringify({ text: words.replace(/&rsquo;/g, "’") }) });
    expect(await go()).toBe(1);
    expect(report()).toContain("text of payload s appears in feed.json");
  });

  it.each(["application/xml", "application/javascript", "application/x-yaml", "application/octet-stream"])(
    "a %s payload that reads as text is scanned (j-2)",
    async (type) => {
      write({ payloads: { s: { from: source("s.txt", `<a>${SECRET}</a>`), type } }, doors: [{ tier: "a", phrase: STRONG, open: ["s"] }] });
      site({ "feed.txt": `copy: ${SECRET}` });
      expect(await go()).toBe(1);
      expect(report()).toContain("text of payload s appears in feed.txt");
    },
  );

  it("a compressed copy of a page sealed in place aborts, however little text it shows (j-3)", async () => {
    const spa = page(`<div id="app"></div><script>app.textContent = "${SECRET}";</script>`, "Members Area");
    site({ "members/index.html": spa, "members/index.html.gz": gzipSync(spa), "members/index.html.br": brotliCompressSync(spa) });
    write({ payloads: { m: { type: "text/html", page: "members/index.html" } }, doors: [{ tier: "a", phrase: STRONG, open: ["m"] }] });
    expect(await go({ element: "/* e */" })).toBe(1);
    expect(report()).toContain("members/index.html.gz is a compressed public copy of payload m");
    expect(report()).toContain("members/index.html.br is a compressed public copy of payload m");
  });

  it("a compressed copy of a sealed image aborts (j-3)", async () => {
    const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), randomBytes(300)]);
    writeFileSync(join(dir, "moth.png"), bytes);
    write({ payloads: { moth: { from: "moth.png", type: "image/png" } }, doors: [{ tier: "a", phrase: STRONG, open: ["moth"] }] });
    site({ "moth.png.gz": gzipSync(bytes) });
    expect(await go()).toBe(1);
    expect(report()).toContain("moth.png.gz is a compressed public copy of payload moth");
  });

  it("a phrase in a file name aborts (j-10)", async () => {
    write(basic());
    site({ [`${STRONG.replace(/ /g, "-")}.html`]: page("x") });
    expect(await go()).toBe(1);
    expect(report()).toContain("the phrase of door fox appears in a file name in the top folder");
    // The name is the secret, so the log never prints it (k-2).
    expect(report()).not.toMatch(/marble|quietly|unfolds/);
  });

  it.each([
    ["spaces", "the hidden room under the mill"],
    ["hyphens", "the-hidden-room-under-the-mill"],
  ])("a data key written as words with %s aborts (j-10, k-3)", async (_label, key) => {
    write(basic(STRONG, { [key]: true }));
    site({ "index.html": page("<p>the hidden room under the mill</p>") });
    expect(await go()).toBe(1);
    expect(report()).toContain("a data value of door fox appears in index.html");
  });

  it("an empty data value warns about nothing (j-13)", async () => {
    write(basic(STRONG, { s: "" }));
    site({ "index.html": page("<p>x</p>") });
    expect(await go()).toBe(0);
    expect(report()).not.toContain("data value");
  });

  it("a hidden page's clean URL aborts (j-13)", async () => {
    write({
      payloads: { room: { from: source("in.html", page("<p>inside</p>")), type: "text/html", page: "s/inner-room-7f3a9b.html" } },
      doors: [{ tier: "a", phrase: STRONG, open: ["room"] }],
    });
    site({ "index.html": page('<a href="/s/inner-room-7f3a9b">go</a>') });
    expect(await go({ element: "/* e */" })).toBe(1);
    expect(report()).toContain("the path of payload room appears in index.html");
  });

  it("warns when a sealed page loads an external script (j-12)", async () => {
    site({ "room.html": page('<script src="https://www.googletagmanager.com/gtag/js"></script><p>words for those who know the way</p>') });
    write({ payloads: { room: { type: "text/html", page: "room.html" } }, doors: [{ tier: "a", phrase: STRONG, open: ["room"] }] });
    expect(await go({ element: "/* e */" })).toBe(0);
    expect(report()).toContain("payload room loads an external script");
  });

  it("a rename failing partway leaves the bundle, no temporary files, and a rerun that refuses (j-6)", async () => {
    site({ "page.html": page("<p>Words for those who know the way in.</p>") });
    write({ payloads: { p: { type: "text/html", page: "page.html" } }, doors: [{ tier: "a", phrase: STRONG, open: ["p"] }] });
    let calls = 0;
    const failing = (from: PathLike, to: PathLike) => {
      if (++calls === 2) throw Object.assign(new Error("disk"), { code: "EIO" });
      renameSync(from, to);
    };
    expect(await go({ element: "/* e */", rename: failing })).toBe(1);
    expect(report()).toContain("writing stopped partway (EIO)");
    expect(existsSync(join(out, BUNDLE_PATH))).toBe(true);
    expect(temps()).toBe("");
    expect(await go({ element: "/* e */" })).toBe(1);
    expect(report()).toContain(`${BUNDLE_PATH} is already in --out`);
  });

  it("the default shell says why it's blank without JavaScript", async () => {
    site({ "page.html": page("<p>Words for those who know the way in.</p>") });
    write({ payloads: { p: { type: "text/html", page: "page.html" } }, doors: [{ tier: "a", phrase: STRONG, open: ["p"] }] });
    expect(await go({ element: "/* e */" })).toBe(0);
    expect(readFileSync(join(out, "page.html"), "utf8")).toContain("<noscript>This page opens with a phrase, which needs JavaScript.</noscript>");
  });
});
