import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "./sealed-entry.js";
import { MAX_ITERATIONS, deriveKek, encrypt, fold1, fromB64, padRecord, randomBytes, toB64, type Bundle } from "./sealed-format.js";

// Few iterations: these tests are about the element, not the KDF. `seal` always uses the constant.
const ITER = 10;
const encode = (text: string) => new TextEncoder().encode(text);

async function makeBundle(doors: { phrase: string; tier: string; data?: unknown; payloads?: Record<string, string> }[]): Promise<Bundle> {
  const salt = randomBytes(16);
  const inline: Bundle["inline"] = [];
  const slots: Bundle["slots"] = [];
  for (const door of doors) {
    const open: Record<string, { k: string; type: string; pid: string }> = {};
    for (const [name, text] of Object.entries(door.payloads ?? {})) {
      const key = randomBytes(32);
      const pid = toB64(randomBytes(9));
      inline.push({ pid, ...(await encrypt(key, encode(text))) });
      open[name] = { k: toB64(key), type: "text/plain", pid };
    }
    const kek = await deriveKek(door.phrase, salt, ITER);
    slots.push(await encrypt(kek, padRecord({ tier: door.tier, open, data: door.data })));
  }
  return { v: 1, kdf: { iter: ITER, salt: toB64(salt), norm: "fold1" }, slots, inline };
}

type Sealed = HTMLElement & { secrets: Record<string, string> };

function mount(bundle: unknown, attrs: Record<string, string> = {}): { el: Sealed; events: { type: string; detail: any }[] } {
  document.body.innerHTML = "";
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "b";
  script.textContent = JSON.stringify(bundle);
  document.body.append(script);
  const el = document.createElement("web-threshold") as Sealed;
  el.setAttribute("sealed", "#b");
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  const events: { type: string; detail: any }[] = [];
  for (const type of ["tier-unlocked", "tier-rejected", "threshold-error"]) {
    el.addEventListener(type, (e) => events.push({ type, detail: (e as CustomEvent).detail }));
  }
  document.body.append(el);
  return { el, events };
}

