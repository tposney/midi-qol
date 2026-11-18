/**
 * Custom Handlebars helpers for midi-qol.
 * Based on Foundry's selectOptions helper but with added hint/tooltip support on options.
 */
import type { SelectOptionValue } from "../../globals.js";
/**
 * Register all custom Handlebars helpers.
 * Call this during module initialization (e.g. in the init hook).
 */
export declare function registerHandlebarsHelpers(): void;
/**
 * Update the label of a SelectOptionValue while preserving hint and other properties.
 * If the option is an object, returns a new object with the updated label.
 * If the option is a plain string, returns the new label string.
 */
export declare function withOptionLabel(option: SelectOptionValue, label: string): SelectOptionValue;
