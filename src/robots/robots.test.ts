// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOTS, type Preset } from "../policy/index.js";
import { GENERATED_HEADER, generateRobots } from "./index.js";
import { isAllowed } from "./rfc9309.js";

const BANANA = readFileSync(new URL("./__fixtures__/banana-robots.txt", import.meta.url), "utf8");
const PRESETS: Preset[] = ["open", "block-ai-training", "block-all-ai", "search-engines-only"];
const namesOf = (kind: string) => BOTS.filter((b) => b.kind === kind).map((b) => b.name);

describe("the RFC 9309 test matcher", () => {
  // The other tests are only as good as this helper, so it gets its own cases.
  const cases: [string, string, string, boolean][] = [
    ["User-agent: *\nDisallow: /", "Foo", "/", false],
    ["User-agent: Foo\nDisallow: /", "Foo", "/", false],
    ["User-agent: Foo\nDisallow: /", "foo", "/", false],
    ["User-agent: Foo\nDisallow: /", "Bar", "/", true],
    ["User-agent: Foo\nDisallow: /", "FooBar", "/", true],
    ["User-agent: *\nDisallow: /\n\nUser-agent: Foo\nAllow: /", "Foo", "/x", true],
    ["User-agent: Foo\nUser-agent: Bar\nDisallow: /", "Bar", "/x", false],
    ["User-agent: *\nDisallow: /tmp/\nAllow: /tmp/ok", "Foo", "/tmp/ok", true],
    ["User-agent: *\nAllow: /\nDisallow: /", "Foo", "/x", true],
    ["User-agent: Foo\nDisallow: /\n\nAllow: /", "Foo", "/x", true],
    ["User-agent: Foo\nDisallow: /\n\nUser-agent: Foo\nAllow: /x", "Foo", "/x", true],
    ["User-agent: *\nDisallow:", "Foo", "/x", true],
  ];
  it.each(cases)("%j as %s on %s", (text, agent, path, expected) => {
    expect(isAllowed(text, agent, path)).toBe(expected);
  });
});

describe.each(PRESETS)("preset %s", (preset) => {
  it("matches its golden file", async () => {
    await expect(generateRobots({ bots: { preset } })).toMatchFileSnapshot(`./__golden__/${preset}.txt`);
  });

  it("starts with the generated header", () => {
    expect(generateRobots({ bots: { preset } }).startsWith(`${GENERATED_HEADER}\n`)).toBe(true);
  });
});

describe("who gets through", () => {
  const can = (preset: Preset, name: string, more: object = {}) =>
    isAllowed(generateRobots({ bots: { preset, ...more } }), name, "/page");
  const bystander = "SomeUnlistedBot";

  it("open lets everyone in", () => {
    for (const { name } of BOTS) expect(can("open", name)).toBe(true);
    expect(can("open", bystander)).toBe(true);
  });

  it("block-ai-training blocks only training", () => {
    for (const name of namesOf("ai-training")) expect(can("block-ai-training", name)).toBe(false);
    for (const kind of ["ai-search", "ai-user", "search-engine"]) {
      for (const name of namesOf(kind)) expect(can("block-ai-training", name)).toBe(true);
    }
    expect(can("block-ai-training", bystander)).toBe(true);
  });

  it("block-all-ai leaves user fetchers and search engines alone", () => {
    for (const kind of ["ai-training", "ai-search"]) {
      for (const name of namesOf(kind)) expect(can("block-all-ai", name)).toBe(false);
    }
    for (const kind of ["ai-user", "search-engine"]) {
      for (const name of namesOf(kind)) expect(can("block-all-ai", name)).toBe(true);
    }
    expect(can("block-all-ai", bystander)).toBe(true);
  });

  it("search-engines-only lets in search engines and nobody else", () => {
    for (const name of namesOf("search-engine")) expect(can("search-engines-only", name)).toBe(true);
    for (const kind of ["ai-training", "ai-search", "ai-user"]) {
      for (const name of namesOf(kind)) expect(can("search-engines-only", name)).toBe(false);
    }
    expect(can("search-engines-only", bystander)).toBe(false);
  });

  it("allow wins over the preset", () => {
    expect(can("block-ai-training", "CCBot", { allow: ["CCBot"] })).toBe(true);
    expect(can("search-engines-only", "Claude-User", { allow: ["Claude-User"] })).toBe(true);
  });

  it("block wins over the preset", () => {
    expect(can("block-ai-training", "Claude-User", { block: ["Claude-User"] })).toBe(false);
    expect(can("open", "GPTBot", { block: ["GPTBot"] })).toBe(false);
    expect(can("search-engines-only", "Baiduspider", { block: ["Baiduspider"] })).toBe(false);
  });
});

describe("extra", () => {
  it("reproduces Banana Rodeo's file byte for byte under open", () => {
    expect(BANANA.length).toBe(1046);
    expect(generateRobots({ bots: { preset: "open" }, extra: BANANA })).toBe(`${GENERATED_HEADER}\n${BANANA}`);
  });

  it("keeps Banana Rodeo's rules", () => {
    const text = generateRobots({ bots: { preset: "open" }, extra: BANANA });
    expect(isAllowed(text, "Foo", "/")).toBe(true);
    expect(isAllowed(text, "Foo", "/cgi-bin/x")).toBe(false);
    expect(isAllowed(text, "Foo", "/tmp/x")).toBe(false);
  });

  it("doesn't undo the block list when it follows a preset", () => {
    const text = generateRobots({ bots: { preset: "block-ai-training" }, extra: "User-agent: *\nDisallow: /tmp/" });
    expect(isAllowed(text, "GPTBot", "/page")).toBe(false);
    expect(isAllowed(text, "Foo", "/page")).toBe(true);
    expect(isAllowed(text, "Foo", "/tmp/x")).toBe(false);
  });

  it("adds a bot the catalogue lacks as its own group", () => {
    const text = generateRobots({ bots: { preset: "open" }, extra: "User-agent: FromMyLogs\nDisallow: /" });
    expect(isAllowed(text, "FromMyLogs", "/")).toBe(false);
    expect(isAllowed(text, "Foo", "/")).toBe(true);
  });

  it("can name AdsBot-Google, which ignores *", () => {
    const text = generateRobots({ bots: { preset: "search-engines-only" }, extra: "User-agent: AdsBot-Google\nDisallow: /" });
    expect(isAllowed(text, "AdsBot-Google", "/")).toBe(false);
  });

  it("can let link previews back in under search-engines-only", () => {
    const text = generateRobots({ bots: { preset: "search-engines-only" }, extra: "User-agent: facebookexternalhit\nAllow: /" });
    expect(isAllowed(text, "facebookexternalhit", "/")).toBe(true);
  });

  it("emits only one * group under open", () => {
    const text = generateRobots({ bots: { preset: "open" }, extra: "User-agent: *\nDisallow: /tmp/" });
    expect(text.match(/User-agent: \*/g)).toHaveLength(1);
  });
});
