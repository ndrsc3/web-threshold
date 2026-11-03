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
const FLAG = () => localStorage.setItem("banana_rodeo_auth", JSON.stringify({ authenticated: true, timestamp: Date.now() }));
const opened = (p) => p.waitForFunction(() => !document.querySelector("web-threshold"), null, { timeout: 8000 }).then(() => true, () => false);
const door = async (p) => (await p.locator("web-threshold").count()) === 1;

for (const [name, engine] of [["chromium", chromium], ["webkit", webkit], ["firefox", firefox]]) {
  const browser = await engine.launch();
  console.log(`\n== ${name}`);
  const context = await browser.newContext();
  await context.addInitScript(FLAG);
  const page = await context.newPage();

  await page.goto(`${base}/pages/faq.html?from=qr&x=1#questions`);
  await page.locator("web-threshold input").waitFor();
  console.log("cold deep link shows the door:", await door(page));
  await page.locator("web-threshold input").fill("Banana Test Phrase");
  await page.locator("web-threshold button").click();
  console.log("phrase opens that same page:", await opened(page), "|", (await page.locator("h1").first().textContent().catch(() => "?"))?.trim().slice(0, 30));
  const u = new URL(page.url());
  console.log("address kept:", u.pathname + u.search + u.hash);

  const link = page.locator('a[href^="/pages/"]').first();
  const href = await link.getAttribute("href");
  await Promise.all([page.waitForNavigation(), link.evaluate((a) => a.click())]);
  console.log(`clicked a real link to ${href}: opens without retyping:`, await opened(page), "| at", new URL(page.url()).pathname);

  await page.goBack();
  await page.waitForTimeout(800);
  console.log("back:", new URL(page.url()).pathname, "| open:", !(await door(page)));
  await page.goForward();
  await page.waitForTimeout(800);
  console.log("forward:", new URL(page.url()).pathname, "| open:", !(await door(page)));

  const [opener] = await Promise.all([context.waitForEvent("page"), page.evaluate((h) => { const a = document.createElement("a"); a.href = h; a.target = "_blank"; a.rel = "noopener"; document.body.append(a); a.click(); }, "/pages/about.html")]);
  await opener.waitForLoadState();
  await opener.waitForTimeout(800);
  console.log("link opened in a new tab shows:", (await door(opener)) ? "door" : "page");
  const [script] = await Promise.all([context.waitForEvent("page"), page.evaluate(() => { window.open("/pages/about.html"); })]);
  await script.waitForLoadState();
  await script.waitForTimeout(800);
  console.log("window.open tab shows:", (await door(script)) ? "door" : "page");

  const typed = await context.newPage();
  await typed.goto(`${base}/pages/about.html`);
  await typed.waitForTimeout(500);
  console.log("address typed into a new tab shows:", (await door(typed)) ? "door" : "page");

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const off = await noJs.newPage();
  await off.goto(`${base}/pages/faq.html`);
  const body = (await off.locator("body").innerText()).trim();
  console.log("JavaScript off shows:", JSON.stringify(body.slice(0, 40)), "| sealed heading:", body.includes("Questions"));

  const crawl = await (await page.request.get(`${base}/pages/faq.html`)).text();
  console.log("a crawler's copy has the heading:", crawl.includes("You've Got Questions"), "| og tags:", crawl.includes("og:title"), "| noindex:", crawl.includes("noindex"));
  await browser.close();
}
server.close();
