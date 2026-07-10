# 02 — Engine Submodules (v2 — Pure Functions)

> `src/lib/engine/` — 10 ไฟล์, ~7,300 บรรทัด
> ระบบ engine รุ่นใหม่ที่ออกแบบตาม "D&D Engine Design Document" — pure functions, data-driven,
> deterministic, testable
>
> ⚠️ **สำคัญ**: ส่วนใหญ่ **ไม่ได้ใช้โดยตรงใน UI** — DnDSolo.tsx import 0 ครั้ง
> ใช้ผ่าน `engineAdapters.ts` เท่านั้น (ซึ่งก็ใช้แค่บางฟังก์ชัน)
> ดู [08-gaps/unwired-engine.md](../08-gaps/unwired-engine.md)

## สรุป Engine Submodules

| ไฟล์ | บรรทัด | Exports | Chapter | ใช้ใน UI? |
|---|---:|---:|---:|:---:|
| [`character.ts`](#characterts) | 945 | 61 | 01 | ⚠️ type only |
| [`actionEconomy.ts`](#actioneconomyts) | 580 | 27 | 02 | ❌ |
| [`combat.ts`](#combatts) | 816 | 38 | 03 | ❌ |
| [`magic.ts`](#magicts) | 877 | 40 | 04 | ❌ |
| [`equipment.ts`](#equipmentts) | 613 | 48 | 05 | ⚠️ type only |
| [`effects.ts`](#effectsts) | 864 | 42 | 06 | ❌ |
| [`skills.ts`](#skillsts) | 649 | 34 | 07 | ❌ |
| [`movement.ts`](#movementts) | 682 | 35 | 08 | ❌ |
| [`rest.ts`](#restts) | 725 | 34 | 10 | ❌ |
| [`dice.ts`](#dicets) | 541 | 21 | 09 | ❌ |
| **รวม** | **7,292** | **380** | | |

**หลักการออกแบบ**:
1. **Pure functions** — ไม่มี side effects, ทุกฟังก์ชันคืน object ใหม่
2. **Data-driven** — Item definitions, spell definitions, condition definitions เป็น data table
3. **Deterministic** — `dice.ts` รองรับ seeded RNG (`withSeed()`, `mulberry32()`)
4. **No UI imports** — ไม่ import React หรือ UI types
5. **Composable** — แต่ละ chapter อ้างอิง chapter อื่นผ่าน type imports

---

## character.ts
**Path**: `src/lib/engine/character.ts` | **บรรทัด**: 945 | **Exports**: 61 | **Chapter**: 01 (Character System)
**ใช้ใน UI?**: ⚠️ Type only (บาง type ถูก import ผ่าน srd.ts, open5e.ts)

### หน้าที่

**Character = Aggregate Root** — root entity ของระบบ
ออกแบบตามหลัก ECS-style: CharacterType กำหนดว่า character มี component อะไรบ้าง
(player/npc/monster/summon/companion/vehicle/object_creature — 7 ประเภท)

Character interface รุ่นนี้เป็น **reference-based** — ไม่ฝังข้อมูลทั้งหมดใน object เดียว
แต่อ้างอิงไปยังระบบอื่น (Combat, Magic, Inventory, Effects) ผ่าน `refs: ComponentRefs`

Lifecycle state machine: created → spawned → active → downed → dead → removed
พร้อม `LIFECYCLE_TRANSITIONS` table ที่กำหนด valid transitions

### Exports หลัก

| กลุ่ม | Export | บรรทัด | หน้าที่ |
|---|---|---:|---|
| **Identity** | `CharacterIdentity`, `CharacterType`, `CharacterTypeConfig`, `CHARACTER_TYPE_CONFIGS` | 49-138 | ID, name, type กำหนด component ที่ active |
| **Lifecycle** | `CharacterLifecycleState`, `LIFECYCLE_TRANSITIONS`, `canTransition(from, to)` | 144-161 | state machine |
| **Species/Class** | `SpeciesDef`, `BackgroundDef`, `ClassDef`, `SubclassDef`, `LevelData` | 187-305 | data definitions |
| **Ability** | `AbilityName`, `AbilityScore`, `getEffectiveScore(score)`, `getAbilityModifier(score)` | 306-347 | ability score + override (temp bonus) |
| **Proficiency** | `PROFICIENCY_BONUS_TABLE`, `getProficiencyBonus(totalLevel)` | 348-363 | PB table Lv.1-20 |
| **Saves** | `SavingThrow`, `getSaveModifier(...)` | 364-389 | saving throw calculation |
| **Skills** | `SkillInstance`, `getSkillModifier(...)`, `hasSkillAdvantage`, `hasSkillDisadvantage` | 391-429 | skill mod + adv/dis sources |
| **Size** | `CreatureSize`, `SIZE_SPACE`, `SIZE_REACH`, `CreatureType`, `CreatureTag` | 169-465 | tiny → gargantuan |
| **Character** | `Character` (interface), `CreateCharacterParams`, `createCharacter(params)` | 548-741 | aggregate root + factory |
| **Helpers** | `getScore`, `getMod`, `getPB`, `getSaveMod`, `getSkillMod`, `hasTag`, `addTag`, `removeTag` | 742-787 | getters |
| **State checks** | `isAlive`, `isDowned`, `isDead`, `isIncapacitated` | 788-808 |  |
| **Mutations** | `transitionLifecycle`, `applyDamageToCharacter`, `applyHealingToCharacter`, `rollDeathSave`, `addXP` | 810-937 | pure functions |

### Dependencies

```typescript
// ไม่ import อะไรจาก src/lib/ อื่น — เป็น root module
```

### สถานะการใช้งาน

- **UI**: ❌ ไม่ได้ใช้โดยตรง
- **Other engine modules**: ✅ ใช้แทบทุกไฟล์ (combat, magic, effects, equipment, movement, skills, rest) — เป็น type provider
- **srd.ts / open5e.ts**: ✅ ใช้ type `AbilityName` สำหรับ normalize API data
- **Tests**: ✅ test_character_engine, test_comprehensive, test_engine_all

---

## actionEconomy.ts
**Path**: `src/lib/engine/actionEconomy.ts` | **บรรทัด**: 580 | **Exports**: 27 | **Chapter**: 02 (Action Economy)
**ใช้ใน UI?**: ❌ ไม่ใช้

### หน้าที่

ระบบ **Action/Bonus/Reaction/Legendary/Mythic/Lair tracker**
แต่ละ action type เป็น data ใน `ACTION_TYPES` table (ไม่ใช่ hardcode enum)
`ActionTracker` เก็บ mutable state ของ combatant หนึ่งตัวใน turn หนึ่ง

Flow: `startTurn` → `resetTurnActions` → player declares action → `validateAction` → `consumeAction` → endTurn → reactions refresh on next turn

รองรับ: Action Surge (grantExtraAction), Haste, Ready Action (queue), Delay
และ resource tracking (Bardic Inspiration, Superiority Dice, Sorcery Points) ผ่าน `grantResource`/`consumeResource`

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `ActionType` (8 ประเภท) | 51 | action, bonus_action, reaction, movement, free, legendary, mythic, lair |
| `ACTION_TYPES` table | 80 | data-driven definitions |
| `ActionDefinition`, `STANDARD_ACTIONS`, `getActionDefinition(id)` | 175-211 |  |
| `ActionTracker` interface | 225 | mutable per-turn state |
| `createActionTracker(params)`, `resetTurnActions`, `resetRoundActions` | 244-291 | lifecycle |
| `validateAction(def, tracker)`, `canAct`, `hasAnyActionLeft` | 305-356 | checks |
| `consumeAction`, `consumeMovement`, `refundAction` | 374-427 | mutations |
| `grantExtraAction(tracker, source)`, `grantResource`, `consumeResource` | 433-481 | Action Surge, resources |
| `QueuedAction`, `checkReadyActions`, `queueReadyAction` | 485-555 | Ready action |
| `summarizeTracker(t)`, `listAvailableActions(tracker)` | 562-580 | UI hints |

### Dependencies

```typescript
// type-only imports (no execution deps)
```

### สถานะการใช้งาน

- **UI**: ❌
- **engine/combat.ts**: ✅ ใช้ (combat เรียก consumeAction เมื่อ resolveAttack)
- **Tests**: ✅ test_engine_all, test_comprehensive

---

## combat.ts
**Path**: `src/lib/engine/combat.ts` | **บรรทัด**: 816 | **Exports**: 38 | **Chapter**: 03 (Combat System)
**ใช้ใน UI?**: ❌ ไม่ใช้ — DnDSolo.tsx มี inline combat logic ของตัวเอง

### หน้าที่

**Flow Controller** ของ combat — เป็น state machine ของ turn lifecycle
แต่ **ไม่มี game logic** — delegate ทุกอย่างไปยัง Dice, Effects, ActionEconomy

Lifecycle: `createCombat` → `startCombat` → `startTurn` → (player acts) → `endTurn` → `nextCombatant` → ... → `endCombat`

รองรับ:
- Initiative (with tie-break: player wins)
- Lair actions (initiative 20, lose ties)
- Surprise (D&D 2024: Disadvantage on Initiative, ไม่ skip turn แล้ว)
- Attack resolution pipeline: roll → compare AC → apply damage → trigger events
- Critical hit (nat 20 → double damage dice via `calculateCriticalDamage`, `doubleDiceExpression`)
- Death saves (3 success stabilize, 3 failure = death)
- Opportunity attacks (`getOpportunityAttackTargets`)
- Contested actions: grapple, shove_push, shove_prone (`resolveContestedAction`)
- Flanking (optional rule, `isFlanking`)
- 13 damage types + categories (physical/elemental/energy/mental/pure)

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `CombatPhase` (7 phases) | 52 | initiative, round_start, turn_start, action, turn_end, round_end, ended |
| `Combatant` interface | 61 | characterId, initiative, position, ac, hp, resistances, conditions, surprised, deathSaves |
| `CombatState` interface | 90 | active, round, phase, initiativeOrder, grid, log, encounterXP, lairInitiative |
| `createCombat(combatants, gridW, gridH, options)` | 124 | sort by initiative desc |
| `nextTurn`, `endCombat`, `getCurrentCombatant`, `getCombatant` | 157-200 | lifecycle |
| `AttackRequest`, `AttackResult`, `resolveAttack(req)` | 226-383 | main attack pipeline |
| `DamageRequest`, `DamageResult`, `applyDamage(req)` | 384-451 | apply damage with resistances |
| `DAMAGE_TYPES`, `DAMAGE_CATEGORIES` | 452-480 | 13 types + categories |
| `DeathSaveResult`, `rollDeathSave`, `reviveFromDowned` | 481-540 |  |
| `getOpportunityAttackTargets` | 553 | leaving reach provokes |
| `ContestedActionRequest`, `resolveContestedAction` | 583-680 | grapple, shove |
| `isFlanking` | 682 | optional rule |
| `calculateCriticalDamage`, `doubleDiceExpression` | 703-733 | crit handling |
| `rollInitiative`, `sortInitiative`, `setSurprised`, `canActThisTurn` | 734-800 |  |
| `summarizeCombat`, `summarizeCombatant` | 802-816 | UI hints |

### Dependencies

```typescript
import { rollD20, rollDamage, type RollResult } from "./dice";
import type { DamageType } from "./equipment";
import type { Position } from "./movement";
```

### สถานะการใช้งาน

- **UI**: ❌ — DnDSolo.tsx มี `initCombat`, `enemyAttacks`, `playerCombatAction` inline อยู่แล้ว (~1,000 บรรทัด)
- **Tests**: ✅ test_engine_all, test_comprehensive, test_dnd_2024_compliance

⚠️ **Gap**: DnDSolo.tsx ควร delegate ไปที่ `engine/combat.ts` แต่ยังไม่ได้ทำ

---

## magic.ts
**Path**: `src/lib/engine/magic.ts` | **บรรทัด**: 877 | **Exports**: 40 | **Chapter**: 04 (Magic System)
**ใช้ใน UI?**: ❌

### หน้าที่

**Spell resolution pipeline** + **slot manager** + **concentration tracking**

รองรับ spellcasting types 5 แบบ:
- Prepared (Cleric, Druid, Paladin, Wizard) — `maxPreparedSpells2024()`
- Known (Bard, Ranger, Sorcerer, Warlock non-pact, Rogue Arcane Trickster, Fighter Eldritch Knight)
- Spellbook (Wizard)
- Pact Magic (Warlock) — `PACT_MAGIC_SLOTS` + `restorePactMagicSlots()`
- Innate (monsters, races)

Spell pipeline: `castSpell(req)` → validate (slots? components? LoS?) → `expendSpellSlot` → resolve (attack/save/heal/auto) → `beginConcentration` → trigger events

Concentration: ONE spell at a time per caster; CON save DC = `max(10, damage/2)`
`concentrationCheckDC(damageTaken)`, `checkConcentration`, `canConcentrate`, `beginConcentration`, `dropConcentration`

Ritual casting: `canCastRitual`, `ritualCastingTime(spell)` — 10 min extra time, no slot

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `SpellSchool`, `SpellLevel`, `SpellKind`, `CastingTime`, `SpellRange`, `SpellDuration` | 54-97 | type defs |
| `SpellComponent`, `SpellDef` | 99-156 | spell data |
| `SpellcastingType`, `SpellcastingCapability`, `maxPreparedSpells2024` | 157-223 | prepared spells calc |
| `SpellSlotState`, `FULL_CASTER_SLOTS`, `PACT_MAGIC_SLOTS`, `createFullCasterSlots`, `createPactMagicSlots`, `createHalfCasterSlots` | 255-357 | slot tables |
| `canCastSpell`, `expendSpellSlot`, `restoreAllSlots`, `restorePactMagicSlots`, `restoreSlots` | 358-456 | slot management |
| `ConcentrationInstance`, `concentrationCheckDC`, `checkConcentration`, `canConcentrate`, `beginConcentration`, `dropConcentration` | 459-547 | concentration |
| `canCastAsRitual`, `canCastRitual`, `ritualCastingTime` | 225-580 | ritual |
| `SpellCastRequest`, `SpellEffectResult`, `SpellCastResult`, `castSpell(req)` | 581-792 | main pipeline |
| `ComponentCheckResult`, `checkComponents` | 794-832 | V/S/M check |
| `SchoolSpecialization`, `summarizeSpell`, `summarizeSlots` | 833-875 | UI hints |

### Dependencies

```typescript
import type { AbilityName } from "./character";
import { rollD20, rollDamage, type RollResult } from "./dice";
import type { DamageType } from "./equipment";
```

### สถานะการใช้งาน

- **UI**: ❌
- **engine/rest.ts**: ✅ ใช้ `restoreAllSlots`, `restorePactMagicSlots`, `SpellSlotState`
- **Tests**: ✅ test_engine_all, test_comprehensive, test_dnd_2024_compliance

---

## equipment.ts
**Path**: `src/lib/engine/equipment.ts` | **บรรทัด**: 613 | **Exports**: 48 | **Chapter**: 05 (Items & Equipment)
**ใช้ใน UI?**: ⚠️ Type only (DamageType ถูก import ผ่าน srd.ts, open5e.ts)

### หน้าที่

**Data-driven item/equipment system** + **slot-based equipment** + **attunement tracking**

Item hierarchy: `ItemDef` → `WeaponDef` / `ArmorDef` / `ShieldDef` / `ConsumableDef` / `ToolDef` / `WondrousDef`

Equipment slot system 16 ช่อง: main_hand, off_hand (or two_handed), armor, shield, cloak, boots, gloves, bracers, belt, ring1, ring2, amulet, headband, head, back, wondrous

Attunement: max 3 attuned items per character — `getAttunedCount`, `canAttuneMore`, `beginAttunement`, `completeAttunement`, `breakAttunement`, `isAttuned`

D&D 2024 Weapon Mastery: 8 masteries (cleave, graze, nick, push, sap, slow, topple, vex) — data-driven
Armor DEX caps + don/doff times per type

Inventory: `InventoryState` + `addItem`, `removeItem`, `isEncumbered`, `encumbranceLevel` (none/light/heavy/over)

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `ItemRarity`, `ITEM_RARITIES` | 50-85 | common → artifact |
| `ItemCategory` | 86 | type defs |
| `ItemDef` | 103 | base interface |
| `WeaponProperty`, `WeaponMastery`, `WEAPON_MASTERIES` | 131-178 | finesse, light, thrown, ... |
| `DamageType` | 181 | 13 types — **type นี้ถูก import โดย srd/open5e** |
| `WeaponDef`, `ArmorDef`, `ArmorType`, `ARMOR_DEX_CAPS`, `ARMOR_DON_DOFF_TIMES` | 186-252 |  |
| `EquipmentSlot`, `EQUIPMENT_SLOTS`, `SLOT_ORDER`, `SLOT_COUNT` | 254-318 | 16 slots |
| `EquipmentState`, `createEmptyEquipment`, `canEquipToSlot`, `equipItem`, `unequipItem`, `findEquippedSlot`, `listEquippedItems` | 318-405 |  |
| `MAX_ATTUNED_ITEMS`, `getAttunedCount`, `canAttuneMore`, `beginAttunement`, `completeAttunement`, `breakAttunement`, `isAttuned` | 407-452 | attunement |
| `InventoryEntry`, `InventoryState`, `createEmptyInventory`, `addItem`, `removeItem`, `isEncumbered`, `encumbranceLevel` | 454-533 |  |
| `ConsumableDef`, `ToolDef`, `STANDARD_ITEMS`, `getItemDef` | 535-583 |  |
| `summarizeEquipment`, `getActiveEffectIds` | 585-613 | UI hints |

### Dependencies

```typescript
// type-only — no execution deps
```

### สถานะการใช้งาน

- **UI**: ❌ — DnDSolo ใช้ WEAPONS, ARMOR, MAGIC_ITEMS จาก `gameData.ts` (legacy)
- **srd.ts, open5e.ts**: ✅ ใช้ `DamageType` type
- **engine/combat.ts, magic.ts**: ✅ ใช้ `DamageType`, `WeaponDef`
- **Tests**: ✅ test_engine_all, test_comprehensive, test_equipment_inventory_objects

---

## effects.ts
**Path**: `src/lib/engine/effects.ts` | **บรรทัด**: 864 | **Exports**: 42 | **Chapter**: 06 (Effects & Conditions)
**ใช้ใน UI?**: ❌

### หน้าที่

**Conditions + buffs + auras + ongoing damage + transformations** — unified effect system

Effect = อะไรก็ตามที่ modify character's stats/behavior (รวมถึง 15 conditions มาตรฐาน + custom effects)
Effect lifecycle: `applyEffect` → `tickEffect` (decrement duration ทุก round) → `removeEffect` (cleanup)

Duration types: instant, rounds, minutes, hours, concentration, until_short_rest, until_long_rest, permanent

Stacking rules: replace, stack, refresh, ignore (data-driven per effect)

Modifier pipeline: แต่ละ effect สามารถ modify attack, damage, AC, save, skill, speed, initiative, ฯลฯ
`getAllModifiers`, `getTotalBonus`, `hasAdvantage`, `hasDisadvantage`, `getDiceBonuses`

Trigger system: `on_attack`, `on_hit`, `on_damage_taken`, `on_turn_start`, ฯลฯ
`fireTriggers` — สำหรับ reactive effects (Fire Shield, Aura of Protection)

Concentration: ONE concentration spell at a time per character
`concentrationCheckDC(damageTaken)` = max(10, damage/2)
`checkConcentration`, `canConcentrate`, `beginConcentration`, `breakConcentration`

15 STANDARD_CONDITIONS: blinded, charmed, deafened, frightened, grappled, incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned, unconscious, exhausted

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `EffectDurationType`, `EffectDuration`, `StackingRule`, `ModifierTarget`, `EffectModifier`, `EffectTrigger`, `EffectTriggerDef`, `EffectCategory`, `EffectDef`, `ActiveEffect` | 45-219 | data model |
| `StandardConditionId`, `STANDARD_CONDITIONS` | 220-392 | 15 conditions |
| `registerCondition`, `getConditionDef`, `registerEffect`, `getEffectDef` | 393-443 | registry |
| `applyEffect`, `removeEffect`, `removeAllOfEffect`, `breakConcentration`, `clearOnShortRest`, `clearOnLongRest` | 445-560 | lifecycle |
| `tickEffect`, `tickAllEffects` | 561-610 | per-round tick |
| `concentrationCheckDC`, `checkConcentration`, `canConcentrate`, `beginConcentration` | 611-660 | concentration |
| `getAllModifiers`, `getTotalBonus`, `hasAdvantage`, `hasDisadvantage`, `getDiceBonuses` | 661-740 | modifier pipeline |
| `getActiveTriggers`, `TriggerOutcome`, `fireTriggers` | 741-795 | triggers |
| `summarizeActiveEffects`, `hasCondition`, `listActiveConditions`, `isIncapacitatedByEffects`, `isConcentrating`, `getAbilityOverride` | 796-864 | queries |

### Dependencies

```typescript
import type { AbilityName } from "./character";
```

### สถานะการใช้งาน

- **UI**: ❌ — DnDSolo ใช้ `c.conditions[]` + `c.buffs[]` inline แบบง่าย ๆ
- **engine/rest.ts**: ✅ ใช้ `clearOnShortRest`, `clearOnLongRest`, `ActiveEffect`
- **Tests**: ✅ test_engine_all, test_comprehensive, test_conditions_effects, test_dnd_2024_compliance

---

## skills.ts
**Path**: `src/lib/engine/skills.ts` | **บรรทัด**: 649 | **Exports**: 34 | **Chapter**: 07 (Skills & Checks)
**ใช้ใน UI?**: ❌

### หน้าที่

**Skill resolution pipeline** + **expertise** + **passive checks** + **group/contested/tool checks**

18 standard skills (Athletics, Acrobatics, Sleight of Hand, Stealth, Arcana, History, Investigation, Nature, Religion, Animal Handling, Insight, Medicine, Perception, Survival, Deception, Intimidation, Performance, Persuasion)

Resolution pipeline: compute modifier → determine adv/dis → roll d20 (+ bonus dice like Guidance +1d4) → compare vs DC → trigger on_skill_check effects

Supports: passive checks (`passiveCheckScore`), group checks (majority succeeds), contested checks (Grapple, Stealth vs Perception), tool checks (Thieves' Tools, Herbalism Kit)

Standard DCs: very_easy(5), easy(10), medium(15), hard(20), very_hard(25), nearly_impossible(30)

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `StandardSkillId`, `SkillDef`, `STANDARD_SKILLS`, `registerSkill`, `getSkillDef` | 51-128 | skill definitions |
| `SkillInstance`, `SkillModifierInput`, `getSkillModifier` | 128-179 | modifier calc |
| `getSkillAdvantageState`, `getSkillDiceBonuses` | 180-199 | adv/dis + bonus dice |
| `CheckRequest`, `CheckResult`, `resolveCheck(req)` | 200-306 | main pipeline |
| `ContestRequest`, `ContestResult`, `resolveContest(req)` | 307-378 | grapple, stealth vs perception |
| `GroupCheckEntry`, `GroupCheckResult`, `resolveGroupCheck` | 379-432 | majority rule |
| `PassiveCheckRequest`, `passiveCheckScore` | 433-462 | 10 + modifier |
| `ToolProficiency`, `ToolCheckRequest`, `resolveToolCheck` | 463-511 | Thieves' Tools, etc. |
| `AbilityCheckRequest`, `resolveAbilityCheck` | 512-551 | raw ability check |
| `DifficultyClass`, `STANDARD_DCS`, `getDC` | 552-584 | DC table |
| `AdvantageSource`, `AdvantageEntry`, `resolveAdvantage` | 585-622 | multiple sources → net result |
| `summarizeSkills`, `resolveSkillAbility` | 623-649 | UI hints |

### Dependencies

```typescript
import type { AbilityName } from "./character";
import { rollD20, rollContest, passiveCheck, type RollResult } from "./dice";
```

### สถานะการใช้งาน

- **UI**: ❌ — DnDSolo ใช้ `SKILLS` table จาก `gameData.ts` + inline d20 rolls
- **Tests**: ✅ test_engine_all, test_expertise, test_comprehensive

---

## movement.ts
**Path**: `src/lib/engine/movement.ts` | **บรรทัด**: 682 | **Exports**: 35 | **Chapter**: 08 (Movement & Positioning)
**ใช้ใน UI?**: ❌

### หน้าที่

**3-Layer movement pipeline**: Capability → Execution → Resolution

- Layer 1 (Capability): `calculateSpeed()` — walk/fly/swim/climb/burrow speeds พร้อม modifiers
- Layer 2 (Execution): `calculateMovementCost()`, `applyDash()`, `applyDisengage()`
- Layer 3 (Resolution): `findPath()` — A* pathfinding, `canMoveTo()` — collision check

Position abstraction: supports grid (x,y), hex (q,r), or Theater of Mind (zone-based)
`gridDistance(a, b)` — Chebyshev (8-way), `distanceInFeet(a, b)` — grid × 5 ft

Movement modes: walk, fly, swim, climb, burrow, teleport (each has own speed + cost multiplier)

Terrain types: normal, difficult (2× cost), very_difficult (3×), impassable, hazardous (damage on enter)

Opportunity attacks: `getOpportunityAttackers()` — ตรวจว่าการเคลื่อนที่นี้ provoke OA จาก enemy ไหนบ้าง
`canMoveSafely()` — Disengage check

Forced movement: push, pull, drag, teleport — never provoke OA
`resolveForcedMovement(req)` — Thunderwave, Misty Step, ฯลฯ

Flying + fall risk: `checkFallRisk(flying, effectiveSpeed)`

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `Position`, `gridDistance`, `distanceInFeet`, `isAdjacent`, `isWithinReach` | 52-82 | position math |
| `MovementMode`, `MOVEMENT_COST_MULTIPLIERS`, `SpeedCapabilityInput`, `SpeedCapability`, `calculateSpeed` | 83-214 | speed calc |
| `TerrainType`, `TerrainDef`, `TERRAIN_TYPES`, `calculateMovementCost`, `calculatePathCost` | 215-285 | terrain |
| `MovementActionState`, `createMovementState`, `applyDash`, `applyDisengage`, `getDashMultiplier`, `getEffectiveMovement` | 286-358 | dash/disengage |
| `findPath`, `canMoveTo` | 359-467 | A* pathfinding |
| `ThreatRange`, `getOpportunityAttackers`, `canMoveSafely` | 468-512 | OA |
| `ForcedMovementType`, `ForcedMovementRequest`, `ForcedMovementResult`, `resolveForcedMovement` | 513-622 | push/pull/teleport |
| `FlyingState`, `checkFallRisk`, `summarizeMovement` | 623-667 | flying |
| `SIZE_SPACE`, `SIZE_REACH` | 669-680 | creature size tables |

### Dependencies

```typescript
import type { AbilityName, CreatureSize, SpeedSet } from "./character";
```

### สถานะการใช้งาน

- **UI**: ❌
- **engine/combat.ts**: ✅ ใช้ `Position`, `gridDistance` (type only)
- **Tests**: ✅ test_engine_all, test_comprehensive

---

## rest.ts
**Path**: `src/lib/engine/rest.ts` | **บรรทัด**: 725 | **Exports**: 34 | **Chapter**: 10 (Rest & Recovery)
**ใช้ใน UI?**: ❌

### หน้าที่

**Rest pipeline + recovery rules + downtime activities**

Rest types: Short Rest (1 hr), Long Rest (8 hr)

Short Rest:
- Spend Hit Dice (max = character level) — each die = class hit die + CON mod
- Recover class resources (Action Surge, Bardic Inspiration, Second Wind)
- Refresh Pact Magic slots

Long Rest (D&D 2024):
- Restore HP to max (no HD spend needed)
- Recover **ALL** spent Hit Dice (2024 change from 5e's "half total, min 1")
- Restore all standard spell slots
- Clear short/long-rest effects
- Reduce exhaustion by 1 level

Rest requirements: safe location, no interruptions
`canRest(character, restType, environment)` — validate
`RestInterruption` — combat/encounter/environment cancels rest

Recovery policies: `DEFAULT_RECOVERY` — data-driven per feature/resource

Downtime activities: crafting, training, research, work, recuperating, carousing
`STANDARD_DOWNTIME` table + `resolveDowntime(plan)`

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `RestType`, `RestTypeDef`, `REST_TYPES` | 61-94 | short_rest, long_rest |
| `HitDicePool`, `createHitDicePool`, `spendHitDie`, `recoverHitDice` | 95-169 | hit dice |
| `RestEnvironment`, `RestRequirement`, `canRest` | 170-250 | validation |
| `InterruptionType`, `RestInterruption`, `checkInterruption` | 251-358 |  |
| `ShortRestRequest`, `ShortRestResult`, `performShortRest` | 359-444 |  |
| `LongRestRequest`, `LongRestResult`, `performLongRest` | 445-523 |  |
| `DowntimeType`, `DowntimeDef`, `STANDARD_DOWNTIME`, `getDowntimeDef` | 524-624 | downtime |
| `RecoveryType`, `ResourceDef`, `STANDARD_RESOURCES`, `getResourceDef`, `getResourcesByRecovery` | 626-672 |  |
| `ExhaustionLevel`, `EXHAUSTION_LEVELS`, `getExhaustionLevel` | 673-699 | D&D 2024 exhaustion |
| `summarizeRestResult`, `summarizeHitDice`, `summarizeDowntimeOptions` | 700-725 | UI hints |

### Dependencies

```typescript
import type { AbilityName } from "./character";
import type { SpellSlotState } from "./magic";
import { restoreAllSlots, restorePactMagicSlots } from "./magic";
import type { ActiveEffect } from "./effects";
import { clearOnShortRest, clearOnLongRest } from "./effects";
import { rollDamage } from "./dice";
```

### สถานะการใช้งาน

- **UI**: ❌ — DnDSolo มี inline rest logic แบบง่าย
- **Tests**: ✅ test_engine_all, test_dnd_2024_compliance, test_comprehensive

---

## dice.ts
**Path**: `src/lib/engine/dice.ts` | **บรรทัด**: 541 | **Exports**: 21 | **Chapter**: 09 (Dice & Resolution)
**ใช้ใน UI?**: ❌ — DnDSolo ใช้ `d()` และ `rollD20()` แบบ inline

### หน้าที่

**Pure dice engine** — no game logic, no Character references

รองรับ full dice expression grammar:
- `NdS` — roll N dice of S sides (2d6)
- `NdS+M` — add modifier (1d20+5)
- `NdSkhK` — keep highest K dice (4d6kh3 — ability score roll)
- `NdSklK` — keep lowest K dice (2d20kl1 — disadvantage)
- `NdS!` — explode on max (1d6!)
- `NdSro<N` — reroll below N (1d20ro<2 — GWM)
- `NdSmin<N` — minimum floor (1d6min2)
- `rN=M` — replace result N with M

Roll types: d20 (with adv/dis), damage (with crit doubling), healing (no negatives), table (1..N)

Bonus/penalty dice: Bless +1d4, Bane -1d4, Bardic Inspiration +1d6

Reroll mechanics: Halfling Lucky (reroll nat 1), GWM (reroll low damage)

Roll history: every roll recorded for audit/replay — `enableRollHistory()`, `getRollHistory()`

**Deterministic mode**: `withSeed(seed)` returns seeded RNG (mulberry32) สำหรับ reproducible tests

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `DiceTerm` | 37 | parsed dice term (count, sides, modifier, keepHigh, keepLow, rerollBelow, explode, min, replace) |
| `DiceTermResult` | 53 | result per term (rolls, kept, dropped, subtotal) |
| `RollResult` | 65 | full result (expression, terms, total, history, isCrit, isFumble, adv/dis, bonus/penalty, rerolled) |
| `RollOptions` | 82 | adv, dis, bonusDice, penaltyDice, rerollOn, rerollDamageBelow, replaceResults, seed, isCritical |
| `RNG` | 99 | `() => number` |
| `mulberry32(seed)`, `withSeed(seed)` | 109-124 | seeded RNG |
| `parseExpression(expr)` | 154 | parser → DiceTerm[] |
| `roll(expression, options?)` | 273 | main function — pure |
| `rollD20(modifier, adv, opts)` | 407 | d20 with adv/dis + bonus dice |
| `rollDamage(damageExpr, isCrit, opts)` | 440 | damage roll (double dice on crit) |
| `rollTable(sides, seed?)` | 457 | 1..N |
| `rollHeal(healExpr, opts)` | 467 | healing (no negatives) |
| `rollContest(modA, modB, advA)` | 479 | grapple, shove |
| `passiveCheck(modifier, opts)` | 498 | 10 + modifier |
| `RollHistoryEntry`, `enableRollHistory`, `disableRollHistory`, `getRollHistory`, `clearRollHistory`, `_recordHistory` | 511-539 | audit log |

### Dependencies

```typescript
// ไม่ import อะไร — pure module
```

### สถานะการใช้งาน

- **UI**: ❌ — DnDSolo ใช้ `Math.floor(Math.random() * N) + 1` inline
- **engine/combat, magic, skills, rest**: ✅ ใช้ `rollD20`, `rollDamage`, `rollContest`
- **Tests**: ✅ test_dice_engine, test_engine_all, test_comprehensive

⚠️ **Gap**: engine มี deterministic dice แล้ว แต่ UI ยังใช้ Math.random() — replay ไม่ได้

---

## สรุป Engine Submodules

### สถานะการ wire ใน UI

| Chapter | ไฟล์ | ใช้ใน UI? | สถานะ |
|---|---|:---:|---|
| 01 Character | character.ts | ⚠️ type only | UI ใช้ Character ของตัวเอง inline |
| 02 ActionEconomy | actionEconomy.ts | ❌ | UI มี action tracking inline |
| 03 Combat | combat.ts | ❌ | UI มี initCombat/enemyAttacks/playerCombatAction inline (~1,000 บรรทัด) |
| 04 Magic | magic.ts | ❌ | UI มี castSRDSpell inline |
| 05 Equipment | equipment.ts | ⚠️ type only | UI ใช้ WEAPONS/ARMOR จาก gameData.ts |
| 06 Effects | effects.ts | ❌ | UI ใช้ c.conditions[] + c.buffs[] inline |
| 07 Skills | skills.ts | ❌ | UI ใช้ SKILLS + inline d20 |
| 08 Movement | movement.ts | ❌ | UI ไม่มี movement system |
| 09 Dice | dice.ts | ❌ | UI ใช้ Math.random() inline |
| 10 Rest | rest.ts | ❌ | UI มี inline rest logic |

### ทำไม engine/ ไม่ถูกใช้?

1. **engineAdapters.ts** เป็นสะพานเดียว แต่ adapter ยังไม่ครบ — มีแค่ emit* helpers + buff/concentration helpers + monster fetcher
2. **DnDSolo.tsx** เป็น god component 5,645 บรรทัด ที่ฝัง logic ไว้ inline มากเกินไป
3. **Type mismatch** — engine/character.ts (aggregate root) ≠ gameData.ts Character (flat struct)
4. **Migration path** ยังไม่ชัดเจน — ต้อง refactor DnDSolo ทีละส่วน

ดูแผนการ wire ใน [09-roadmap/migration-plan.md](../09-roadmap/migration-plan.md) และ [08-gaps/unwired-engine.md](../08-gaps/unwired-engine.md)
