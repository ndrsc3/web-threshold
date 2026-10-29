var m = (t) => {
  throw TypeError(t);
};
var d = (t, o, e) => o.has(t) || m("Cannot " + e);
var i = (t, o, e) => (d(t, o, "read from private field"), e ? e.call(t) : o.get(t)), u = (t, o, e) => o.has(t) ? m("Cannot add the same private member more than once") : o instanceof WeakSet ? o.add(t) : o.set(t, e), p = (t, o, e, r) => (d(t, o, "write to private field"), r ? r.call(t, e) : o.set(t, e), e), b = (t, o, e) => (d(t, o, "access private method"), e);
var l, s, c, f, h;
class g extends HTMLElement {
  constructor() {
    super(...arguments);
    u(this, c);
    u(this, l, {});
    u(this, s, null);
    u(this, h, (e) => {
      var a;
      e.preventDefault();
      const r = (((a = i(this, s)) == null ? void 0 : a.value) ?? "").trim(), n = i(this, l)[r];
      i(this, s) && (i(this, s).value = ""), n && this.dispatchEvent(
        new CustomEvent("tier-unlocked", {
          detail: { tier: n },
          bubbles: !0,
          composed: !0
        })
      );
    });
  }
  static get observedAttributes() {
    return ["placeholder"];
  }
  /** Consumer sets this — `el.secrets = { "phrase": "tier" }`. Never persisted. */
  set secrets(e) {
    p(this, l, e ?? {});
  }
  get secrets() {
    return i(this, l);
  }
  connectedCallback() {
    this.shadowRoot || b(this, c, f).call(this);
  }
  attributeChangedCallback(e, r, n) {
    e === "placeholder" && i(this, s) && (i(this, s).placeholder = n ?? "");
  }
  /**
   * Submit the current value, as pressing return would. The phone number pad
   * has no return key, so a consumer using inputmode="numeric" wires its own
   * button to this.
   */
  submit() {
    var e, r;
    (r = (e = this.shadowRoot) == null ? void 0 : e.querySelector("form")) == null || r.requestSubmit();
  }
}
l = new WeakMap(), s = new WeakMap(), c = new WeakSet(), f = function() {
  var a;
  const e = this.attachShadow({ mode: "open" }), r = this.getAttribute("placeholder") ?? "", n = this.getAttribute("inputmode") ?? "text";
  e.innerHTML = `
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
          inputmode="${n.replace(/"/g, "&quot;")}"
          name="threshold"
          placeholder="${r.replace(/"/g, "&quot;")}"
          aria-label="Enter a phrase to continue"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
        />
      </form>
    `, p(this, s, e.querySelector("input")), (a = e.querySelector("form")) == null || a.addEventListener("submit", i(this, h));
}, h = new WeakMap();
customElements.get("web-threshold") || customElements.define("web-threshold", g);
export {
  g as WebThreshold
};
