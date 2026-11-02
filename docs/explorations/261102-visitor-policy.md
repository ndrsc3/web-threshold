---
type: exploration
status: promoted
closes-when: a visitor-policy plan is written in docs/plans/ with its order against sealed tiers decided, or the idea is dropped
tags:
  - threshold
  - bots
  - robots-txt
  - visitor-policy
date: 261102
---

# The Threshold as visitor policy

| Field | Value |
|-------|-------|
| **Trigger** | Conversation 261031–261102: reading The Crawler Zoo (crawlerzoo.com) to see what the Threshold should absorb |
| **Modules** | `src/` (today's `<web-threshold>`), planned `policy` / `robots` / `guard` entry points, `data/bots.json` |
| **Outcome** | Plan created for level 0; sealed tiers (v0.5) run in parallel (owner 261102); levels 1–2 stay on the board |

## Context

The Threshold today is a browser component: one input, a typed phrase opens a tier (README § Contract). Its security model in plain mode is "atmosphere, not protection", and v0.5 adds sealed tiers (`docs/plans/261029-v0.5-encrypted-tiers.md`).

The owner wants the Threshold to grow into the place where a site configures **how anyone or anything comes in**: people through the gate, bots through rules. Specifically:

- toggle which bots are allowed;
- generate a `robots.txt`, plus any server rules or scripts that help;
- record bots that misbehave and refuse them ("record and refuse").

Out of scope for now: a dashboard or exhibit of visiting bots (the Crawler Zoo already does that well; a later exploration, configurable per site) and a maze (later, if ever). Guiding constraint: **as simple as possible.**

Reference material: `vault-FinkaLabs/Signal/Data/The Crawler Zoo — Live Crawler Exhibit.md` and the posture model in `vault-FinkaLabs/Knowledge/Dev/Designing for an AI-Scraped Web.md` (feed, signal, gate, trap, withhold). The Threshold would cover signal, gate and trap.

## Findings

### 1. What we take from the Crawler Zoo

Read 261101 from its public pages (`/tools`, `/robots-txt-generator`, `/block-ai-crawlers`, `/reading-room`).

- **Three kinds of AI bot.** Training crawlers, AI search crawlers and user-triggered fetchers. Blocking training costs nothing in search. Blocking AI search costs citations in AI answers. Blocking user-triggered fetchers (Claude-User, ChatGPT-User, Perplexity-User) blocks a person who asked about the site, and several operators say robots.txt may not apply to them anyway. **Default: let user-triggered fetchers through.**
- **Presets.** Block AI training · Block all AI · Block SEO tools · Search engines only · Clear.
- **A cost note for each bot.** Ticking a bot shows what blocking it costs. Examples: blocking Googlebot drops you from Google Search (use `Google-Extended` to opt out of Gemini training only). Blocking GPTBot doesn't affect ChatGPT search (that's `OAI-SearchBot`). Blocking Bingbot also drops you from DuckDuckGo and Yahoo. AdsBot-Google ignores `User-agent: *` and has to be named. This is the most valuable thing to borrow, written in our own words: the Zoo publishes no license for its data.
- **Names that exist only in robots.txt.** `Google-Extended` and `Applebot-Extended` never visit, so only robots.txt can block them, never a server rule.
- **The server writes the file.** The generator is a list of checkboxes. The page fetches `/robots-txt-generator.txt?b=…`, so the preview, the shareable link and the download are always the same. Its client script is about 1.3 KB.
- **robots.txt is a sign, not a lock.** It doesn't stop bots that ignore it (1,230 walked into the Zoo's forbidden path in 30 days), impostors, or data already collected.
- **Check identity by network, never by user-agent.** Impostors are common; real crawlers come from their operator's published IP ranges.
- **Trap by misbehaviour.** robots.txt forbids one path, and every page links to it invisibly. Anything that arrives ignored the sign. Polite bots never pay for it.
- **People are counted only as an anonymous total.**
- **`llms.txt` and `ai.txt` are read far less than robots.txt** (40 and 30 bots, against 78), and some reads look like bulk crawling, not real use. They're cheap to generate but low value.

### 2. Where to get an up-to-date bot list

Checked 261102 (GitHub API, raw downloads, HTTP status of the IP-range files).