function type(el: Sealed, phrase: string): void {
  el.shadowRoot!.querySelector("input")!.value = phrase;
  el.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

const settle = async (el: Sealed) => {
  await vi.waitFor(() => expect(el.hasAttribute("busy")).toBe(false));
  await new Promise((done) => setTimeout(done, 0));
  await vi.waitFor(() => expect(el.hasAttribute("busy")).toBe(false));
};

describe("sealed mode", () => {
  let bundle: Bundle;
  const odd = { route: "/s/x/", n: 3, nested: [{ a: null }, true], "": "empty key", ελ: "σάς" };

  beforeAll(async () => {
    bundle = await makeBundle([
      { phrase: "the fox was here", tier: "fox", data: odd, payloads: { note: "<p>fox note</p>" } },
      { phrase: "σάς μας", tier: "greek", payloads: { other: "greek note" } },
      { phrase: "no payload", tier: "bare" },
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("opens a door: tier, untouched data, names, and the payload as a Blob", async () => {
    const { el, events } = mount(bundle);
    type(el, "the fox was here");
    await settle(el);
    expect(events.map((e) => e.type)).toEqual(["tier-unlocked"]);
    const detail = events[0]!.detail;
    expect(detail.tier).toBe("fox");
    expect(detail.data).toEqual(odd);
    expect(detail.names).toEqual(["note"]);
    const blob = (await detail.open("note")) as Blob;
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("<p>fox note</p>");
  });

  it("each phrase opens only its own payloads", async () => {
    const { el, events } = mount(bundle);
    type(el, "the fox was here");
    await settle(el);
    await expect(events[0]!.detail.open("other")).rejects.toThrow(/doesn't open/);
    await expect(events[0]!.detail.open("constructor")).rejects.toThrow(/doesn't open/);
  });

  it.each(["The  FOX was here", "the fox wás here", " THE FOX WAS HERE "])("forgives %j", async (phrase) => {
    const { el, events } = mount(bundle);
    type(el, phrase);
    await settle(el);
    expect(events[0]?.detail.tier).toBe("fox");
  });

  it.each(["σας μας", "ΣΑΣ ΜΑΣ", "Σάς Μας"])("opens the Greek door with %s", async (phrase) => {
    const { el, events } = mount(bundle);
    type(el, phrase);
    await settle(el);
    expect(events[0]?.detail.tier).toBe("greek");
  });

  it.each(["wrong", "constructor", "__proto__", "toString"])("stays silent on %s", async (phrase) => {
    const { el, events } = mount(bundle);
    const before = document.body.innerHTML;
    type(el, phrase);
    await settle(el);
    expect(events).toEqual([]);
    expect(el.shadowRoot!.querySelector("input")!.value).toBe("");
    expect(document.body.innerHTML).toBe(before);
  });

  it("emits tier-rejected with no payload only when opted in", async () => {
    const { el, events } = mount(bundle, { "report-wrong": "" });
    type(el, "wrong");
    await settle(el);
    expect(events).toEqual([{ type: "tier-rejected", detail: null }]);
  });

  it("empty input skips derivation", async () => {
    const spy = vi.spyOn(crypto.subtle, "deriveBits");
    const { el, events } = mount(bundle, { "report-wrong": "" });
    type(el, "   ");
    await settle(el);
    expect(spy).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("a double submit is one attempt, and busy reflects it", async () => {
    const spy = vi.spyOn(crypto.subtle, "deriveBits");
    const { el, events } = mount(bundle);
    type(el, "the fox was here");
    expect(el.hasAttribute("busy")).toBe(true);
    expect(el.getAttribute("aria-busy")).toBe("true");
    type(el, "the fox was here");
    await settle(el);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(el.hasAttribute("aria-busy")).toBe(false);
  });

  it("refuses when secrets are also set, opening nothing", async () => {
    const { el, events } = mount(bundle);
    el.secrets = { "the fox was here": "plain" };
    await vi.waitFor(() => expect(events).toEqual([{ type: "threshold-error", detail: { code: "both-modes" } }]));
    type(el, "the fox was here");
    await settle(el);
    expect(events.every((e) => e.detail?.code === "both-modes")).toBe(true);
    expect(events).toHaveLength(2);
  });

  it("set after connect: a fault at submit, never silence", async () => {
    document.body.innerHTML = "";
    const el = document.createElement("web-threshold") as Sealed;
    const codes: string[] = [];
    el.addEventListener("threshold-error", (e) => codes.push((e as CustomEvent).detail.code));
    document.body.append(el);
    el.setAttribute("sealed", "#b");
    type(el, "the fox was here");
    await settle(el);
    expect(codes).toEqual(["sealed-set-after-connect"]);
  });
});

describe("faults: threshold-error, no unlock, never tier-rejected", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const good = async () => makeBundle([{ phrase: "fox", tier: "fox" }]);
  const cases: [string, (b: Bundle) => unknown, string][] = [
    ["not an object", () => "nope", "malformed-bundle"],
    ["an unknown version", (b) => ({ ...b, v: 2 }), "unsupported-version"],
    ["a missing norm", (b) => ({ ...b, kdf: { iter: b.kdf.iter, salt: b.kdf.salt } }), "unsupported-norm"],
    ["an unknown norm", (b) => ({ ...b, kdf: { ...b.kdf, norm: "fold2" } }), "unsupported-norm"],
    ["iterations over the ceiling", (b) => ({ ...b, kdf: { ...b.kdf, iter: MAX_ITERATIONS + 1 } }), "iterations-over-ceiling"],
    ["no slots", (b) => ({ ...b, slots: undefined }), "malformed-bundle"],
    ["a null slot", (b) => ({ ...b, slots: [null] }), "malformed-bundle"],
    ["an empty slot", (b) => ({ ...b, slots: [{}] }), "malformed-bundle"],
    ["numeric fields", (b) => ({ ...b, slots: [{ iv: 1, ct: 2 }] }), "malformed-bundle"],
    ["bad base64", (b) => ({ ...b, slots: [{ iv: "%%", ct: "%%" }] }), "malformed-bundle"],
    ["a bad salt", (b) => ({ ...b, kdf: { ...b.kdf, salt: "%%" } }), "malformed-bundle"],
    ["a malformed inline payload", (b) => ({ ...b, inline: [{ pid: "x" }] }), "malformed-bundle"],
  ];

  it.each(cases)("%s", async (_label, change, code) => {
    const { el, events } = mount(change(await good()), { "report-wrong": "" });
    await vi.waitFor(() => expect(events).toEqual([{ type: "threshold-error", detail: { code } }]));
    type(el, "fox");
    await settle(el);
    expect(events).toEqual([{ type: "threshold-error", detail: { code } }]);
  });

  const mountUrl = (url: string) => {
    document.body.innerHTML = "";
    const el = document.createElement("web-threshold") as Sealed;
    el.setAttribute("sealed", url);
    el.setAttribute("report-wrong", "");
    const events: string[] = [];
    for (const name of ["tier-unlocked", "tier-rejected"]) el.addEventListener(name, () => events.push(name));
    el.addEventListener("threshold-error", (e) => events.push((e as CustomEvent).detail.code));
    document.body.append(el);
    return { el, events };
  };

  it("refuses a cross-origin URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { events } = mountUrl("https://elsewhere.example/site.json");
    await vi.waitFor(() => expect(events).toEqual(["cross-origin"]));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a submit during a failing fetch waits, and reads as a fault", async () => {
    let fail!: () => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((_, reject) => (fail = () => reject(new Error("down")))));
    const { el, events } = mountUrl("/s/site.json");
    await vi.waitFor(() => expect(fail).toBeDefined());
    type(el, "fox");
    expect(el.hasAttribute("busy")).toBe(true);
    fail();
    await settle(el);
    expect(events).toEqual(["fetch-failed"]);
  });

  it("a submit during a good fetch waits, and opens", async () => {
    const bundle = await good();
    let finish!: () => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise((done) => (finish = () => done(new Response(JSON.stringify(bundle))))),
    );
    const { el, events } = mountUrl("/s/site.json");
    await vi.waitFor(() => expect(finish).toBeDefined());
    type(el, "fox");
    finish();
    await settle(el);
    expect(events).toEqual(["tier-unlocked"]);
  });

  it("missing crypto.subtle", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try {
      const bundle = { v: 1, kdf: { iter: 10, salt: "AAAA", norm: "fold1" }, slots: [] };
      const { events } = mount(bundle);
      await vi.waitFor(() => expect(events.map((e) => e.detail?.code)).toEqual(["no-webcrypto"]));
    } finally {
      Object.defineProperty(globalThis, "crypto", original);
    }
  });
});

describe("URL-loaded payloads", () => {
  async function urlBundle(src: string) {
    const key = randomBytes(32);
    const plain = encode("from a file");
    const sealed = await encrypt(key, plain);
    const salt = randomBytes(16);
    const open = { pic: { k: toB64(key), type: "image/png", iv: sealed.iv, src } };
    const slots = [await encrypt(await deriveKek("fox", salt, ITER), padRecord({ tier: "fox", open }))];
    const bundle: Bundle = { v: 1, kdf: { iter: ITER, salt: toB64(salt), norm: "fold1" }, slots, inline: [] };
    return { bundle, cipher: fromB64(sealed.ct) };
  }
  afterEach(() => vi.restoreAllMocks());

  it("fetches and opens on request, with the record's type", async () => {
    const { bundle, cipher } = await urlBundle("/s/x.sealed");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(cipher as BodyInit));
    const { el, events } = mount(bundle);
    type(el, "fox");
    await settle(el);
    expect(fetchSpy).not.toHaveBeenCalled(); // lazy
    const blob = (await events[0]!.detail.open("pic")) as Blob;
    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("from a file");
  });

  it("a failed fetch rejects and emits threshold-error, never tier-rejected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { bundle } = await urlBundle("/s/x.sealed");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 404 }));
    const { el, events } = mount(bundle, { "report-wrong": "" });
    type(el, "fox");
    await settle(el);
    await expect(events[0]!.detail.open("pic")).rejects.toThrow();
    expect(events.map((e) => e.detail?.code ?? e.type)).toEqual(["tier-unlocked", "fetch-failed"]);
  });

  it("refuses a cross-origin file", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { bundle } = await urlBundle("https://elsewhere.example/x.sealed");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { el, events } = mount(bundle);
    type(el, "fox");
    await settle(el);
    await expect(events[0]!.detail.open("pic")).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an entry with a file but no IV rejects, without fetching", async () => {
    const key = randomBytes(32);
    const salt = randomBytes(16);
    const open = { pic: { k: toB64(key), type: "image/png", src: "/s/x.sealed" } };
    const slots = [await encrypt(await deriveKek("fox", salt, ITER), padRecord({ tier: "fox", open }))];
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { el, events } = mount({ v: 1, kdf: { iter: ITER, salt: toB64(salt), norm: "fold1" }, slots, inline: [] });
    type(el, "fox");
    await settle(el);
    await expect(events[0]!.detail.open("pic")).rejects.toThrow("payload-missing");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a host's fallback page instead of the file is a fault", async () => {
    const { bundle } = await urlBundle("/s/x.sealed");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("<html>fallback</html>"));
    const { el, events } = mount(bundle, { "report-wrong": "" });
    type(el, "fox");
    await settle(el);
    await expect(events[0]!.detail.open("pic")).rejects.toThrow();
    expect(events.map((e) => e.detail?.code ?? e.type)).toEqual(["tier-unlocked", "payload-unreadable"]);
  });
});

