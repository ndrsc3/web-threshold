# web-threshold — Task Board

Status: active
Plan: `docs/plans/261029-v0.4-encrypted-tiers.md`

## P1 — now
- [ ] **Decide order: visitor policy vs v0.4** `[PLAN]` — explore, then pick which ships first; levels 0–1 don't touch gate code
  - exploration: `docs/explorations/261102-visitor-policy.md` § 6

## P2 — next-up
- [ ] **v0.4 sealed tiers** `[GATE]` — real gating; the garden drops staticrypt (after noesis v1, ~261106)
  - plan: `docs/plans/261029-v0.4-encrypted-tiers.md`
- [ ] **Visitor policy: config schema + bot catalogue** `[POLICY]` — `defineThreshold()`, merged `data/bots.json` (arcjet + ai.robots.txt), the three-kinds mapping
  - exploration: `docs/explorations/261102-visitor-policy.md` §§ 2–3
- [ ] **Confirm Vercel middleware cost** `[GUARD]` — every-request middleware at our traffic, before committing to guard level 1

## P3 — backlog
- [ ] **Visitor policy: guard levels 0–1** `[GUARD]` — generated robots.txt; middleware refuses listed bots, catches impostors by IP range, records and refuses trap hits
- [ ] **Visitor policy: guard level 2** `[GUARD]` — remember trapped bots site-wide; only once logs show trap hits worth it

## Parked
- [ ] **Bot viewer / exhibit** — parked 261102 (owner): later exploration, configurable per site; the Crawler Zoo already does it well
- [ ] **Maze** — parked 261102 (owner): record and refuse first; revisit only if a site wants it as an exhibit

## Done
- [x] **v0.3.0** — `label` and `button` attributes, styleable parts (261029)
