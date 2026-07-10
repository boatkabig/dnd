# 02 — Domain Modules (v1 — Feature Systems)

> `src/lib/*.ts` — ไฟล์ที่ไม่ใช่ core-data, content-api, adapters, dungeon (ไฟล์อื่น ๆ ที่เหลือ ~35 ไฟล์)
> แบ่งเป็น Domain 1-35 ตาม architecture document
>
> โมดูลในหมวดนี้เป็น "feature systems" — แต่ละโมดูล implement กลไกของ D&D 5e/2024 ในด้านใดด้านหนึ่ง
> บางโมดูลถูก UI ใช้โดยตรง บางโมดูลใช้ผ่าน engineAdapters และบางโมดูลเป็น "unwired engine"

## สรุป Domain Modules (ตามกลุ่ม)

### Core gameplay (Domain 1-14)

| ไฟล์ | บรรทัด | Domain | ใช้ใน UI? | หน้าที่ |
|---|---:|---|:---:|---|
| diceEngine.ts | 391 | 9 | ❌ | RollTable + formula parser (legacy) |
| rollResolver.ts | 277 | 9 | ❌ | D20 resolution pipeline |
| skills.ts | 451 | 8 | ❌ | Skill system + expertise (legacy) |
| actionSystem.ts | 316 | 13 | ❌ | Action definitions (legacy) |
| combat.ts | 723 | 5 | ❌ | Legacy combat helpers |
| character.ts | 148 | 1 | ❌ | Legacy character (ดู [core-data.md](core-data.md)) |
| movement.ts | 468 | 8 | ❌ | Legacy movement helpers |
| conditions.ts | 418 | 11 | ❌ | 15 conditions definitions |
| effects.ts | 401 | 12 | ❌ | Spell effects + area shapes (legacy) |
| magic.ts | 370 | 4 | ❌ | Legacy magic helpers |
| resources.ts | 346 | 9 | ❌ | Resource pools (rage, ki, sorcery, lay on hands) |
| rest.ts | 312 | 23 | ❌ | Short/Long rest mechanics (v1) |
| features.ts | 642 | 9 | ❌ | Class features table (Lv.1-20, 12 classes) |
| equipment.ts | 275 | 5 | ❌ | Weapon/armor data (legacy) |
| items.ts | 193 | 3 | ❌ | Item definitions (legacy) |
| inventory.ts | 233 | 3 | ❌ | Inventory + container management |
| spells.ts | 140 | 4 | ❌ | Spell slot tables + helpers — **แต่ DnDSolo ใช้จริง** |
| time.ts | 434 | 24 | ❌ | WorldClock + calendar |

### Exploration & tactical (Domain 15-20)

| ไฟล์ | บรรทัด | Domain | ใช้ใน UI? | หน้าที่ |
|---|---:|---|:---:|---|
| objects.ts | 225 | 15 | ❌ | Scene objects: door, chest, trap, lever |
| environment.ts | 191 | 16 | ❌ | Weather, light, hazards |
| terrain.ts | 140 | 17 | ❌ | Terrain types + movement cost |
| vision.ts | 212 | 18 | ❌ | Vision types + light detection |
| stealth.ts | 218 | 19 | ❌ | Hide + detection |
| cover.ts | 275 | 20 | ❌ | Position, distance, cover, flanking |

### World & narrative (Domain 21-26)

| ไฟล์ | บรรทัด | Domain | ใช้ใน UI? | หน้าที่ |
|---|---:|---|:---:|---|
| exploration.ts | 469 | 21 | ❌ | Travel, search, traps |
| social.ts | 506 | 22 | ❌ | Social interaction system |
| monsters.ts | 410 | 25 | ❌ | Monster data model + AI behavior |
| world.ts | 424 | 26 | ❌ | MapNode, Location, Quest, Faction |

### Engine infrastructure (Domain 27-30)

| ไฟล์ | บรรทัด | Domain | ใช้ใน UI? | หน้าที่ |
|---|---:|---|:---:|---|
| ruleEngine.ts | 423 | 27 | ❌ | RuleRegistry + COMMON_RULES |
| events.ts | 442 | 28 | ❌ | EventBus + 30+ event types |
| aoe.ts | 381 | 29 | ❌ | Area effect calculations |
| gameState.ts | 494 | 30 | ❌ | (ดู [core-data.md](core-data.md)) |

### AI DM layer (Domain 31-35)

| ไฟล์ | บรรทัด | Domain | ใช้ใน UI? | หน้าที่ |
|---|---:|---|:---:|---|
| dialogue.ts | 515 | 31 | ✅ | Dialogue memory + NPC attitude + intent analysis |
| planning.ts | 566 | 32 | ✅ | Tactical AI planning |
| narrative.ts | 526 | 33 | ✅ | StoryArc, Scene, Pacing |
| encounter.ts | 558 | 34 | ✅ | Difficulty calculator + encounter tables |
| content.ts | 505 | 35 | ✅ | Homebrew content registry |

### Index

| ไฟล์ | บรรทัด | หน้าที่ |
|---|---:|---|
| domains.ts | 275 | Domain index + helpers (re-exports ทั้งหมด) |

---

## diceEngine.ts
**Path**: `src/lib/diceEngine.ts` | **บรรทัด**: 391 | **Exports**: 13 | **Domain**: 9 (Dice) | **ใช้ใน UI?**: ❌

### หน้าที่

Dice engine รุ่น legacy — มี formula parser (`parseExpression`), `roll()`, `rollD20()`, `rollDamage()`, `rollTable()`, `rollWildMagic()`, `rollContest()`, `passiveCheck()`

⚠️ ทับซ้อนกับ `engine/dice.ts` รุ่นใหม่ — engine/dice.ts มี deterministic mode (`withSeed`) และ roll history (`enableRollHistory`) ที่ diceEngine.ts ไม่มี

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `DiceTerm`, `RollResult`, `RollContext` | 14-58 | types |
| `parseExpression(expr)` | 59 | parser |
| `roll(expr, ctx?)` | 161 | main function |
| `rollSimple(expr)` | 304 | simple variant คืน {total, rolls, mod, formula} |
| `rollD20(modifier, adv, ctx?)` | 316 | d20 with adv/dis |
| `rollDamage(expr, isCrit, ctx?)` | 343 | damage (double dice on crit) |
| `rollRecharge(threshold)` | 354 | monster recharge 5-6 / 6 |
| `rollTable(sides)` | 360 | 1..N |
| `rollWildMagic()` | 365 | Wild Magic surge |
| `rollContest(modA, modB, advA)` | 370 | grapple, shove |
| `passiveCheck(modifier)` | 388 | 10 + modifier |

### Dependencies
ไม่ import จาก module อื่น — pure module

### สถานะการใช้งาน
- **UI**: ❌ — DnDSolo ใช้ `Math.floor(Math.random() * N) + 1` inline
- **Other modules**: ✅ ใช้โดย engineAdapters.ts, dialogue.ts, encounter.ts, narrative.ts, planning.ts, content.ts, srd.ts, และอีกหลายไฟล์ (10 importers)
- **Tests**: ✅ test_roll_system, test_comprehensive

