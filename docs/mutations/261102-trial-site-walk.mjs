// Walks a sealed copy of Banana Rodeo's real build across pages. Usage: node br-walk.mjs <clone-with-playwright> <site-dir>
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize, sep } from "node:path";

const [clone, root] = process.argv.slice(2);
const { chromium, webkit, firefox } = createRequire(join(clone, "package.json"))("playwright");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (path.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return; }
  const file = normalize(join(root, path.endsWith("/") ? `${path}index.html` : path));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((d) => server.listen(0, "127.0.0.1", d));
const base = `http://localhost:${server.address().port}`;
const OLD_FLAG = () => localStorage.setItem("banana_rodeo_auth", JSON.stringify({ authenticated: true, timestamp: Date.now() }));

for (const [name, engine] of [["chromium", chromium], ["webkit", webkit], ["firefox", firefox]]) {
  const browser = await engine.launch();
  const context = await browser.newContext();
  // Stands in for removing the site's old client-side gate, which would otherwise redirect.
  await context.addInitScript(OLD_FLAG);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 90)));
  const h1 = async () => (await page.locator("h1").first().textContent({ timeout: 5000 }).catch(() => "none"))?.trim().slice(0, 44);
  console.log(`\n== ${name}`);
  await page.goto(`${base}/pages/sponsor-us.html`);
  await page.locator("web-threshold input").waitFor();
  console.log("door shown:", (await page.locator("web-threshold").count()) === 1, "| sealed text in source:", (await (await page.request.get(`${base}/pages/sponsor-us.html`)).text()).includes("SUPPORT THE BANANA RODEO"));
  await page.locator("web-threshold input").fill("Banana Test Phrase");
  await page.locator("web-threshold button").click();
  await page.waitForFunction(() => !document.querySelector("web-threshold"), null, { timeout: 8000 });
  console.log("opened:", await h1());

  let retyped = 0;
  for (const next of ["bananifesto", "faq", "about", "photowall", "guestbook"]) {
    const started = Date.now();
    await page.goto(`${base}/pages/${next}.html`);
    await page.waitForFunction(() => !document.querySelector("web-threshold"), null, { timeout: 8000 }).catch(() => retyped++);
    console.log(`walked to ${next}: "${await h1()}" in ${Date.now() - started} ms`);
  }
  console.log("pages that asked again:", retyped);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector("web-threshold"), null, { timeout: 8000 }).catch(() => console.log("reload asked again"));
  console.log("after reload:", await h1());
  console.log("page styles:", await page.evaluate(() => [...document.styleSheets].some((s) => (s.href ?? "").includes("/styles/"))), "| script bundle ran, images:", await page.locator("img").count());

  const other = await browser.newContext();
  await other.addInitScript(OLD_FLAG);
  const tab = await other.newPage();
  await tab.goto(`${base}/pages/faq.html`);
  await tab.waitForTimeout(600);
  console.log("a new session sees the door:", (await tab.locator("web-threshold").count()) === 1);
  console.log("page errors:", errors.length ? [...new Set(errors)].slice(0, 3).join(" | ") : "none");
  await browser.close();
}
server.close();
