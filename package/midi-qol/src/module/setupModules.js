import { error, debugEnabled, i18n } from "../midi-qol.js";
import { log } from "../midi-qol.js";
import { configSettings } from "./settings.js";
let modules = { "about-time": "0.0",
	"betterrolls5e": "1.6.6",
	"dice-so-nice": "4.1.1",
	"itemacro": "1.0.0",
	"lmrtfy": "0.9",
	"lib-wrapper": "1.3.5",
	"dae": "0.8.43",
	"combat-utility-belt": "1.3.8",
	"times-up": "0.1.2",
	"conditional-visibility": "0.0",
	"monks-tokenbar": "0.0",
	"socketlib": "0.0",
	"advanced-macros": "1.0",
	"dnd5e-helpers": "3.0.0",
	"dfreds-convenient-effects": "1.8.0",
	"levels": "1.7.0",
	"levelsvolumetrictemplates": "0.0.0",
	"lib-changelogs": "0.0.0"
};
export let installedModules = new Map();
export let setupModules = () => {
	for (let name of Object.keys(modules)) {
		const modVer = game.modules.get(name)?.data.version || "0.0.0";
		const neededVer = modules[name];
		const isValidVersion = isNewerVersion(modVer, neededVer) || !isNewerVersion(neededVer, modVer);
		installedModules.set(name, game.modules.get(name)?.active && isValidVersion);
		if (!installedModules.get(name)) {
			if (game.modules.get(name)?.active)
				error(`midi-qol requires ${name} to be of version ${modules[name]} or later, but it is version ${game.modules.get(name)?.data.version}`);
			else
				console.warn(`midi-qol | module ${name} not active - some features disabled`);
		}
	}
	if (debugEnabled > 0)
		for (let module of installedModules.keys())
			log(`module ${module} has valid version ${installedModules.get(module)}`);
};
export function dice3dEnabled() {
	//@ts-ignore
	return installedModules.get("dice-so-nice") && game.dice3d?.isEnabled();
}
export function checkModules() {
	if (game.user?.isGM && !installedModules.get("socketlib")) {
		//@ts-ignore expected one argument but got 2
		ui.notifications.error("midi-qol.NoSocketLib", { permanent: true, localize: true });
	}
	//@ts-ignore
	const midiVersion = game.modules.get("midi-qol").data.version;
	const notificationVersion = game.settings.get("midi-qol", "notificationVersion");
	//@ts-ignore
	if (game.user?.isGM && !installedModules.get("lib-changelogs") && isNewerVersion(midiVersion, notificationVersion)) {
		game.settings.set("midi-qol", "notificationVersion", midiVersion);
		//@ts-ignore expected one argument but got 2
		ui.notifications?.warn("midi-qol.NoChangelogs", { permanent: true, localize: true });
	}
	checkCubInstalled();
}
export function checkCubInstalled() {
	return;
	if (game.user?.isGM && configSettings.concentrationAutomation && !installedModules.get("combat-utility-belt")) {
		let d = new Dialog({
			// localize this text
			title: i18n("midi-qol.confirm"),
			content: i18n("midi-qol.NoCubInstalled"),
			buttons: {
				one: {
					icon: '<i class="fas fa-check"></i>',
					label: "OK",
					callback: () => {
						configSettings.concentrationAutomation = false;
					}
				}
			},
			default: "one"
		});
		d.render(true);
	}
}
Hooks.once('libChangelogsReady', function () {
	//@ts-ignore
	libChangelogs.register("midi-qol", `
0.8.83
* Fix for better rolls activation condition processing.
* Added non magical silver physical damage resistance/immunity/vulnerability, which is bypassed by magical and silvered weapons.
* Fix for removing cocnentration effects when one of the target tokens has been removed from the scene.
* Monk's token bar saves now displays the DC based on the midi midi show DC setting.
* Fix for bug introduced in 0.8.81 with critical damage configuration - if you have Default DND5e as you setting, midi would incorrectly interpret that as no damage bonus.
* Fix for 1Reaction effects not expiring on a missed attack.
* Fix for localisation problem if using midi's concentration effect (i.e. no CUB/Convenient Effects).
* Addition to reactions. As well as triggering on attacks, reactions can trigger on damage application. Midi uses the activation condition of the item to work out which one is applicable.  
Most feats/spells have a blank activation conditon and midi will treat those as attack triggered reactions, or if the localised string attacked is in the activation condition.  

Hellish Rebuke, for example, has "Which you take in response to being **damaged** by a creature within 60 feet of you that you can see", and midi will tirgger those with the word damage in the activation conditon when a character is damage. (Hellish rebuke is a special one since it triggers only if you took damage).

* Added new item field "Active Effect Condtion". If set the activation condition must evaluate to true for the active effect to be applied. The saving throw if any must also be failed for the effect to be applied. For example, the included mace of disruption does additional damage to undead and if an undead fails it's save it is frightened. By setting the Activation Condition and Active Effect Activation Condition to checked only undead will suffer extra damage and be set frightened if they fail the save.

* Implemented Optional Rule: Challenge Mode Armor. See the readme.md for more information. My testing indicates that this is extremly unfavourable to higher level tank characters, dramatically increasing the amount of damage they take. I have implemented a modified version that, 1) scales the damage from an EC hit and 2) Armor provides damage reduction equal to the AR for all hits.

0.8.81
* Fix for bug introduced in 0.8.80 for onUse/Damage Bonus macros where targets was not set correctly. Impacted concentration not being removed automatically.

0.8.80
* "full damage on save" to configure save damage for spells (like no damage on save it is always checked) - full damage on save would be used for spells that always do their damage but have contingent effects, like poisoned on a failed save.
* Added roll other damage for spells with the same settings as roll other damage for rwak/mwak.
* Fix for TrapWorkflow not targeting via templates correctly.
* Corrected tooltip for saving throw details when using better rolls (was always displaying 1d20).
* Correction to Divine Smite sample item which was incorrectly adding the bonus damage for improved divine smite.
* Fix for better rolls AoE spells failing if the template was placed before the damage roll completed (i.e. when dice so nice enabled).
* Fix for midi-qol not picking up the damage types for versatile damage rolls.
* Tidied up Readme.md

* Discovered, but have not fixed that if a) using better rolls, b) not using merge card and c) using dice so nice then save results won't be displayed to the chat. So if using better rolls you should enable merge card.

0.8.79
* fix for overtime effects duplicating convenient effects when the name of the effect being checked matches a convenient effect.
* fix for TrapWorkflow not displaying the damage type list in the roll flavor.
* Add new config option to bypass the spell cast dialog, casting at default level and placing templates. Pressing both Advantage+Disadvantage keys will force display of the casting dialog. If you don't have a spell slot of the level of the spell the dialog will be displayed so you can choose another slot. 
* exported overTimeJSONData to help macros create items on the fly.  
FYI: if you want an overtime effect that just calls a macro each turn use  
	flags.midi-qol.overTime OVERRIDE turn=start,macro=macro name, label=My Label  
The macro will be called with the normal onUse macro data for the overTime effect being rolled.

[Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`, "major");
});
