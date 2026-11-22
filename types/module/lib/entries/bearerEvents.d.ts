import type { Workflow } from "../../Workflow.js";
/** The use damaged a target: the user's dealsDamage, once per use */
export declare function raiseDealsDamage(workflow: Workflow, target: TokenDocument.Implementation | undefined): Promise<void>;
export declare function registerBearerEvents(): void;
