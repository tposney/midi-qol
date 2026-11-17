import { describe, expect, it, vi } from "vitest";

const activityTypes: Record<string, { documentClass?: unknown }> = {};
vi.mock("../src/midi-qol.js", () => ({ GameSystemConfig: { activityTypes } }));
const { adoptActivityType, graftOnto } = await import("../src/module/activities/graft.js");

function dnd5eClass() {
  class Base { describe() { return "base"; } }
  class Dnd5e extends Base {
    static DEFAULT_OPTIONS: Record<string, unknown> = { classes: ["dnd5e"], actions: { a: 1 } };
    static who() { return "dnd5e"; }
    use() { return "dnd5e.use"; }
    roll() { return "dnd5e.roll"; }
  }
  return Dnd5e;
}

describe("graftOnto", () => {
  it("installs midi's members on dnd5e's class; super reaches dnd5e's originals", () => {
    const Dnd5e = dnd5eClass();
    class Mixin extends Dnd5e { use() { return `mixin(${super.use()})`; } roll() { return `mixin(${super.roll()})`; } }
    class Midi extends Mixin { use() { return `midi(${super.use()})`; } }
    graftOnto(Midi, Dnd5e);
    const instance = new Dnd5e();
    expect(instance.use()).toBe("midi(mixin(dnd5e.use))");
    expect(instance.roll()).toBe("mixin(dnd5e.roll)");
    expect(instance.describe()).toBe("base");
  });

  it("installs statics, with super reaching dnd5e's, and merges DEFAULT_OPTIONS into dnd5e's own", () => {
    const Dnd5e = dnd5eClass();
    class Midi extends Dnd5e {
      static DEFAULT_OPTIONS = { actions: { b: 2 } };
      static who() { return `midi(${super.who()})`; }
    }
    graftOnto(Midi, Dnd5e);
    expect(Dnd5e.who()).toBe("midi(dnd5e)");
    expect(Dnd5e.DEFAULT_OPTIONS).toEqual({ classes: ["dnd5e"], actions: { a: 1, b: 2 } });
  });

  it("refuses a class that does not extend the one it is installed on", () => {
    class Other { }
    expect(() => graftOnto(class extends Other { }, dnd5eClass())).toThrow(/does not extend/);
  });
});

describe("adoptActivityType", () => {
  it("grafts the class and sheet onto the registered ones and keeps dnd5e's sheet in metadata", () => {
    class Sheet { tabs() { return ["dnd5e"]; } }
    class MidiSheet extends Sheet { tabs() { return [...super.tabs(), "midi"]; } }
    class Activity { static metadata = { type: "attack", sheetClass: Sheet }; use() { return "dnd5e"; } }
    class MidiActivity extends Activity {
      static metadata = { ...Activity.metadata, sheetClass: MidiSheet };
      use() { return `midi(${super.use()})`; }
    }
    activityTypes.attack = { documentClass: Activity };
    expect(adoptActivityType("attack", MidiActivity, MidiSheet)).toBe(Activity);
    expect(new Activity().use()).toBe("midi(dnd5e)");
    expect(new Sheet().tabs()).toEqual(["dnd5e", "midi"]);
    expect(Activity.metadata.sheetClass).toBe(Sheet);
  });

  it("does nothing for a type dnd5e does not register", () => {
    expect(adoptActivityType("nothing", class { })).toBeUndefined();
  });
});
