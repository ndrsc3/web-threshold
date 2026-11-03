# web-threshold

**The Threshold** — a reusable entry gate as a Web Component. A single input field; what the visitor types decides which tier of content opens. No accounts, no login modals. A wrong phrase fails silently.

Used by La Finka's sites and others: lafinka.space, noesis.lafinka.space, banana.rodeo (planned), and the La Finka digital garden (planned, with the v0.5 sealed mode).

## Install

Pin a tag. Each site upgrades on purpose.

```bash
npm install github:ndrsc3/web-threshold#v0.4.0
```

```ts
import "@ndrsc3/web-threshold";            // registers <web-threshold>
import type { WebThreshold } from "@ndrsc3/web-threshold";
```

Plain HTML, no build step:

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/ndrsc3/web-threshold@v0.4.0/dist/web-threshold.js"></script>
```

## Contract

```html
<web-threshold label="Enter case no." button="Submit ▸" placeholder="…" inputmode="text"></web-threshold>
<script type="module">
  const t = document.querySelector("web-threshold");
  t.secrets = { "open sesame": "gardener", "vouchsafe": "collaborator" };
  t.addEventListener("tier-unlocked", (e) => e.detail.tier);
</script>
```

- Renders one input in a shadow root. On submit (return, or `t.submit()`): trimmed input matches a key in `secrets` → emits `tier-unlocked` with `{ tier }` (bubbles, composed). Otherwise, silent fail: no event, no error.
- The input clears after every attempt. No persistence between visits.
- The consumer provides the secrets map and owns the page; the Threshold only emits the event.
- **Text is configurable**, and every attribute is optional and can change later:
  - `label`: a visible prompt above the input, which also names the input for screen readers. With no label, the input gets a generic `aria-label`.
  - `button`: renders a submit button with this text. With no button, only the return key submits.
  - `placeholder`: the input's placeholder.
- `inputmode` passes through to the input (`numeric` gets the phone number pad). That pad has no return key, so set `button`, or wire your own button to `t.submit()`.
- **Styling:** the element inherits `font` and `color`. Restyle any piece from the page with `::part(form)`, `::part(label)`, `::part(input)` and `::part(button)`.

**Security model (plain mode):** the secrets map ships to the browser, so the gate is atmosphere, not protection. Sealed mode hides phrases and what they open.

## Sealed mode: the entry point to a labyrinth

Unreleased, planned for v0.5. A phrase opens a sealed record of keys plus free-form data of your own, and the element hands it to your page as an event. Nothing it opens is readable in the page's source, on a plain static host.

**1. Write a doors file.** This is the config and the mapping: each door says what its phrase opens, and what data your page receives. Keep it out of git and out of your build output, because it holds the phrases.

```json
{
  "payloads": { "note": { "from": "private/note.txt", "type": "text/plain" } },
  "doors": [
    { "tier": "fox", "phrase": "the fox was here", "open": ["note"], "data": { "theme": "moss" } }
  ],
  "allowPublic": []
}
```

**2. Seal after your site builds.**

```bash
web-threshold seal --doors doors.json --out dist
```

This writes `dist/s/site.json`, proves each phrase opens exactly its own payloads, and stops the build if a secret is found in your public files.

**3. Use the sealed entry, and react to the event.** The element never navigates, styles or plays anything: that's your page.

```html
<web-threshold sealed="/s/site.json" report-wrong button="Enter"></web-threshold>
<script type="module">
  import "@ndrsc3/web-threshold/sealed";
  const el = document.querySelector("web-threshold");
  el.addEventListener("tier-unlocked", async ({ detail }) => {
    document.documentElement.dataset.theme = detail.data?.theme;
    if (detail.names.includes("note")) note.textContent = await (await detail.open("note")).text();
  });
