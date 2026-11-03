var T = (e) => {
  throw TypeError(e);
};
var S = (e, s, t) => s.has(e) || T("Cannot " + t);
var i = (e, s, t) => (S(e, s, "read from private field"), t ? t.call(e) : s.get(e)), d = (e, s, t) => s.has(e) ? T("Cannot add the same private member more than once") : s instanceof WeakSet ? s.add(e) : s.set(e, t), g = (e, s, t, r) => (S(e, s, "write to private field"), r ? r.call(e, t) : s.set(e, t), t), a = (e, s, t) => (S(e, s, "access private method"), t);
const D = "fold1";
class l extends Error {
  constructor(s) {
    super(s), this.code = s;
  }
}
function x(e) {
  return e.normalize("NFD").replace(new RegExp("\\p{M}", "gu"), "").normalize("NFC").replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/\s+/g, " ").trim().toLowerCase();
}
function H(e) {
  let s = "";
  for (const t of e) s += String.fromCharCode(t);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function w(e) {
  const s = atob(e.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (t) => t.charCodeAt(0));
}
const y = (e) => e, R = (e) => crypto.subtle.importKey("raw", y(e), "AES-GCM", !1, ["encrypt", "decrypt"]);
async function z(e, s, t) {
  const r = await crypto.subtle.importKey("raw", new TextEncoder().encode(x(e)), "PBKDF2", !1, ["deriveBits"]), o = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: y(s), iterations: t }, r, 256);
  return new Uint8Array(o);
}
async function G(e, s) {
  const t = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: y(w(s.iv)) },
    await R(e),
    y(w(s.ct))
  );
  return new Uint8Array(t);
}
async function J(e, s) {
  if (typeof e.src != "string" || typeof e.iv != "string") throw new l("payload-missing");
  const t = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: y(w(e.iv)) },
    await R(w(e.k)),
    y(await s(e.src))
  );
  return new Uint8Array(t);
}
async function $(e, s) {
  const t = [];
  for (const r of e.slots)
    try {
      t.push(JSON.parse(new TextDecoder().decode(await G(s, r))));
    } catch {
    }
  return t;
}
const C = (e) => typeof e == "string" && /^[A-Za-z0-9_-]+$/.test(e), X = (e) => C(e == null ? void 0 : e.iv) && C(e == null ? void 0 : e.ct);
function Y(e) {
  const s = e;
  if (typeof s != "object" || s === null) throw new l("malformed-bundle");
  if (s.v !== 1) throw new l("unsupported-version");
  const t = s.kdf;
  if (typeof t != "object" || t === null || typeof t.salt != "string") throw new l("malformed-bundle");
  if (t.norm !== D) throw new l("unsupported-norm");
  if (!Number.isInteger(t.iter) || t.iter < 1) throw new l("malformed-bundle");
  if (t.iter > 5e6) throw new l("iterations-over-ceiling");
  if (!C(t.salt)) throw new l("malformed-bundle");
  if (!Array.isArray(s.slots) || !s.slots.every(X)) throw new l("malformed-bundle");
  return s;
}
var p, u, b, L, F, E;
class W extends HTMLElement {
  constructor() {
    super(...arguments);
    d(this, b);
    d(this, p, {});
    d(this, u, null);
    d(this, E, (t) => {
      var o;
      t.preventDefault();
      const r = (((o = i(this, u)) == null ? void 0 : o.value) ?? "").trim();
      i(this, u) && (i(this, u).value = ""), this.handlePhrase(r);
    });
  }
  static get observedAttributes() {
    return ["placeholder", "label", "button"];
  }
  /** Consumer sets this — `el.secrets = { "phrase": "tier" }`. Never persisted. */
  set secrets(t) {
    g(this, p, t ?? {});
  }
  get secrets() {
    return i(this, p);
  }
  connectedCallback() {
    this.shadowRoot || (a(this, b, L).call(this), this.hasAttribute("sealed") && this.sealedAttached());
  }
  /** The sealed entry loads its bundle here. This entry can't open one. */
  sealedAttached() {
    Promise.resolve().then(() => this.emitFault("sealed-needs-sealed-entry"));
  }
  emitFault(t) {
    console.error(`web-threshold: ${t}`), this.dispatchEvent(
      new CustomEvent("threshold-error", { detail: { code: t }, bubbles: !0, composed: !0 })
    );
  }
  attributeChangedCallback(t, r, o) {
    var h;
    if (!this.shadowRoot || r === o) return;
    if (t === "placeholder" && i(this, u)) {
      i(this, u).placeholder = o ?? "";
      return;
    }
    const c = ((h = i(this, u)) == null ? void 0 : h.value) ?? "";
    a(this, b, F).call(this), i(this, u) && (i(this, u).value = c);
  }
  /**
   * Submit the current value, as pressing return would. The phone number pad
   * has no return key: set the `button` attribute, or wire your own button to this.
   */
  submit() {
    var t, r;
    (r = (t = this.shadowRoot) == null ? void 0 : t.querySelector("form")) == null || r.requestSubmit();
  }
  /** What a submitted phrase does. The sealed entry overrides this. */
  handlePhrase(t) {
    if (this.hasAttribute("sealed")) {
      this.emitFault("sealed-needs-sealed-entry");
      return;
    }
    const r = Object.hasOwn(i(this, p), t) ? i(this, p)[t] : void 0;
    r && this.dispatchEvent(
      new CustomEvent("tier-unlocked", {
        detail: { tier: r },
        bubbles: !0,
        composed: !0
      })
    );
  }
}
p = new WeakMap(), u = new WeakMap(), b = new WeakSet(), L = function() {
  const t = this.attachShadow({ mode: "open" });
  t.innerHTML = `
      <style>
        :host { display: block; }
        form { margin: 0; }
        label { display: block; margin-bottom: 0.4em; }
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
        button {
          font: inherit;
          color: inherit;
          background: transparent;
          border: 1px solid currentColor;
          padding: 0.4em 1em;
          margin-top: 1em;
          cursor: pointer;
        }
      </style>
      <form part="form" autocomplete="off" novalidate></form>
    `, t.querySelector("form").addEventListener("submit", i(this, E)), a(this, b, F).call(this);
}, /** Build the form's contents from the current attributes. */
F = function() {
  const t = this.shadowRoot.querySelector("form"), r = this.getAttribute("label"), o = this.getAttribute("button"), c = this.getAttribute("inputmode") ?? "text";
  t.innerHTML = `
      ${r ? `<label part="label" for="threshold-input">${k(r)}</label>` : ""}
      <input
        part="input"
        id="threshold-input"
        type="text"
        inputmode="${k(c)}"
        name="threshold"
        placeholder="${k(this.getAttribute("placeholder") ?? "")}"
        ${r ? "" : 'aria-label="Enter a phrase to continue"'}
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
      />
      ${o ? `<button part="button" type="submit">${k(o)}</button>` : ""}
    `, g(this, u, t.querySelector("input"));
}, E = new WeakMap();
function k(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const j = "web-threshold:keys";
var m, v, A, n, N, P, O, q, I, K, U, B, _, M;
class Z extends W {
  constructor() {
    super(...arguments);
    d(this, n);
    d(this, m, null);
    d(this, v, []);
    d(this, A, !1);
  }
  /**
   * A listener can attach after a replay: on a sealed page the element upgrades as the page
   * is written, before the page's own module runs. It still hears what it missed. A listener
   * further up, on `document`, has to be there first.
   */
  addEventListener(t, r, o) {
    if (super.addEventListener(t, r, o), t === "tier-unlocked")
      for (const c of i(this, v))
        queueMicrotask(() => {
          const h = new CustomEvent("tier-unlocked", { detail: c, bubbles: !0, composed: !0 });
          for (const f of ["target", "currentTarget"]) Object.defineProperty(h, f, { value: this });
          typeof r == "function" ? r.call(this, h) : r.handleEvent(h);
        });
  }
  sealedAttached() {
    g(this, m, a(this, n, N).call(this));
  }
  handlePhrase(t) {
    if (!this.hasAttribute("sealed")) {
      super.handlePhrase(t);
      return;
    }
    a(this, n, U).call(this, t);
  }
}
m = new WeakMap(), v = new WeakMap(), A = new WeakMap(), n = new WeakSet(), N = async function() {
  var t;
  await Promise.resolve();
  try {
    if (!((t = globalThis.crypto) != null && t.subtle)) throw new l("no-webcrypto");
    const r = Y(await a(this, n, K).call(this, this.getAttribute("sealed") ?? ""));
    return Object.keys(this.secrets).length > 0 ? this.emitFault("both-modes") : a(this, n, P).call(this) && await a(this, n, I).call(this, r), r;
  } catch (r) {
    return this.emitFault(r instanceof l ? r.code : "malformed-bundle"), null;
  }
}, P = function() {
  const t = this.getAttribute("remember");
  return t === "session" ? !0 : (t !== null && this.emitFault("unsupported-remember"), !1);
}, /** Keys that opened a slot, per tab. Never a phrase. Storage failing only means retyping. */
O = function() {
  try {
    const t = JSON.parse(sessionStorage.getItem(j) ?? "[]");
    return Array.isArray(t) ? t.filter((r) => typeof r == "string") : [];
  } catch {
    return [];
  }
}, q = function(t) {
  if (this.getAttribute("remember") === "session")
    try {
      const r = new Set(a(this, n, O).call(this)).add(H(t));
      sessionStorage.setItem(j, JSON.stringify([...r]));
    } catch {
    }
}, I = async function(t) {
  for (const r of a(this, n, O).call(this))
    try {
      for (const o of await $(t, w(r))) a(this, n, B).call(this, o, !0);
    } catch {
    }
}, K = async function(t) {
  const r = new URL(t, location.href);
  if (r.origin !== location.origin) throw new l("cross-origin");
  let o;
  try {
    o = await fetch(r);
  } catch {
    throw new l("fetch-failed");
  }
  if (!o.ok) throw new l("fetch-failed");
  return o.json();
}, U = async function(t) {
  if (!i(this, A)) {
    if (!i(this, m)) {
      this.emitFault("sealed-set-after-connect");
      return;
    }
    if (Object.keys(this.secrets).length > 0) {
      this.emitFault("both-modes");
      return;
    }
    if (x(t)) {
      a(this, n, M).call(this, !0);
      try {
        const r = await i(this, m);
        if (!r) return;
        const o = await z(t, w(r.kdf.salt), r.kdf.iter), [c] = await $(r, o);
        c ? (a(this, n, q).call(this, o), a(this, n, B).call(this, c)) : this.hasAttribute("report-wrong") && this.dispatchEvent(new CustomEvent("tier-rejected", { bubbles: !0, composed: !0 }));
      } catch {
        this.emitFault("malformed-bundle");
      } finally {
        a(this, n, M).call(this, !1);
      }
    }
  }
}, B = function(t, r = !1) {
  const o = {
    tier: t.tier,
    data: t.data,
    names: Object.keys(t.open),
    ...r ? { replayed: r } : {},
    open: async (c) => {
      if (!Object.hasOwn(t.open, c)) throw new Error(`this door doesn't open "${c}"`);
      const h = t.open[c];
      try {
        return new Blob([await J(h, (f) => a(this, n, _).call(this, f))], { type: h.type });
      } catch (f) {
        throw this.emitFault(f instanceof l ? f.code : "payload-unreadable"), f;
      }
    }
  };
  r && i(this, v).push(o), this.dispatchEvent(new CustomEvent("tier-unlocked", { detail: o, bubbles: !0, composed: !0 }));
}, _ = async function(t) {
  const r = new URL(t, location.href);
  if (r.origin !== location.origin) throw new l("cross-origin");
  let o = null;
  try {
    o = await fetch(r);
  } catch {
  }
  if (!(o != null && o.ok)) throw new l("fetch-failed");
  return new Uint8Array(await o.arrayBuffer());
}, M = function(t) {
  g(this, A, t), this.toggleAttribute("busy", t), t ? this.setAttribute("aria-busy", "true") : this.removeAttribute("aria-busy");
};
customElements.get("web-threshold") || customElements.define("web-threshold", Z);
export {
  Z as SealedThreshold
};
