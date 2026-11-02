#!/usr/bin/env node
// Runs the golden bundle and the sealed demo in real Chromium, WebKit and Firefox, because
// `fold1` and WebCrypto must agree across engines. Needs a built demo: `npm run demo:build`.
// First time: `npx playwright install chromium webkit firefox`.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", ".demo");
if (!existsSync(join(root, "s/site.json"))) {
  console.error("No built demo in .demo/. Run `npm run build && npm run demo:build` first.");
  process.exit(1);
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json" };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = normalize(join(root, path.endsWith("/") ? `${path}index.html` : path));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
// localhost is a secure context in every engine, which crypto.subtle needs.
const base = `http://localhost:${server.address().port}`;

async function enter(page, phrase) {
  await page.locator("web-threshold input").fill(phrase);
  await page.locator("web-threshold button").click();
  await page.locator("web-threshold[busy]").waitFor({ state: "detached" });
}

function expectText(actual, wanted, what) {
  if (!actual.includes(wanted)) throw new Error(`${what}: wanted "${wanted}", got "${actual}"`);
}

async function runEngine(name, engine) {
  const browser = await engine.launch();
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (err) => errors.push(`page error: ${err.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    const text = (selector) => page.locator(selector).innerText();
    const waitFor = (selector, wanted) =>
      page.waitForFunction(([s, w]) => document.querySelector(s)?.textContent?.includes(w), [selector, wanted], { timeout: 15_000 });

    await page.goto(`${base}/golden.html`);
    await enter(page, "wrong");
    await waitFor("#out", "rejected");
    await enter(page, 'ΣΑΣ "ΜΑΣ" - CAFE...');
    await waitFor("#out", "golden note");
    expectText(await text("#out"), 'golden | {"n":1,"s":"σάς"} | golden note, κατώφλι', "golden bundle");
    await enter(page, "σάς “μας” — café…");
    await waitFor("#out", "golden note");

    await page.goto(`${base}/`);
    // The bytes as served, not the parsed page: parsing can drop what a person could still read.
    const source = await (await page.request.get(`${base}/`)).text();
    if (source.includes("third stone")) throw new Error("sealed text in the page source");
    await enter(page, "not a real phrase");
    await waitFor("#wrong", "Nothing opens");
    await enter(page, "THE FOX  was here");
    await waitFor("#reveal", "third stone");
    expectText(await text("#tier"), "fox", "fox door");
    await enter(page, "the kiln is still warm");
    await waitFor("#reveal", "shelf of cups");
    if ((await page.locator("#message").textContent()) !== "") throw new Error("the last door carried over");
    await enter(page, "ΣΑΣ ΠΕΡΙΜΕΝΩ ΣΤΟ ΚΑΤΩΦΛΙ");
    await waitFor("#reveal", "κατώφλι");
    await enter(page, "σας περιμενω στο κατωφλι");
    await waitFor("#tier", "threshold");

    await enter(page, "the moth came back");
    await page.locator("#figure").waitFor({ state: "visible" });
    const drawn = await page.locator("#figure").evaluate((image) => image.decode().then(() => image.naturalWidth));
    if (drawn !== 32) throw new Error(`the sealed image didn't draw: width ${drawn}`);
    if (!(await page.locator("#figure").getAttribute("src")).startsWith("blob:")) throw new Error("the image didn't come from a blob");

    // A re-route, then a whole page behind its own door.
    await enter(page, "the inner room waits");
    await page.waitForURL("**/s/inner-room-7f3a9b/");
    const shell = await (await page.request.get(page.url())).text();
    if (shell.includes("existed nowhere") || shell.includes("The inner room")) throw new Error("the sealed page is in its shell");
    await enter(page, "a wrong phrase here");
    await enter(page, "THE INNER ROOM WAITS");
    await page.locator("h1", { hasText: "The inner room" }).waitFor();
    expectText(await text("#ran"), "Its own script ran", "sealed page script");
    expectText(await page.title(), "The inner room", "sealed page title");
    await page.reload();
    await page.locator("web-threshold input").waitFor();
    if (await page.locator("h1", { hasText: "The inner room" }).count()) throw new Error("a reload kept the sealed page open");

    await page.goto(`${base}/bench.html`);
    await page.locator("#go").click();
    await waitFor("#result", "Median");
    const timing = await text("#result");

    // A real miss in the page shows up as a failed step above; these are the quieter ones.
    if (errors.length > 0) throw new Error(errors.join("; "));
    console.log(`ok   ${name}: ${timing}`);
    return true;
  } catch (err) {
    console.log(`FAIL ${name}: ${err.message.split("\n")[0]}${errors.length ? ` (${errors.join("; ")})` : ""}`);
    return false;
  } finally {
    await browser.close();
  }
}

let passed = true;
for (const [name, engine] of [["chromium", chromium], ["webkit", webkit], ["firefox", firefox]]) {
  if (!(await runEngine(name, engine))) passed = false;
}
server.close();
process.exitCode = passed ? 0 : 1;
