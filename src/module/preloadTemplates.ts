export async function preloadTemplates() {
  const templatePaths = [
    // Add paths to "modules/midi-qol/templates" - TODO check these
    "modules/midi-qol/templates/saves.html",
    "modules/midi-qol/templates/hits.html",
    "modules/midi-qol/templates/item-card.html",
    "modules/midi-qol/templates/tool-card.html",
    "modules/midi-qol/templates/config.html",
    "modules/midi-qol/templates/damage-results.html",
    "modules/midi-qol/templates/roll-stats.html",
    "modules/midi-qol/templates/damage-results-player.html",
    "modules/midi-qol/templates/lateTargeting.html",
    // "modules/midi-qol/templates/midiProperties.html"
    "modules/midi-qol/templates/sound-config.html",
    "modules/midi-qol/templates/rollAlternate.html",
    "modules/midi-qol/templates/actorOnUseMacrosConfig.html",
  ];
	return loadTemplates(templatePaths);
}
