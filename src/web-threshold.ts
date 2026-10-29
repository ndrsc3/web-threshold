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

export class WebThreshold extends HTMLElement {
  #secrets: SecretMap = {};
  #input: HTMLInputElement | null = null;

  static get observedAttributes(): string[] {
    return ["placeholder"];
  }

  /** Consumer sets this — `el.secrets = { "phrase": "tier" }`. Never persisted. */
  set secrets(map: SecretMap) {
    this.#secrets = map ?? {};
  }

  get secrets(): SecretMap {
    return this.#secrets;
  }

  connectedCallback(): void {
    // Guard: connectedCallback can fire more than once; only build the shadow tree once.
    if (this.shadowRoot) return;
    this.#render();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "placeholder" && this.#input) {
      this.#input.placeholder = value ?? "";
    }
  }

  #render(): void {
    const root = this.attachShadow({ mode: "open" });
    const placeholder = this.getAttribute("placeholder") ?? "";
    // A numeric code wants the phone's number pad: inputmode="numeric".
    const inputmode = this.getAttribute("inputmode") ?? "text";
    root.innerHTML = `
      <style>
        :host { display: block; }
        form { margin: 0; }
        input {
          font: inherit;
          color: inherit;
          background: transparent;
          border: none;
          border-bottom: 1px solid currentColor;
          padding: 0.4em 0;
          width: 100%;
          outline: none;
        }
        input::placeholder { color: inherit; opacity: 0.4; }
      </style>
      <form part="form" autocomplete="off" novalidate>
        <input
          part="input"
          type="text"
          inputmode="${inputmode.replace(/"/g, "&quot;")}"
          name="threshold"
          placeholder="${placeholder.replace(/"/g, "&quot;")}"
          aria-label="Enter a phrase to continue"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
        />
      </form>
    `;
    this.#input = root.querySelector("input");
    root.querySelector("form")?.addEventListener("submit", this.#onSubmit);
  }

  /**
   * Submit the current value, as pressing return would. The phone number pad
   * has no return key, so a consumer using inputmode="numeric" wires its own
   * button to this.
   */
  submit(): void {
    this.shadowRoot?.querySelector("form")?.requestSubmit();
  }

  #onSubmit = (event: Event): void => {
    event.preventDefault();
    const value = (this.#input?.value ?? "").trim();
    const tier = this.#secrets[value];
    // Clear the field regardless — nothing carries over between attempts (no persistence).
    if (this.#input) this.#input.value = "";
    if (!tier) return; // silent fail — stay on the public surface

    this.dispatchEvent(
      new CustomEvent<TierUnlockedDetail>("tier-unlocked", {
        detail: { tier },
        bubbles: true,
        composed: true,
      }),
    );
  };
}
