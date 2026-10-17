import { GameSystemConfig, i18n, i18nFormat } from "../midi-qol.js";

// Every dnd5e 6 roll modification field (abilities.<id>.save.roll, skills.<id>.roll, rolls.ability.check, attributes.death.roll, ...)
// gets fail and success conditions beside dnd5e's bonus/min/max/mode. Runs on import, before dnd5e builds its data models.
function extendRollFields() {
  const D20RollModificationField = globalThis.dnd5e?.dataModels?.shared?.D20RollModificationField;
  if (!D20RollModificationField || Object.hasOwn(D20RollModificationField.prototype, "_initialize")) return;
  const { StringField } = foundry.data.fields;
  const condition = (kind: "fail" | "success") => new StringField({
    required: false, nullable: true, initial: null, blank: true,
    label: `midi-qol.RollField.${kind}.label`, hint: `midi-qol.RollField.${kind}.hint`
  });
  const baseInitialize = Object.getPrototypeOf(D20RollModificationField.prototype)._initialize;
  D20RollModificationField.prototype._initialize = function (fields: Record<string, foundry.data.fields.DataField.Any>) {
    return baseInitialize.call(this, { ...fields, fail: condition("fail"), success: condition("success") });
  };
}
extendRollFields();

const ATTACK_TYPES = ["mwak", "rwak", "msak", "rsak"];

/**
 * The dnd5e roll field that replaces an old midi fail/success/min/max flag (given without "flags.midi-qol."), as a full
 * system path, or undefined if the flag has no single dnd5e equivalent (fail.all, fail.ability.all, fail.save.school.<school>).
 */
export function rollFieldForFlag(flag: string): string | undefined {
  const match = flag.match(/^(fail|success|min|max)\.(.+)$/);
  if (!match) return undefined;
  const [, kind, rest] = match;
  let path: string | undefined;
  let part: RegExpMatchArray | null;
  if (rest === "concentration" || rest === "ability.save.concentration") path = "attributes.concentration.roll";
  else if (rest === "deathSave") path = "attributes.death.roll";
  else if ((part = rest.match(/^ability\.(save|check)\.(\w+)$/)))
    path = part[2] === "all" ? `rolls.ability.${part[1]}` : `abilities.${part[2]}.${part[1]}.roll`;
  else if ((part = rest.match(/^(skill|tool)\.([\w-]+)$/)))
    path = part[2] === "all" ? `rolls.ability.${part[1]}` : `${part[1]}s.${part[2]}.roll`;
  else if ((part = rest.match(/^attack\.(\w+)$/))) {
    if (part[1] === "all") path = "rolls.attack";
    else if (ATTACK_TYPES.includes(part[1])) path = `rolls.attack.${part[1]}`;
  }
  return path ? `system.${path}.${kind}` : undefined;
}

/**
 * DAE field mappings from the old midi flags to the dnd5e roll fields that replace them. DAE applies an effect's old key to
 * the new field and reports the deprecation; min and max keep the strongest value, as midi's flags did.
 */
export function rollFieldMappings(abilities: string[], skills: string[], tools: string[]): Record<string, { key: string, type: string }> {
  const ids = (list: string[]) => [...list, "all"];
  const flags: string[] = ["deathSave", "concentration"].flatMap(rest => [`fail.${rest}`, `success.${rest}`])
    .concat(["min.concentration", "max.concentration"]);
  for (const kind of ["fail", "success", "min", "max"]) {
    for (const rollType of ["save", "check"]) flags.push(...ids(abilities).map(id => `${kind}.ability.${rollType}.${id}`));
    flags.push(...ids(skills).map(id => `${kind}.skill.${id}`), ...ids(tools).map(id => `${kind}.tool.${id}`));
  }
  for (const kind of ["fail", "success", "min", "max"]) flags.push(...ids(ATTACK_TYPES).map(id => `${kind}.attack.${id}`));
  const mappings: Record<string, { key: string, type: string }> = {};
  for (const flag of flags) {
    const key = rollFieldForFlag(flag);
    const kind = flag.split(".")[0];
    if (key) mappings[`flags.midi-qol.${flag}`] = { key, type: kind === "min" ? "upgrade" : kind === "max" ? "downgrade" : "override" };
  }
  return mappings;
}


