import {
  BundleError,
  deriveKek,
  fold1,
  fromB64,
  openEntry,
  openSlots,
  parseBundle,
  type Bundle,
  type SealedRecord,
} from "./sealed-format.js";
import { WebThreshold, type TierUnlockedDetail } from "./web-threshold.js";

/** Payload of `tier-unlocked` in sealed mode. */
export interface SealedUnlockedDetail extends TierUnlockedDetail {
  /** The door's free-form site data, untouched. */
  data?: unknown;
  /** The payload names this door opens. */
  names: string[];
  open(name: string): Promise<Blob>;
}

/**
 * <web-threshold sealed="#bundle"> or sealed="/s/site.json": a phrase opens a record
 * of keys plus site data. Without `sealed`, this is the plain element.
 */
export class SealedThreshold extends WebThreshold {
  #load: Promise<Bundle | null> | null = null;
  #busy = false;

  protected override sealedAttached(): void {
    this.#load = this.#loadBundle();
  }

  async #loadBundle(): Promise<Bundle | null> {
    await Promise.resolve();
    try {
      if (!globalThis.crypto?.subtle) throw new BundleError("no-webcrypto");
      const bundle = parseBundle(await this.#readSource(this.getAttribute("sealed") ?? ""));
      if (Object.keys(this.secrets).length > 0) this.emitFault("both-modes");
      return bundle;
    } catch (err) {
      this.emitFault(err instanceof BundleError ? err.code : "malformed-bundle");
      return null;
    }
  }

  async #readSource(source: string): Promise<unknown> {
    if (source.startsWith("#")) {
      const script = document.getElementById(source.slice(1));
      if (!script) throw new BundleError("bundle-not-found");
      return JSON.parse(script.textContent ?? "");
    }
    const url = new URL(source, location.href);
    if (url.origin !== location.origin) throw new BundleError("cross-origin");
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new BundleError("fetch-failed");
    }
    if (!response.ok) throw new BundleError("fetch-failed");
    return response.json();
  }

  protected override handlePhrase(value: string): void {
    if (!this.hasAttribute("sealed")) {
      super.handlePhrase(value);
      return;
    }
    void this.#attempt(value);
  }

  async #attempt(value: string): Promise<void> {
    if (this.#busy) return;
    if (!this.#load) {
      this.emitFault("sealed-set-after-connect");
      return;
    }
    if (Object.keys(this.secrets).length > 0) {
      this.emitFault("both-modes");
      return;
    }
    if (!fold1(value)) return;

    this.#setBusy(true);
    try {
      const bundle = await this.#load;
      // A failed load already said so, and it must never read as a wrong phrase.
      if (!bundle) return;
      const kek = await deriveKek(value, fromB64(bundle.kdf.salt), bundle.kdf.iter);
      const [record] = await openSlots(bundle, kek);
      if (record) this.#unlock(bundle, record);
      else if (this.hasAttribute("report-wrong")) {
        this.dispatchEvent(new CustomEvent("tier-rejected", { bubbles: true, composed: true }));
      }
    } catch {
      this.emitFault("malformed-bundle");
    } finally {
      this.#setBusy(false);
    }
  }

  #unlock(bundle: Bundle, record: SealedRecord): void {
    const detail: SealedUnlockedDetail = {
      tier: record.tier,
      data: record.data,
      names: Object.keys(record.open),
      open: async (name) => {
        if (!Object.hasOwn(record.open, name)) throw new Error(`this door doesn't open "${name}"`);
        const entry = record.open[name]!;
        try {
          return new Blob([(await openEntry(bundle, entry, (src) => this.#fetchFile(src))) as BlobPart], { type: entry.type });
        } catch (err) {
          // Such as a host answering a .sealed file with its HTML fallback: it fails the tag.
          this.emitFault(err instanceof BundleError ? err.code : "payload-unreadable");
          throw err;
        }
      },
    };
    this.dispatchEvent(new CustomEvent("tier-unlocked", { detail, bubbles: true, composed: true }));
  }

  async #fetchFile(src: string): Promise<Uint8Array> {
    const url = new URL(src, location.href);
    if (url.origin !== location.origin) throw new BundleError("cross-origin");
    let response: Response | null = null;
    try {
      response = await fetch(url);
    } catch {
      // Reported below.
    }
    if (!response?.ok) throw new BundleError("fetch-failed");
    return new Uint8Array(await response.arrayBuffer());
  }

  #setBusy(busy: boolean): void {
    this.#busy = busy;
    this.toggleAttribute("busy", busy);
    if (busy) this.setAttribute("aria-busy", "true");
    else this.removeAttribute("aria-busy");
  }
}
