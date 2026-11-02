#!/usr/bin/env node
// A consumer's bundler must keep a bare `import "@ndrsc3/web-threshold/sealed"`, or the
// element silently never registers. Packs the built package, installs it in a temp site,
// bundles a bare import of each entry and checks registration survived. Needs a built dist/.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vite = join(root, "node_modules/.bin/vite");
const site = mkdtempSync(join(tmpdir(), "threshold-consumer-"));
let failed = false;

try {
  const tarball = execFileSync("npm", ["pack", root, "--pack-destination", site, "--silent"], { encoding: "utf8" }).trim().split("\n").pop();
  writeFileSync(join(site, "package.json"), JSON.stringify({ name: "site", private: true, type: "module" }));
  execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund", join(site, tarball)], { cwd: site });

  for (const [entry, marker] of [["@ndrsc3/web-threshold", "customElements.define"], ["@ndrsc3/web-threshold/sealed", "PBKDF2"]]) {
    mkdirSync(join(site, "src"), { recursive: true });
    writeFileSync(join(site, "index.html"), '<script type="module" src="/src/main.js"></script>');
    writeFileSync(join(site, "src/main.js"), `import "${entry}";\n`);
    rmSync(join(site, "dist"), { recursive: true, force: true });
    execFileSync(vite, ["build", "--logLevel", "error"], { cwd: site, stdio: "inherit" });
    const assets = join(site, "dist/assets");
    const code = readdirSync(assets).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(assets, f), "utf8")).join("");
    const kept = code.includes("customElements.define") && code.includes(marker);
    console.log(`${kept ? "ok  " : "FAIL"} bare import of ${entry}`);
    if (!kept) failed = true;
  }
} finally {
  rmSync(site, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
