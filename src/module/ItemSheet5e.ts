export var MidiItemSheet5e;

export function setupMidiItemSheet5e() {
  const baseClass = globalThis.dnd5e.applications.item.ItemSheet5e;
 MidiItemSheet5e = defineMidiItemSheet5eClass(baseClass);
  
}

let defineMidiItemSheet5eClass = (baseClass: any) => {
  return class MidiAttackActivitySheet extends baseClass {
    static PARTS = {
      ...super.PARTS,
      "midi-qol": {
        template: "modules/midi-qol/templates/midiPropertiesForm.hbs",
      }
    }
  }
}
