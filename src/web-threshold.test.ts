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
  const el = document.createElement("web-threshold") as ThresholdEl;
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

describe("<web-threshold>", () => {
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

  it("defaults the input to inputmode=text", () => {
    expect(el.shadowRoot!.querySelector("input")!.getAttribute("inputmode")).toBe("text");
  });

  it("passes an inputmode attribute through to the input (number pad for numeric codes)", () => {
    document.body.innerHTML = "";
    const numeric = document.createElement("web-threshold") as ThresholdEl;
    numeric.setAttribute("inputmode", "numeric");
    document.body.appendChild(numeric);
    expect(numeric.shadowRoot!.querySelector("input")!.getAttribute("inputmode")).toBe("numeric");
  });

  it("submit() unlocks like pressing return, for pads with no return key", () => {
    const tier = captureTier(el);
    el.shadowRoot!.querySelector("input")!.value = "vouchsafe";
    (el as unknown as { submit(): void }).submit();
    expect(tier()).toEqual({ tier: "collaborator" });
  });

  it("renders no prompt or button by default", () => {
    expect(el.shadowRoot!.querySelector("label")).toBeNull();
    expect(el.shadowRoot!.querySelector("button")).toBeNull();
    expect(el.shadowRoot!.querySelector("input")!.getAttribute("aria-label")).toBeTruthy();
  });

  it("label renders a visible prompt that names the input", () => {
    el.setAttribute("label", "Enter case no.");
    const label = el.shadowRoot!.querySelector("label")!;
    expect(label.textContent).toBe("Enter case no.");
    expect(label.getAttribute("part")).toBe("label");
    expect(label.getAttribute("for")).toBe(el.shadowRoot!.querySelector("input")!.id);
  });

  it("label and button text are escaped, not parsed as HTML", () => {
    el.setAttribute("label", "<b>case</b>");
    el.setAttribute("button", "<i>go</i>");
    expect(el.shadowRoot!.querySelector("b")).toBeNull();
    expect(el.shadowRoot!.querySelector("i")).toBeNull();
    expect(el.shadowRoot!.querySelector("label")!.textContent).toBe("<b>case</b>");
  });

  it("button renders a submit button that unlocks", () => {
    el.setAttribute("button", "Submit");
    const tier = captureTier(el);
    el.shadowRoot!.querySelector("input")!.value = "open sesame";
    const button = el.shadowRoot!.querySelector("button")!;
    expect(button.textContent).toBe("Submit");
    expect(button.getAttribute("part")).toBe("button");
    button.click();
    expect(tier()).toEqual({ tier: "gardener" });
  });

  it("keeps the typed value when label or button changes", () => {
    el.shadowRoot!.querySelector("input")!.value = "half typed";
    el.setAttribute("label", "Prompt");
    expect(el.shadowRoot!.querySelector("input")!.value).toBe("half typed");
  });
});
