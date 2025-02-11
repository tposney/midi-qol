This is the first public release of midi for dnd5e v4. 
There have been quite a few release of midi for testing prior to this release and you are encouraged to read through the change log for the previous versions.

* If you have not yet migrated to v4 you **really really** should make a backup of your world before installing midi.
* It is **strongly recommended** that when you first run the upgraded world that you disable all modules so that dnd5e can do it's best to migrate items.
* There are likely to be issues with any items that end up having a utility effect created (this means any item that has other damage defined) so please check them once updated and midi is enabled.
* You must have dae 12.0.12 for midi to run. (which is also released).
* If this is the first time you have run midi with dnd4, there are quite a lot of changes:
  - midi now uses activities, most directly for attack activities that can also roll extra damage, such as a spider bite via an "other" activity. This replaces the previous "other damage" mechanism. 
    - Have a look at the SRD spider bite item plus the spider bite included in the midi sample items (which shows a few tweaks).
  - Most midi properties are being migrated from the item to activities, which is not yet complete. 
  - Use/active effect conditions are now per activity (rather than per item - although the existing per item conditions are still supported until they are deprecated).
    - Reaction activities utilise the Use condition to decide if the activity should be offered as a reaction option.
  - Support for a triggered activity on all midi activities, which allows you to chain a new activity after the first activity is complete. Have a look at ice knife as an examplue use case for this.
  - The previous mechanism for area effect items centered on the caster have been revisited.
      - Target range/self shape=radius/emanation will now auto place the template on the caster (the size of the template will scale with the size of the caster's token due to a dnd5e enhancement)
      - Target range/self shape=raidus/emanation - no template which will auto target tokens within range of the target. 
      - To avoid targeting the caster in the template put the special target "self" in the target type setting.
* For some items (dragon slayer, life stealer, wounding) there is a new way to mange those items. The items in the sample items compendium are "generator" items (which utilise a very clever idea from the dungeon master's guide foundry module) which allow you to drag the generator's effect (an enchantment) to a target weapon which will imbue it with the relevant changes. 