---

## rollResolver.ts
**Path**: `src/lib/rollResolver.ts` | **บรรทัด**: 277 | **Exports**: 15 | **Domain**: 9 | **ใช้ใน UI?**: ❌

### หน้าที่

D20 resolution pipeline — แปลง character + action → roll + modifiers → result
ครอบคลุม: ability checks, skill checks, saving throws, attack rolls, damage rolls, healing, initiative, death saves, hit dice, contests, passive checks

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `abilityMod(c, ability)` | 15 | ability modifier |
| `savingThrowMod(c, ability)` | 19 | save mod (proficient? +PB) |
| `skillCheckMod(c, skillKey, classSkills, extraSkills)` | 36 | skill mod |
| `RollOptions` | 64 | adv, dis, bonus, reroll |
| `rollAbilityCheck(c, ability, dc, options?)` | 78 |  |
| `rollSkillCheck(...)` | 104 |  |
| `rollSavingThrow(...)` | 132 |  |
| `rollAttack(...)` | 159 |  |
| `rollDamageRoll(...)` | 192 |  |
| `rollHealing(healExpr)` | 203 |  |
| `rollInitiative(dexMod, options?)` | 210 |  |
| `rollDeathSave()` | 234 |  |
| `rollHitDice(hitDie, conMod)` | 250 |  |
| `rollContest(...)` | 258 |  |
| `rollPassive(modifier)` | 274 |  |

### Dependencies
```typescript
import { ABILS, mod, profByLevel, SKILLS, ... } from "./gameData";
import { roll, rollD20, rollDamage, ... } from "./diceEngine";
```

### สถานะการใช้งาน
- **UI**: ❌ — DnDSolo ใช้ inline rolls
- **Other modules**: ✅ ใช้โดย engineAdapters.ts และอื่น ๆ
- **Tests**: ✅ test_roll_system, test_comprehensive

---

## conditions.ts
**Path**: `src/lib/conditions.ts` | **บรรทัด**: 418 | **Exports**: 24 | **Domain**: 11 | **ใช้ใน UI?**: ❌

### หน้าที่

15 SRD conditions แบบละเอียด — แต่ละ condition มี:
- ผลต่อ attack rolls (adv/dis)
- ผลต่อ ability checks
- ผลต่อ saving throws
- ผลต่อ speed
- ผลต่อ concentration
- การ interact กับ conditions อื่น

รวมถึง helper functions: `hasCondition`, `addCondition`, `removeCondition`, `getConditionEffectOn` (attack/check/save/speed)

### Exports หลัก
- `Condition`, `ConditionId`, `CONDITIONS` table (15 entries)
- `hasCondition`, `addCondition`, `removeCondition`
- `getConditionEffectOnAttack`, `getConditionEffectOnCheck`, `getConditionEffectOnSave`, `getConditionEffectOnSpeed`
- `isIncapacitating`, `getIncapacitatingConditions`
- `summarizeConditions`

### Dependencies
ไม่ import จาก module อื่น — pure data

### สถานะการใช้งาน
- **UI**: ❌ — DnDSolo ใช้ `c.conditions[]` + `CONDITIONS_TH` จาก gameData.ts แบบ inline
- **Tests**: ✅ test_conditions_effects

---

## effects.ts (legacy)
**Path**: `src/lib/effects.ts` | **บรรทัด**: 401 | **Exports**: 17 | **Domain**: 12 | **ใช้ใน UI?**: ❌

### หน้าที่

Spell effects + area shapes (legacy) — เก็บ spell effect definitions + helpers
⚠️ ทับซ้อนกับ `engine/effects.ts` รุ่นใหม่ (ซึ่งมี modifier pipeline + trigger system ที่ซับซ้อนกว่า)

### Exports หลัก
- `SpellEffect`, `SpellEffectKind`, `AreaShape`, `SpellEffectArea`
- `EFFECTS` table (spell effect definitions)
- `applyEffect`, `getEffectModifiers`, `hasConcentrationEffect`

### Dependencies
ไม่ import จาก module อื่น

### สถานะการใช้งาน
- **UI**: ❌
- **Tests**: ✅ test_conditions_effects, test_comprehensive

---

## features.ts
**Path**: `src/lib/features.ts` | **บรรทัด**: 642 | **Exports**: 21 | **Domain**: 9 | **ใช้ใน UI?**: ❌

### หน้าที่

Class features table (Lv.1-20, 12 classes) — data-driven feature definitions
รวมถึง: scaling (Cantrip damage scales with character level, Sneak Attack +1d6 / 2 levels),
recovery type (short_rest, long_rest, dawn, recharge_5_6, recharge_6),
trigger events (on_attack, on_hit, on_damage_taken, on_turn_start, on_kill, ฯลฯ)

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `FeatureSource`, `FeatureType`, `FeatureTriggerEvent`, `RecoveryType` | 21-46 | type defs |
| `FeatureResource`, `FeatureEffectData`, `FeatureScaling`, `FeatureRequirement`, `FeatureDef` | 48-159 | data model |
| `FEATURE_LIBRARY` | 166 | main feature table (12 classes × 20 levels) |
| `getCharacterFeatures(...)` | 481 | ดึง features ที่ character มี |
| `canActivateFeature(...)`, `consumeFeatureResource`, `restoreFeatureResources` | 518-582 |  |
| `getTriggeredFeatures(features, event)`, `getPassiveFeatures`, `getReactionFeatures` | 583-603 |  |
| `getScalingValue(feature, level)`, `processFeatureEffects(...)` | 604-642 |  |

### Dependencies
ไม่ import จาก module อื่น — pure data + helpers

### สถานะการใช้งาน
- **UI**: ❌ — DnDSolo ใช้ `FEATURES` table จาก gameData.ts แบบ inline
- **Tests**: ✅ test_features_resources, test_comprehensive

---

## resources.ts
**Path**: `src/lib/resources.ts` | **บรรทัด**: 346 | **Exports**: 9 | **Domain**: 9 | **ใช้ใน UI?**: ❌

### หน้าที่

Resource pools — Rage, Ki, Sorcery Points, Lay on Hands, Bardic Inspiration, Superiority Dice, ฯลฯ
`ResourceRegistry` class เก็บ resource definitions + helpers สำหรับ create/consume/restore

### Exports หลัก
- `ResourceType`, `RecoveryType`, `Resource`, `ResourceRegistry` (class)
- `createClassResources(cls, level)`, `createSpellSlotResources`, `createHPResources`, `createDeathSaveResources`, `createItemChargeResource`

### Dependencies
ไม่ import จาก module อื่น

### สถานะการใช้งาน
- **UI**: ❌ — DnDSolo ใช้ `c.rageUsed`, `c.kiUsed`, `c.sorceryPoints`, `c.layOnHandsPool`, ฯลฯ inline ใน Character interface
- **Tests**: ✅ test_features_resources

---

## spells.ts
**Path**: `src/lib/spells.ts` | **บรรทัด**: 140 | **Exports**: 8 | **Domain**: 4 | **ใช้ใน UI?**: ✅ **ใช้จริง**

