var y = Object.defineProperty;
var x = (n, e, a) => e in n ? y(n, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : n[e] = a;
var k = (n, e, a) => x(n, typeof e != "symbol" ? e + "" : e, a);
const S = [
  {
    name: "GPTBot",
    kind: "ai-training"
  },
  {
    name: "ClaudeBot",
    kind: "ai-training"
  },
  {
    name: "anthropic-ai",
    kind: "ai-training"
  },
  {
    name: "Google-Extended",
    kind: "ai-training"
  },
  {
    name: "Google-CloudVertexBot",
    kind: "ai-training"
  },
  {
    name: "Applebot-Extended",
    kind: "ai-training"
  },
  {
    name: "meta-externalagent",
    kind: "ai-training"
  },
  {
    name: "FacebookBot",
    kind: "ai-training"
  },
  {
    name: "CCBot",
    kind: "ai-training"
  },
  {
    name: "Bytespider",
    kind: "ai-training"
  },
  {
    name: "TikTokSpider",
    kind: "ai-training"
  },
  {
    name: "cohere-training-data-crawler",
    kind: "ai-training"
  },
  {
    name: "DeepSeekBot",
    kind: "ai-training"
  },
  {
    name: "AI2Bot",
    kind: "ai-training"
  },
  {
    name: "PanguBot",
    kind: "ai-training"
  },
  {
    name: "Timpibot",
    kind: "ai-training"
  },
  {
    name: "ImagesiftBot",
    kind: "ai-training"
  },
  {
    name: "Webzio-Extended",
    kind: "ai-training"
  },
  {
    name: "OAI-SearchBot",
    kind: "ai-search"
  },
  {
    name: "Claude-SearchBot",
    kind: "ai-search"
  },
  {
    name: "PerplexityBot",
    kind: "ai-search"
  },
  {
    name: "Amzn-SearchBot",
    kind: "ai-search"
  },
  {
    name: "AzureAI-SearchBot",
    kind: "ai-search"
  },
  {
    name: "ExaSearchBot",
    kind: "ai-search"
  },
  {
    name: "GrokBot",
    kind: "ai-search"
  },
  {
    name: "Kimi-SearchBot",
    kind: "ai-search"
  },
  {
    name: "YouBot",
    kind: "ai-search"
  },
  {
    name: "ChatGPT-User",
    kind: "ai-user"
  },
  {
    name: "Claude-User",
    kind: "ai-user"
  },
  {
    name: "Perplexity-User",
    kind: "ai-user"
  },
  {
    name: "MistralAI-User",
    kind: "ai-user"
  },
  {
    name: "meta-externalfetcher",
    kind: "ai-user"
  },
  {
    name: "Amzn-User",
    kind: "ai-user"
  },
  {
    name: "Kimi-User",
    kind: "ai-user"
  },
  {
    name: "Manus-User",
    kind: "ai-user"
  },
  {
    name: "kagi-fetcher",
    kind: "ai-user"
  },
  {
    name: "Googlebot",
    kind: "search-engine"
  },
  {
    name: "Bingbot",
    kind: "search-engine"
  },
  {
    name: "Applebot",
    kind: "search-engine"
  },
  {
    name: "DuckDuckBot",
    kind: "search-engine"
  },
  {
    name: "Bravebot",
    kind: "search-engine"
  },
  {
    name: "YandexBot",
    kind: "search-engine"
  },
  {
    name: "Baiduspider",
    kind: "search-engine"
  }
], u = S, d = {
  open: [],
  "block-ai-training": ["ai-training"],
  "block-all-ai": ["ai-training", "ai-search"],
  "search-engines-only": ["ai-training", "ai-search", "ai-user"]
};
class l extends Error {
  constructor() {
    super(...arguments);
    k(this, "name", "ThresholdConfigError");
  }
}
function C(n) {
  return g(n).some((e) => /^user-agent\s*:\s*\*$/i.test(e));
}
function g(n) {
  return n.split(/\r?\n/).map((e) => e.replace(/#.*$/, "").trim()).filter(Boolean);
}
function m(n, e, a) {
  if (e === void 0) return [];
  if (!Array.isArray(e))
    return a.push(`bots.${n} must be a list of bot names`), [];
  const r = [];
  for (const t of e) {
    const s = u.find((o) => o.name.toLowerCase() === String(t).toLowerCase());
    s ? r.push(s.name) : a.push(`bots.${n}: "${String(t)}" is not in the catalogue; add it through extra as its own group`);
  }
  return r;
}
function h(n, e, a, r) {
  for (const t of Object.keys(e))
    a.includes(t) || r.push(`unknown key ${n}${t}`);
}
function A(n) {
  const e = [];
  if (typeof n != "object" || n === null)
    throw new l("the config must be an object");
  const { bots: a, extra: r } = n;
  if (h("", n, ["bots", "extra"], e), typeof a != "object" || a === null)
    throw e.push("bots.preset is required"), new l(e.join(`
`));
  h("bots.", a, ["preset", "allow", "block"], e);
  const t = a, s = t.preset;
  t.preset === void 0 ? e.push("bots.preset is required") : Object.keys(d).includes(String(t.preset)) || e.push(`unknown preset "${String(t.preset)}"; use ${Object.keys(d).join(", ")}`);
  const o = m("allow", t.allow, e), c = m("block", t.block, e);
  for (const i of o)
    c.includes(i) && e.push(`"${i}" is in both bots.allow and bots.block`);
  if (r !== void 0)
    if (typeof r != "string")
      e.push("extra must be a string");
    else {
      const i = g(r).find((w) => !/^sitemap\s*:/i.test(w));
      i !== void 0 && !/^user-agent\s*:/i.test(i) && e.push(`extra must start its rules with a User-agent line, not "${i}"`), s === "search-engines-only" && C(r) && e.push("extra can't have a User-agent: * group under search-engines-only");
    }
  if (e.length > 0) throw new l(e.join(`
`));
  const p = d[s], f = u.filter((i) => p.includes(i.kind)).map((i) => i.name), b = [.../* @__PURE__ */ new Set([...f, ...c])].filter((i) => !o.includes(i)), B = s === "search-engines-only" ? [.../* @__PURE__ */ new Set([...u.filter((i) => i.kind === "search-engine").map((i) => i.name), ...o])].filter(
    (i) => !c.includes(i)
  ) : [];
  return { preset: s, blocked: b, allowed: B, extra: r };
}
function j(n) {
  return A(n), n;
}
export {
  u as BOTS,
  l as ThresholdConfigError,
  j as defineThreshold,
  C as hasStarGroup,
  A as resolvePolicy
};
