import { saveOutcomeService, type SaveOutcomeContributor } from "../module/services/outcomeRules/service.js";
import { declareRule, ruleId, ruleOn } from "./registry.js";

/* Optional rule criticalSaves: a natural 20 saves and a natural 1 fails, whatever the DC */

const criticalSaves: SaveOutcomeContributor = {
  usesCriticals: true,
  for: ({ total, dc, critical, fumble }) => ({ success: (critical || total >= dc) && !fumble })
};

export function registerCriticalSavesRule() {
  const rule = declareRule({ id: ruleId("criticalSaves"), setting: "criticalSaves", service: "saveOutcome", label: "Critical saves (a natural 20 saves, a natural 1 fails)",
    settings: [{ key: "criticalSaves", type: "boolean", label: "midi-qol.CriticalSaves.Name", default: false }] });
  saveOutcomeService.register(rule.id, criticalSaves, { label: rule.label, available: () => ruleOn("criticalSaves") });
}
