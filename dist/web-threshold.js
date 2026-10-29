var y = (e) => {
  throw TypeError(e);
};
var b = (e, o, t) => o.has(e) || y("Cannot " + t);
var i = (e, o, t) => (b(e, o, "read from private field"), t ? t.call(e) : o.get(e)), h = (e, o, t) => o.has(e) ? y("Cannot add the same private member more than once") : o instanceof WeakSet ? o.add(e) : o.set(e, t), m = (e, o, t, r) => (b(e, o, "write to private field"), r ? r.call(e, t) : o.set(e, t), t), c = (e, o, t) => (b(e, o, "access private method"), t);
var u, n, l, v, f, p;
class w extends HTMLElement {
  constructor() {
    super(...arguments);
    h(this, l);
    h(this, u, {});
    h(this, n, null);
    h(this, p, (t) => {
      var a;
      t.preventDefault();
      const r = (((a = i(this, n)) == null ? void 0 : a.value) ?? "").trim(), s = i(this, u)[r];
      i(this, n) && (i(this, n).value = ""), s && this.dispatchEvent(
        new CustomEvent("tier-unlocked", {
          detail: { tier: s },
          bubbles: !0,
          composed: !0
        })
      );
    });
  }
  static get observedAttributes() {
    return ["placeholder", "label", "button"];
  }
  /** Consumer sets this — `el.secrets = { "phrase": "tier" }`. Never persisted. */
  set secrets(t) {
    m(this, u, t ?? {});
  }
  get secrets() {
    return i(this, u);
  }
  connectedCallback() {
    this.shadowRoot || c(this, l, v).call(this);
  }
  attributeChangedCallback(t, r, s) {
    var g;
    if (!this.shadowRoot || r === s) return;
    if (t === "placeholder" && i(this, n)) {
      i(this, n).placeholder = s ?? "";
      return;
    }
    const a = ((g = i(this, n)) == null ? void 0 : g.value) ?? "";
    c(this, l, f).call(this), i(this, n) && (i(this, n).value = a);
  }
  /**
   * Submit the current value, as pressing return would. The phone number pad
   * has no return key: set the `button` attribute, or wire your own button to this.
   */
  submit() {
    var t, r;
    (r = (t = this.shadowRoot) == null ? void 0 : t.querySelector("form")) == null || r.requestSubmit();
  }
}
u = new WeakMap(), n = new WeakMap(), l = new WeakSet(), v = function() {
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
    `, t.querySelector("form").addEventListener("submit", i(this, p)), c(this, l, f).call(this);
}, /** Build the form's contents from the current attributes. */
f = function() {
  const t = this.shadowRoot.querySelector("form"), r = this.getAttribute("label"), s = this.getAttribute("button"), a = this.getAttribute("inputmode") ?? "text";
  t.innerHTML = `
      ${r ? `<label part="label" for="threshold-input">${d(r)}</label>` : ""}
      <input
        part="input"
        id="threshold-input"
        type="text"
        inputmode="${d(a)}"
        name="threshold"
        placeholder="${d(this.getAttribute("placeholder") ?? "")}"
        ${r ? "" : 'aria-label="Enter a phrase to continue"'}
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
      />
      ${s ? `<button part="button" type="submit">${d(s)}</button>` : ""}
    `, m(this, n, t.querySelector("input"));
}, p = new WeakMap();
function d(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
customElements.get("web-threshold") || customElements.define("web-threshold", w);
export {
  w as WebThreshold
};