### หน้าที่

Spell slot tables + helpers — bridge ระหว่าง gameData.ts (SLOT_TABLE) กับ srd.ts (fetchSpell)
compute AC, spell attack mod, spell DC, get slot table per class/level

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `computeAC(c)` | 22 | AC = base + DEX (or armor) + shield + buffs (Mage Armor, Shield, etc.) |
| `getSpell(index, slotLevel?, charLevel?)` | 67 | async — ดึง spell จาก srd.ts |
| `getClassSpellIndices(className, level)` | 80 | ดึง spell list ของ class |
| `getClassSpellbook(className, maxLevel)` | 92 | ดึง spellbook |
| `spellAtkMod(c)` | 102 | spell attack modifier |
| `spellDC(c)` | 105 | spell save DC = 8 + PB + casting mod |
| `getSlotTable(cls, level)` | 112 | slot table per class/level |
| `maxSpellLevel(cls, charLevel)` | 125 | ดู max spell level |
| `CLASSES`, `SLOT_TABLE`, `HALF_CASTER_SLOTS` (re-export) | 139 | จาก gameData.ts |

### Dependencies
```typescript
import { CLASSES, SLOT_TABLE, HALF_CASTER_SLOTS } from "./gameData";
import { fetchSpell } from "./srd";
```

### สถานะการใช้งาน
- **UI**: ✅ — DnDSolo ใช้ `computeAC`, `spellAtkMod`, `spellDC`, `getSlotTable`, `maxSpellLevel`, `getClassSpellIndices`
- **Tests**: ❌ ไม่มี test โดยตรง

---

## actionSystem.ts (legacy)
**Path**: `src/lib/actionSystem.ts` | **บรรทัด**: 316 | **Exports**: 9 | **Domain**: 13 | **ใช้ใน UI?**: ❌

### หน้าที่

Action definitions (legacy) — list ของ actions ที่ character ทำได้ใน combat
รวม prerequisites, resource cost, ผลที่เกิด

⚠️ ทับซ้อนกับ `engine/actionEconomy.ts` รุ่นใหม่

### Exports หลัก
- `Action`, `ActionCategory`, `ActionPrerequisite`
- `ACTIONS` table (Attack, Cast Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use Object, ฯลฯ)
- `getAvailableActions(state)`, `canPerformAction`, `performAction`

### Dependencies
```typescript
import type { CharacterState } from "./character";
```

### สถานะการใช้งาน
- **UI**: ❌
- **Other modules**: ✅ character.ts (legacy) ใช้ `getAvailableActions` ใน `canTakeAction`
- **Tests**: ✅ test_actions

---

## combat.ts (legacy), movement.ts (legacy), magic.ts (legacy), equipment.ts (legacy), character.ts (legacy), items.ts, inventory.ts
**Path**: `src/lib/{combat,movement,magic,equipment,character,items,inventory}.ts` | **บรรทัด**: 723+468+370+275+148+193+233 = 2,410 | **ใช้ใน UI?**: ❌ (ทั้งหมด)

⚠️ **Technical Debt**: ไฟล์เหล่านี้เป็น legacy versions ที่ทับซ้อนกับ `engine/` รุ่นใหม่
จาก import graph — ไม่มีใคร import (นอกจาก test files) → อาจเป็น dead code

ดู [08-gaps/technical-debt.md](../08-gaps/technical-debt.md) สำหรับรายละเอียด

### สถานะการใช้งาน (รวม)
- **UI**: ❌ ทั้งหมด
- **Tests**: ✅ test_combat (legacy), test_equipment_inventory_objects (legacy)
- **Recommendation**: ลบทิ้งได้หลังจาก migration เสร็จ

---

## rest.ts (v1)
**Path**: `src/lib/rest.ts` | **บรรทัด**: 312 | **Exports**: 20 | **Domain**: 23 | **ใช้ใน UI?**: ❌

### หน้าที่

Short/Long rest mechanics (v1) — เวอร์ชันเบา ๆ ของ `engine/rest.ts`
มี ShortRestInput/Result, LongRestInput/Result, RestRequirement, RestInterruption, RecoveryPolicy, DowntimeActivity

### Exports หลัก
- `RestType`, `RestDefinition`, `REST_DEFINITIONS`
- `performShortRest`, `performLongRest`
- `RestRequirement`, `canRest`
- `RestInterruption`, `applyInterruption`
- `RecoveryPolicy`, `DEFAULT_RECOVERY`
- `DowntimeActivity`, `DowntimePlan`, `DowntimeResult`, `resolveDowntime`

### Dependencies
```typescript
import { EXHAUSTION_LEVELS } from "./gameData";
```

### สถานะการใช้งาน
- **UI**: ❌ — DnDSolo มี inline rest logic
- **Tests**: ✅ test_comprehensive

---

## time.ts
**Path**: `src/lib/time.ts` | **บรรทัด**: 434 | **Exports**: 34 | **Domain**: 24 | **ใช้ใน UI?**: ❌ (ใช้ผ่าน engineAdapters)

### หน้าที่

WorldClock + calendar system — 6 sub-systems:
- 24.1 TimeScale — unit conversion (round, minute, hour, day, week, month, year)
- 24.2 CombatTime — CombatClock with initiative order
- 24.3 Duration — spell/feature durations (rounds, minutes, hours, days, concentration)
- 24.4 Timer — start/pause/resume/expire timers
- 24.5 Calendar — Forgotten Realms calendar (12 months × 30 days + 5 holidays)
- 24.6 TimeEvents — schedule events at specific world time

`WorldClock` class — singleton-style, holds `GameTime` (totalSeconds)
Method: `advance(seconds)`, `advanceByUnit(amount, unit)`, `scheduleEvent(spec)`, `checkEvents()`

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `TimeScaleUnit`, `UNIT_TO_SECONDS` | 21-37 | round(6s), minute(60), hour(3600), day(86400), ... |
| `GameTime`, `createTime`, `advanceTime`, `advanceByUnit`, `formatGameTime` | 38-78 |  |
| `CombatClock`, `createCombatClock`, `nextTurn`, `currentCombatantId` | 80-130 | combat time tracking |
| `DurationUnit`, `Duration`, `durationToSeconds`, `formatDuration` | 131-181 | spell durations |
| `Timer`, `startTimer`, `isTimerExpired`, `timerRemainingSeconds`, `pauseTimer`, `resumeTimer` | 182-241 |  |
| `Season`, `CalendarDate`, `CalendarDefinition`, `FORGOTTEN_REALMS_CALENDAR`, `gameTimeToDate`, `getSeason`, `isHoliday`, `formatCalendarDate` | 242-319 |  |
| `TimeEventTrigger`, `TimeEvent`, `scheduleTimeEvent`, `checkTimeEvents` | 320-378 |  |
| `WorldClock` (class) | 379 | singleton-style clock |

### Dependencies
ไม่ import จาก module อื่น — pure module

### สถานะการใช้งาน
- **UI**: ❌ — แต่ engineAdapters.ts ใช้ `WorldClock` (Section 1: getWorldClock, advanceHours, ฯลฯ) เป็น singleton
- **Other modules**: ✅ engineAdapters.ts, gameState.ts (type only)
- **Tests**: ✅ test_all_domains, test_comprehensive

