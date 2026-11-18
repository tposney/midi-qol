import { DamageApplicationOptions } from "../../globals.js";
export declare class DamageApplicationElementMidi extends globalThis.dnd5e.applications.components.DamageApplicationElement {
    #private;
    chatMessage: any;
    damages: any[];
    damageType: string;
    /** dnd5e fills `damages` from every damage roll on the card; this tray applies only its own type's. */
    connectedCallback(): void;
    /**
     * dnd5e marks every multiplier in use on the tray's row but not who has which; when targets differ, each pill shows
     * its own.
     */
    refreshMultiplier(): void;
    /** A target's figures change with its multiplier, set from its pane; keep the markers in step. */
    refreshListEntry(entry: HTMLElement, damage: {
        temp: number;
        tempMax: number;
        total: number;
    }): void;
    /**
     * Apply as midi's workflow does: each target's damage, as this tray calculates it, goes through the workflow's
     * damage hooks (CAT/CPR edit the damage item there), then the GM applies it and records a linked undo card.
     * dnd5e's Apply calls `actor.applyDamage`, which skips the hooks and leaves no undo card.
     */
    _onApplyDamage(event: Event): Promise<void>;
    /**
     * Override to handle "all" type and midi custom change types for labels
     */
    getChangeSourceOptions(type: string, change: string, options: DamageApplicationOptions, isActive: boolean): {
        label: string;
        mode: string;
        pressed: string;
        title: string;
    };
    /**
     * Append midi's custom change-source buttons after the parent builds the entry.
     *
     * The signature is positional and dnd5e widened it: 6.0 calls
     * `buildTargetListEntry(targetList, { uuid, name })`, where the list is now the *first* argument
     * because entries are grouped into it. Taking the old single-argument form did not fail loudly —
     * it destructured `uuid` and `name` off the target list, got `undefined` for both, and passed one
     * argument where two were expected, so every target entry was built against a target that did not
     * exist.
     */
    buildTargetListEntry(targetList: HTMLElement, { uuid, name }: {
        uuid: string;
        name?: string;
    }): HTMLLIElement | void;
    /**
     * dnd5e's per-target options, decorated with midi's save/resistance detail.
     *
     * Built on `super` rather than in a private map of midi's own. The old version seeded
     * `{ multiplier: 1 }`, and `getMergedOptions` resolves `options.multiplier ?? fallback` — so the
     * multiplier was pinned to 1 and the ×½/×2 buttons had no effect. It also dropped the
     * `originatingMessage` dnd5e's default carries.
     */
    getTargetOptions(uuid: string): DamageApplicationOptions;
    static SET_FLAGS: string[];
    static SAVE_FLAGS: string[];
    static BOOL_FLAGS: string[];
    calculateDamage(actor: Actor.Implementation, options: DamageApplicationOptions): {
        temp: number;
        tempMax: any;
        total: any;
        active: Record<string, boolean | Set<string>>;
        potential: Record<string, boolean | Set<string>>;
    };
}
