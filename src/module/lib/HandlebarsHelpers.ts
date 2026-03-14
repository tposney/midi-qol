/**
 * Custom Handlebars helpers for midi-qol.
 * Based on Foundry's selectOptions helper but with added hint/tooltip support on options.
 */

import type { SelectOptionValue } from "../../globals.js";

/**
 * Register all custom Handlebars helpers.
 * Call this during module initialization (e.g. in the init hook).
 */
export function registerHandlebarsHelpers(): void {
	Handlebars.registerHelper("midiSelectOptions", midiSelectOptions);
}

/**
 * A drop-in replacement for Foundry's {{selectOptions}} that supports a `hint` property
 * on each option, rendered as a title attribute on the <option> element for hover tooltips.
 *
 * Options format — object values can include a `hint` key:
 * ```js
 * let choices = {
 *   a: { label: "Choice A", hint: "Detailed description of A" },
 *   b: { label: "Choice B", hint: "Detailed description of B" }
 * };
 * ```
 *
 * Or use `hintAttr` to specify which property holds the hint:
 * ```js
 * let choices = [
 *   { key: "a", name: "Choice A", description: "Description of A" },
 *   { key: "b", name: "Choice B", description: "Description of B" }
 * ];
 * // {{midiSelectOptions choices valueAttr="key" labelAttr="name" hintAttr="description"}}
 * ```
 *
 * Simple string values (no hint) also work, same as Foundry's helper:
 * ```js
 * let choices = { a: "Choice A", b: "Choice B" };
 * // {{midiSelectOptions choices selected=value localize=true}}
 * ```
 *
 * When localize=true, hints are localized. If the localized result equals the key
 * (meaning no translation was found), the hint is omitted.
 *
 * Hash parameters (same as Foundry's selectOptions, plus hintAttr):
 * - selected: current value(s)
 * - localize: localize labels (and hints) via game.i18n.localize
 * - blank: label for a blank first option
 * - sort: sort options alphabetically
 * - inverted: swap keys and values
 * - valueAttr: property name for option value (when choices are objects)
 * - labelAttr: property name for option label
 * - hintAttr: property name for option hint/tooltip (default: "hint")
 */
function midiSelectOptions(choices: any, options: any): Handlebars.SafeString {
	const {
		localize = false,
		blank,
		sort,
		valueAttr,
		labelAttr,
		hintAttr,
		inverted,
	} = options.hash;

	let selected: string[] = normalizeSelected(options.hash.selected);

	// Build flat array of { value, label, hint? }
	const optionList: SelectOptionEntry[] = [];

	if (choices instanceof Array) {
		for (const [i, choice] of choices.entries()) {
			if (typeof choice === "object") {
				optionList.push(extractOption(choice, i, { valueAttr, labelAttr, hintAttr }));
			} else {
				optionList.push({ value: String(i), label: String(choice) });
			}
		}
	} else if (choices && typeof choices === "object") {
		for (const entry of Object.entries(choices)) {
			const [k, v] = inverted ? ([entry[1], entry[0]] as [any, any]) : entry;
			const value = valueAttr ? (v as any)[valueAttr] : k;
			if (typeof v === "object") {
				optionList.push(extractOption(v as any, value, { valueAttr, labelAttr, hintAttr }));
			} else {
				optionList.push({ value: String(value), label: String(v) });
			}
		}
	}

	// Localize
	if (localize) {
		for (const opt of optionList) {
			if (opt.label) opt.label = game.i18n!.localize(opt.label);
			if (opt.hint) {
				const localized = game.i18n!.localize(opt.hint);
				// If localize returns the key unchanged, no translation exists — omit the hint
				opt.hint = (localized !== opt.hint) ? localized : undefined;
			}
		}
	}

	// Sort
	if (sort) {
		optionList.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "", game.i18n!.lang));
	}

	// Build HTML
	const parts: string[] = [];

	// Blank option
	if (typeof blank === "string") {
		const blankLabel = localize ? game.i18n!.localize(blank) : blank;
		const sel = selected.includes("") ? " selected" : "";
		parts.push(`<option value=""${sel}>${escapeHTML(blankLabel)}</option>`);
	}

	for (const opt of optionList) {
		if (opt.value === undefined || opt.label === undefined) continue;
		const sel = selected.includes(String(opt.value)) ? " selected" : "";
		const hintStr = opt.hint ? ` title="${escapeHTML(opt.hint)}"` : "";
		parts.push(`<option value="${escapeHTML(String(opt.value))}"${sel}${hintStr}>${escapeHTML(opt.label)}</option>`);
	}

	return new Handlebars.SafeString(parts.join("\n"));
}

/* ---------------------------------------- */
/*  Internal helpers                        */
/* ---------------------------------------- */

interface SelectOptionEntry {
	value: string;
	label: string;
	hint?: string;
}

interface ExtractAttrs {
	valueAttr?: string;
	labelAttr?: string;
	hintAttr?: string;
}

function normalizeSelected(selected: any): string[] {
	if (selected === undefined || selected === null) return [];
	if (selected instanceof Set) return Array.from(selected).map(String);
	if (selected instanceof Array) return selected.map(String);
	return [String(selected)];
}

function extractOption(obj: Record<string, any>, fallbackValue: any, attrs: ExtractAttrs): SelectOptionEntry {
	const value = String(attrs.valueAttr ? obj[attrs.valueAttr] : (obj.value ?? fallbackValue));
	const label = String(attrs.labelAttr ? obj[attrs.labelAttr] : (obj.label ?? value));
	const hint = attrs.hintAttr ? obj[attrs.hintAttr] : obj.hint;
	const entry: SelectOptionEntry = { value, label };
	if (hint !== undefined && hint !== null) entry.hint = String(hint);
	return entry;
}

function escapeHTML(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Update the label of a SelectOptionValue while preserving hint and other properties.
 * If the option is an object, returns a new object with the updated label.
 * If the option is a plain string, returns the new label string.
 */
export function withOptionLabel(option: SelectOptionValue, label: string): SelectOptionValue {
	if (typeof option === "object") {
		return { ...option, label };
	}
	return label;
}

