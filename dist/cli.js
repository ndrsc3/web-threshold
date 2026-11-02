#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
const catalogue = [
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
];
const BOTS = catalogue;
const BLOCKED_KINDS = {
  open: [],
  "block-ai-training": ["ai-training"],
  "block-all-ai": ["ai-training", "ai-search"],
  "search-engines-only": ["ai-training", "ai-search", "ai-user"]
};
class ThresholdConfigError extends Error {
  constructor() {
    super(...arguments);
    __publicField(this, "name", "ThresholdConfigError");
  }
}
function hasStarGroup(extra) {
  return directives(extra).some((d) => /^user-agent\s*:\s*\*$/i.test(d));
}
function directives(text) {
  return text.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean);
}
function canonicalNames(field, names, errors) {
  if (names === void 0) return [];
  if (!Array.isArray(names)) {
    errors.push(`bots.${field} must be a list of bot names`);
    return [];
  }
  const found = [];
  for (const name of names) {
    const bot = BOTS.find((b) => b.name.toLowerCase() === String(name).toLowerCase());
    if (bot) found.push(bot.name);
    else errors.push(`bots.${field}: "${String(name)}" is not in the catalogue; add it through extra as its own group`);
  }
  return found;
}
function unknownKeys(where, value, known, errors) {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) errors.push(`unknown key ${where}${key}`);
  }
}
function resolvePolicy(config) {
  const errors = [];
  if (typeof config !== "object" || config === null) {
    throw new ThresholdConfigError("the config must be an object");
  }
  const { bots, extra } = config;
  unknownKeys("", config, ["bots", "extra"], errors);
  if (typeof bots !== "object" || bots === null) {
    errors.push("bots.preset is required");
    throw new ThresholdConfigError(errors.join("\n"));
  }
  unknownKeys("bots.", bots, ["preset", "allow", "block"], errors);
  const raw = bots;
  const preset = raw.preset;
  if (raw.preset === void 0) errors.push("bots.preset is required");
  else if (!Object.keys(BLOCKED_KINDS).includes(String(raw.preset))) {
    errors.push(`unknown preset "${String(raw.preset)}"; use ${Object.keys(BLOCKED_KINDS).join(", ")}`);
  }
  const allow = canonicalNames("allow", raw.allow, errors);
  const block = canonicalNames("block", raw.block, errors);
  for (const name of allow) {
    if (block.includes(name)) errors.push(`"${name}" is in both bots.allow and bots.block`);
  }
  if (extra !== void 0) {
    if (typeof extra !== "string") {
      errors.push("extra must be a string");
    } else {
      const first = directives(extra).find((d) => !/^sitemap\s*:/i.test(d));
      if (first !== void 0 && !/^user-agent\s*:/i.test(first)) {
        errors.push(`extra must start its rules with a User-agent line, not "${first}"`);
      }
      if (preset === "search-engines-only" && hasStarGroup(extra)) {
        errors.push("extra can't have a User-agent: * group under search-engines-only");
      }
    }
  }
  if (errors.length > 0) throw new ThresholdConfigError(errors.join("\n"));
  const kinds = BLOCKED_KINDS[preset];
  const inPreset = BOTS.filter((b) => kinds.includes(b.kind)).map((b) => b.name);
  const blocked = [.../* @__PURE__ */ new Set([...inPreset, ...block])].filter((name) => !allow.includes(name));
  const allowed = preset === "search-engines-only" ? [.../* @__PURE__ */ new Set([...BOTS.filter((b) => b.kind === "search-engine").map((b) => b.name), ...allow])].filter(
    (name) => !block.includes(name)
  ) : [];
  return { preset, blocked, allowed, extra };
}
const GENERATED_HEADER = "# Generated by web-threshold";
function group(names, rule) {
  return [...names.map((name) => `User-agent: ${name}`), rule].join("\n");
}
function generateRobots(config) {
  const { preset, blocked, allowed, extra } = resolvePolicy(config);
  const groups = [];
  if (preset === "search-engines-only") {
    groups.push(group(["*"], "Disallow: /"));
    if (allowed.length > 0) groups.push(group(allowed, "Allow: /"));
  } else if (preset === "open" && !(extra !== void 0 && hasStarGroup(extra))) {
    groups.push(group(["*"], "Allow: /"));
  }
  if (preset !== "search-engines-only" && blocked.length > 0) {
    groups.push(group(blocked, "Disallow: /"));
  }
  const generated = groups.join("\n\n");
  if (extra === void 0) return `${GENERATED_HEADER}
${generated}
`;
  return generated ? `${GENERATED_HEADER}
${generated}

${extra}` : `${GENERATED_HEADER}
${extra}`;
}
const CONFIG = "threshold.config.ts";
const OUT = join("public", "robots.txt");
const USAGE = "usage: web-threshold robots";
function loadFailure(err) {
  const code = err.code;
  if (code === "ERR_UNKNOWN_FILE_EXTENSION") {
    return `this Node can't load ${CONFIG}; it needs a Node with type stripping turned on (Node 24 has it)`;
  }
  if (err instanceof SyntaxError) {
    return `${CONFIG} didn't load as an ES module (${err.message}); check "type" in the site's package.json is not "commonjs"`;
  }
  return `${CONFIG} didn't load: ${err instanceof Error ? err.message : String(err)}`;
}
async function robots(cwd, log) {
  const configPath = join(cwd, CONFIG);
  if (!existsSync(configPath)) {
    log(`no ${CONFIG} in ${cwd}`);
    return 1;
  }
  let config;
  try {
    config = (await import(pathToFileURL(configPath).href)).default;
  } catch (err) {
    const invalid = (err == null ? void 0 : err.name) === "ThresholdConfigError";
    log(invalid ? `${CONFIG}:
${err.message}` : loadFailure(err));
    return 1;
  }
  if (config === void 0) {
    log(`${CONFIG} has no default export`);
    return 1;
  }
  let text;
  try {
    text = generateRobots(config);
  } catch (err) {
    log(`${CONFIG}:
${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const outPath = join(cwd, OUT);
  if (existsSync(outPath) && !readFileSync(outPath, "utf8").startsWith(GENERATED_HEADER)) {
    log(`${OUT} wasn't generated by web-threshold, so it stays. To replace it: git rm ${OUT}, moving any rules you need into extra`);
    return 1;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text);
  log(`wrote ${OUT}`);
  return 0;
}
async function run(args, cwd, log = console.error) {
  if (args.length === 1 && args[0] === "robots") return robots(cwd, log);
  log(USAGE);
  return 1;
}
void run(process.argv.slice(2), process.cwd()).then((code) => {
  process.exitCode = code;
});