---

## objects.ts (Domain 15), environment.ts (16), terrain.ts (17), vision.ts (18), stealth.ts (19), cover.ts (20)

กลุ่ม Exploration & tactical — ทั้งหมด **ไม่ใช้ใน UI** (เป็น unwired engine)

### objects.ts
**Path**: `src/lib/objects.ts` | **บรรทัด**: 225 | **Exports**: 13 | **Domain**: 15

Scene objects: door, chest, trap, lever, statue, fountain, altar, ฯลฯ
- `SceneObjectType`, `OBJECT_TYPE_TH`, `SceneObject`, `ObjectState`, `ObjectInteraction`
- `canInteractObject`, `interactObject`, `damageObject`
- `ObjectTrigger`, `checkTriggers`
- `createDoor(id, locked, lockDC, pos)`, `createChest(id, loot, locked, lockDC, pos)`, `createTrap(id, ...)`

### environment.ts
**Path**: `src/lib/environment.ts` | **บรรทัด**: 191 | **Exports**: 20 | **Domain**: 16

Weather, light, hazards:
- `EnvironmentState`, `WeatherType`, `WeatherState`, `WEATHER_PRESETS`
- `LightLevel`, `LightingState`, `LightSource`, `getLightLevelAt(pos, sources, timeOfDay)`
- `TemperatureLevel`, `TemperatureState`, `TEMPERATURE_PRESETS`
- `EnvironmentalHazard`, `NaturalEffect`, `MagicalEnvironment`
- `EnvInteraction`, `canInteractWithEnvironment`
- `EnvironmentEvent`, `createEnvironment`

### terrain.ts
**Path**: `src/lib/terrain.ts` | **บรรทัด**: 140 | **Exports**: 13 | **Domain**: 17

Terrain types + movement cost:
- `TerrainType` (normal, difficult, very_difficult, impassable, hazardous, water, ice, mud, ฯลฯ)
- `TERRAIN_DEFS` (movement cost multipliers)
- `TerrainFeature` (trees, rocks, walls, hills, rivers, cliffs, ฯลฯ) + `TERRAIN_FEATURES`
- `TerrainInteraction` (climb, swim, jump, dig, hide, search)
- `Biome` (forest, desert, mountain, swamp, plains, tundra, coast, underground, urban) + `BIOME_CONFIGS`
- `generateTerrainSquare(config)`

### vision.ts
**Path**: `src/lib/vision.ts` | **บรรทัด**: 212 | **Exports**: 15 | **Domain**: 18

Vision types + light detection:
- `VisionType` (normal, darkvision, blindsight, tremorsense, truesight) + `VISION_TYPES`
- `canSeeInLight(visions, light)`
- `hasLineOfSight(from, to, blockers)`
- `VisibilityState`, `getVisibility(...)`
- `SoundEvent`, `canHearSound`, `ScentEvent`
- `passivePerception(wisScore, proficient, charLevel, expertise)`
- `DetectionResult`, `detectWithPassive`, `detectWithActive`, `detectWithSpecialSense`

### stealth.ts
**Path**: `src/lib/stealth.ts` | **บรรทัด**: 218 | **Exports**: 16 | **Domain**: 19

Hide + detection:
- `HideCheck`, `canHide`
- `StealthResult`, `rollStealth`
- `HiddenState`, `createHiddenState`, `revealHidden`, `updateHiddenFrom`
- `activeSearch`, `isInvisible`, `isHidden`
- `getDetectionDifficulty`
- `checkSurprise` (D&D 2024: surprise → Disadvantage on Initiative)
- `TrackResult`, `rollTracking`
- `getStealthModifiers`

### cover.ts
**Path**: `src/lib/cover.ts` | **บรรทัด**: 275 | **Exports**: 26 | **Domain**: 20

Position, distance, cover, flanking:
- `Position`, `getDistance`, `getGridDistance`, `isMeleeRange`, `isWithinRange`
- `CoverLevel` (none, half, three_quarter, total) + `COVER_AC_BONUS`, `COVER_DEX_SAVE_BONUS`, `COVER_LABEL_TH`
- `calculateCover(attacker, target, obstacles)` — ray casting
- `hasLineOfAttack`, `hasHighGround`, `getHighGroundBonus`
- `FormationType` (line, circle, scattered, tight, flanking), `isFlanking`, `isChokePoint`
- `ForcedMovementType`, `ForcedMovement`, `createPush`, `createPull`, `createKnockback`, `createTeleport`, `createFall`
- `PositionEvent`, `PositionTrigger`, `checkPositionTriggers`

### สถานะการใช้งาน (ทั้งกลุ่ม 15-20)
- **UI**: ❌ ทั้งหมด
- **Tests**: ✅ test_env_terrain_vision_stealth_cover, test_comprehensive, test_all_domains

---

## exploration.ts (Domain 21)
**Path**: `src/lib/exploration.ts` | **บรรทัด**: 469 | **Exports**: 33 | **ใช้ใน UI?**: ❌

### หน้าที่

Domain 21: Exploration — 10 sub-systems:
- 21.1 ExplorationMode (dungeon, wilderness, urban, travel)
- 21.2 Travel (TravelPlan, estimateTravelTime)
- 21.3 TravelPace (fast/normal/slow + PACE_EFFECTS)
- 21.4 Navigation (survival, nature, map, tool)
- 21.5 ExplorationTurn (10-minute turns)
- 21.6 Search (SearchAttempt, resolveSearch)
- 21.7 Investigation (clues, investigateClue)
- 21.8 Traps (TrapDefinition, TrapEffect, isTrapTriggered, detectTrap, disableTrap)
- 21.9 ExplorationEvents (DEFAULT_EVENT_TABLE, rollExplorationEvent)
- 21.10 summarizeExploration

### Exports หลัก
- `ExplorationMode`, `ExplorationState`, `ExplorationLogEntry`, `createExplorationState`, `logExplorationAction`
- `TravelPlan`, `estimateTravelTime`, `TravelPace`, `PaceEffect`, `PACE_EFFECTS`
- `NavigationMethod`, `NavigationCheck`, `resolveNavigation`
- `ExplorationTurn`, `startExplorationTurn`, `advanceExplorationTurn`
- `SearchTarget`, `SearchAttempt`, `resolveSearch`
- `InvestigationClue`, `investigateClue`
- `TrapDefinition`, `TrapEffect`, `TrapTriggerType`, `isTrapTriggered`, `detectTrap`, `disableTrap`
- `ExplorationEventType`, `ExplorationEventEntry`, `DEFAULT_EVENT_TABLE`, `rollExplorationEvent`
- `summarizeExploration`

### Dependencies
ไม่ import จาก module อื่น — pure module

### สถานะการใช้งาน
- **UI**: ❌
- **Tests**: ✅ test_all_domains, test_comprehensive

---

## social.ts (Domain 22)
**Path**: `src/lib/social.ts` | **บรรทัด**: 506 | **Exports**: 32 | **ใช้ใน UI?**: ❌

