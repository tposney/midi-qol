import { type SaveRequestProvider } from "./service.js";
/** midi's own providers, by id: another module that claims some targets can hand others to one of these */
export declare const midiSaveProviders: Record<string, SaveRequestProvider>;
export declare function registerMidiSaveProviders(): void;
