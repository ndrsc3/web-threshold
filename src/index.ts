import { FinkaThreshold } from "./finka-threshold.js";

export { FinkaThreshold } from "./finka-threshold.js";
export type { TierName, SecretMap, TierUnlockedDetail } from "./finka-threshold.js";

// Side effect: register the element on import. Guarded so importing twice is safe.
if (!customElements.get("finka-threshold")) {
  customElements.define("finka-threshold", FinkaThreshold);
}

declare global {
  interface HTMLElementTagNameMap {
    "finka-threshold": FinkaThreshold;
  }
}