### หน้าที่

Social interaction system — 8 sub-systems:
- 22.1 SocialInteraction (type, target, context)
- 22.2 NPCAttitude (friendly, indifferent, hostile)
- 22.3 DialogueSystem (DialogueNode, DialogueResponse, DialogueState)
- 22.4 SocialChecks (persuasion, deception, intimidation, insight, performance)
- 22.5 Influence (InfluenceState, applyInfluenceChange)
- 22.6 Reputation (per NPC, per faction, per region)
- 22.7 Bargaining (BargainingContext, resolveBargaining)
- 22.8 Information (secret, rumor, quest, location — revealInfo, attemptInfoGather)

### Exports หลัก
- `SocialInteractionType`, `SocialInteraction`, `NPCAttitude`, `influenceDC`, `InfluenceResult`, `resolveInfluence`
- `ATTITUDE_MODIFIERS`
- `DialogueNode`, `DialogueResponse`, `DialogueState`, `startDialogue`, `chooseDialogueResponse`
- `SocialSkill`, `SocialCheckRequest`, `resolveSocialCheck`
- `InfluenceState`, `createInfluence`, `applyInfluenceChange`, `attitudeFromInfluence`
- `ReputationScope`, `ReputationEntry`, `ReputationTracker`, `setReputation`, `adjustReputation`, `getReputation`
- `BargainingContext`, `resolveBargaining`
- `InfoType`, `InfoPiece`, `revealInfo`, `attemptInfoGather`
- `createNPCSocialProfile`

### Dependencies
ไม่ import จาก module อื่น

### สถานะการใช้งาน
- **UI**: ❌ — DnDSolo ใช้ LLM สำหรับ social ทั้งหมด (ผ่าน /api/dm)
- **Tests**: ✅ test_all_domains, test_comprehensive

---

## monsters.ts (Domain 25)
**Path**: `src/lib/monsters.ts` | **บรรทัด**: 410 | **Exports**: 36 | **ใช้ใน UI?**: ❌ (ใช้ผ่าน srd.ts adapter)

### หน้าที่

Monster data model + AI behavior — 7 sub-systems:
- 25.1 CreatureBase (size, type, alignment, speed)
- 25.2 MonsterStats (hp, ac, abilities, saves, skills, passivePerception, languages)
- 25.3 MonsterAction (action, bonus, reaction, legendary, mythic, lair) + recharge
- 25.4 MonsterAbility (feature, spell, trait, attack, legendary, legendary_resistance, lair_action)
- 25.5 AIBehavior (aggressive, defensive, tactical, opportunistic, pack, solitary, ฯลฯ) + decideAIAction
- 25.6 NPCData (memory, relationships) + addNPCMemory, adjustRelationship
- 25.7 CreatureState (status: alive, downed, dead, incapacitated, restrained, ฯลฯ) + updateCreatureHP, markDead, canAct

รวมถึง LairAction + `shouldTriggerLairAction`

### Exports หลัก
- `CreatureType`, `CreatureSize`, `Alignment`, `CreatureBase`, `SIZE_TO_SPACE_FT`
- `AbilityScores`, `MonsterStats`, `abilityModifier`, `crToXP`, `crToProficiencyBonus`
- `ActionType`, `MonsterAction`, `canUseAction`, `useAction`, `rollRecharge`, `resetRecharge`
- `AbilityKind`, `MonsterAbility`
- `AIPattern`, `AIBehavior`, `AIPriority`, `decideAIAction`
- `NPCData`, `NPCMemoryEntry`, `npcRemembers`, `addNPCMemory`, `adjustRelationship`
- `CreatureStatus`, `CreatureState`, `updateCreatureHP`, `markDead`, `canAct`
- `MonsterDefinition`, `NPCTemplate`, `LairAction`, `shouldTriggerLairAction`

### Dependencies
ไม่ import จาก module อื่น — pure module

### สถานะการใช้งาน
- **UI**: ❌ — DnDSolo ใช้ monster data จาก `fetchMonsterForCombat` (engineAdapters) → srd.ts → `convertSRDMonsterToDefinition`
- **Tests**: ✅ test_all_domains, test_comprehensive

---

## world.ts (Domain 26)
**Path**: `src/lib/world.ts` | **บรรทัด**: 424 | **Exports**: 37 | **ใช้ใน UI?**: ❌ (ใช้ผ่าน gameState.ts SaveSnapshot)

### หน้าที่

World map, locations, quests, factions, lore, economy — 7 sub-systems:
- 26.1 WorldMap (MapNode, unlockMapNode, getReachableNodes)
- 26.2 Location (summarizeLocation)
- 26.3 Quest (status, objectives, rewards, isQuestComplete, progressObjective, completeQuest)
- 26.4 CampaignState (CampaignChoice, recordChoice, setFlag, hasFlag, setVariable)
- 26.5 Faction (FactionRelationship, Faction, adjustFactionReputation)
- 26.6 LoreDatabase (LoreEntry, createLoreDatabase, revealLore, getKnownLore)
- 26.7 Economy (ShopInventory, EconomyState, calculateBuyPrice, calculateSellPrice, buyItem)

### Exports หลัก
- `MapNodeType`, `MapNode`, `WorldMap`, `unlockMapNode`, `getReachableNodes`
- `Location`, `summarizeLocation`
- `QuestStatus`, `ObjectiveType`, `QuestObjective`, `QuestReward`, `Quest`, `isQuestComplete`, `progressObjective`, `completeQuest`
- `CampaignChoice`, `CampaignState`, `recordChoice`, `setFlag`, `hasFlag`, `setVariable`
- `FactionRelationship`, `Faction`, `factionRelationshipFromReputation`, `adjustFactionReputation`
- `LoreCategory`, `LoreEntry`, `LoreDatabase`, `createLoreDatabase`, `revealLore`, `getKnownLore`
- `ShopInventory`, `EconomyState`, `calculateBuyPrice`, `calculateSellPrice`, `buyItem`
- `createCampaign`

### Dependencies
ไม่ import จาก module อื่น — pure module

### สถานะการใช้งาน
- **UI**: ❌ — DnDSolo ใช้ Quest interface จาก `gameData.ts` และ inline map state
- **Other modules**: ✅ gameState.ts (type CampaignState), srd.ts (type LoreEntry)
- **Tests**: ✅ test_all_domains, test_comprehensive

---

## ruleEngine.ts (Domain 27)
**Path**: `src/lib/ruleEngine.ts` | **บรรทัด**: 423 | **Exports**: 16 | **ใช้ใน UI?**: ❌ (ใช้ผ่าน engineAdapters)

### หน้าที่

Rule validation + resolution + modifier calculation + conflict resolution — 4 sub-systems:
- 27.1 RuleValidation (RuleRequirement, RuleRestriction, validateRule)
- 27.2 RuleResolution (ResolutionInput, ModifierSource, ResolutionResult, resolveRule)
- 27.3 ModifierCalculation (ModifierStack, buildModifierStack, resolveModifierConflicts)
- 27.4 ConflictResolution — modifier conflicts (replace, stack, ignore, highest, lowest)

