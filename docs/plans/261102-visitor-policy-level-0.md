# Visitor policy, level 0: config and generated robots.txt

| Field | Value |
|-------|-------|
| **Date** | 261102 |
| **Status** | Active |
| **Reviewed** | 261102 |
| **Origin** | Exploration: `docs/explorations/261102-visitor-policy.md` |
| **Modules** | `src/policy`, `src/robots`, `src/cli`, `data/bots.json`, build config |
| **Complexity** | Medium |
| **Review** | Solo OK · Adversarial review: run 261102-a (19 findings, folded), 261102-b (9 findings, folded), 261102-c (7 findings, folded), 261102-d (4 LOW, folded) · cleared to implement |

## Goal

A site with a build step writes one small config saying which bots it wants, plus any raw lines of its own, and the build writes its `robots.txt`. No server code. The gate and every consumer's pinned install stay untouched.

## Background

The exploration holds the owner's requirements and the research. Level 0 is the "sign" level: it asks bots to behave and enforces nothing.

The need is live: `noesis.lafinka.space/robots.txt` returned the app's HTML with a 200 on 261102, because of its catch-all rewrite. A hand-written file fixes that one site. Banana Rodeo has path rules, `Crawl-delay` and a `Sitemap:` in its file. `web_underScore` has `Disallow: /s/` and `/p/` and no build step, so it stays hand-written (a-2).

## Approach

1. **Write the list and `src/policy` + `src/robots`** as pure functions with no DOM, with golden files that include the awkward names (`Applebot`, `Bravebot`) (b-1).
2. **Add the CLI and its build**, keeping the gate's output unchanged.
3. **Prove the path a consumer takes:** a git-tag install in a scratch site.

### Catalogue

`data/bots.json` is a hand-written, reviewed list of 30–60 bots, bundled into `dist` at build time (a-1):

```json
{ "name": "GPTBot", "kind": "ai-training" }
```

- `kind` is one of `ai-training`, `ai-search`, `ai-user`, `search-engine`. A dual-role bot takes the kind that matches what blocking it costs: `Applebot` and `Bravebot` are `search-engine` (a-4).
- A bot with no clear kind stays off the list, so the `block-*` presets don't touch it. `search-engines-only` still blocks it like any unlisted bot, including `facebookexternalhit` and so link previews; the README says so and shows a named group in `extra` as the way back (a-4, b-3).
- `ai.robots.txt` (MIT) and operators' docs are the sources. The README carries the notice in full, because `data/` isn't published in the package (a-18).
- Catalogue tests: every name is a plain product token; names are unique ignoring case; no name in a blocking kind is a substring of a `search-engine` or `ai-user` name, because some parsers match by substring (a-5).

The cost notes (what blocking a bot costs you) are a README table for about 15 major bots, checked against the operators' docs, with source links (a-8).

### Config

```ts
// threshold.config.ts
import { defineThreshold } from "@ndrsc3/web-threshold/policy";

export default defineThreshold({
  bots: { preset: "block-ai-training", allow: ["CCBot"], block: ["Bytespider"] },
  extra: "User-agent: *\nDisallow: /cgi-bin/\nSitemap: https://example.com/sitemap.xml",
});
```

| Preset | Blocks | Generated shape |
|---|---|---|
| `open` | nothing | `User-agent: *` / `Allow: /`, unless `extra` has its own `*` group |
| `block-ai-training` | `ai-training` | one named group, `Disallow: /`; no `*` group of its own |
| `block-all-ai` | `ai-training`, `ai-search` | the same; `ai-user` stays allowed |
| `search-engines-only` | everything but `search-engine` | `User-agent: *` / `Disallow: /`, plus a named `Allow: /` group for the allowed bots |

- `bots.preset` is required; a missing one is a refusal (c-3).
- `allow` and `block` take catalogue names, matched ignoring case. A bot the catalogue lacks goes in `extra` as its own group (a-12, b-7).
- `extra` is raw text appended after the generated groups (a-2). Its first directive other than a comment or `Sitemap` must be `User-agent`, or its rules would attach to the last generated group and could undo the block list (b-4). `search-engines-only` with a `User-agent: *` group in `extra` is an error, because the two would conflict; detection tolerates case and spacing (b-4).
- `AdsBot-Google` ignores `*`, so `search-engines-only` doesn't stop it. The README says so and shows the `extra` group that blocks it (a-15, b-7).

**Validation fails closed:** an unknown preset, a name not in the catalogue, a name in both `allow` and `block`, a bad `extra`, or an unknown key stops the build with a non-zero exit and writes nothing. A bump can therefore break a site's build if a name it lists leaves the catalogue; that's intended, and release notes must say so (a-12).

### CLI

`web-threshold robots` (a-16, b-8, c-6). `src/cli` dispatches subcommands and an unknown one exits non-zero, so sealed tiers can add `seal` there (b-9).

- **Paths (d-4):** reads `threshold.config.ts`; writes `public/robots.txt`, creating `public/` if needed (a-17, b-8, c-7).
- **Header:** the file's first line is `# Generated by web-threshold`.
- **Overwrite guard:** refuses a file without that header, and the message says to `git rm` it first (c-6).
- **Write:** only after validation passes. The CLI validates even if a config skipped `defineThreshold()`.
- **Site wiring:** `"prebuild": "web-threshold robots"`, with the output gitignored (a-17). The README shows this.

### Package

```
web-threshold/
  src/gate/      existing
  src/policy/    defineThreshold(), validation, types, preset → block list
  src/robots/    policy → robots.txt text (internal, no export)
  src/cli/       the CLI; bundles policy, robots and the list
  data/bots.json
```

