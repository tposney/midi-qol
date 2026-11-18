/** handler({actor, token, parentCard}) runs when a creature dies. */
export function onCreatureDeath(handler: any): void;
/** Registered on catReady: without CAT the handlers' utilities don't exist. */
export function registerDeathHooks(): void;