`RuleRegistry` class — singleton-style registry
`COMMON_RULES` — predefined rules (attack_melee, attack_ranged, save, skill_check, ฯลฯ)

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `RuleCategory` | 25 | attack, save, skill_check, damage, healing, ... |
| `RuleRequirement`, `RuleRestriction`, `RuleDefinition` | 36-62 | rule data model |
| `ValidationContext`, `ValidationResult`, `validateRule(rule, ctx)` | 62-153 | validate action against rule |
| `ResolutionInput`, `ModifierSource`, `ResolutionResult`, `resolveRule(ruleId, input)` | 154-240 | main resolution |
| `ModifierStack`, `buildModifierStack`, `resolveModifierConflicts` | 241-321 | modifier pipeline |
| `RuleRegistry` (class) | 322 | singleton — register, get, resolve, validate |
| `COMMON_RULES` | 360 | predefined rules |

### Dependencies
ไม่ import จาก module อื่น

### สถานะการใช้งาน
- **UI**: ❌ — engineAdapters.ts ใช้ผ่าน `getRuleRegistry()`, `resolveAttackRoll()`, `validateAction()`
- **Tests**: ✅ test_all_domains, test_comprehensive

---

## events.ts (Domain 28)
**Path**: `src/lib/events.ts` | **บรรทัด**: 442 | **Exports**: 17 | **ใช้ใน UI?**: ❌ (ใช้ผ่าน engineAdapters)

### หน้าที่

EventBus + 30+ event types — 4 sub-systems:
- 28.1 EventType — 30+ types (on_attack, on_hit, on_damage_dealt, on_damage_taken, on_heal, on_kill, on_death, on_turn_start, on_turn_end, on_cast_spell, on_condition_applied, on_save, on_skill_check, ฯลฯ)
- 28.2 TriggerCondition — event matching (eventType, source, target, payload filter)
- 28.3 Listener — EventListener with priority, owner, source (feature/spell/item/monster/condition/system)
- 28.4 EventChain — chain events together (EventChainStep, EventChainResult)

`EventBus` class — singleton-style event bus
Method: `register(listener)`, `unregister(id)`, `emit(event, ctx)`, `registerCustomHandler`, `chain(chainDef)`

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `EventType` (30+ types) | 25 | on_attack, on_hit, on_damage_dealt/taken, on_heal, on_kill, on_death, on_turn_start/end, on_cast_spell, ... |
| `GameEvent`, `EventPayload` | 63-79 | event data model |
| `TriggerCondition`, `matchesTrigger(event, trigger)` | 80-175 | matching |
| `ListenerSource`, `EventListener`, `ListenerAction`, `ListenerContext` | 176-214 | listener model |
| `EventChainStep`, `EventChainResult` | 215-233 | chains |
| `EventBus` (class) | 234 | singleton — register, unregister, emit, chain |
| `createAttackEvent`, `createDamageEvent`, `createDeathEvent`, `createTurnStartEvent`, `createSpellCastEvent` | 393-433 | factory helpers |

### Dependencies
ไม่ import จาก module อื่น

### สถานะการใช้งาน
- **UI**: ❌ — engineAdapters.ts ใช้ผ่าน `getEventBus()`, `emitGameEvent()`, 17 `emit*` functions
- **Tests**: ✅ test_eventbus, test_comprehensive

---

## aoe.ts (Domain 29)
**Path**: `src/lib/aoe.ts` | **บรรทัด**: 381 | **Exports**: 21 | **ใช้ใน UI?**: ❌ (ใช้ผ่าน engineAdapters)

### หน้าที่

Area effect calculations — 4 sub-systems:
- 29.1 AreaShape (sphere, cube, cone, line, cylinder, emanation)
- 29.2 AreaCalculation (Point, AreaDefinition, feetToGrid, gridToFeet, distance, pointInArea, getAreaSquares, filterByLineOfSight)
- 29.3 TargetSelection (TargetFilter, PotentialTarget, selectTargetsInArea)
- 29.4 AreaEffects (AreaEffectType, AreaEffectApplication, AreaEffectResult, resolveAreaEffect)

`COMMON_SPELL_AREAS` — predefined shapes for common spells (Fireball, Lightning Bolt, Cone of Cold, ฯลฯ)

### Exports หลัก
- `AreaShape`, `Point`, `AreaDefinition`, `FEET_PER_GRID_SQUARE`, `feetToGrid`, `gridToFeet`, `distance`, `gridDistance`
- `pointInArea(point, area)`, `getAreaSquares(area)`, `filterByLineOfSight(...)`
- `TargetFilter`, `PotentialTarget`, `selectTargetsInArea(...)`
- `AreaEffectType`, `AreaEffectApplication`, `AreaEffectResult`, `ResolveAreaEffectInput`, `resolveAreaEffect(input)`
- `SpellAreaTemplate`, `COMMON_SPELL_AREAS`

### Dependencies
ไม่ import จาก module อื่น

### สถานะการใช้งาน
- **UI**: ❌ — engineAdapters.ts ใช้ผ่าน `selectEnemiesInAoE()` (simplified version)
- **Tests**: ✅ test_all_domains, test_comprehensive

---

## dialogue.ts (Domain 31) ✅ ใช้ใน UI
**Path**: `src/lib/dialogue.ts` | **บรรทัด**: 515 | **Exports**: 32 | **ใช้ใน UI?**: ✅ ใช้โดยตรง

### หน้าที่

Dialogue memory + NPC attitude + **intent analysis** (keyword-based)
เป็น layer ก่อนส่ง player input ไป LLM — `analyzeIntent(text)` จำแนกว่าผู้เล่นต้องการอะไร (attack, cast, talk, search, rest, move, buy, ฯลฯ)

3 sub-systems:
- 31.1 ConversationState (greeting, investigating, negotiating, concluding, ended, interrupted)
- 31.2 PlayerIntent (attack, cast_spell, talk, search, rest, move, buy, sell, use_item, skill_check, ฯลฯ) + analyzeIntent (keyword classifier)
- 31.3 DialogueMemory (facts, promises, betrayals, gifts, secrets, topics discussed)

NPC emotion model: NPCEmotion (neutral, friendly, hostile, fearful, joyful, angry, sad, suspicious, curious, ฯลฯ) + EmotionState + shiftEmotion + applyIntentToEmotion

`DialogueSession` — รวม conversation state + memory + emotion + context

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `ConversationPhase`, `ConversationState`, `startConversation`, `advanceConversation` | 25-58 |  |
| `PlayerIntent` (15+ types), `IntentAnalysisResult`, **`analyzeIntent(playerInput)`** | 81-166 | **keyword classifier** — สำคัญมาก |
| `NPCEmotion`, `EmotionState`, `createEmotionState`, `shiftEmotion`, `applyIntentToEmotion` | 167-226 |  |
| `DialogueMemory`, `createDialogueMemory`, `learnFact`, `makePromise`, `markBetrayal`, `receiveGift`, `revealSecret`, `markTopicDiscussed` | 227-300 | memory |
| `ResponseDirective`, `generateResponseDirective(...)` | 301-370 | LLM hint |
| `DialogueBranch`, `BranchVisit`, `visitBranch` | 371-408 | branching |
| `ConversationTurn`, `ConversationContext`, `addTurn`, `shouldEndConversation` | 409-467 |  |
| `DialogueSession`, `createDialogueSession`, **`processPlayerInput(...)`** | 468-515 | **main entry** |

