import catalogue from "../../data/bots.json";

export type BotKind = "ai-training" | "ai-search" | "ai-user" | "search-engine";
export type Preset = "open" | "block-ai-training" | "block-all-ai" | "search-engines-only";

export interface BotPolicy {
  preset: Preset;
  /** Catalogue names to let through, whatever the preset says. */
  allow?: string[];
  /** Catalogue names to refuse, whatever the preset says. */
  block?: string[];
}

export interface ThresholdConfig {
  bots: BotPolicy;
  /** Raw robots.txt text, appended as written after the generated groups. */
  extra?: string;
}

export interface Bot {
  name: string;
  kind: BotKind;
}

export const BOTS = catalogue as Bot[];

const BLOCKED_KINDS: Record<Preset, BotKind[]> = {
  open: [],
  "block-ai-training": ["ai-training"],
  "block-all-ai": ["ai-training", "ai-search"],
  "search-engines-only": ["ai-training", "ai-search", "ai-user"],
};

export class ThresholdConfigError extends Error {
  override name = "ThresholdConfigError";
}

/** True if `extra` has a group for every bot. */
export function hasStarGroup(extra: string): boolean {
  return directives(extra).some((d) => /^user-agent\s*:\s*\*$/i.test(d));
}

/** Non-empty lines of robots.txt text, comments removed. */
function directives(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
}

function canonicalNames(field: string, names: unknown, errors: string[]): string[] {
  if (names === undefined) return [];
  if (!Array.isArray(names)) {
    errors.push(`bots.${field} must be a list of bot names`);
    return [];
  }
  const found: string[] = [];
  for (const name of names) {
    const bot = BOTS.find((b) => b.name.toLowerCase() === String(name).toLowerCase());
    if (bot) found.push(bot.name);
    else errors.push(`bots.${field}: "${String(name)}" is not in the catalogue; add it through extra as its own group`);
  }
  return found;
}

function unknownKeys(where: string, value: object, known: string[], errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) errors.push(`unknown key ${where}${key}`);
  }
}

export interface ResolvedPolicy {
  preset: Preset;
  /** Named `Disallow: /` group. */
  blocked: string[];
  /** Named `Allow: /` group; only `search-engines-only` needs one. */
  allowed: string[];
  extra: string | undefined;
}

/** Checks a config and works out who is blocked. Throws on anything it can't vouch for. */
export function resolvePolicy(config: unknown): ResolvedPolicy {
  const errors: string[] = [];
  if (typeof config !== "object" || config === null) {
    throw new ThresholdConfigError("the config must be an object");
  }
  const { bots, extra } = config as { bots?: unknown; extra?: unknown };
  unknownKeys("", config, ["bots", "extra"], errors);

  if (typeof bots !== "object" || bots === null) {
    errors.push("bots.preset is required");
    throw new ThresholdConfigError(errors.join("\n"));
  }
  unknownKeys("bots.", bots, ["preset", "allow", "block"], errors);

  const raw = bots as { preset?: unknown; allow?: unknown; block?: unknown };
  const preset = raw.preset as Preset;
  if (raw.preset === undefined) errors.push("bots.preset is required");
  else if (!Object.keys(BLOCKED_KINDS).includes(String(raw.preset))) {
    errors.push(`unknown preset "${String(raw.preset)}"; use ${Object.keys(BLOCKED_KINDS).join(", ")}`);
  }

  const allow = canonicalNames("allow", raw.allow, errors);
  const block = canonicalNames("block", raw.block, errors);
  for (const name of allow) {
    if (block.includes(name)) errors.push(`"${name}" is in both bots.allow and bots.block`);
  }

  if (extra !== undefined) {
    if (typeof extra !== "string") {
      errors.push("extra must be a string");
    } else {
      // Rules before any User-agent line would join the last generated group
      // and could undo the block list.
      const first = directives(extra).find((d) => !/^sitemap\s*:/i.test(d));
      if (first !== undefined && !/^user-agent\s*:/i.test(first)) {
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
  const blocked = [...new Set([...inPreset, ...block])].filter((name) => !allow.includes(name));

  const allowed =
    preset === "search-engines-only"
      ? [...new Set([...BOTS.filter((b) => b.kind === "search-engine").map((b) => b.name), ...allow])].filter(
          (name) => !block.includes(name),
        )
      : [];

  return { preset, blocked, allowed, extra: extra as string | undefined };
}

/** Checks the config and returns it, so a mistake surfaces where the config is written. */
export function defineThreshold(config: ThresholdConfig): ThresholdConfig {
  resolvePolicy(config);
  return config;
}