/** midi's flag-name template and its label for a roll field's fail/success, e.g. abilities.dex.save.roll.fail → fail.ability.save, Dexterity. */
function rollFieldTemplate(field: string): { template: string, label: string } | undefined {
  const match = field.match(/^(?:system\.)?(.+)\.(fail|success)$/);
  if (!match) return undefined;
  const [, path, kind] = match;
  const all = i18n("midi-qol.RollField.all");
  let part: RegExpMatchArray | null;
  if ((part = path.match(/^abilities\.(\w+)\.(save|check|attack)\.roll$/))) {
    const label = GameSystemConfig.abilities[part[1]]?.label ?? part[1];
    return { template: part[2] === "attack" ? `${kind}.attack` : `${kind}.ability.${part[2]}`, label };
  }
  if ((part = path.match(/^rolls\.ability\.(save|check)$/))) return { template: `${kind}.ability.${part[1]}`, label: all };
  if ((part = path.match(/^rolls\.ability\.(skill|tool)$/))) return { template: `${kind}.${part[1]}`, label: i18n(`midi-qol.RollField.${part[1]}s`) };
  if ((part = path.match(/^skills\.(\w+)\.roll$/))) return { template: `${kind}.skill`, label: GameSystemConfig.skills[part[1]]?.label ?? part[1] };
  if ((part = path.match(/^tools\.([\w-]+)\.roll$/)))
    return { template: `${kind}.tool`, label: (globalThis.dnd5e?.documents?.Trait?.keyLabel?.(`tool:${part[1]}`) as string | undefined) ?? part[1] };
  if (path === "rolls.attack") return { template: `${kind}.attack`, label: all };
  if ((part = path.match(/^rolls\.attack\.(\w+)$/)))
    return { template: `${kind}.attack`, label: (GameSystemConfig.itemActionTypes[part[1]] ?? part[1]).replace(/ Attack$/, "") };
  if ((part = path.match(/^attributes\.(death|concentration|init)\.roll$/))) return { template: kind, label: i18n(`midi-qol.RollField.${part[1]}`) };
  return undefined;
}

/** A readable name for a roll field's fail/success (with or without "system."), e.g. "Fail (Dexterity Saves)". */
export function rollFieldName(field: string): string | undefined {
  const entry = rollFieldTemplate(field);
  return entry && i18nFormat(`midi-qol.flagTemplate.${entry.template}.name`, { label: entry.label });
}

/** Names for every roll field's fail and success, keyed by full system path, for DAE's localization map. */
export function rollFieldLocalizations(): Record<string, { name: string, description: string }> {
  const paths = ["rolls.ability.save", "rolls.ability.check", "rolls.ability.skill", "rolls.ability.tool", "rolls.attack",
    ...ATTACK_TYPES.map(type => `rolls.attack.${type}`), "attributes.death.roll", "attributes.concentration.roll", "attributes.init.roll",
    ...Object.keys(GameSystemConfig.abilities).flatMap(id => ["save", "check", "attack"].map(type => `abilities.${id}.${type}.roll`)),
    ...Object.keys(GameSystemConfig.skills ?? {}).map(id => `skills.${id}.roll`),
    ...Object.keys(GameSystemConfig.tools ?? {}).map(id => `tools.${id}.roll`)];
  const entries: Record<string, { name: string, description: string }> = {};
  // Resolved when read: tool labels need dnd5e's tool index, which may not be loaded yet.
  for (const path of paths) for (const kind of ["fail", "success"]) {
    const text = (part: "name" | "description") => {
      const entry = rollFieldTemplate(`${path}.${kind}`);
      return entry ? i18nFormat(`midi-qol.flagTemplate.${entry.template}.${part}`, { label: entry.label }) : `${path}.${kind}`;
    };
    entries[`system.${path}.${kind}`] = { get name() { return text("name"); }, get description() { return text("description"); } };
  }
  return entries;
}
