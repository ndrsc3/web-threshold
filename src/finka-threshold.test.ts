import { beforeEach, describe, expect, it } from "vitest";
import "./index.js";
import type { SecretMap, TierUnlockedDetail } from "./index.js";

const SECRETS: SecretMap = {
  "open sesame": "gardener",
  "the latch lifts": "agoridean",
  "vouchsafe": "collaborator",
};

interface ThresholdEl extends HTMLElement {
  secrets: SecretMap;
}

function mount(): ThresholdEl {
  document.body.innerHTML = "";
  const el = document.createElement("finka-threshold") as ThresholdEl;
  el.secrets = SECRETS;
  document.body.appendChild(el);
  return el;
}

function submit(el: ThresholdEl, value: string): void {
  const input = el.shadowRoot!.querySelector("input")!;
  input.value = value;
  el.shadowRoot!
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

function captureTier(el: ThresholdEl): () => TierUnlockedDetail | null {
  let detail: TierUnlockedDetail | null = null;
  el.addEventListener("tier-unlocked", (e) => {
    detail = (e as CustomEvent<TierUnlockedDetail>).detail;
  });
  return () => detail;
}

describe("<finka-threshold> v0.1", () => {
  let el: ThresholdEl;
  beforeEach(() => {
    el = mount();
  });

  it("renders a single input inside a shadow root", () => {
    const inputs = el.shadowRoot!.querySelectorAll("input");
    expect(inputs.length).toBe(1);
  });

  it("emits tier-unlocked with the mapped tier on a matching phrase", () => {
    const tier = captureTier(el);
    submit(el, "open sesame");
    expect(tier()).toEqual({ tier: "gardener" });
  });

  it("maps different phrases to different tiers", () => {
    const tier = captureTier(el);
    submit(el, "vouchsafe");
    expect(tier()).toEqual({ tier: "collaborator" });
  });

  it("fails silently on a non-matching phrase — no event, no throw", () => {
    let fired = false;
    el.addEventListener("tier-unlocked", () => (fired = true));
    expect(() => submit(el, "wrong code")).not.toThrow();
    expect(fired).toBe(false);
  });

  it("trims surrounding whitespace before matching", () => {
    const tier = captureTier(el);
    submit(el, "   open sesame   ");
    expect(tier()).toEqual({ tier: "gardener" });
  });

  it("clears the input after every submit (no persistence between attempts)", () => {
    submit(el, "open sesame");
    expect(el.shadowRoot!.querySelector("input")!.value).toBe("");
    submit(el, "wrong code");
    expect(el.shadowRoot!.querySelector("input")!.value).toBe("");
  });

  it("emits a composed, bubbling event so the consumer page can listen at the document", () => {
    let heard: TierUnlockedDetail | null = null;
    document.addEventListener(
      "tier-unlocked",
      (e) => (heard = (e as CustomEvent<TierUnlockedDetail>).detail),
      { once: true },
    );
    submit(el, "the latch lifts");
    expect(heard).toEqual({ tier: "agoridean" });
  });
});
