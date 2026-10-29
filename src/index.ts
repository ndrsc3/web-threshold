import { WebThreshold } from "./web-threshold.js";

export { WebThreshold } from "./web-threshold.js";
export type { TierName, SecretMap, TierUnlockedDetail } from "./web-threshold.js";

// Side effect: register the element on import. Guarded so importing twice is safe.
if (!customElements.get("web-threshold")) {
  customElements.define("web-threshold", WebThreshold);
}

declare global {
  interface HTMLElementTagNameMap {
    "web-threshold": WebThreshold;
  }
}
