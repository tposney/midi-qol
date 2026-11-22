/**
 * Other modules' data in `workflowOptions`, made to survive serialisation (sockets, chat-card flags) through a
 * Foundry DataModel per namespace. A module declares what `workflowOptions.<namespace>` carries; midi sends the
 * model's source (a Set becomes an array) and rebuilds it on receipt (the SetField makes it a Set again).
 *
 * Keys a schema does not declare are per-use state: they are not transmitted, persisted or passed to child
 * workflows. Namespaces nobody registered pass through unchanged; on the card they are stored with a deprecation
 * warning for now (cardWorkflowOptions).
 */
type FieldMap = foundry.data.fields.DataSchema;
type ModelClass = new (source: object) => foundry.abstract.DataModel.Any;
/** Declare the data a module keeps under `workflowOptions.<namespace>`: a DataModel class or a schema function. */
export declare function registerWorkflowOptionsSchema(namespace: string, schema: ModelClass | (() => FieldMap)): void;
/** For sending or persisting: registered namespaces become their JSON-safe model source. */
export declare const encodeWorkflowOptions: <T>(options: T) => T;
/** For receiving: registered namespaces are rebuilt through their model. */
export declare const decodeWorkflowOptions: <T>(options: T) => T;
/** What a child workflow inherits: exactly what transmission would carry. */
export declare const inheritableWorkflowOptions: <T>(options: T) => T;
/**
 * midi's own option keys (WorkflowOptions, MidiOptions, and what midi reads from either). Any other key is another
 * module's: stored on the card through a registered schema (its namespace), or, for now, as it is.
 */
export declare const MIDI_OPTION_KEYS: Set<string>;
/** Internal: the change of rule above, when its time comes (and for tests) */
export declare function setStoreUnregisteredWorkflowOptions(value: boolean): void;
/**
 * The options as a card stores them for a rebuilt workflow: registered namespaces as their schema's data; other
 * modules' keys as they are (with a deprecation warning, once per key) or, once that ends, not at all.
 */
export declare function cardWorkflowOptions<T>(options: T): T;
/** Applies `fn` to every `workflowOptions` object in a socket payload, copying only the path to what changed. */
export declare function mapPayload(value: unknown, fn: (options: object) => object, depth?: number): unknown;
/**
 * socketlib with the codec at both ends: calls encode the `workflowOptions` in their arguments, handlers decode them,
 * and results come back the same way. Local calls (to oneself) go through it too, so they see what remote ones do.
 */
export declare function withWorkflowOptionsCodec<T extends object>(socket: T): T;
export {};
