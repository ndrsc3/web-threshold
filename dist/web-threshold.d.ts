/**
 * The Threshold — <web-threshold>
 *
 * A single static input field rendered as a custom element. The visitor types a
 * phrase; if it matches a key in `secrets`, the element emits a `tier-unlocked`
 * CustomEvent carrying the mapped tier. A non-matching phrase fails silently —
 * no error message, no shake, no "try again" (the contract's "no error
 * theater"). No persistence, no admin UI, no token URLs. The consuming page owns
 * what happens on unlock; the Threshold only emits the event.
 *
 * Contract: README.md § Contract.
 */
export type TierName = string;
/** Maps a secret phrase to the tier it unlocks. Consumer-provided. */
export type SecretMap = Record<string, TierName>;
/** Payload of the `tier-unlocked` event. */
export interface TierUnlockedDetail {
    tier: TierName;
}
export declare class WebThreshold extends HTMLElement {
    #private;
    static get observedAttributes(): string[];
    /** Consumer sets this — `el.secrets = { "phrase": "tier" }`. Never persisted. */
    set secrets(map: SecretMap);
    get secrets(): SecretMap;
    connectedCallback(): void;
    attributeChangedCallback(name: string, _old: string | null, value: string | null): void;
    /**
     * Submit the current value, as pressing return would. The phone number pad
     * has no return key, so a consumer using inputmode="numeric" wires its own
     * button to this.
     */
    submit(): void;
}