| Source | License | Last pushed | Size | Role |
|---|---|---|---|---|
| `arcjet/well-known-bots` | MIT | 261023 | 826 bots | **Base.** User-agent patterns, categories (ai 94, search-engine 76, monitor 82, preview 39, …), and identity checks on 110 bots: IP ranges (CIDR or IP lists, with the operator's JSON URL), reverse-DNS masks, and Web Bot Auth. Covers the Anthropic, OpenAI, Perplexity, Google and Meta crawlers. A curated fork of monperrus. |
| `ai-robots-txt/ai.robots.txt` | MIT | 261030 | 202 AI bots | **Overlay.** The names robots.txt uses, plus operator, purpose and whether the bot obeys robots.txt. Ships robots.txt, nginx, Caddy, HAProxy and `.htaccess` blocks. Weak spots: "respects robots.txt" says "Unclear" for 123 of the 202, and the purpose labels are inconsistent (31 "AI Assistants", 20 "AI Data Scrapers", plus free text). |
| `monperrus/crawler-user-agents` | MIT | 261031 | 1,505 patterns | Widest user-agent coverage; no identity checks, rough tags. Fallback only. |
| Operators' IP-range files | n/a | live | n/a | 200 on 261102: Google (`googlebot.json`), Bing (`bingbot.json`), OpenAI (`gptbot` / `searchbot` / `chatgpt-user.json`), Perplexity (`perplexitybot` / `perplexity-user.json`), Apple (`applebot.json`). Arcjet's entries already link to them. |

**Proposal:** merge arcjet (identity) and ai.robots.txt (AI purpose, robots.txt names) into one `data/bots.json` kept in the repo, plus our own cost-note layer. `scripts/refresh-bots` pulls both upstream lists and shows the diff for review before anything changes, so no bot lands unseen.

Assumption to check: mapping arcjet's categories and ai.robots.txt's purpose labels onto our three kinds will need some hand-sorting.

### 3. Package shape: option A (agreed 261102)

One repo (`web-threshold`), one package (`@ndrsc3/web-threshold`), separate entry points, so a static site never ships server code and a server never ships the browser component. The repo keeps its name, and a site pins one tag for everything.

```
web-threshold/
  src/gate/      <web-threshold> component (today's code; v0.5 sealed mode later)
  src/policy/    defineThreshold() — config schema + types
  src/robots/    policy → robots.txt (+ CLI: `web-threshold robots`)
  src/guard/     policy → request check: refuse / allow / record
  data/bots.json merged catalogue + our cost notes
  scripts/refresh-bots
```

Rejected: B (one repo holding several packages: release overhead we don't need) and C (separate repos: the owner wants one repo).

One config per site; the build writes robots.txt from it and the guard reads the same rules at request time, so the two can't drift apart:

```ts
// threshold.config.ts
export default defineThreshold({
  bots:  { preset: "block-ai-training", allow: ["Claude-User"], block: ["Bytespider"] },
  trap:  { path: "/back-room/" },
  gate:  { tiers: { /* plain secrets now; sealed later */ } },
});
```

### 4. Guard levels: why a little server code, and how little

To **refuse** a bot, something has to answer the request before the page goes out. On Vercel, a static site's files are served with no code of ours running. The smallest way to add a check is Vercel's routing middleware: one `middleware.ts` at the site's root that runs before every request, and works with plain Vite sites (noesis, banana.rodeo). Every live consumer is on Vercel: `web_noesis`, `web_bananaRodeo` and `web_underScore` all have `vercel.json`.

| Level | What runs | Gets you | Needs |
|---|---|---|---|
| **0: Sign** | Build step only | Generated robots.txt (optionally `llms.txt` / `ai.txt`) | Any host |
| **1: Guard** | `middleware.ts` | 403 for listed bots; impostors caught by IP range; trap path returns 403 and writes one log line ("record" = Vercel's own logs) | Vercel; no database |
| **2: Memory** | Middleware plus a small key-value store | A bot that falls in the trap is refused site-wide afterwards | One store |

Leaning: **build levels 0 and 1; add level 2 only once the logs show trap hits worth remembering.**

Open costs to check: the middleware runs on every request (expected to stay within Vercel's free allowance at our traffic; unverified), and the IP-range files need refreshing. Reverse-DNS checks are left out: Vercel's edge has no plain DNS lookup, and IP ranges are enough. A server-rule export (an nginx snippet) can follow for any site not on Vercel.

### 5. Trap: record and refuse

- robots.txt forbids the trap path, and the page carries a link to it that no person can see. The `<web-threshold>` element could render that link itself, or the site places a small snippet.
- A hit means a 403 and a log line. At level 2, the bot is also remembered and refused everywhere.
- No maze. It bills a request per room, and the owner wants it later at most.
- User-triggered fetchers stay allowed by default, but if one walks into the trap it is still recorded.

### 6. Still open

- **The project's Key Constraints #3 and #5.** #3's "tiny" is scoped to the gate (owner 261102). Its audit-log part and #5 ("events out, not page ownership") stay open until guard level 1.
- **Catalogue.** Level 0 ships a hand-written list, not the merge in § 2 (owner 261102); `refresh-bots` and arcjet wait.
- **Viewer:** later, and configurable per site.
- **The cost of every-request middleware on Vercel:** unverified.
- **Licensing:** arcjet and ai.robots.txt are MIT, so attribution goes in `data/` and the README.

## Action Items

- [x] Decide the order against sealed tiers — in parallel (owner 261102)
- [x] Draft `threshold.config` schema and the three-kinds mapping — level 0 plan
- [ ] Confirm the Vercel middleware cost at our traffic — on the board
- [x] `/plan` in `docs/plans/` — level 0 plan; version number decided at its release

## Related

- Plan: `docs/plans/261102-visitor-policy-level-0.md`
- `docs/plans/261029-v0.5-encrypted-tiers.md`
- `vault-FinkaLabs/Projects/The Threshold/The Threshold.md`
- `vault-FinkaLabs/Signal/Data/The Crawler Zoo — Live Crawler Exhibit.md`
- `vault-FinkaLabs/Knowledge/Dev/Designing for an AI-Scraped Web.md`
- `_underScore/knowledge/web-access-control-patterns.md`
