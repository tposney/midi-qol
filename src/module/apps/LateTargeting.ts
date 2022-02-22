import { log, debug, i18n, error, warn, noDamageSaves, cleanSpellName, MQdefaultDamageType, allAttackTypes, gameStats, debugEnabled, overTimeEffectsToDelete, geti18nOptions } from "../../midi-qol.js";
import { configSettings, autoRemoveTargets, checkRule } from "../settings.js";

class LateTargetingDialog extends Application {
  data: {
    //@ts-ignore
    actor: CONFIG.Actor.documentClass,
    //@ts-ignore
    item: CONFIG.Item.documentClass,
    user: User
  }

  //@ts-ignore .Actor, .Item
  constructor(actor: CONFIG.Actor.documentClass, item: CONFIG.Item.documentClass, user, options = {}) {
    super(options);
    this.data.actor = actor;
    this.data.item = item;
    this.data.user = user;
  }

  async getData(options = {}) {
    let data: any = mergeObject(this.data, await super.getData(options));

    this.data = data;
    return data;
  }
}