### Dependencies
ไม่ import จาก module อื่น — pure module (แต่ใช้ LLM ผ่าน /api/intent ที่ DnDSolo.tsx เรียก)

### สถานะการใช้งาน
- **UI**: ✅ — DnDSolo ใช้ `analyzeIntent`, `createDialogueSession`, `processPlayerInput`, `DialogueSession`
- **Tests**: ✅ test_all_domains, test_comprehensive

ดูเพิ่มเติม: [04-ai-dm/intent-system.md](../04-ai-dm/intent-system.md)

---

## planning.ts (Domain 32) ✅ ใช้ใน UI
**Path**: `src/lib/planning.ts` | **บรรทัด**: 566 | **Exports**: 22 | **ใช้ใน UI?**: ✅ ใช้โดยตรง

### หน้าที่

Tactical AI planning — สำหรับ DM/monster ตัดสินใจ
4 sub-systems:
- 32.1 Goal + Strategy (GoalType: kill, defend, escape, negotiate, retrieve, explore, survive, ... + Strategy: aggressive, defensive, tactical, opportunistic, evasive)
- 32.2 DecisionOptions (generateDecisionOptions(strategy, ctx))
- 32.3 PredictedOutcome (predictOutcome(action, ctx))
- 32.4 RiskAssessment (assessRisk(ctx))

`generateFullPlan(spec)` — main entry point: รับ ctx + goals → คืน `FullPlan` (goals, strategy, options, best action, predicted outcome, risk, revision policy)

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `GoalType`, `Goal`, `createGoal`, `selectHighestPriorityGoal` | 24-66 |  |
| `Strategy`, `selectStrategy(goal, ctx)` | 67-113 |  |
| `PlanningContext` | 114-132 |  |
| `DecisionOption`, `generateDecisionOptions(strategy, ctx)` | 133-139 |  |
| `PredictedOutcome`, `predictOutcome(action, ctx)` | 255-365 |  |
| `SelectedAction`, `selectBestAction(options, ctx)` | 366-404 |  |
| `PlanRevision`, `shouldReplan(...)` | 405-443 |  |
| `AgentPlan`, `CoordinatedPlan`, `coordinateAgents(agents, ctx)` | 444-491 |  |
| `RiskAssessment`, `assessRisk(ctx)` | 492-531 |  |
| `FullPlan`, `generateFullPlan(spec)` | 532-566 | **main entry** |

### Dependencies
ไม่ import จาก module อื่น — pure functions

### สถานะการใช้งาน
- **UI**: ✅ — DnDSolo ใช้ `generateFullPlan`, `selectBestAction`, `generateDecisionOptions`, `predictOutcome`, `assessRisk`
- **Tests**: ✅ test_all_domains, test_comprehensive

---

## narrative.ts (Domain 33) ✅ ใช้ใน UI
**Path**: `src/lib/narrative.ts` | **บรรทัด**: 526 | **Exports**: 42 | **ใช้ใน UI?**: ✅ ใช้โดยตรง

### หน้าที่

StoryArc + Scene + Pacing + Branches + Consequences + Foreshadow + Themes + NarrationDirective
เป็น structure สำหรับ DM เตรียม story ล่วงหน้า (ไม่ใช่ LLM generate)

8 sub-systems:
- 33.1 StoryArc (ArcPhase: setup → inciting_incident → rising_action → midpoint → complication → climax → falling_action → resolution → epilogue)
- 33.2 Scene (SceneType: exploration, combat, social, puzzle, transition, cutscene, rest, revelation + SceneTension: calm → low → medium → high → climax)
- 33.3 NarrativeBranch (player choices → branching paths)
- 33.4 Consequence (delayed consequences + checkPendingConsequences)
- 33.5 Pacing (PacingState + updatePacingAfterScene)
- 33.6 Foreshadow (plant → hint → payoff)
- 33.7 Theme (ThemeState + observeTheme + getDominantThemes)
- 33.8 NarrationDirective (generateNarrationDirective — LLM hint)

`NarrativeEngine` — รวม arc + current scene + branch tracker + consequence tracker + pacing + foreshadow + theme

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `ArcPhase`, `StoryArc`, `createStoryArc`, `advanceArc` | 24-67 |  |
| `SceneType`, `SceneTension`, `Scene`, `SceneChoice`, `createScene`, `completeObjective`, `isSceneComplete`, `endScene` | 68-141 |  |
| `NarrativeBranch`, `BranchTracker`, `createBranchTracker`, `registerBranch`, `completeBranch` | 142-211 |  |
| `Consequence`, `ConsequenceTracker`, `createConsequenceTracker`, `registerConsequence`, `checkPendingConsequences` | 212-263 | delayed consequences |
| `PacingState`, `createPacingState`, `updatePacingAfterScene` | 264-321 |  |
| `Foreshadow`, `ForeshadowTracker`, `createForeshadowTracker`, `plantForeshadow`, `hintForeshadow`, `payoffForeshadow`, `getReadyForeshadows` | 322-387 |  |
| `ThemeState`, `createThemeState`, `observeTheme`, `getDominantThemes` | 388-422 |  |
| `NarrationDirective`, `generateNarrationDirective(...)` | 423-485 | LLM hint |
| `NarrativeEngine`, `createNarrativeEngine`, `enterScene`, `completeScene` | 486-526 | main engine |

### Dependencies
ไม่ import จาก module อื่น — pure functions

### สถานะการใช้งาน
- **UI**: ✅ — DnDSolo ใช้ `createStoryArc`, `createScene`, `enterScene`, `completeScene`, `updatePacingAfterScene`, `generateNarrationDirective`, `NarrativeEngine`, `Scene`, `SceneType`
- **Tests**: ✅ test_all_domains, test_comprehensive

---

## encounter.ts (Domain 34) ✅ ใช้ใน UI
**Path**: `src/lib/encounter.ts` | **บรรทัด**: 558 | **Exports**: 37 | **ใช้ใน UI?**: ✅ ใช้โดยตรง

### หน้าที่

Difficulty calculator + encounter tables + wave encounters + encounter budget

5 sub-systems:
- 34.1 DifficultyLevel (trivial, easy, medium, hard, deadly) + SOLO_DIFFICULTY_THRESHOLDS + calculateDifficulty + getDifficultyThresholds
- 34.2 CR/XP conversion (crToXP, xpToCR, suggestedCR)
- 34.3 EncounterGeneration (generateEncounter)
- 34.4 EncounterTables (DEFAULT_ENCOUNTER_TABLES by biome + rollEncounterFromTable + findEncounterTable)
- 34.5 WaveEncounter (multi-wave fights)

Modifier system: weather + time of day modifiers (applyModifiers)

