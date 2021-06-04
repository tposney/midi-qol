import { debug, i18n, error, warn, noDamageSaves, cleanSpellName, MQdefaultDamageType, allAttackTypes, gameStats, debugEnabled } from "../midi-qol.js";
import { configSettings, autoRemoveTargets, checkRule } from "./settings.js";
import { log } from "../midi-qol.js";
import { Workflow, WORKFLOWSTATES } from "./workflow.js";
// import { broadcastData } from "./GMAction";
import { socketlibSocket } from "./GMAction.js";
import { installedModules } from "./setupModules.js";
import { concentrationCheckItemName } from "./Hooks.js";
/**
 *  return a list of {damage: number, type: string} for the roll and the item
 */
export let createDamageList = (roll, item, defaultType = MQdefaultDamageType) => {
    let damageParts = {};
    const rollTerms = roll.terms;
    let evalString = "";
    let damageSpec = item ? item.data.data.damage : { parts: [] };
    // create data for a synthetic roll
    let rollData = item ? item.getRollData() : {};
    rollData.mod = 0;
    debug("CreateDamageList: Passed roll is ", roll);
    debug("CreateDamageList: Damage spec is ", damageSpec);
    let partPos = 0;
    // If we have an item we can use it to work out each of the damage lines that are being rolled
    for (let [spec, type] of damageSpec.parts) { // each spec,type is one of the damage lines
        // TODO look at replacing this with a map/reduce
        debug("CreateDamageList: single Spec is ", spec, type, item);
        //@ts-ignore replaceFromulaData - blank out @field - do this to avoid @XXXX not found
        let formula = Roll.replaceFormulaData(spec, rollData || {}, { missing: "0", warn: false });
        //@ts-ignore evaluate
        const dmgSpec = new Roll(formula, rollData || {}); //.evaluate({async: false});
        // dmgSpec is now a roll with the right terms (but nonsense value) to pick off the right terms from the passed roll
        //@ts-ignore length
        for (let i = 0; i < dmgSpec.terms.length; i++) { // grab all the terms for the current damage line
            evalString += rollTerms[partPos].total;
            partPos += 1;
        }
        // Each damage line is added together and we can skip the operator term
        partPos += 1;
        if (evalString) {
            //@ts-ignore sfeEval
            let result = Roll.safeEval(evalString);
            damageParts[type || defaultType] = (damageParts[type || defaultType] || 0) + result;
            evalString = "";
        }
    }
    // We now have all of the item's damage lines (or none if no item)
    // Now just add up the other terms - using any flavor types for the rolls we get
    // we stepped one term too far so step back one
    partPos -= 1;
    // process the rest of the roll as a sequence of terms.
    // Each might have a damage flavour so we do them expression by expression
    const validTypes = Object.entries(CONFIG.DND5E.damageTypes).deepFlatten().concat(Object.entries(CONFIG.DND5E.healingTypes).deepFlatten());
    evalString = "";
    let damageType = "";
    let numberTermFound = false; // We won't evaluate until at least 1 numeric term is found
    while (partPos < rollTerms.length) {
        // Accumulate the text for each of the terms until we have enough to eval
        const evalTerm = rollTerms[partPos];
        partPos += 1;
        if (evalTerm instanceof CONFIG.Dice.termTypes.DiceTerm) {
            // this is a dice roll
            evalString += evalTerm.total;
            damageType = evalTerm.options.flavor;
            numberTermFound = true;
        }
        else if (evalTerm instanceof CONFIG.Dice.termTypes.NumericTerm) {
            evalString += evalTerm.total;
            damageType = evalTerm.options.flavor || damageType; // record this if we get it
            numberTermFound = true;
        }
        if (evalTerm instanceof CONFIG.Dice.termTypes.OperatorTerm) {
            if (["*", "/"].includes(evalTerm.operator)) {
                // multiply or divide keep going keep going
                evalString += evalTerm.total;
            }
            else if (["-", "+"].includes(evalTerm.operator)) {
                if (numberTermFound) { // we have a number and a +/- so we can eval the term (do it greedily so we get the right damage type)
                    //@ts-ignore safeEval
                    let result = Roll.safeEval(evalString);
                    damageParts[damageType || defaultType] = (damageParts[damageType || defaultType] || 0) + result;
                    // reset for the next term - we don't know how many there will be
                    evalString = "";
                    damageType = "";
                    numberTermFound = false;
                    evalString = evalTerm.total;
                }
                else { // what to do with parenthetical term or others?
                    evalString += evalTerm.total;
                }
            }
        }
    }
    // evalString contains the terms we have not yet evaluated so do them now
    if (evalString) {
        //@ts-ignore
        const damage = Roll.safeEval(evalString);
        // we can always add since the +/- will be recorded in the evalString
        damageParts[damageType || defaultType] = (damageParts[damageType || defaultType] || 0) + damage;
    }
    const damageList = Object.entries(damageParts).map(([type, damage]) => { return { damage, type }; });
    debug("CreateDamageList: Final damage list is ", damageList);
    return damageList;
};
export async function getSelfTarget(actor) {
    if (actor.token)
        return actor.token;
    const speaker = ChatMessage.getSpeaker({ actor });
    if (speaker.token)
        return canvas.tokens.get(speaker.token);
    //@ts-ignore
    return await Token.fromActor(actor);
}
export async function getSelfTargetSet(actor) {
    return new Set([await getSelfTarget(actor)]);
}
// Calculate the hp/tempHP lost for an amount of damage of type
export function calculateDamage(a, appliedDamage, t, totalDamage, dmgType, existingDamage = []) {
    debug("calculate damage ", a, appliedDamage, t, totalDamage, dmgType);
    let prevDamage = existingDamage.find(ed => ed.tokenId === t.id);
    var hp = a.data.data.attributes.hp;
    var oldHP, tmp;
    if (prevDamage) {
        oldHP = prevDamage.newHP;
        tmp = prevDamage.newTempHP;
    }
    else {
        oldHP = hp.value;
        tmp = parseInt(hp.temp) || 0;
    }
    let value = Math.floor(appliedDamage);
    if (dmgType.includes("temphp")) { // only relavent for healing of tmp HP
        var newTemp = Math.max(tmp, -value, 0);
        var newHP = oldHP;
    }
    else {
        var dt = value > 0 ? Math.min(tmp, value) : 0;
        var newTemp = tmp - dt;
        var newHP = Math.clamped(oldHP - (value - dt), 0, hp.max + (parseInt(hp.tempmax) || 0));
    }
    const altSceneId = getProperty(t.data.flags, "multilevel-tokens.sscene");
    let sceneId = altSceneId ?? t.scene.id;
    const altTokenId = getProperty(t.data.flags, "multilevel-tokens.stoken");
    let tokenId = altTokenId ?? t.id;
    const altTokenUuid = (altTokenId && altSceneId) ? `Scene.${altSceneId}.Token.${altTokenId}` : undefined;
    const tokenUuid = altTokenUuid ?? t.document.uuid;
    debug("calculateDamage: results are ", newTemp, newHP, appliedDamage, totalDamage);
    if (game.user.isGM)
        log(`${a.name} ${oldHP} takes ${value} reduced from ${totalDamage} Temp HP ${newTemp} HP ${newHP} `);
    // TODO change tokenId, actorId to tokenUuid and actor.uuid
    return { tokenId, tokenUuid, actorID: a.id, tempDamage: tmp - newTemp, hpDamage: oldHP - newHP, oldTempHP: tmp, newTempHP: newTemp,
        oldHP: oldHP, newHP: newHP, totalDamage: totalDamage, appliedDamage: value, sceneId };
}
/**
 * Work out the appropriate multiplier for DamageTypeString on actor
 * If configSettings.damageImmunities are not being checked always return 1
 *
 */