</script>
```

- **Adding, changing or removing a door** is one entry plus a rebuild. There's no live editing, and removal only affects new builds: anyone holding an old copy and its phrase can still open that copy. Each build also changes the salt.
- **`data` is yours.** Add any key (`sound`, `route`, `step`) and read it in your handler, with no release of this package. Values stay hidden, but your handler code, class names and asset names are public, so a truly hidden effect needs its assets sealed too. Check a route's origin before following it, and don't put `data` into `innerHTML`.
- **Matching is forgiving.** Case, spacing, curly quotes and accents are ignored: `σας`, `σάς` and `ΣΑΣ` open the same door. Phrases that differ only that way count as duplicates and stop the build.
- **Wrong phrases are silent** unless you set `report-wrong`, which emits `tier-rejected`. Faults (a bad bundle, a failed fetch) emit `threshold-error` with a `code`, never `tier-rejected`.
- **While a phrase is being checked**, the element sets `busy` and `aria-busy`, which you can style. A slow phone can take a moment.

**What the build check does.** A secret found in your public files stops the build if it's 3+ words or 16+ characters; a shorter match warns. `allowPublic` lists exact strings that are meant to be public, such as a clue or a footer a sealed note shares with the site. It reads through tags, JSON and URL escapes, HTML entities and `.gz`/`.br`, but not other encodings such as base64, and it can't see inside images. In a language written without spaces, a sealed note is only matched in whole runs between punctuation. Unknown file types stop the build, because they can't be checked.

**Limits:**
- Anyone can copy the file and guess offline, as fast as their hardware allows. Weak phrases only get a warning, which is fine for eggs. For anything you care about, use several random words. Not for personal, financial or regulated data.
- The door count is public: it's the length of an array.
- A script on the page can see phrases and opened content, so sealed pages shouldn't load third-party scripts. Self-host this element there rather than using the CDN. `seal` warns if it sees an external script beside a sealed gate.
- Set `sealed` before the element connects. Setting it later emits `threshold-error`.
- Files are capped at 10 MiB, with a warning over 2 MiB, because a phone holds them twice in memory while opening them. Sealed files use root-relative paths, so deploy at a domain's root. A resized copy of a sealed image in your public files isn't detected.
- The build check skips the bodies of `<style>` and executable `<script>` in sealed pages, which usually match the public site's, so it won't notice a secret written in them leaking elsewhere. Boilerplate of 8+ words in a sealed page's visible text or long attributes, such as a shared footer, stops the build until you list it in `allowPublic`.
- A sealed page with an import map fails in Firefox, because the shell's own module already ran. Sealed pages should use ordinary script URLs.
- A sealed page's address, and its payload name, are public. Only the content is protected, and a phrase can't be revoked once a copy of the bundle is out.
- Remembered unlocks last for one tab. A plain new tab starts fresh and retypes. Page scripts can read the stored key, but it only opens that phrase's door, and it never reveals the phrase.

**Images and files.** Any payload with a non-text type, or text over 64 KiB, becomes a pure-ciphertext file at a random name, listed only inside the doors that open it. `detail.open(name)` fetches it on request and returns a `Blob`, so an image is `img.src = URL.createObjectURL(blob)`.

**Whole pages.** Give an HTML payload a `page`, and `seal` writes a small public shell at that path. The shell holds the door, and the right phrase replaces the document with your page, whose own scripts and styles then run.

```json
{ "from": "private/room.html", "type": "text/html", "page": "s/room-7f3a9b/index.html" }
```

`--shell shell.html` uses your own template for the shell, which must contain `<!--web-threshold-->` exactly once. The shell fetches `/s/site.json`, so every page in a site shares one bundle. Reloading shows the door again, unless the door is remembered. Keep the path random, and don't link to it from public pages, unless you list it in `allowPublic`.

**Sealing a built site.** Leave out `from`, and `seal` seals the built page already at `page`, replacing it with a shell. Its address stays as it was, so links keep working. Run it on fresh build output, because it overwrites those files, and rebuild before sealing again. The source pages have to stay out of any public repo, or anyone can read them there. Only the pages are sealed: images and other files they use stay public at their usual addresses, unless you seal them as payloads too.

```json
{ "payloads": { "about": { "type": "text/html", "page": "pages/about.html" } }, "doors": [ ... ], "remember": "session" }
```

**Remembering across pages.** With `remember="session"` on the element (`"remember": "session"` in the doors file does this for shells), a door opened once stays open in that tab, across pages and reloads. On load, the element emits `tier-unlocked` again with `detail.replayed` true for each remembered door. A listener on the element hears any replay it missed, however late it attaches; a listener on `document` has to be there first. A handler that re-routes must skip replays, or a reload loops. After a rebuild, remembered keys open nothing, and visitors retype.

**Every way in.** Each sealed address serves its own door, so a deep link, QR code or bookmark opens that same page after its phrase, keeping its full address. With `remember`, links, reloads and back and forward open directly in that tab, while a new tab asks again unless a script opened it. With JavaScript off the page is blank, and a shared link shows a generic card unless a custom shell adds public preview tags.

To try it: `npm run build && npm run demo`, then open `http://localhost:4173`. `npm run test:browsers` runs the demo in Chromium, WebKit and Firefox.

## Visitor policy: robots.txt from one config

For a site with a build step. Add `threshold.config.ts` at the site's root:

```ts
import { defineThreshold } from "@ndrsc3/web-threshold/policy";

export default defineThreshold({
  bots: { preset: "block-ai-training", allow: ["CCBot"], block: ["Bytespider"] },
  extra: "User-agent: *\nDisallow: /cgi-bin/\nSitemap: https://example.com/sitemap.xml",
});
```

Run it before the build, and gitignore the output, which is rebuilt each time:

```json
"scripts": { "prebuild": "web-threshold robots" }
```

`web-threshold robots` writes `public/robots.txt`. A bad config stops the build with a non-zero exit and writes nothing, because a typo must never mean a bot silently stays unblocked. It needs a Node with type stripping (Node 24) and a site that isn't `"type": "commonjs"`.

| Preset | Blocks | Lets through |
|---|---|---|
| `open` | nothing | everyone |
| `block-ai-training` | AI training crawlers | everyone else |
| `block-all-ai` | AI training and AI search crawlers | user-triggered fetchers, search engines, unlisted bots |
| `search-engines-only` | everyone else, including user-triggered fetchers | search engines |

