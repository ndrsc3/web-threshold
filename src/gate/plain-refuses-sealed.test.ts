// Only the plain entry is registered here, as it would be if it got there first.
import { expect, it } from "vitest";
import "./index.js";

it("emits threshold-error and refuses submits, never falling back to secrets", async () => {
  const el = document.createElement("web-threshold") as HTMLElement & { secrets: Record<string, string> };
  el.setAttribute("sealed", "#bundle");
  el.secrets = { fox: "fox" };
  const faults: string[] = [];
  let unlocked = false;
  el.addEventListener("threshold-error", (e) => faults.push((e as CustomEvent<{ code: string }>).detail.code));
  el.addEventListener("tier-unlocked", () => (unlocked = true));
  document.body.append(el);
  await Promise.resolve();
  await Promise.resolve();
  expect(faults).toEqual(["sealed-needs-sealed-entry"]);

  el.shadowRoot!.querySelector("input")!.value = "fox";
  el.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  expect(unlocked).toBe(false);
  expect(faults).toEqual(["sealed-needs-sealed-entry", "sealed-needs-sealed-entry"]);
});