export let getTraitMult = (actor, dmgTypeString, item) => {
    dmgTypeString = dmgTypeString.toLowerCase();
    if (dmgTypeString.includes("healing") || dmgTypeString.includes("temphp"))
        return -1;
    if (dmgTypeString.includes("midi-none"))
        return 0;
    let totalMult = 1;
    if (configSettings.damageImmunities !== "none" && dmgTypeString !== "") {
        // if not checking all damage counts as magical
        const magicalDamage = (item?.type !== "weapon"
            || (item?.data.data.attackBonus > 0 && !configSettings.requireMagical)
            || item.data.data.properties["mgc"]);
        for (let { type, mult } of [{ type: "di", mult: 0 }, { type: "dr", mult: 0.5 }, { type: "dv", mult: 2 }]) {
            let trait = actor.data.data.traits[type].value;
            if (!magicalDamage && trait.includes("physical"))
                trait = trait.concat("bludgeoning", "slashing", "piercing");
            if (item?.type === "spell" && trait.includes("spell"))
                totalMult = totalMult * mult;
            else if (item?.type === "power" && trait.includes("power"))
                totalMult = totalMult * mult;
            else if (trait.includes(dmgTypeString))
                totalMult = totalMult * mult;
        }
    }
    return totalMult;
    // Check the custom immunities
    return 1;
};
export let applyTokenDamage = (damageDetail, totalDamage, theTargets, item, saves, options = { existingDamage: [], superSavers: new Set() }) => {
    return applyTokenDamageMany([damageDetail], [totalDamage], theTargets, item, [saves], { existingDamage: options.existingDamage ?? [], superSavers: [options.superSavers ?? new Set()] });
};
export let applyTokenDamageMany = (damageDetailArr, totalDamageArr, theTargets, item, savesArr, options = { existingDamage: [], superSavers: [] }) => {
    let damageList = [];
    let targetNames = [];
    let appliedDamage;
    let workflow = (Workflow.workflows && Workflow._workflows[item?.uuid]) || {};
    warn("Apply token damage ", damageDetailArr, totalDamageArr, theTargets, item, savesArr, workflow);
    if (!theTargets || theTargets.size === 0) {
        workflow.currentState = WORKFLOWSTATES.ROLLFINISHED;
        // probably called from refresh - don't do anything
        return [];
    }
    const highestOnlyDR = false;
    let totalDamage = totalDamageArr.reduce((a, b) => (a ?? 0) + b);
    let totalAppliedDamage = 0;
    let appliedTempHP = 0;
    for (let t of theTargets) {
        let a = t?.actor;
        if (!a)
            continue;
        appliedDamage = 0;
        appliedTempHP = 0;
        const magicalDamage = (item?.type !== "weapon" || item?.data.data.attackBonus > 0 || item.data.data.properties["mgc"]);
        let DRTotal = 0;
        for (let i = 0; i < totalDamageArr.length; i++) {
            let damageDetail = damageDetailArr[i];
            let saves = savesArr[i] ?? new Set();
            let superSavers = options.superSavers[i] ?? new Set();
            var dmgType;
            for (let { damage, type } of damageDetail) {
                //let mult = 1;
                let mult = saves.has(t) ? getSaveMultiplierForItem(item) : 1;
                if (superSavers.has(t) && getSaveMultiplierForItem(item) === 0.5) {
                    mult = saves.has(t) ? 0 : 0.5;
                }
                if (!type)
                    type = MQdefaultDamageType;
                mult = mult * getTraitMult(a, type, item);
                let typeDamage = Math.floor(damage * Math.abs(mult)) * Math.sign(mult);
                if (type.toLowerCase() !== "temphp")
                    dmgType = type.toLowerCase();
                //         let DRType = parseInt(getProperty(t.actor.data, `flags.midi-qol.DR.${type}`)) || 0;
                //@ts-ignore evaluate
                let DRType = (new Roll((getProperty(t.actor.data, `flags.midi-qol.DR.${type}`) || "0"))).evaluate({ async: false }).total;
                if (DRType === 0 && ["bludgeoning", "slashing", "piercing"].includes(type) && !magicalDamage) {
                    //@ts-ignore evaluate
                    DRType = Math.max(DRType, (new Roll((getProperty(t.actor.data, `flags.midi-qol.DR.non-magical`) || "0"), t.actor.getRollData())).evaluate({ async: false }).total);
                    //         DRType = parseInt(getProperty(t.actor.data, `flags.midi-qol.DR.non-magical`)) || 0;
                }
                else if (DRType === 0 && ["bludgeoning", "slashing", "piercing"].includes(type) && getProperty(t.actor.data, `flags.midi-qol.DR.physical`)) {
                    //@ts-ignore evaluate
                    DRType = Math.max(DRType, (new Roll((getProperty(t.actor.data, `flags.midi-qol.DR.physical`) || "0"), t.actor.getRollData())).evaluate({ async: false }).total);
                    //         DRType = parseInt(getProperty(t.actor.data, `flags.midi-qol.DR.non-magical`)) || 0;
                }
                else if (DRType === 0 && !["bludgeoning", "slashing", "piercing"].includes(type) && getProperty(t.actor.data, `flags.midi-qol.DR.non-physical`), t.actor.getRollData()) {
                    //@ts-ignore evaluate
                    DRType = Math.max(DRType, (new Roll((getProperty(t.actor.data, `flags.midi-qol.DR.non-physical`) || "0"), t.actor.getRollData())).evaluate({ async: false }).total);
                }
                if (type.includes("temphp")) {
                    appliedTempHP += typeDamage;
                }
                else {
                    appliedDamage += typeDamage;
                    DRType = Math.clamped(0, typeDamage, DRType);
                    if (checkRule("maxDRValue"))
                        DRTotal = Math.max(DRTotal, DRType);
                    else
                        DRTotal += DRType;
                }
                // TODO: consider mwak damage reduCtion
            }
        }
        //@ts-ignore evaluate
        const DR = Math.clamped(0, appliedDamage, (new Roll((getProperty(t.actor.data, "flags.midi-qol.DR.all") || "0"), a.getRollData())).evaluate({ async: false }).total);
        //      const DR = parseInt(getProperty(t.actor.data, "flags.midi-qol.DR.all")) || 0;
        if (checkRule("maxDRValue"))
            DRTotal = Math.max(DRTotal, DR);
        else
            DRTotal = Math.clamped(0, appliedDamage, DR + DRTotal);
        appliedDamage -= DRTotal;
        if (!Object.keys(CONFIG.DND5E.healingTypes).includes(dmgType)) {
            totalDamage = Math.max(totalDamage, 0);
            appliedDamage = Math.max(appliedDamage, 0);
        }
        totalAppliedDamage += appliedDamage;
        if (!dmgType)
            dmgType = "temphp";
        let ditem = calculateDamage(a, appliedDamage, t, totalDamage, dmgType, options.existingDamage);
        ditem.tempDamage = ditem.tempDamage + appliedTempHP;
        if (appliedTempHP <= 0) { // tmphealing applied to actor does not add only gets the max
            ditem.newTempHP = Math.max(ditem.newTempHP, -appliedTempHP);
        }
        else {
            ditem.newTempHP = Math.max(0, ditem.newTempHP - appliedTempHP);
        }
        damageList.push(ditem);
        targetNames.push(t.name);
    }
    if (theTargets.size > 0) {
        socketlibSocket.executeAsGM("createReverseDamageCard", {
            autoApplyDamage: configSettings.autoApplyDamage,
            sender: game.user.name,
            damageList: damageList,
            targetNames,
            chatCardId: workflow.itemCardId,
        });
    }
    if (configSettings.keepRollStats) {
        gameStats.addDamage(totalAppliedDamage, totalDamage, theTargets.size, item);
    }
    return damageList;
};
export async function processDamageRoll(workflow, defaultDamageType) {
    warn("Process Damage Roll ", workflow);
    // proceed if adding chat damage buttons or applying damage for our selves
    let appliedDamage = [];
    const actor = workflow.actor;
    let item = workflow.item;
    // const re = /.*\((.*)\)/;
    // const defaultDamageType = message.data.flavor && message.data.flavor.match(re);
    // Show damage buttons if enabled, but only for the applicable user and the GM
    let theTargets = workflow.hitTargets;
    if (item?.data.data.target?.type === "self")
        theTargets = await getSelfTargetSet(actor) || theTargets;
    let effectsToExpire = [];
    if (theTargets.size > 0 && item?.hasAttack)
        effectsToExpire.push("1Hit");
    if (theTargets.size > 0 && item?.hasDamage)
        effectsToExpire.push("DamageDealt");
    if (effectsToExpire.length > 0) {
        expireMyEffects.bind(workflow)(effectsToExpire);
    }
    // Don't check for critical - RAW say these don't get critical damage
    if (["rwak", "mwak"].includes(item?.data.data.actionType) && configSettings.rollOtherDamage) {
        if (workflow.otherDamageRoll && configSettings.singleConcentrationRoll) {
            appliedDamage = applyTokenDamageMany([workflow.damageDetail, workflow.otherDamageDetail, workflow.bonusDamageDetail ?? []], [workflow.damageTotal, workflow.otherDamageTotal, workflow.bonusDamageTotal ?? 0], theTargets, item, [new Set(), workflow.saves, new Set()], { existingDamage: [],
                superSavers: [new Set(), workflow.superSavers, new Set()]
            });
        }
        else {
            let savesToUse = workflow.otherDamageRoll ? new Set() : workflow.saves;
            appliedDamage = applyTokenDamageMany([workflow.damageDetail, workflow.bonusDamageDetail ?? []], [workflow.damageTotal, workflow.bonusDamageTotal ?? 0], theTargets, item, [savesToUse, savesToUse], { existingDamage: [],
                superSavers: [workflow.superSavers, workflow.superSavers]
            });
            //      appliedDamage = await applyTokenDamage(workflow.damageDetail, workflow.damageTotal, theTargets, item, new Set(), {existingDamage: [], superSavers: new Set()});
            if (workflow.otherDamageRoll) {
                // assume pervious damage applied and then calc extra damage
                appliedDamage = await applyTokenDamage(workflow.otherDamageDetail, workflow.otherDamageTotal, theTargets, item, workflow.saves, { existingDamage: appliedDamage, superSavers: workflow.superSavers });
            }
        }
    }
    else {
        appliedDamage = applyTokenDamageMany([workflow.damageDetail, workflow.bonusDamageDetail ?? []], [workflow.damageTotal, workflow.bonusDamageTotal ?? 0], theTargets, item, [workflow.saves, workflow.saves], { existingDamage: [],
            superSavers: [workflow.superSavers, workflow.superSavers]
        });
    }
    workflow.damageList = appliedDamage;
    debug("process damage roll: ", configSettings.autoApplyDamage, workflow.damageDetail, workflow.damageTotal, theTargets, item, workflow.saves);
}
export let getSaveMultiplierForItem = item => {
    // find a better way for this ? perhaps item property
    if (!item)
        return 1;
    if (item.data.data.properties?.nodam)
        return 0;
    if (item.data.data.properties?.fulldam)
        return 1;
    if (item.data.data.properties?.halfdam)
        return 0.5;
    if (noDamageSaves?.includes(cleanSpellName(item.name)))
        return 0;
    //@ts-ignore decodeHTML
    let description = TextEditor.decodeHTML((item.data.data.description?.value || "")).toLocaleLowerCase();
    if (description?.includes(i18n("midi-qol.noDamageText").toLocaleLowerCase())) {
        return 0.0;
    }
    if (!configSettings.checkSaveText)
        return configSettings.defaultSaveMult;
    if (description?.includes(i18n("midi-qol.halfDamage").toLocaleLowerCase()) || description?.includes(i18n("midi-qol.halfDamageAlt").toLocaleLowerCase())) {
        return 0.5;
    }
    //  Think about this. if (checkSavesText true && item.hasSave) return 0; // A save is specified but the half-damage is not specified.
    return configSettings.defaultSaveMult;
};
export function requestPCSave(ability, rollType, player, actorId, advantage, flavor, dc, requestId) {
    const playerLetme = !player?.isGM && ["letme", "letmeQuery"].includes(configSettings.playerRollSaves);
    const gmLetme = player.isGM && ["letme", "letmeQuery"].includes(configSettings.rollNPCSaves);
    if (player && installedModules.get("lmrtfy") && (playerLetme || gmLetme)) {
        if ((configSettings.playerRollSaves === "letmeQuery")) {
            // TODO - reinstated the LMRTFY patch so that the event is properly passed to the roll
            advantage = 2;
        }
        else {
            advantage = (advantage ? 1 : 0);
        }
        let mode = "roll";
        if (player.isGM && configSettings.autoCheckSaves !== "allShow") {
            mode = "blindroll";
        }
        let message = `${configSettings.displaySaveDC ? "DC " + dc : ""} ${i18n("midi-qol.saving-throw")} ${flavor}`;
        if (rollType === "abil")
            message = `${configSettings.displaySaveDC ? "DC " + dc : ""} ${i18n("midi-qol.ability-check")} ${flavor}`;
        const socketData = {
            user: player.id,
            actors: [actorId],
            abilities: rollType === "abil" ? [ability] : [],
            saves: rollType !== "abil" ? [ability] : [],
            skills: [],
            advantage: player.isGM ? 2 : advantage,
            mode,
            title: i18n("midi-qol.saving-throw"),
            message: `${configSettings.displaySaveDC ? "DC " + dc : ""} ${i18n("midi-qol.saving-throw")} ${flavor}`,
            formula: "",
            attach: requestId,
            deathsave: false,
            initiative: false
        };
        debug("process player save ", socketData);
        //@ts-ignore - emit not in types
        game.socket.emit('module.lmrtfy', socketData);
        //@ts-ignore - global variable
        LMRTFY.onMessage(socketData);
    }
    else {
        let actorName = game.actors.get(actorId).name;
        let content = ` ${actorName} ${configSettings.displaySaveDC ? "DC " + dc : ""} ${CONFIG.DND5E.abilities[ability]} ${i18n("midi-qol.saving-throw")}`;
        content = content + (advantage ? `(${i18n("DND5E.Advantage")}` : "") + ` - ${flavor}`;
        ChatMessage.create({
            content,
            whisper: [player]
        });
    }
}
export function midiCustomEffect(actor, change) {
    if (!change.key.startsWith("flags.midi-qol"))
        return;
    //@ts-ignore
    const val = Number.isNumeric(change.value) ? parseInt(change.value) : 1;
    setProperty(actor.data, change.key, change.value);
}
export function untargetDeadTokens() {
    if (autoRemoveTargets !== "none") {
        game.user.targets.forEach(t => {
            if (t.actor?.data.data.attributes.hp.value <= 0) {
                //@ts-ignore
                t.setTarget(false, { releaseOthers: false });
            }
        });
    }
}
export function untargetAllTokens(...args) {
    let combat = args[0];
    //@ts-ignore current
    let prevTurn = combat.current.turn - 1;
    if (prevTurn === -1)
        prevTurn = combat.turns.length - 1;
    const previous = combat.turns[prevTurn];
    //@ts-ignore
    if ((game.user.isGM && ["allGM", "all"].includes(autoRemoveTargets)) || (autoRemoveTargets === "all" && canvas.tokens.controlled.find(t => t.id === previous.tokenId))) {
        // release current targets
        game.user.targets.forEach(t => {
            //@ts-ignore
            t.setTarget(false, { releaseOthers: false });
        });
    }
}
export function checkIncapcitated(actor, item, event) {
    if (actor.data.data.attributes?.hp?.value <= 0) {
        console.log(`minor-qol | ${actor.name} is incapacitated`);
        ui.notifications.warn(`${actor.name} is incapacitated`);
        return true;
    }
    return false;
}
/** takes two tokens of any size and calculates the distance between them
*** gets the shortest distance betwen two tokens taking into account both tokens size
*** if wallblocking is set then wall are checked
**/
//TODO change this to TokenData
export function getDistance(t1, t2, wallblocking = false) {
    if (!t1 || !t2)
        return 0;
    //Log("get distance callsed");
    var x, x1, y, y1, d, r, segments = [], rdistance, distance;
    for (x = 0; x < t1.data.width; x++) {
        for (y = 0; y < t1.data.height; y++) {
            const origin = new PIXI.Point(...canvas.grid.getCenter(Math.round(t1.data.x + (canvas.dimensions.size * x)), Math.round(t1.data.y + (canvas.dimensions.size * y))));
            for (x1 = 0; x1 < t2.data.width; x1++) {
                for (y1 = 0; y1 < t2.data.height; y1++) {
                    const dest = new PIXI.Point(...canvas.grid.getCenter(Math.round(t2.data.x + (canvas.dimensions.size * x1)), Math.round(t2.data.y + (canvas.dimensions.size * y1))));
                    const r = new Ray(origin, dest);
                    if (wallblocking && canvas.walls.checkCollision(r)) {
                        //Log(`ray ${r} blocked due to walls`);
                        continue;
                    }
                    segments.push({ ray: r });
                }
            }
        }
    }
    // console.log(segments);
    if (segments.length === 0) {
        //Log(`${t2.data.name} full blocked by walls`);
        return -1;
    }
    rdistance = canvas.grid.measureDistances(segments, { gridSpaces: true });
    distance = rdistance[0];
    rdistance.forEach(d => { if (d < distance)
        distance = d; });
    if (configSettings.optionalRules.distanceIncludesHeight) {
        let height = Math.abs((t1.data.elevation || 0) - (t2.data.elevation || 0));
        if (canvas.grid.diagonalRule === "555") {
            let nd = Math.min(distance, height);
            let ns = Math.abs(distance - height);
            distance = nd + ns;
        }
        else
            distance = Math.sqrt(height * height + distance * distance);
    }
    return distance;
}
;
export function checkRange(actor, item, tokenId, targets) {
    let itemData = item.data.data;
    // check that a range is specified at all
    if (!itemData.range)
        return;
    if (!itemData.range.value && !itemData.range.long && itemData.range.units !== "touch")
        return "normal";
    // skip non mwak/rwak/rsak/msak types that do not specify a target type
    if (!allAttackTypes.includes(itemData.actionType) && !["creature", "ally", "enemy"].includes(itemData.target?.type))
        return "normal";
    let token = canvas.tokens.get(tokenId);
    if (!token) {
        warn(`${game.user.name} no token selected cannot check range`);
        ui.notifications.warn(`${game.user.name} no token selected`);
        return "fail";
    }
    let range = itemData.range?.value || 0;
    let longRange = itemData.range?.long || 0;
    if (itemData.range.units === "touch") {
        range = 5;
        longRange = 0;
    }
    if (["mwak", "msak", "mpak"].includes(itemData.actionType) && !itemData.properties?.thr)
        longRange = 0;
    for (let target of targets) {
        if (target === token)
            continue;
        // check the range
        let distance = getDistance(token, target, true);
        if ((longRange !== 0 && distance > longRange) || (distance > range && longRange === 0)) {
            console.log(`minor-qol | ${target.name} is too far ${distance} from your character you cannot hit`);
            ui.notifications.warn(`${actor.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`);
            return "fail";
        }
        if (distance > range)
            return "dis";
        if (distance < 0) {
            console.log(`minor-qol | ${target.name} is blocked by a wall`);
            ui.notifications.warn(`${actor.name}'s target is blocked by a wall`);
            return "fail";
        }
    }
    return "normal";
}
export function testKey(keyString, event) {
    if (!event)
        return false;
    switch (keyString) {
        case "altKey":
            return event?.altKey;
        case "shiftKey":
            return event?.shiftKey;
        case "ctrlKey":
            return event?.ctrlKey || event?.metaKey;
        default:
            error("Impossible key mapping for speed roll");
    }
}
export function isAutoFastAttack(workFlow = null) {
    if (workFlow && workFlow.workflowType === "DummyWorkflow")
        return workFlow.rollOptions.fastForward;
    return game.user.isGM ? configSettings.gmAutoFastForwardAttack : ["all", "attack"].includes(configSettings.autoFastForward);
}
export function isAutoFastDamage(workFlow = null) {
    if (workFlow && workFlow.workflowType === "DummyWorkflow")
        return workFlow.rollOptions.fastForward;
    ;
    return game.user.isGM ? configSettings.gmAutoFastForwardDamage : ["all", "damage"].includes(configSettings.autoFastForward);
}
export function getAutoRollDamage() {
    return game.user.isGM ? configSettings.gmAutoDamage : configSettings.autoRollDamage;
}
export function getAutoRollAttack() {
    return game.user.isGM ? configSettings.gmAutoAttack : configSettings.autoRollAttack;
}
export function itemHasDamage(item) {
    return item?.data.data.actionType !== "" && item?.hasDamage;
}
export function itemIsVersatile(item) {
    return item?.data.data.actionType !== "" && item?.isVersatile;
}
export function getRemoveAttackButtons() {
    return game.user.isGM ?
        ["all", "attack"].includes(configSettings.gmRemoveButtons) :
        ["all", "attack"].includes(configSettings.removeButtons);
}
export function getRemoveDamageButtons() {
    return game.user.isGM ?
        ["all", "damage"].includes(configSettings.gmRemoveButtons) :
        ["all", "damage"].includes(configSettings.removeButtons);
}
export function getTokenPlayerName(token) {
    if (!token)
        return game.user.name;
    if (!installedModules.get("combat-utility-belt"))
        return token.name;
    if (!game.settings.get("combat-utility-belt", "enableHideNPCNames"))
        return token.name;
    if (getProperty(token.actor.data.flags, "combat-utility-belt.enableHideName"))
        return getProperty(token.actor.data.flags, "combat-utility-belt.hideNameReplacement");
    //@ts-ignore hasPlayerOwner not defined.
    if (token.actor.hasPlayerOwner)
        return token.name;
    switch (token.data.disposition) {
        case -1:
            if (game.settings.get("combat-utility-belt", "enableHideHostileNames"))
                return game.settings.get("combat-utility-belt", "hostileNameReplacement");
            break;
        case 0:
            if (game.settings.get("combat-utility-belt", "enableHideNeutralNames"))
                return game.settings.get("combat-utility-belt", "neutralNameReplacement");
        case 1:
            if (game.settings.get("combat-utility-belt", "enableHideFriendlyNames"))
                return game.settings.get("combat-utility-belt", "friendlyNameReplacement");
        default:
    }
    return token.name;
}
// Add the concentration marker to the character and update the duration if possible
export async function addConcentration(options) {
    const item = options.workflow.item;
    await item.actor.unsetFlag("midi-qol", "concentration-data");
    if (installedModules.get("combat-utility-belt") && configSettings.concentrationAutomation) {
        let selfTarget = await getSelfTarget(item.actor);
        if (!selfTarget)
            return;
        const concentrationName = game.settings.get("combat-utility-belt", "concentratorConditionName");
        const itemDuration = item.data.data.duration;
        // set the token as concentrating
        await game.cub.addCondition(concentrationName, [selfTarget], { warn: false });
        // Update the duration of the concentration effect - TODO remove it CUB supports a duration
        if (options.workflow.hasDAE) {
            const ae = duplicate(selfTarget.actor.data.effects.find(ae => ae.label === concentrationName));
            if (ae) {
                //@ts-ignore
                const inCombat = (game.combat?.turns.some(turnData => turnData.tokenId === selfTarget.id));
                const convertedDuration = options.workflow.dae.convertDuration(itemDuration, inCombat);
                if (convertedDuration.type === "seconds") {
                    ae.duration.seconds = convertedDuration.seconds;
                    ae.duration.startTime = game.time.worldTime;
                }
                else if (convertedDuration.type === "turns") {
                    ae.duration.rounds = convertedDuration.rounds;
                    ae.duration.turns = convertedDuration.turns;
                    ae.duration.startRound = game.combat?.round;
                    ae.duration.startTurn = game.combat?.turn;
                }
                await selfTarget.actor.updateEmbeddedEntity("ActiveEffect", ae);
            }
        }
    }
    else if (configSettings.concentrationAutomation) {
        let actor = options.workflow.actor;
        let selfTarget = await getSelfTarget(item.actor);
        if (!selfTarget)
            return;
        let concentrationName = i18n("midi-qol.Concentrating");
        //@ts-ignore tokenId
        const inCombat = (game.combat?.turns.some(turnData => turnData.tokenId === selfTarget.id));
        //@ts-ignore DAE
        const convertedDuration = window.DAE?.convertDuration(item.data.data.duration, inCombat);
        const currentItem = game.items.getName(concentrationCheckItemName);
        const effectData = {
            changes: [],
            origin: item.uuid,
            disabled: false,
            icon: currentItem.img,
            label: concentrationName,
            duration: undefined
        };
        if (convertedDuration.type === "seconds") {
            effectData.duration = { seconds: convertedDuration.seconds, startTime: game.time.worldTime };
        }
        else if (convertedDuration.type === "turns") {
            effectData.duration = {
                rounds: convertedDuration.rounds,
                turns: convertedDuration.turns,
                startRound: game.combat?.round,
                startTurn: game.combat?.turn
            };
        }
        actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    }
}
//  the second setting the flag for the macro to be called when damaging an opponent
/**
 * Find tokens nearby
 * @param {number|null} disposition. same(1), opposite(-1), neutral(0), ignore(null) token disposition
 * @param {Token} token The token to search around
 * @param {number} distance in game units to consider near
 */
