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
export declare const BOTS: Bot[];
export declare class ThresholdConfigError extends Error {
    name: string;
}
/** True if `extra` has a group for every bot. */
export declare function hasStarGroup(extra: string): boolean;
export interface ResolvedPolicy {
    preset: Preset;
    /** Named `Disallow: /` group. */
    blocked: string[];
    /** Named `Allow: /` group; only `search-engines-only` needs one. */
    allowed: string[];
    extra: string | undefined;
}
/** Checks a config and works out who is blocked. Throws on anything it can't vouch for. */
export declare function resolvePolicy(config: unknown): ResolvedPolicy;
/** Checks the config and returns it, so a mistake surfaces where the config is written. */
export declare function defineThreshold(config: ThresholdConfig): ThresholdConfig;
