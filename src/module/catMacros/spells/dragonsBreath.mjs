import {dialogUtils, effectUtils, itemUtils, workflowUtils} from '../proxy.mjs';
// Cast gives the target a Dragon's Breath feature holding a copy of the spell's Exhale activity, fixed to the chosen
// damage type, the caster's save DC and the cast level; it goes when concentration ends.
async function cast({workflow}) {
    if (workflow.activity.type !== 'utility' || !workflow.targets.size) return;
    const exhale = workflow.item.system.activities.find(activity => activity.type === 'save');
    if (!exhale) return;
    const damageTypes = exhale.damage.parts[0]?.types ? [...exhale.damage.parts[0].types] : ['acid', 'cold', 'fire', 'lightning', 'poison'];
    const damageType = await dialogUtils.selectDamageType(damageTypes, workflow.item.name, 'Choose the breath\'s damage type');
    if (!damageType) return;
    const castLevel = workflowUtils.getCastLevel(workflow) ?? workflow.item.system.level;
    const activityData = exhale.toObject();
    activityData.save.dc = {calculation: '', formula: String(exhale.save.dc.value)};
    activityData.damage.parts[0].types = [damageType];
    activityData.damage.parts[0].number = 3 + Math.max(0, castLevel - 2);
    activityData.damage.parts[0].scaling = {mode: '', number: null, formula: ''};
    activityData.midiProperties = {...(activityData.midiProperties ?? {}), automationOnly: false};
    const itemData = {
        name: workflow.item.name,
        type: 'feat',
        img: workflow.item.img,
        system: {
            description: {value: `<p>Magic action: exhale a 15-foot Cone of ${damageType}. DC ${exhale.save.dc.value} Dexterity save, ${activityData.damage.parts[0].number}d6 damage, half on a success.</p>`},
            type: {value: 'spellFeature'},
            properties: ['mgc'],
            activities: {[activityData._id]: activityData}
        },
        flags: {'midi-qol': {dragonsBreath: workflow.item.uuid}}
    };
    const concentration = effectUtils.getConcentrationEffect(workflow.actor, workflow.item);
    await Promise.all(Array.from(workflow.targets).map(async token => {
        if (token.actor) await itemUtils.createItems(token.actor, [itemData], {favorite: true, parentEntity: concentration});
    }));
}
export const dragonsBreath = {
    name: 'Dragon\'s Breath',
    version: '1.0.0',
    rules: '2024',
    roll: [
        {pass: 'activityRollFinished', macro: cast, priority: 50}
    ]
};
