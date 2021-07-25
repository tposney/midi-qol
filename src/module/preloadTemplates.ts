export async function preloadTemplates() {
  const templatePaths = [
    // Add paths to "modules/midi-qol/templates" - TODO check these
    "modules/midi-qol/templates/saves.html",
    "modules/midi-qol/templates/hits.html",
    "modules/midi-qol/templates/item-card.html",
    "modules/midi-qol/templates/tool-card.html",
    "modules/midi-qol/templates/config.html",
    "modules/midi-qol/templates/damage-results.html",
    "modules/midi-qol/templates/roll-stats.html"
    
  ];
	return loadTemplates(templatePaths);
}
