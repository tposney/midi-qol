import { MODULE_ID, i18n, GameSystemConfig } from "../midi-qol.js";

/**
 * Detect Magic senses a region made by a spell or a magic item. The region editor's Appearance tab gets Magical and
 * Magic School for any other region (flags.midi-qol.magical, flags.midi-qol.magicSchool); the school defaults to that
 * of the spell that made the region.
 */
export function setupRegionMagic() {
  Hooks.on("renderRegionConfig", (app: foundry.applications.sheets.RegionConfig, html: HTMLElement) => {
    const tab = html.querySelector<HTMLElement>('.tab[data-tab="appearance"]');
    if (!tab || tab.querySelector(".midi-qol-region-magic")) return;
    const region = app.document;
    const { createCheckboxInput, createSelectInput, createFormGroup } = foundry.applications.fields;
    const schools = Object.entries(GameSystemConfig.spellSchools as Record<string, { label: string }>)
      .map(([value, school]) => ({ value, label: school.label }));
    const magical = createFormGroup({
      label: i18n("midi-qol.RegionMagic.Magical"),
      hint: i18n("midi-qol.RegionMagic.MagicalHint"),
      classes: ["slim", "midi-qol-region-magic"],
      input: createCheckboxInput({ name: `flags.${MODULE_ID}.magical`, value: !!region.getFlag(MODULE_ID, "magical") })
    });
    const school = createFormGroup({
      label: i18n("midi-qol.RegionMagic.School"),
      classes: ["midi-qol-region-magic"],
      input: createSelectInput({
        name: `flags.${MODULE_ID}.magicSchool`,
        value: (region.getFlag(MODULE_ID, "magicSchool") as string | undefined) ?? "",
        blank: i18n("midi-qol.RegionMagic.SchoolFromSpell"),
        options: schools
      })
    });
    tab.append(magical, school);
  });
}