New: an `./policy` export and a `bin` (a-8). `.` stays as it is.

**Build (a-7):** `vite build` keeps the library build and adds `policy` as an entry. A second config, `vite.cli.config.ts`, uses `build.ssr`, `emptyOutDir: false` and `ssr.noExternal`, and runs after it. `src/cli` gets its own `tsconfig.cli.json` with `types: ["node"]` and a dev-only `@types/node`; the main tsconfig excludes `src/cli` and keeps `types: []`, so gate code still can't reach for Node. Adding `src/cli` to the library entries fails, as pass 261102-a showed.

## Decision Log

- **Hand-written list, no upstream sync** *(owner 261102, a-1)*: the 202-name catalogue caused most of the plan's complexity, and upstream records only 64 as obeying `robots.txt`. This cuts `refresh-bots`, `unsorted`, the sorting tables and the token rules. `refresh-bots` returns when someone needs a name faster than the list changes. Arcjet joins with guard level 1, which reads its identity data.
- **Raw `extra` lines; sites with a build step** *(owner 261102, a-2)*: `web_underScore` stays hand-written and the README says so, so its capability-path rule is never at risk. The output is a static file for any host; the CLI needs a build.
- **Key Constraint #3 scoped to the gate** *(owner 261102, a-10)*: the browser gate stays tiny and policy lives in its own entry point. The audit-log part and #5 stay open until guard level 1.
- **`ai-user` is allowed by both `block-*` presets**: the exploration's default. To block one, name it in `block`. `search-engines-only` blocks them, as its name says; `allow` is the opt-out (b-5).
- **No `Block SEO tools` preset yet**: it would need its own list.
- **No `llms.txt` or `ai.txt`** (a-19): optional in exploration § 4, and read far less than `robots.txt`.
- **Config narrower than the exploration's example**: no `trap` or `gate` keys until something reads them.
- **`.ts` configs use Node's own type stripping**: no new dependency. `web_noesis`'s Vercel project reports Node 24.x (`vercel project inspect`, 261102). An unsupported Node, or a `.ts` config in a `"type": "commonjs"` site, gets a clear message rather than Node's raw error (a-11, c-7).
- **`dist/` is rebuilt only at release**, per README § Releasing, so the parallel tracks don't fight over it (a-9).

## Risks / Open Questions

- **SPA rewrites.** A generated `public/robots.txt` should win over a catch-all rewrite, because Vercel serves real files first (from memory). Verify on the first adopter's preview before saying it works (a-13).
- **A pinned tag freezes the list.** Editing the list then tagging is a manual ritual, by choice.
- **Cost notes can be wrong.** They're claims about other companies' behaviour, which is why each carries a source link.

## Tasks

1. **List:** 30–60 entries, with the catalogue tests above. Cost-note table and MIT notice in the README.
2. **`src/policy`:** `defineThreshold()`, types, validation. A test for each refusal.
3. **`src/robots`:** text generation. Golden files per preset; round-trip tests showing `ai-user` bots are allowed under `block-*` and `allow` wins. Tests use a small RFC 9309 matcher in a test helper (longest match, `Allow` wins ties, blank lines not significant), with no new dependency (b-1, b-2). Copy `web_bananaRodeo/public/robots.txt` in as a fixture and pass it through `extra` under `open`: the output after the header must equal it byte for byte, with no normalisation, so a dropped `Crawl-delay` or `Sitemap` fails (c-4, d-2). Assert the fixture's length (1046 bytes), and check the matcher against a written path table (`/cgi-bin/x` no, `/` yes) (d-1).
4. **`src/cli`:** defaults, overwrite guard, non-zero exit on any failure.
5. **Build:** as above. In a scratch clone, build the same source under the old and new vite configs; `dist/web-threshold.js` must match. Never build in the shared checkout, since `dist/` is tracked (a-9, b-6). Import `./policy` in Node with no DOM.
6. **Consumer proof:** clone to scratch, commit a built `dist/` and tag there, `npm i git+file://<clone>#<tag>` in a scratch site, confirm `bin` links, run with a `.ts` config and read the output back. Then break the config and confirm a non-zero exit with no file written. Repeat with `--no-experimental-strip-types` and in a `"type": "commonjs"` site for the clear message (a-11, a-13, d-3).
7. **Docs:** README section (config, presets, wiring, minimum Node for `.ts`, limits: a sign not a lock, `AdsBot-Google`, link previews, no-build sites); update `package.json`'s `description`; board.
8. **Release, owner-approved as v0.4.0 (261102):** build from a clean clone at the commit to be tagged, never the shared checkout. Compare `dist/web-threshold.js` with the previous tag's and name any gate change in the release notes (c-2). Tag, push, offer the bump. On the first adopter, check the generated file on a Vercel preview.

## Pickup — start here next session

- **Order:** tasks 1 to 7 in order. Any machine with Node 24; task 1 needs network for its sources.
- **Commits:** the checkout is shared with sealed-tiers work. Before task 5, commit this plan's paths by pathspec to `main`, unpushed; never `src/gate/` or `dist/` (c-1).
- **Owner-owed inputs:** none to proceed before task 8. Show the owner the bot list after task 1, without waiting on it (c-5). Version: v0.4.0, with sealed tiers moving to v0.5 (owner 261102).
- **Do not re-derive:** noesis is insulated by its `v0.3.0` pin, with its `main.ts` typechecked against the packed package after the `src/gate` move (`9435f9f`). Multi-entry Vite leaves `dist/web-threshold.js` unchanged, and type stripping loads a `.ts` config on Node 24.22 (pass 261102-a, simulated in scratch).
- **Stay out of:** `src/gate/` and `web_noesis`.