export function findNearby(disposition, token, distance, maxSize = undefined) {
    if (!token)
        return [];
    let targetDisposition = token.data.disposition * disposition;
    let nearby = canvas.tokens.placeables.filter(t => {
        if (t.data.height * t.data.width > maxSize)
            return false;
        if (t.actor &&
            t.id !== token.id && // not the token
            t.actor.data.data.attributes?.hp?.value > 0 && // not incapacitated
            (disposition === null || t.data.disposition === targetDisposition)) {
            const tokenDistance = getDistance(t, token, true);
            return 0 < tokenDistance && tokenDistance <= distance;
        }
        else
            return false;
    });
    return nearby;
}
export function checkNearby(disposition, token, distance) {
    return findNearby(disposition, token, distance).length !== 0;
    ;
}
export function hasCondition(token, condition) {
    if (!token)
        return false;
    const localCondition = i18n(`midi-qol.${condition}`);
    if (getProperty((token.actor.data.flags), `conditional-visibility.${condition}`))
        return true;
    if (installedModules.get("combat-utility-belt") && game.cub.getCondition(localCondition)) {
        return game.cub.hasCondition(localCondition, [token], { warn: false });
    }
    return false;
}
export async function removeHiddenInvis() {
    const token = canvas.tokens.get(this.tokenId);
    removeTokenCondition(token, "hidden").then(() => {
        removeTokenCondition(token, "invisible");
    });
    log(`Hidden/Invisibility removed for ${this.actor.name} due to attack`);
}
export async function removeCondition(condition) {
    const token = canvas.tokens.get(this.tokenId);
    removeTokenCondition(token, condition);
}
export async function removeTokenCondition(token, condition) {
    if (!token)
        return;
    //@ts-ignore
    const CV = window.ConditionalVisibility;
    const localCondition = i18n(`midi-qol.${condition}`);
    if (condition === "hidden") {
        CV?.unHide([token]);
    }
    else
        CV?.setCondition([token], condition, false);
    if (installedModules.get("combat-utility-belt") && game.cub.getCondition(localCondition)) {
        game.cub.removeCondition(localCondition, token, { warn: false });
    }
}
// this = {actor, item, myExpiredEffects}
export async function expireMyEffects(effectsToExpire) {
    const expireHit = effectsToExpire.includes("1Hit") && !this.effectsAlreadyExpired.includes("1Hit");
    const expireAction = effectsToExpire.includes("1Action") && !this.effectsAlreadyExpired.includes("1Action");
    const expireAttack = effectsToExpire.includes("1Attack") && !this.effectsAlreadyExpired.includes("1Attack");
    const expireDamage = effectsToExpire.includes("DamageDealt") && !this.effectsAlreadyExpired.includes("DamageDealt");
    // expire any effects on the actor that require it
    if (debugEnabled && false) {
        const test = this.actor.effects.map(ef => {
            const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
            return [(expireAction && specialDuration?.includes("1Action")),
                (expireAttack && specialDuration?.includes("1Attack") && this.item?.hasAttack),
                (expireHit && this.item?.hasAttack && specialDuration?.includes("1Hit") && this.hitTargets.size > 0)];
        });
        debug("expiry map is ", test);
    }
    const myExpiredEffects = this.actor.effects.filter(ef => {
        const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
        if (!specialDuration || !specialDuration?.length)
            return false;
        return (expireAction && specialDuration.includes("1Action")) ||
            (expireAttack && this.item?.hasAttack && specialDuration.includes("1Attack")) ||
            (expireAttack && this.item?.hasAttack && specialDuration.includes(`1Attack:${this.item.data.data.actionType}`)) ||
            (expireHit && this.item?.hasAttack && specialDuration.includes("1Hit") && this.hitTargets.size > 0) ||
            (expireDamage && this.item?.hasDamage && specialDuration.includes("DamageDealt"));
    }).map(ef => ef.id);
    debug("expire my effects", myExpiredEffects, expireAction, expireAttack, expireHit);
    this.effectsAlreadyExpired = this.effectsAlreadyExpired.concat(effectsToExpire);
    if (myExpiredEffects?.length > 0)
        await this.actor?.deleteEmbeddedEntity("ActiveEffect", myExpiredEffects);
}
// this = actor
export function expireRollEffect(rollType, abilityId) {
    const expiredEffects = this.effects?.filter(ef => {
        const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
        if (!specialDuration)
            return false;
        if (specialDuration.includes(`is${rollType}`))
            return true;
        if (specialDuration.includes(`is${rollType}.${abilityId}`))
            return true;
        return false;
    }).map(ef => ef.id);
    if (expiredEffects?.length > 0) {
        socketlibSocket.executeAsGM("removeEffects", {
            actorUuid: this.uuid,
            effects: expiredEffects,
        });
    }
}
export async function validTargetTokens(tokenSet) {
    const multiLevelTokens = [...tokenSet].filter(t => getProperty(t.data, "flags.multilevel-tokens"));
    const nonLocalTokens = multiLevelTokens.filter(t => !canvas.tokens.get(t.data.flags["multilevel-tokens"].stoken));
    let normalTokens = [...tokenSet].filter(a => a.actor);
    // return new Set(normalTokens);
    let tokenData;
    let synthTokens = nonLocalTokens.map(t => {
        const mlFlags = t.data.flags["multilevel-tokens"];
        const scene = game.scenes.get(mlFlags.sscene);
        //@ts-ignore .tokens not defined
        const tData = scene.data.tokens.find(tdata => tdata._id === mlFlags.stoken);
        if (tData) {
            let baseActor = game.actors.get(tData.actorId);
            let actorData = mergeObject(baseActor.data, t.data.actorData, { inplace: false });
            t.actor = new Actor(actorData, { token: t });
            // delete tokenData.flags["multilevel-tokens"];
            // return new Token(tokenData, scene)
            //const token = Token.create(tokenData, {temporary: true});
            return t;
        }
        ui.notifications.error("Could not find ml source token");
        return t;
    });
    // const testToken = await Token.create(tokenData, {temporary: true});
    // const synthTokens = await Promise.all(synthTokenPromises);
    //@ts-ignore synthTokens is of type Placeable[], not Token
    return new Set(normalTokens.concat(synthTokens));
}
export function MQfromUuid(uuid) {
    let parts = uuid.split(".");
    let doc;
    const [docName, docId] = parts.slice(0, 2);
    parts = parts.slice(2);
    const collection = CONFIG[docName].collection.instance;
    doc = collection.get(docId);
    // Embedded Documents
    while (doc && parts.length > 1) {
        const [embeddedName, embeddedId] = parts.slice(0, 2);
        doc = doc.getEmbeddedDocument(embeddedName, embeddedId);
        parts = parts.slice(2);
    }
    return doc || null;
}
export function MQfromActorUuid(uuid) {
    let doc = MQfromUuid(uuid);
    if (doc instanceof CONFIG.Token.documentClass)
        doc = doc.actor;
    return doc || null;
}
