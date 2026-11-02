// @vitest-environment node
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { run } from "../cli/run.js";
import { deriveKek, encrypt, fromB64, openPayload, openSlots, padRecord, randomBytes, toB64, type Bundle } from "../gate/sealed-format.js";
import { BUNDLE_PATH, buildBundle, seal, verifyBundle, type DoorsFile } from "./index.js";

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
    expect(new TextDecoder().decode(await openPayload(bundle, record!.open.note!))).toContain("hidden note");
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
    ["a page, until slice 2", () => ({ payloads: { p: { from: "x.html", type: "text/html", page: "s/x/index.html" } }, doors: [{ tier: "a", phrase: STRONG, open: ["p"] }] }), /"page" isn't available yet/],
    ["a binary type, until slice 2", () => ({ payloads: { p: { from: "x.png", type: "image/png" } }, doors: [{ tier: "a", phrase: STRONG, open: ["p"] }] }), /binary type image\/png isn't available yet/],
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

  it("text over 64 KiB, until slice 2", async () => {
    write({ payloads: { n: { from: source("big.txt", "x ".repeat(33 * 1024)), type: "text/plain" } }, doors: [{ tier: "a", phrase: STRONG, open: ["n"] }] });
    expect(await go()).toBe(1);
    expect(report()).toContain("over 64 KiB");
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

  it("passes a good bundle", async () => {
    await expect(verifyBundle(await buildBundle(file, contents), file, contents)).resolves.toBeUndefined();
  });

  it("a record holding an undeclared key", async () => {
    const wider: DoorsFile = { ...file, doors: [{ tier: "one", phrase: "first door phrase", open: ["a", "b"] }, file.doors[1]!] };
    await expect(verifyBundle(await buildBundle(wider, contents), file, contents)).rejects.toThrow(/exactly its declared/);
  });

  it("different content", async () => {
    const other = new Map(contents).set("a", new TextEncoder().encode("xxx"));
    await expect(verifyBundle(await buildBundle(file, other), file, contents)).rejects.toThrow(/byte-identical/);
  });

  it("corrupted ciphertext", async () => {
    const bundle = await buildBundle(file, contents);
    bundle.slots[0]!.ct = bundle.slots[0]!.ct.replace(/^./, (c) => (c === "A" ? "B" : "A"));
    await expect(verifyBundle(bundle, file, contents)).rejects.toThrow(/opened 0 slots/);
  });

  it("swapped tiers", async () => {
    const swapped: DoorsFile = { ...file, doors: [{ ...file.doors[0]!, tier: "two" }, { ...file.doors[1]!, tier: "one" }] };
    await expect(verifyBundle(await buildBundle(swapped, contents), file, contents)).rejects.toThrow(/another door's record/);
  });

  it("two payloads sharing a key", async () => {
    const salt = randomBytes(16);
    const key = randomBytes(32);
    const inline: Bundle["inline"] = [];
    const slots: Bundle["slots"] = [];
    for (const door of file.doors) {
      const name = door.open[0]!;
      const pid = `pid-${name}`;
      inline.push({ pid, ...(await encrypt(key, contents.get(name)!)) });
      const open = { [name]: { k: toB64(key), type: "text/plain", pid } };
      slots.push(await encrypt(await deriveKek(door.phrase, salt, 10), padRecord({ tier: door.tier, open })));
    }
    const bundle: Bundle = { v: 1, kdf: { iter: 10, salt: toB64(salt), norm: "fold1" }, slots, inline };
    await expect(verifyBundle(bundle, file, contents)).rejects.toThrow(/share a key/);
  });

  it("a slot that any phrase opens", async () => {
    const bundle = await buildBundle(file, contents);
    const extra = await encrypt(await deriveKek("first door phrase", fromB64(bundle.kdf.salt), bundle.kdf.iter), padRecord({ tier: "one", open: {} }));
    bundle.slots.push(extra);
    await expect(verifyBundle(bundle, file, contents)).rejects.toThrow(/opened 2 slots/);
  });

  it("a real run stops on a bad sealer, writing nothing", async () => {
    write(basic());
    const broken = async (doors: DoorsFile, c: Map<string, Uint8Array>) => {
      const bundle = await buildBundle(doors, c);
      bundle.slots = [];
      return bundle;
    };
    expect(await go({ build: broken })).toBe(1);
    expect(report()).toContain("read-back: door fox opened 0 slots");
    expect(existsSync(join(out, BUNDLE_PATH))).toBe(false);
  });

  it("a sealer writing plaintext is stopped, by read-back or by the scan", async () => {
    write(basic());
    const leaky = async (doors: DoorsFile, c: Map<string, Uint8Array>) => {
      const bundle = await buildBundle(doors, c);
      return { ...bundle, leak: new TextDecoder().decode(c.get("note")!) } as Bundle;
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

  it.each([[[]], [["--doors", "doors.json"]], [["--doors", "doors.json", "--out"]], [["--doors", "doors.json", "--out", "dist", "--phrase", "x"]], [["--doors", "doors.json", "--out", "dist", "--shell", "shell.html"]]])(
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
    expect(report()).toMatch(/seal failed: (EEXIST|ENOTDIR)/);
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