describe("fold1", () => {
  const same: [string, string][] = [
    ["The  Fox\n", "the fox"],
    ["don’t", "don't"],
    ["“hi”", '"hi"'],
    ["a–b—c", "a-b-c"],
    ["wait…", "wait..."],
    ["σάς", "σας"],
    ["ΣΑΣ", "σας"],
    ["Σάς", "σας"],
    ["café", "cafe"],
    ["año", "ano"],
  ];
  it.each(same)("%j folds to %j", (input, expected) => expect(fold1(input)).toBe(expected));
  it("keeps σασ apart from σας", () => expect(fold1("σασ")).not.toBe(fold1("σας")));
  it("empties whitespace", () => expect(fold1(" \n\t ")).toBe(""));
  it("is stable when applied twice", () => {
    for (const [input] of same) expect(fold1(fold1(input))).toBe(fold1(input));
  });
});

describe("format", () => {
  it("round-trips base64url", () => {
    const bytes = randomBytes(257);
    expect(fromB64(toB64(bytes))).toEqual(bytes);
  });

  it("pads records to a 256-byte multiple", () => {
    for (const size of [0, 100, 300, 1000]) {
      const padded = padRecord({ tier: "x".repeat(size), open: {} });
      expect(padded.length % 256).toBe(0);
      expect(JSON.parse(new TextDecoder().decode(padded)).tier).toHaveLength(size);
    }
  });
});
