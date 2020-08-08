export const preloadTemplates = async function() {
  const templatePaths = [
    // Add paths to "modules/midi-qol/templates"
    "modules/midi-qol/templates/saves.html",
    "modules/midi-qol/templates/hits.html",
    "modules/midi-qol/templates/spellleveldialog.html"
  ];
	return loadTemplates(templatePaths);
}