EncounterBudget: tracking XP budget per adventuring day (longRestBudget resets)

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `EncounterType`, `EncounterSpec`, `EncounterParticipant` | 25-63 |  |
| `DifficultyLevel`, `DifficultyThreshold`, `SOLO_DIFFICULTY_THRESHOLDS` | 64-118 |  |
| `encounterMultiplier`, `calculateDifficulty`, `getDifficultyThresholds` | 119-150 | **สำคัญ** |
| `EncounterGenerationParams`, `GeneratedEncounter`, `crToXP`, `xpToCR`, `suggestedCR`, `generateEncounter` | 151-282 |  |
| `EncounterReward`, `calculateReward`, `rollRewardItems` | 283-325 |  |
| `EncounterTableEntry`, `EncounterTable`, `DEFAULT_ENCOUNTER_TABLES`, `rollEncounterFromTable`, `findEncounterTable` | 326-413 |  |
| `EncounterModifier`, `WEATHER_MODIFIERS`, `TIME_MODIFIERS`, `applyModifiers` | 414-451 |  |
| `EncounterBudget`, `createEncounterBudget`, `spendBudget`, `longRestBudget`, `remainingBudget`, `recommendedNextDifficulty` | 452-515 |  |
| `WaveSpec`, `WaveEncounter`, `createWaveEncounter`, `advanceWave` | 516-558 |  |

### Dependencies
ไม่ import จาก module อื่น — pure functions

### สถานะการใช้งาน
- **UI**: ✅ — DnDSolo ใช้ `calculateDifficulty`, `getDifficultyThresholds`, `suggestedCR`, `crToXP`, `DifficultyLevel`
- **Tests**: ✅ test_all_domains, test_comprehensive

---

## content.ts (Domain 35) ✅ ใช้ใน UI
**Path**: `src/lib/content.ts` | **บรรทัด**: 505 | **Exports**: 33 | **ใช้ใน UI?**: ✅ ใช้โดยตรง

### หน้าที่

Homebrew content registry — สำหรับ import/export homebrew content (spells, monsters, items, classes, races, backgrounds, feats)

5 sub-systems:
- 35.1 ContentRegistry (createContentRegistry, registerContent, getContent, listContentByType, searchContent)
- 35.2 Import (importContentJSON, importContentFromURL, ImportResult)
- 35.3 HomebrewManager (class) + HomebrewOverride
- 35.4 Validation (validateContentEntry, validateContentBatch)
- 35.5 Versioning (ContentVersion, VersionTracker, registerMigration, migrateContent, ContentDiff, diffContent)

รองรับ: ContentPack (ส่งออกเป็น JSON แชร์ได้) + checksum verification

### Exports หลัก

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `ContentType`, `ContentEntry`, `ContentRegistry` | 25-49 |  |
| `createContentRegistry`, `registerContent`, `getContent`, `listContentByType`, `searchContent` | 50-110 |  |
| `ImportResult`, `importContentJSON`, `importContentFromURL` | 111-182 | import |
| `HomebrewOverride`, `HomebrewManager` (class) | 183-233 |  |
| `ValidationResult`, `validateContentEntry`, `validateContentBatch` | 234-312 | validation |
| `ContentVersion`, `VersionTracker`, `createVersionTracker`, `recordVersion`, `registerMigration`, `migrateContent` | 313-368 | versioning |
| `ContentDiff`, `diffContent`, `exportContentEntry`, `exportContentBatch`, `exportByType` | 369-440 | export |
| `ContentPack`, `createContentPack`, `addEntryToPack`, `exportContentPack`, `importContentPack`, `verifyChecksum` | 441-505 | pack |

### Dependencies
ไม่ import จาก module อื่น — pure functions

### สถานะการใช้งาน
- **UI**: ✅ — DnDSolo ใช้ `createContentRegistry`, `importContentJSON`, `exportByType`, `listContentByType`, `ContentRegistry`, `ContentType`
- **Tests**: ✅ test_all_domains, test_comprehensive

---

## domains.ts (Index)
**Path**: `src/lib/domains.ts` | **บรรทัด**: 275 | **Exports**: 5 | **ใช้ใน UI?**: ❌

### หน้าที่

Index file — re-export ทุก domain module เป็น namespace
`DOMAINS` array — metadata ของทั้ง 36 domains (id, name, module, description, status)

### Exports หลัก

```typescript
export * as diceEngine from "./diceEngine.js";
export * as rollResolver from "./rollResolver.js";
export * as skills from "./skills.js";
// ... (32 modules)
export * as gameData from "./gameData.js";
export * as spells from "./spells.js";

export interface DomainMeta { id: number; name: string; module: string; description: string; status: "active" | "unwired" | "legacy"; }
export const DOMAINS: DomainMeta[] = [/* 36 entries */];
export function getDomainById(id: number): DomainMeta | undefined;
export function getDomainByModule(moduleName: string): DomainMeta | undefined;
export function listAllDomains(): DomainMeta[];
```

### สถานะการใช้งาน
- **UI**: ❌ — DnDSolo import แต่ละ module ตรง ๆ ไม่ได้ผ่าน domains.ts
- **Tests**: ✅ test_all_domains ใช้ `DOMAINS` เพื่อ iterate

---

## สรุป Domain Modules

### การกระจายตัว (UI vs Unwired)

| สถานะ | จำนวน | ไฟล์ |
|---|---:|---|
| ✅ ใช้ใน UI โดยตรง | 5 | dialogue, planning, narrative, encounter, content (+ spells) |
| ⚠️ ใช้ผ่าน engineAdapters | 5 | time, gameState, events, ruleEngine, aoe |
| ❌ Unwired (tests only) | ~25 | ส่วนใหญ่ |

### Dead Code Candidates

ไฟล์ legacy ที่ทับซ้อนกับ `engine/` รุ่นใหม่ และไม่มีใคร import (นอกจาก tests):
- `src/lib/combat.ts` (723 บรรทัด) — legacy combat
- `src/lib/movement.ts` (468 บรรทัด) — legacy movement
- `src/lib/magic.ts` (370 บรรทัด) — legacy magic
- `src/lib/equipment.ts` (275 บรรทัด) — legacy equipment
- `src/lib/character.ts` (148 บรรทัด) — legacy character

**รวม ~2,000 บรรทัด** — ดู [08-gaps/technical-debt.md](../08-gaps/technical-debt.md)

### การออกแบบ

- **Pure functions**: ทุก domain module เป็น pure functions + data tables (ไม่มี side effects)
- **No React/UI imports**: domain modules ไม่ import React
- **Type-only imports**: บาง module ใช้ type จาก module อื่นแบบ `import type` เท่านั้น
- **Singletons**: WorldClock, EventBus, RuleRegistry, GameState — เป็น class ที่ instantiate ผ่าน `getXxx()` factory ใน engineAdapters.ts

ดูเพิ่มเติม:
- [engine-submodules.md](engine-submodules.md) — สำหรับ engine/ รุ่นใหม่
- [adapters.md](adapters.md) — สำหรับการ bridge เข้า UI
- [08-gaps/unwired-engine.md](../08-gaps/unwired-engine.md) — สำหรับแผนการ wire
