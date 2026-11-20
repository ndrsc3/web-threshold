# web-threshold — Task Board

Status: active
Plans: `docs/plans/261102-visitor-policy-level-0.md` · `docs/plans/261029-v0.5-encrypted-tiers.md`

## P1 — now
- [ ] **Bump consumers to v0.5.0** — only `web_noesis` pins the package (v0.3.0); its row is on its own board, P3, after its v1. Banana Rodeo's adoption row names v0.5.0
- [ ] **Port the old guard mutations, one list at a time** `[GATE]` — `mutation-check.py` runs vitest now (`"runner": "vitest"`), and `docs/mutations/v0.6.0.json` is the first spec. Port a list when its code is next changed, not in bulk: 124 of the 156 old anchors still match and 30 are stale. A whole-suite sweep to find each mutation's catching tests took ~30 s a mutation (stopped 261120), and `seal.test.ts` alone is ~35 s a run. `261102-round-j.py` already fails closed
- [ ] **Banana Rodeo: whole-site trial done, adoption later** `[GATE]` — owner 261102: revisit later. Open for it: pages in a public repo, its Vercel-hosted build, images stay public; a signed cookie is the alternative for a real lock

## P2 — next-up
- [ ] **Confirm Vercel middleware cost and log retention** `[GUARD]` — every-request middleware at our traffic on Hobby, before committing to guard level 1

## P3 — backlog
- [ ] **Visitor policy: guard level 1** `[GUARD]` — middleware refuses listed bots, catches impostors by IP range, records and refuses trap hits; arcjet identity data joins the catalogue; needs the Key Constraints #3 and #5 call
  - exploration: `docs/explorations/261102-visitor-policy.md` §§ 4–5
- [ ] **Visitor policy: guard level 2** `[GUARD]` — remember trapped bots site-wide; only once logs show trap hits worth it
- [ ] **La Finka garden: sealed files for gated pages** — owner 261104: the house-only geothermal manual (`/maintenance/systems/system-geothermal/`, group `agorideans`) embeds a schematic and marked-up basement photos, which stay public at their own URLs under staticrypt. Accepted for now. The case for moving the garden's gating to sealed mode; the decision row is in `digitalgarden_lafinka/docs/TASKS.md` ("Decide whether page gating moves to The Threshold's sealed mode")

## Parked
- [ ] **Bot viewer / exhibit** — parked 261102 (owner): later exploration, configurable per site; the Crawler Zoo already does it well
- [ ] **Maze** — parked 261102 (owner): record and refuse first; revisit only if a site wants it as an exhibit

## Done
- [x] **v0.6.0 source: `masked` and `strict`** — `masked` attribute (password field) and `"masked": true` in the doors file for seal's shells; `"strict": true` makes any phrase hit in public output stop the build. Tests + `docs/mutations/v0.6.0.json` (4/4 caught). First consumer: underScore's `/startup/` (261120)
- [x] **v0.5.0: sealed mode** — two shipped-code reviews folded (-j, -k), clean-clone build, tagged and pushed (261102)
- [x] **Docs** — README front door, `docs/sealed-mode.md`, `docs/visitor-policy.md`; images via `npm run docs:shots` (261102)
- [x] **Default shell: `<noscript>` line** — a sealed page with JavaScript off says it needs it (261102)
- [x] **v0.5 sealed mode: phone bench** — median 73 ms, slowest 80 ms at 600k and 64 slots, Pixel 9 Pro over HTTPS; older phones and iOS unmeasured (261102)
- [x] **v0.4.0: visitor policy level 0** — config, 43-bot list, generated robots.txt, gate inherited-key fix; ▶ first adopter checks the file on a Vercel preview (261102)
- [x] **Gate moved to `src/gate/`** — shared base for both tracks; `dist/web-threshold.js` byte-identical (261102)
- [x] **v0.3.0** — `label` and `button` attributes, styleable parts (261029)
