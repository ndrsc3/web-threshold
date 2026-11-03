#!/usr/bin/env node
// Regenerates the screenshots in docs/images/ from the built demo, so they show what the
// code does today. Needs `npm run build && npm run demo:build`, and Chromium for Playwright
// (`npx playwright install chromium`). Every phrase here is a public demo fixture.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serveDemo } from "./serve-demo.mjs";

const images = join(dirname(fileURLToPath(import.meta.url)), "..", "docs/images");
const { base, server } = await serveDemo();
mkdirSync(images, { recursive: true });

const browser = await chromium.launch();
const errors = [];
try {
  const shoot = async (path, size, shots) => {
    const page = await (await browser.newContext({ viewport: size, deviceScaleFactor: 2 })).newPage();
    page.on("pageerror", (err) => errors.push(`${path}: ${err.message}`));
    await page.goto(`${base}${path}`);
    await page.locator("web-threshold input").waitFor();
    for (const { phrase, name, element } of shots) {
      if (phrase) {
        await page.locator("web-threshold input").fill(phrase);
        await page.locator("web-threshold button").click();
        await page.locator("web-threshold[busy]").waitFor({ state: "detached" });
        await page.waitForTimeout(600); // the theme's colour transition
      }
      const target = element ? page.locator(element) : page;
      await target.screenshot({ path: join(images, `${name}.png`) });
      console.log(`wrote docs/images/${name}.png`);
    }
  };

  await shoot("/", { width: 760, height: 700 }, [
    { name: "sealed-door", element: "body" },
    { phrase: "the fox was here", name: "sealed-fox-opened", element: "body" },
  ]);
  await shoot("/s/inner-room-7f3a9b/index.html", { width: 760, height: 360 }, [
    { name: "page-door" },
    { phrase: "the inner room waits", name: "page-opened" },
  ]);
} finally {
  await browser.close();
  server.close();
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
