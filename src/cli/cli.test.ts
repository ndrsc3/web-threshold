// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { GENERATED_HEADER } from "../robots/index.js";
import { run } from "./run.js";

const OUT = join("public", "robots.txt");

describe("web-threshold robots", () => {
  let site: string;
  let lines: string[];
  const exec = (args = ["robots"]) => run(args, site, (line) => lines.push(line));
  const config = (text: string) => writeFileSync(join(site, "threshold.config.ts"), text);

  beforeEach(() => {
    site = mkdtempSync(join(tmpdir(), "threshold-cli-"));
    lines = [];
  });

  it("writes robots.txt, creating public/", async () => {
    config(`export default { bots: { preset: "block-ai-training" } };`);
    expect(await exec()).toBe(0);
    const text = readFileSync(join(site, OUT), "utf8");
    expect(text.startsWith(GENERATED_HEADER)).toBe(true);
    expect(text).toContain("User-agent: GPTBot");
  });

  it("gives the same file on a second run", async () => {
    config(`export default { bots: { preset: "block-all-ai" } };`);
    await exec();
    const first = readFileSync(join(site, OUT), "utf8");
    expect(await exec()).toBe(0);
    expect(readFileSync(join(site, OUT), "utf8")).toBe(first);
  });

  it("refuses a bad config and writes nothing", async () => {
    config(`export default { bots: { preset: "open", block: ["Nope"] } };`);
    expect(await exec()).toBe(1);
    expect(lines.join("\n")).toContain('"Nope" is not in the catalogue');
    expect(existsSync(join(site, OUT))).toBe(false);
  });

  it("leaves the earlier file alone when the config goes bad", async () => {
    const before = `${GENERATED_HEADER}\nUser-agent: *\nAllow: /\n`;
    mkdirSync(join(site, "public"));
    writeFileSync(join(site, OUT), before);
    config(`export default { bots: { preset: "wrong" } };`);
    expect(await exec()).toBe(1);
    expect(readFileSync(join(site, OUT), "utf8")).toBe(before);
  });

  it("refuses a hand-written file, and says how to replace it", async () => {
    config(`export default { bots: { preset: "open" } };`);
    mkdirSync(join(site, "public"));
    writeFileSync(join(site, OUT), "User-agent: *\nDisallow: /s/\n");
    expect(await exec()).toBe(1);
    expect(lines.join("\n")).toContain("git rm");
    expect(readFileSync(join(site, OUT), "utf8")).toBe("User-agent: *\nDisallow: /s/\n");
  });

  it("refuses a missing config", async () => {
    expect(await exec()).toBe(1);
    expect(lines.join("\n")).toContain("no threshold.config.ts");
  });

  it("refuses a config with no default export", async () => {
    config(`export const bots = { preset: "open" };`);
    expect(await exec()).toBe(1);
    expect(lines.join("\n")).toContain("no default export");
  });

  it.each([[[]], [["seal"]], [["robots", "--force"]]])("refuses arguments %j", async (args) => {
    config(`export default { bots: { preset: "open" } };`);
    expect(await exec(args)).toBe(1);
    expect(lines.join("\n")).toContain("usage");
    expect(existsSync(join(site, OUT))).toBe(false);
  });
});
