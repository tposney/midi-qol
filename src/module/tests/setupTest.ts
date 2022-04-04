import { applySettings } from "../apps/ConfigPanel.js";
import { busyWait, resetActors, testCECondition, testCubContiion, testDOW, testMacroExecute, testRollAbilitySave, testRollAbilitySkill, testRollNoParams } from "./tests.js";

export function setupMidiTests() {
  if (!game?.user?.isGM) return;
  if (game.world.id !== "midi-test") return;
  applySettings("FullAuto");
  doTests();
}

function addEffect(actor: any, changes: any[]) {
}

async function doTests() {
  await busyWait(2);
  await doTest(testDOW, "damage only workflow");
  await doTest(testRollAbilitySave, "test Roll Ability Save");
  await doTest(testRollAbilitySkill, "test Roll Skill");
  await doTest(testRollNoParams, "test item.roll with no params - TAH");
  await doTest(testCubContiion, "Test Cub Condition Apply");
  await doTest(testCECondition, "Test CE Condition Apply");
  await doTest(testMacroExecute, "Text macro.itemMacro");


}

async function doTest(func: () => {}, label) {
  resetActors();
  let result;
  try {
    result = await func();
  } catch(err) {
    console.error(`Test ${label} failed`, err);
    result = false;
  }
  if (result) console.warn(`Test ${label} passed`);
  else console.error(`Test ${label} failed`);
}