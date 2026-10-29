import {attack} from './actions/attack.mjs';
import {checkCover} from './actions/checkCover.mjs';
import {genericActions} from './actions/genericActions.mjs';
import {hideAction, searchAction} from './actions/hide.mjs';
import {influence} from './actions/influence.mjs';
import {knockOut} from './actions/knockOut.mjs';
import {magic} from './actions/magic.mjs';
import {stabilize} from './actions/stabilize.mjs';
import {suffocationHoldingBreath, suffocationOutOfAir} from './actions/suffocation.mjs';
import {toggleEffect} from './actions/toggleEffect.mjs';
import {automationNotes} from './automationNotes.mjs';
import {auraTurn} from './features/auraTurn.mjs';
import {registerDeathHooks} from './features/death.mjs';
import {fearAura} from './features/fearAura.mjs';
import {forcedMovement} from './features/forcedMovement.mjs';
import {grappleOnHit, targetGrappledMacro} from './features/grappleBite.mjs';
import {maxHpDrain} from './features/maxHpDrain.mjs';
import {carefulSpell, distantSpell, empoweredSpell, extendedSpell, heightenedSpell, metamagicCareful, metamagicHeightened, quickenedSpell, seekingSpell, subtleSpell, transmutedSpell, twinnedSpell} from './features/metamagic.mjs';
import {preserveLife} from './features/preserveLife.mjs';
import {regeneration} from './features/regeneration.mjs';
import {registerSwallowHooks, swallow} from './features/swallow.mjs';
import {targetRestriction} from './features/targetRestriction.mjs';
import {weaponMastery} from './features/weaponMastery.mjs';
import {lightSource} from './items/lightSource.mjs';
import {command} from './spells/command.mjs';
import {detectMagic} from './spells/detectMagic.mjs';
import {dragonsBreath} from './spells/dragonsBreath.mjs';
import {ensnaringStrike} from './spells/ensnaringStrike.mjs';
import {identify} from './spells/identify.mjs';
import {lesserRestoration} from './spells/lesserRestoration.mjs';
import {phantasmalForce} from './spells/phantasmalForce.mjs';
import {sanctuary} from './spells/sanctuary.mjs';
import {sleep} from './spells/sleep.mjs';
// CAT macros of midi's sample items, keyed by the identifier items reference in flags.cat.macros.
const catMacros = {
    'attack': attack,
    'check-cover': checkCover,
    'generic-actions': genericActions,
    'hide': hideAction,
    'influence': influence,
    'knock-out': knockOut,
    'magic': magic,
    'search': searchAction,
    'stabilize': stabilize,
    'suffocation-holding-breath': suffocationHoldingBreath,
    'suffocation-out-of-air': suffocationOutOfAir,
    'toggle-effect': toggleEffect,
    'automation-notes': automationNotes,
    'aura-turn': auraTurn,
    'fear-aura': fearAura,
    'forced-movement': forcedMovement,
    'grapple-on-hit': grappleOnHit,
    'target-grappled': targetGrappledMacro,
    'max-hp-drain': maxHpDrain,
    'regeneration': regeneration,
    'swallow': swallow,
    'target-restriction': targetRestriction,
    'careful-spell': carefulSpell,
    'distant-spell': distantSpell,
    'empowered-spell': empoweredSpell,
    'extended-spell': extendedSpell,
    'heightened-spell': heightenedSpell,
    'quickened-spell': quickenedSpell,
    'seeking-spell': seekingSpell,
    'subtle-spell': subtleSpell,
    'transmuted-spell': transmutedSpell,
    'twinned-spell': twinnedSpell,
    'metamagic-careful': metamagicCareful,
    'metamagic-heightened': metamagicHeightened,
    'preserve-life': preserveLife,
    'weapon-mastery': weaponMastery,
    'light-source': lightSource,
    'command': command,
    'detect-magic': detectMagic,
    'dragons-breath': dragonsBreath,
    'ensnaring-strike': ensnaringStrike,
    'identify': identify,
    'lesser-restoration': lesserRestoration,
    'phantasmal-force': phantasmalForce,
    'sanctuary': sanctuary,
    'sleep': sleep
};
export function registerCATMacros(source) {
    const validKeys = [...cat.lib.constants.triggerTypes, 'rules', 'generic', 'genericConfig', 'documents'];
    for (const [identifier, value] of Object.entries(catMacros)) {
        const data = {source, identifier};
        for (const key of validKeys) if (value[key] !== undefined) data[key] = value[key];
        cat.api.registerFnMacro(data);
    }
    cat.api.registerSourceName(source, game.modules.get(source)?.title ?? source);
    registerDeathHooks();
    registerSwallowHooks();
}
