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
export {registerHideSearchSettings} from './actions/hide.mjs';
// CAT macros of midi's sample action items, keyed by the identifier items reference in flags.cat.macros.
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
    'toggle-effect': toggleEffect
};
export function registerCATMacros(source) {
    const validKeys = [...cat.lib.constants.triggerTypes, 'rules', 'generic', 'genericConfig', 'documents'];
    for (const [identifier, value] of Object.entries(catMacros)) {
        const data = {source, identifier};
        for (const key of validKeys) if (value[key] !== undefined) data[key] = value[key];
        cat.api.registerFnMacro(data);
    }
    cat.api.registerSourceName(source, game.modules.get(source)?.title ?? source);
}