- **`allow` and `block`** take names from `data/bots.json`, ignoring case, and override the preset. `bots.preset` is required.
- **`extra`** is raw robots.txt text, copied as written after the generated groups. Its rules must start with a `User-agent` line. It can't have a `User-agent: *` group under `search-engines-only`. A bot the list lacks goes here as its own group.
- **An existing `public/robots.txt`** that this tool didn't generate is left alone, and the run fails. Move any rules you need into `extra`, then `git rm` it.

**Limits:**
- robots.txt is a sign, not a lock. It doesn't stop bots that ignore it, or impostors.
- A site with no build step (such as `web_underScore`, whose rules protect capability URLs) keeps a hand-written file.
- `AdsBot-Google` ignores `*`, so `search-engines-only` doesn't stop it. To block it: `extra: "User-agent: AdsBot-Google\nDisallow: /"`.
- `search-engines-only` also blocks link previews, which come from unlisted bots. To allow one: `extra: "User-agent: facebookexternalhit\nAllow: /"`.
- Removing a name from the list in a later version stops the build of a site that names it. That's deliberate; release notes say so.

### What blocking costs

From the operators' own docs, read 261102.

| Bot | What blocking it does | Source |
|---|---|---|
| `Googlebot` | Affects Google Search, Images, Video and News. A blocked URL can still be listed, without its content. | [Google](https://developers.google.com/search/docs/crawling-indexing/googlebot) |
| `Google-Extended` | Opts out of Gemini training and grounding. Not a Search signal. It never visits, so only robots.txt can express it. | [Google](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers) |
| `GPTBot` | Opts out of OpenAI training. Independent of ChatGPT search. | [OpenAI](https://developers.openai.com/api/docs/bots) |
| `OAI-SearchBot` | Drops you from ChatGPT search answers, though you can still appear as a navigational link. | [OpenAI](https://developers.openai.com/api/docs/bots) |
| `ChatGPT-User` | Aimed at a person's own request. OpenAI says robots.txt rules may not apply. | [OpenAI](https://developers.openai.com/api/docs/bots) |
| `ClaudeBot` | Opts out of collection that could contribute to Anthropic's training. | [Anthropic](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) |
| `Claude-SearchBot` | May reduce visibility in Claude's search results. | [Anthropic](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) |
| `Claude-User` | Stops Claude fetching your pages when a person asks about them. | [Anthropic](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) |
| `PerplexityBot` | Drops you from Perplexity's search listings. Perplexity says it isn't used for training. | [Perplexity](https://docs.perplexity.ai/guides/bots) |
| `Perplexity-User` | Aimed at a person's own request. Perplexity says it generally ignores robots.txt. | [Perplexity](https://docs.perplexity.ai/guides/bots) |
| `Applebot` | Affects search in Siri, Spotlight and Safari. | [Apple](https://support.apple.com/en-us/119829) |
| `Applebot-Extended` | Opts out of Apple's model training, and pages can still appear in search. It never crawls. | [Apple](https://support.apple.com/en-us/119829) |
| `meta-externalagent` | Opts out of Meta's training and direct product indexing. | [Meta](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers) |
| `meta-externalfetcher` | Aimed at a person's own request. Meta says it may bypass robots.txt. | [Meta](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers) |
| `Bingbot` | DuckDuckGo says it sources links largely from Bing, so its results are affected too. | [DuckDuckGo](https://duckduckgo.com/duckduckgo-help-pages/results/sources/) |

The bot list is hand-kept. Names and purposes were checked against [ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt) and operators' docs; `YandexBot` and `Baiduspider` weren't checked against an operator's page.

ai.robots.txt is MIT licensed:

> MIT License. Copyright (c) 2024 ai.robots.txt. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Develop

```bash
npm install
npm run dev        # demo page (index.html)
npm test           # vitest + happy-dom
npm run typecheck
npm run build      # dist/: ES module + .d.ts
```

## Releasing

`dist/` is committed so git-tag installs and the CDN need no build. For each release: bump `version` in `package.json`, `npm test && npm run build`, commit `dist/` with the source, tag `vX.Y.Z`, push the tag, then bump the consumers you want on it.

## History

- **v0.4.0** — Visitor policy: `defineThreshold()` (`@ndrsc3/web-threshold/policy`), four presets, raw `extra` lines and `web-threshold robots`. Gate fix: inherited object keys such as `constructor` no longer fire `tier-unlocked`, which changes `dist/web-threshold.js`. Adds the LICENSE file. A site naming a bot that later leaves the list stops building, by design.
- **v0.3.0** — `label` and `button` attributes; `::part(label)` and `::part(button)`. Labels and button text are HTML-escaped.
- **v0.2.0** — extracted from `web_lafinka` (`packages/threshold`, branch `path0/threshold-v0.1`, `a04bb6b`) into its own repo. Renamed `<finka-threshold>` → `<web-threshold>` (breaking). Added the `inputmode` passthrough and `submit()`.
- **v0.1.0** — first build, inside the `web_lafinka` monorepo.

Naming: reusable web modules are `web-<module>`; sites are `web_<site>`.

## License

MIT (`LICENSE`).
