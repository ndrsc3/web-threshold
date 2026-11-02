import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS, served as written
import { applyUnlock, safeRoute } from "./handler.js";

function page() {
  document.body.innerHTML = '<b id="t"></b><p id="m"></p><pre id="r" hidden></pre>';
  const went: string[] = [];
  const sounds: string[] = [];
  return {
    went,
    sounds,
    root: document.documentElement,
    tier: document.getElementById("t")!,
    message: document.getElementById("m")!,
    reveal: document.getElementById("r")!,
    sound: (name: string) => sounds.push(name),
    go: (url: string) => went.push(url),
  };
}
const detail = (over: object) => ({ tier: "fox", names: [], open: async () => new Blob(["x"]), ...over });

describe("demo handler", () => {
  it("doesn't navigate to another origin", async () => {
    const p = page();
    await applyUnlock(detail({ data: { route: "https://elsewhere.example/" } }), p);
    expect(p.went).toEqual([]);
  });

  it.each(["javascript:alert(1)", "//elsewhere.example/x", 3])("refuses the route %j", (route) => {
    expect(safeRoute(route, "https://here.example")).toBeNull();
  });

  it("follows a same-site route", async () => {
    const p = page();
    await applyUnlock(detail({ data: { route: "/inner/" } }), p);
    expect(p.went).toEqual([new URL("/inner/", location.origin).href]);
  });

  it("skips routing on a replay, so a reload can't loop", async () => {
    const p = page();
    await applyUnlock(detail({ replayed: true, data: { route: "/inner/" } }), p);
    expect(p.went).toEqual([]);
  });

  it("keeps markup in data and payloads as text", async () => {
    const p = page();
    const html = '<img src=x onerror="alert(1)">';
    await applyUnlock(detail({ names: ["n"], data: { message: html }, open: async () => new Blob([html]) }), p);
    expect(document.querySelector("img")).toBeNull();
    expect(p.message.textContent).toBe(html);
    expect(p.reveal.textContent).toBe(html);
  });

  it("clears the last door's message and text", async () => {
    const p = page();
    await applyUnlock(detail({ names: ["n"], data: { message: "first" } }), p);
    await applyUnlock(detail({ data: {} }), p);
    expect(p.message.textContent).toBe("");
    expect(p.reveal.textContent).toBe("");
    expect(p.reveal.hidden).toBe(true);
  });

  it("reads a key the site invented", async () => {
    const p = page();
    await applyUnlock(detail({ data: { sound: "bell" } }), p);
    expect(p.sounds).toEqual(["bell"]);
  });
});
