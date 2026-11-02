import { SealedThreshold } from "./sealed.js";

export { SealedThreshold } from "./sealed.js";
export type { SealedUnlockedDetail } from "./sealed.js";
export type { SecretMap, TierName, TierUnlockedDetail, ThresholdFaultDetail } from "./web-threshold.js";

// Side effect: register the element on import. If the plain entry got there first,
// it stays plain, and a `sealed` attribute emits threshold-error and refuses submits.
if (!customElements.get("web-threshold")) {
  customElements.define("web-threshold", SealedThreshold);
}
