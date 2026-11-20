var y = (e) => {
  throw TypeError(e);
};
var m = (e, o, t) => o.has(e) || y("Cannot " + t);
var s = (e, o, t) => (m(e, o, "read from private field"), t ? t.call(e) : o.get(e)), h = (e, o, t) => o.has(e) ? y("Cannot add the same private member more than once") : o instanceof WeakSet ? o.add(e) : o.set(e, t), f = (e, o, t, r) => (m(e, o, "write to private field"), r ? r.call(e, t) : o.set(e, t), t), d = (e, o, t) => (m(e, o, "access private method"), t);
var l, i, a, v, g, p;
class w extends HTMLElement {
  constructor() {
    super(...arguments);
    h(this, a);
    h(this, l, {});
    h(this, i, null);
    h(this, p, (t) => {
      var n;
      t.preventDefault();
      const r = (((n = s(this, i)) == null ? void 0 : n.value) ?? "").trim();
      s(this, i) && (s(this, i).value = ""), this.handlePhrase(r);
    });
  }
  static get observedAttributes() {
    return ["placeholder", "label", "button", "masked"];
  }
  /** Consumer sets this — `el.secrets = { "phrase": "tier" }`. Never persisted. */
  set secrets(t) {
    f(this, l, t ?? {});
  }
  get secrets() {
    return s(this, l);
  }
  connectedCallback() {
    this.shadowRoot || (d(this, a, v).call(this), this.hasAttribute("sealed") && this.sealedAttached());
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
  attributeChangedCallback(t, r, n) {
    var u;
    if (!this.shadowRoot || r === n) return;
    if (t === "placeholder" && s(this, i)) {
      s(this, i).placeholder = n ?? "";
      return;
    }
    const b = ((u = s(this, i)) == null ? void 0 : u.value) ?? "";
    d(this, a, g).call(this), s(this, i) && (s(this, i).value = b);
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
    const r = Object.hasOwn(s(this, l), t) ? s(this, l)[t] : void 0;
    r && this.dispatchEvent(
      new CustomEvent("tier-unlocked", {
        detail: { tier: r },
        bubbles: !0,
        composed: !0
      })
    );
  }
}
l = new WeakMap(), i = new WeakMap(), a = new WeakSet(), v = function() {
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
    `, t.querySelector("form").addEventListener("submit", s(this, p)), d(this, a, g).call(this);
}, /** Build the form's contents from the current attributes. */
g = function() {
  const t = this.shadowRoot.querySelector("form"), r = this.getAttribute("label"), n = this.getAttribute("button"), b = this.getAttribute("inputmode") ?? "text", u = this.hasAttribute("masked") ? "password" : "text";
  t.innerHTML = `
      ${r ? `<label part="label" for="threshold-input">${c(r)}</label>` : ""}
      <input
        part="input"
        id="threshold-input"
        type="${u}"
        inputmode="${c(b)}"
        name="threshold"
        placeholder="${c(this.getAttribute("placeholder") ?? "")}"
        ${r ? "" : 'aria-label="Enter a phrase to continue"'}
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
      />
      ${n ? `<button part="button" type="submit">${c(n)}</button>` : ""}
    `, f(this, i, t.querySelector("input"));
}, p = new WeakMap();
function c(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
customElements.get("web-threshold") || customElements.define("web-threshold", w);
export {
  w as WebThreshold
};
