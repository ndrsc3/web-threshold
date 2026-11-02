// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BOTS, ThresholdConfigError, defineThreshold, resolvePolicy } from "./index.js";

describe("catalogue", () => {
  it("has 30 to 60 bots", () => {
    expect(BOTS.length).toBeGreaterThanOrEqual(30);
    expect(BOTS.length).toBeLessThanOrEqual(60);
  });

  it("uses plain tokens", () => {
    for (const { name } of BOTS) expect(name).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("has no names differing only by case", () => {
    const lower = BOTS.map((b) => b.name.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it("has no blocking name inside a name that should stay allowed", () => {
    // Some parsers match by substring, so this would also block the longer name.
    const blocking = BOTS.filter((b) => b.kind === "ai-training" || b.kind === "ai-search");
    const kept = BOTS.filter((b) => b.kind === "search-engine" || b.kind === "ai-user");
    for (const b of blocking) {
      for (const k of kept) expect(k.name.toLowerCase()).not.toContain(b.name.toLowerCase());
    }
  });
});

describe("refusals", () => {
  const refused: [string, unknown, RegExp][] = [
    ["a config that isn't an object", "nope", /must be an object/],
    ["no bots", {}, /bots\.preset is required/],
    ["no preset", { bots: {} }, /bots\.preset is required/],
    ["an unknown preset", { bots: { preset: "block-everything" } }, /unknown preset/],
    ["an unknown top-level key", { bots: { preset: "open" }, trap: {} }, /unknown key trap/],
    ["an unknown bots key", { bots: { preset: "open", deny: [] } }, /unknown key bots\.deny/],
    ["a name not in the catalogue", { bots: { preset: "open", block: ["GPTBott"] } }, /"GPTBott" is not in the catalogue/],
    ["allow that isn't a list", { bots: { preset: "open", allow: "GPTBot" } }, /must be a list/],
    ["a name in both lists", { bots: { preset: "open", allow: ["GPTBot"], block: ["gptbot"] } }, /in both/],
    ["extra that isn't text", { bots: { preset: "open" }, extra: 1 }, /must be a string/],
    ["extra opening with a rule", { bots: { preset: "open" }, extra: "Allow: /\nDisallow: /tmp/" }, /must start its rules/],
    ["a stray Sitemap, then a rule", { bots: { preset: "open" }, extra: "Sitemap: https://x/s\nAllow: /" }, /must start its rules/],
    ["a * group under search-engines-only", { bots: { preset: "search-engines-only" }, extra: "User-agent: *\nDisallow: /x" }, /search-engines-only/],
    ["a * group in other spelling", { bots: { preset: "search-engines-only" }, extra: "user-agent:*\nDisallow: /x" }, /search-engines-only/],
  ];

  it.each(refused)("refuses %s", (_label, config, message) => {
    expect(() => resolvePolicy(config)).toThrow(ThresholdConfigError);
    expect(() => resolvePolicy(config)).toThrow(message);
  });

  it("defineThreshold refuses when the config is written", () => {
    expect(() => defineThreshold({ bots: { preset: "open", block: ["Nope"] } })).toThrow(ThresholdConfigError);
  });

  it("reports every problem at once", () => {
    expect(() => resolvePolicy({ bots: { preset: "nope", block: ["Nope"] }, trap: {} })).toThrow(
      /unknown key trap[\s\S]*unknown preset[\s\S]*"Nope"/,
    );
  });
});

describe("accepted", () => {
  it("matches names ignoring case and returns the catalogue spelling", () => {
    expect(resolvePolicy({ bots: { preset: "open", block: ["gptbot"] } }).blocked).toEqual(["GPTBot"]);
  });

  it("takes comments and a Sitemap ahead of the first group in extra", () => {
    expect(() =>
      resolvePolicy({ bots: { preset: "open" }, extra: "# hi\nSitemap: https://x/s\n\nUser-agent: Foo\nDisallow: /" }),
    ).not.toThrow();
  });

  it("takes a * group under the other presets", () => {
    expect(() => resolvePolicy({ bots: { preset: "block-all-ai" }, extra: "User-agent: *\nDisallow: /x" })).not.toThrow();
  });
});
