# web-threshold

**The Threshold** — a reusable entry gate as a Web Component. A single input field; what the visitor types decides which tier of content opens. No accounts, no login modals. A wrong phrase fails silently.

Used by La Finka's sites and others: lafinka.space, noesis.lafinka.space, banana.rodeo (planned), and the La Finka digital garden (planned, with the v0.4 encryption mode).

## Install

Pin a tag. Each site upgrades on purpose.

```bash
npm install github:ndrsc3/web-threshold#v0.3.0
```

```ts
import "@ndrsc3/web-threshold";            // registers <web-threshold>
import type { WebThreshold } from "@ndrsc3/web-threshold";
```

Plain HTML, no build step:

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/ndrsc3/web-threshold@v0.3.0/dist/web-threshold.js"></script>
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

**Security model (plain mode):** the secrets map ships to the browser, so the gate is atmosphere, not protection. Real gating is the planned v0.4 encryption mode (`docs/plans/`).

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

- **v0.3.0** — `label` and `button` attributes; `::part(label)` and `::part(button)`. Labels and button text are HTML-escaped.
- **v0.2.0** — extracted from `web_lafinka` (`packages/threshold`, branch `path0/threshold-v0.1`, `a04bb6b`) into its own repo. Renamed `<finka-threshold>` → `<web-threshold>` (breaking). Added the `inputmode` passthrough and `submit()`.
- **v0.1.0** — first build, inside the `web_lafinka` monorepo.

Naming: reusable web modules are `web-<module>`; sites are `web_<site>`.

## License

MIT (`LICENSE`).
