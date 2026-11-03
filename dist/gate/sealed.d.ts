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
/**
 * <web-threshold sealed="/s/site.json">: a phrase opens a record of keys plus site data.
 * Without `sealed`, this is the plain element.
 */
export declare class SealedThreshold extends WebThreshold {
    #private;
    /**
     * A listener can attach after a replay: on a sealed page the element upgrades as the page
     * is written, before the page's own module runs. It still hears what it missed. A listener
     * further up, on `document`, has to be there first.
     */
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    protected sealedAttached(): void;
    protected handlePhrase(value: string): void;
}
