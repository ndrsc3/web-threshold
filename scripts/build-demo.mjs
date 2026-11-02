#!/usr/bin/env node
// Builds the sealed demo into the gitignored .demo/ from a built dist/, then seals it
// exactly as a site would. Run `npm run build` first. Serve it with `npm run demo`.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".demo");

if (!existsSync(join(root, "dist/web-threshold-sealed.js"))) {
  console.error("No built sealed entry in dist/. Run `npm run build` first.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
copyFileSync(join(root, "demo/sealed.html"), join(out, "index.html"));
copyFileSync(join(root, "demo/bench.html"), join(out, "bench.html"));
copyFileSync(join(root, "demo/golden.html"), join(out, "golden.html"));
copyFileSync(join(root, "src/gate/__golden__/v1.json"), join(out, "golden.json"));
copyFileSync(join(root, "demo/handler.js"), join(out, "handler.js"));
copyFileSync(join(root, "dist/web-threshold-sealed.js"), join(out, "web-threshold-sealed.js"));

execFileSync("node", [join(root, "dist/cli.js"), "seal", "--doors", "demo/doors.json", "--out", ".demo", "--public-fixture"], {
  cwd: root,
  stdio: "inherit",
});
