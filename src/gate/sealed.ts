import {
  BundleError,
  deriveKek,
  fold1,
  fromB64,
  openEntry,
  openSlots,
  parseBundle,
  toB64,
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
  /** True when this came from session memory, not typing. A route handler skips these, or a reload loops. */
  replayed?: boolean;
}

const MEMORY_KEY = "web-threshold:keys";

/**
 * <web-threshold sealed="/s/site.json">: a phrase opens a record of keys plus site data.
 * Without `sealed`, this is the plain element.
 */
export class SealedThreshold extends WebThreshold {
  #load: Promise<Bundle | null> | null = null;
  #replays: SealedUnlockedDetail[] = [];
  #busy = false;

  /**
   * A listener can attach after a replay: on a sealed page the element upgrades as the page
   * is written, before the page's own module runs. It still hears what it missed. A listener
   * further up, on `document`, has to be there first.
   */
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
    super.addEventListener(type, listener, options);
    if (type !== "tier-unlocked") return;
    for (const detail of this.#replays) {
      queueMicrotask(() => {
        const event = new CustomEvent("tier-unlocked", { detail, bubbles: true, composed: true });
        // As if dispatched here, so a handler reading the target works the same either way (j-11).
        for (const key of ["target", "currentTarget"]) Object.defineProperty(event, key, { value: this });
        if (typeof listener === "function") listener.call(this, event);
        else listener.handleEvent(event);
      });
    }
  }

  protected override sealedAttached(): void {
    this.#load = this.#loadBundle();
  }

  async #loadBundle(): Promise<Bundle | null> {
    await Promise.resolve();
    try {
      if (!globalThis.crypto?.subtle) throw new BundleError("no-webcrypto");
      const bundle = parseBundle(await this.#readSource(this.getAttribute("sealed") ?? ""));
      if (Object.keys(this.secrets).length > 0) this.emitFault("both-modes");
      else if (this.#remembers()) await this.#replay(bundle);
      return bundle;
    } catch (err) {
      this.emitFault(err instanceof BundleError ? err.code : "malformed-bundle");
      return null;
    }
  }

  #remembers(): boolean {
    const value = this.getAttribute("remember");
    if (value === "session") return true;
    if (value !== null) this.emitFault("unsupported-remember");
    return false;
  }

  /** Keys that opened a slot, per tab. Never a phrase. Storage failing only means retyping. */
  #storedKeys(): string[] {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(MEMORY_KEY) ?? "[]");
      return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  #keep(kek: Uint8Array): void {
    if (this.getAttribute("remember") !== "session") return;
    try {
      const keys = new Set(this.#storedKeys()).add(toB64(kek));
      sessionStorage.setItem(MEMORY_KEY, JSON.stringify([...keys]));
    } catch {
      // Retyping is the fallback.
    }
  }

  /** Stale keys from an earlier build simply open nothing. */
  async #replay(bundle: Bundle): Promise<void> {
    for (const stored of this.#storedKeys()) {
      try {
        for (const record of await openSlots(bundle, fromB64(stored))) this.#unlock(record, true);
      } catch {
        // A damaged entry opens nothing.
      }
    }
  }

  async #readSource(source: string): Promise<unknown> {
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
      if (record) {
        this.#keep(kek);
        this.#unlock(record);
      } else if (this.hasAttribute("report-wrong")) {
        this.dispatchEvent(new CustomEvent("tier-rejected", { bubbles: true, composed: true }));
      }
    } catch {
      this.emitFault("malformed-bundle");
    } finally {
      this.#setBusy(false);
    }
  }

  #unlock(record: SealedRecord, replayed = false): void {
    const detail: SealedUnlockedDetail = {
      tier: record.tier,
      data: record.data,
      names: Object.keys(record.open),
      ...(replayed ? { replayed } : {}),
      open: async (name) => {
        if (!Object.hasOwn(record.open, name)) throw new Error(`this door doesn't open "${name}"`);
        const entry = record.open[name]!;
        try {
          return new Blob([(await openEntry(entry, (src) => this.#fetchFile(src))) as BlobPart], { type: entry.type });
        } catch (err) {
          // Such as a host answering a .sealed file with its HTML fallback: it fails the tag.
          this.emitFault(err instanceof BundleError ? err.code : "payload-unreadable");
          throw err;
        }
      },
    };
    if (replayed) this.#replays.push(detail);
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
