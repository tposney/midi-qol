/**
 * Asked of the reveal policy (M19, services/revealPolicy), whose default provider is the rule below.
 * Who sees what of a save: one rule for midi's saves section, its damage lines, the save messages and dnd5e's
 * summaries of them, and the DC in save requests. A card's challenge (its DC, and its NPC targets' results) is the
 * caster's: dnd5e's challenge visibility "player" shows it to players when the caster has a player owner, whoever
 * clicked; the caster's owners always see it. A player character's (or player-owned NPC's) result is shown unless
 * "none". midi's save display then decides how much of a visible result is shown.
 */
/** How save results are shown (Auto Check Saves). */
export declare function saveDisplayMode(): string;
/** The actor whose challenge a card is: the one that used the activity. */
export declare function cardActor(card: ChatMessage.Implementation | null | undefined): Actor.Implementation | undefined;
/** Whether `user` sees the challenge of a card used by `caster`. */
export declare function challengeVisible(caster: Actor.Implementation | null | undefined, user?: User.Implementation | null | undefined): boolean;
/** Whether players who don't own `caster` see the challenge of a card it used. */
export declare function challengeVisibleToPlayers(caster: Actor.Implementation | null | undefined): boolean;
/** Whether `user` sees a target's save result on a card used by `caster`; `playerOwned`: the target has a player owner. */
export declare function canSeeSaveResult(caster: Actor.Implementation | null | undefined, playerOwned: boolean, user?: User.Implementation | null | undefined): boolean;
/** Whether `user` sees a player character's save outcome: as canSeeSaveResult, or its owner unless whisper/gmOnly (as dnd5e shows a roll's challenge to its roller). */
export declare function canSeePlayerOutcome(caster: Actor.Implementation | null | undefined, target: Actor.Implementation | null | undefined, user?: User.Implementation | null | undefined): boolean;
/** How much of a visible save a player sees: the dice for player characters and allShow, else the total or just the outcome. */
export declare function saveDetail(playerOwned: boolean): "outcome" | "total" | "dice";
