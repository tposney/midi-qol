// midi's Damage Absorption trait (system.traits.da) is stored like dnd5e's di/dr/dv. Runs on import, before dnd5e
// builds its actor schemas.
function extendActorTraits() {
  const actorModels = globalThis.dnd5e?.dataModels?.actor;
  const DamageTraitField = actorModels?.DamageTraitField;
  if (!DamageTraitField) return;
  for (const model of [actorModels.CharacterData, actorModels.NPCData, actorModels.VehicleData]) {
    if (!model) continue;
    const baseDefineSchema = model.defineSchema;
    model.defineSchema = function () {
      const schema = baseDefineSchema.call(this);
      if (!schema.traits?.fields?.da) schema.traits?.extendFields({ da: new DamageTraitField({}, { label: "midi-qol.DamageAbsorption" }) });
      return schema;
    };
  }
}
extendActorTraits();
