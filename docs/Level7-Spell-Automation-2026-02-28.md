# Level 7 Spell Automation Analysis — 2026-02-28

## Already Implemented Elsewhere
| Spell | Where |
|-------|-------|
| Conjure Celestial | CPR |
| Crown of Stars | midi-item-showcase (legacy only) |
| Fire Storm | CPR |
| Teleport | CPR |

## Spells Being Implemented as midi-qol Sample Items

1. **Finger of Death** — Single target, CON save, 7d8+30 necrotic, half on save. Zombie-raising is narrative.
2. **Regenerate** — 4d8+15 instant healing + OverTime 1 HP/turn start for 1 hour.
3. **Divine Word** — CHA save, HP-threshold effects: 0-20 dies, 21-30 blinded/deafened/stunned 1hr, 31-40 blinded/deafened 10min, 41-50 deafened 1min. Requires onUse macro.
4. **Prismatic Spray** — DEX save, 60ft cone. Per-target 1d8 for ray type (fire/acid/lightning/poison/cold/petrified/special). Requires onUse macro.
5. **Reverse Gravity** — DEX save in 50ft-radius 100ft-high cylinder. Fall damage on failed save.
6. **Delayed Blast Fireball** — Multi-activity: cast (place bead), turn-end increment (1d6 accumulation), trigger explosion (20ft sphere DEX save, 12d6 + accumulated fire damage, half on save).

## Not Suitable for Automation
| Spell | Reason |
|-------|--------|
| Arcane Sword | Summon + repeated attacks on subsequent turns |
| Etherealness | Narrative/planar travel, no rolls |
| Forcecage | Narrative constraint, no meaningful save |
| Magnificent Mansion | Utility, no rolls |
| Mirage Arcane | Illusion/terrain, narrative |
| Plane Shift | Niche melee attack + CHA save variant |
| Project Image | Illusion, narrative |
| Resurrection | 1hr cast, -4 penalty tracking across long rests |
| Sequester | Utility, narrative |
| Simulacrum | Too complex for standard automation |
| Symbol | 6 modes, trigger-based, persistent area — very complex |
