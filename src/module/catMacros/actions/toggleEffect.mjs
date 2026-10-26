// For an action whose activity toggles its effect: using it again removes the effect instead. Generic Actions uses a
// fresh copy of the item each time, so midi's own toggle, which matches the item, cannot find the earlier effect.
async function toggle({workflow}) {
    if (!workflow.activity.midiProperties?.toggleEffect) return;
    const names = new Set(workflow.activity.effects.map(profile => profile.effect?.name).filter(Boolean));
    const active = workflow.actor.effects.filter(effect => names.has(effect.name));
    if (!active.length) return;
    await workflow.actor.deleteEmbeddedDocuments('ActiveEffect', active.map(effect => effect.id));
    return true;
}
export const toggleEffect = {
    name: 'Toggle Effect',
    version: '1.0.0',
    rules: 'all',
    roll: [{pass: 'itemPreItemRoll', macro: toggle, priority: 50}]
};
