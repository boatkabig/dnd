# 02 — Core Data Layer

> ข้อมูลพื้นฐานทั้งหมดของ engine: constants ของระบบ (classes, races, items, conditions),
> interface ของ Character แบบ legacy, และ SaveSnapshot + State Update pipeline แบบใหม่
> ไฟล์ในหมวดนี้เป็น "พื้น" ของระบบทั้งหมด — แทบทุก module อื่น import สิ่งใดสิ่งหนึ่งจากที่นี่

ไฟล์ที่ครอบคลุม:

| ไฟล์ | บรรทัด | Exports | ใช้ใน UI? |
|---|---:|---:|:---:|
| [`src/lib/gameData.ts`](#gamedatats) | 961 | 49 | ✅ ใช้โดยตรง |
| [`src/lib/character.ts`](#characterts) | 148 | 4 | ❌ ไม่ใช้ (legacy) |
| [`src/lib/gameState.ts`](#gamestatets) | 494 | 31 | ❌ ไม่ได้ใช้โดยตรง (ใช้ผ่าน engineAdapters) |

---

## gameData.ts
**Path**: `src/lib/gameData.ts` | **บรรทัด**: 961 | **Exports**: 49 | **ใช้ใน UI?**: ✅ ใช้โดยตรง (DnDSolo.tsx import ~30 สัญลักษณ์)

### หน้าที่

ไฟล์ "พจนานุกรม" ของทั้งระบบ — เก็บ SRD constants ทั้งหมดที่ engine ใช้เป็น fallback เมื่อ API (srd/open5e) ไม่ตอบ
ครอบคลุมข้อมูล static ของ D&D 5e/2024:

- 12 classes หลัก (Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard)
- 9 species/races หลัก + subraces
- 9 backgrounds ตาม D&D 2024 PHB (แต่ละ background ให้ 2 skill proficiencies + 1 origin feat + ASI + tool + equipment + personality/ideals/bonds/flaws)
- 15 conditions ทั้งหมดของ SRD (พร้อมคำอธิบายภาษาไทยและ mechanical effect mapping)
- ตาราง Weapons (พร้อม D&D 2024 Weapon Mastery — 8 masteries: Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex)
- ตาราง Armor, Magic Items, Consumables, Bestiary
- Spell slot tables (FULL_CASTER_SLOTS, HALF_CASTER_SLOTS)
- Encounter difficulty thresholds + helper functions
- Light/vision helpers, grapple check, dual wield check
- D&D 2024 Exhaustion rules (6 levels, -2/level ต่อ D20 Test, -5 ft/level ต่อ Speed, Lv6 = Death)

### Exports หลัก

| Export | ประเภท | บรรทัด | หน้าที่ |
|---|---|---:|---|
| `ABILS` | const | 9 | `["str","dex","con","int","wis","cha"]` |
| `mod(score)` | fn | 11 | แปลง ability score → modifier |
| `profByLevel(lv)` | fn | 12 | คำนวณ proficiency bonus ตาม level |
| `XP_THRESHOLDS` | const | 13 | XP thresholds สำหรับ level 1-20 |
| `SKILLS` | const | 16 | 18 skills พร้อม ability + ชื่อไทย |
| `EXHAUSTION_LEVELS` | const | 50 | `6` (D&D 2024) |
| `exhaustionPenalty(level)` | fn | 51 | `-2 * level` ต่อ D20 Test |
| `exhaustionSpeedPenalty(level)` | fn | 54 | `-5 * level` ft |
| `isExhaustionDeadly(level)` | fn | 57 | `level >= 6` → death |
| `CONDITIONS_TH` | const | 61 | คำอธิบาย 15 conditions ภาษาไทย |
| `DISADV_CONDS`, `CHECK_DISADV_CONDS`, `ENEMY_ADV_CONDS`, `INCAPACITATING_CONDS` | const | 80-83 | condition → mechanical effect mapping |
| `BACKGROUNDS` | const | 93 | 9 backgrounds ตาม D&D 2024 PHB |
| `RACES` | const | 249 | 9 species + subraces |
| `ALIGNMENTS` | const | 265 | 9 alignments |
| `LANGUAGES` | const | 278 | ภาษามาตรฐาน + exotic |
| `ORIGIN_FEATS` | const | 300 | D&D 2024 origin feats |
| `CLASSES` | const | 354 | 12 classes data |
| `FEATURES` | const | 466 | class features table (Lv.1-20, 12 classes) |
| `WEAPONS` | const | 604 | อาวุธทั้งหมด พร้อม mastery + reach + range |
| `WEAPON_MASTERIES` | const | 664 | 8 masteries + คำอธิบาย |
| `weaponByName(nm)` | fn | 675 | ค้นหา weapon ตามชื่อไทย |
| `ARMOR` | const | 683 | armor data |
| `MAGIC_ITEMS` | const | 703 | ไอเทมเวทมนตร์ |
| `wornHas(c, eff)` | fn | 731 | ตรวจว่าใส่ magic item ที่มี effect นี้อยู่ไหม |
| `CONSUMABLES` | const | 734 | ไอเทมใช้แล้วหมด |
| `BESTIARY` | const | 758 | มอนสเตอร์ fallback |
| `monSave(e, abil)` | fn | 796 | ดึง saving throw ของ monster |
| `SLOT_TABLE`, `HALF_CASTER_SLOTS` | const | 799, 805 | spell slot tables ตาม class level |
| `DIRV` | const | 811 | direction vectors (n/s/e/w/ne/nw/se/sw) |
| `MAP_ICON` | const | 812 | icon per map node type |
| `DAMAGE_TYPES` | const | 815 | 13 damage types |
| `applyDamageModifiers(rawDmg, dmgType, mods)` | fn | 822 | คำนวณ resistance/vulnerability/immunity |
| `COVER_AC_BONUS` | const | 834 | half/three_quarter/total → +AC |
| `LightLevel`, `VisionType` | type | 842-843 | "bright"/"dim"/"darkness" + vision modes |
| `canSeeTarget(...)` | fn | 846 | ตรวจ vision vs concealment |
| `passivePerception(c)` | fn | 855 | 10 + WIS mod + proficiency |
| `ENCOUNTER_THRESHOLDS` | const | 875 | XP thresholds ตาม char level + party size |
| `rateEncounterDifficulty(totalXP, charLevel)` | fn | 903 | "trivial"/"easy"/"medium"/"hard"/"deadly" |
| `gameTimeToString(time)` | fn | 915 | "Day 1, 08:00" |
| `getLightLevelForHour(hour)` | fn | 922 | bright/dim/darkness ตามเวลา |
| `Quest` | interface | 930 | quest data model |
| `grappleCheck(attackerMod, defenderMod)` | fn | 943 | contested roll |
| `canDualWield(c)` | fn | 952 | ตรวจว่าใช้ two-weapon fighting ได้ไหม |

### Dependencies

ไม่ import จาก module อื่นใน src/lib/ (เป็น leaf module — pure data + helpers)
ใช้แค่ TypeScript primitives + `Math`/`Date`

### สถานะการใช้งาน

- **UI (DnDSolo.tsx)**: ✅ ใช้โดยตรง — import ~30 สัญลักษณ์ (ABILS, mod, SKILLS, CLASSES, RACES, BACKGROUNDS, WEAPONS, ARMOR, BESTIARY, SLOT_TABLE, CONDITIONS_TH, ฯลฯ)
- **Engine modules**: ✅ ใช้โดย engineAdapters.ts (type Quest), combat.ts (legacy), magic.ts (legacy), skills.ts (legacy), spells.ts, rollResolver.ts, vision.ts, movement.ts (legacy)
- **Tests**: ✅ ใช้โดย test_roll_system, test_dnd_2024_compliance, test_expertise, test_comprehensive

**หมายเหตุ**: ไฟล์นี้เป็น "single source of truth" ของ SRD data ในระบบ — เมื่อ API (srd/open5e) ตอบ ผลจะ override ค่าในนี้ แต่เมื่อ API fail ค่าในนี้คือ fallback สำคัญ

---

## character.ts
**Path**: `src/lib/character.ts` | **บรรทัด**: 148 | **Exports**: 4 | **ใช้ใน UI?**: ❌ ไม่ใช้ (legacy interface)

### หน้าที่

ไฟล์นี้เป็น **legacy Character interface** — ใช้โดย engine modules รุ่นเก่า (combat.ts, magic.ts, movement.ts, equipment.ts แบบ legacy)
ที่อยู่ใน src/lib/ (ไม่ใช่ src/lib/engine/)

Character interface นี้เป็น "flat struct" — ฝังข้อมูลทั้งหมดใน object เดียว (hp, ac, abilities, slots, inventory, conditions, buffs, deathSaves, ฯลฯ)
ต่างจาก `engine/character.ts` รุ่นใหม่ที่เป็น aggregate root + reference-based

มีฟังก์ชัน helper 2 ตัว:
- `buildCharacterState(c, combat?)` — แปลง Character + CombatState → `CharacterState` สำหรับ Action System
- `canTakeAction(c, actionId, combat?)` — เช็คว่า character ทำ action นี้ได้ไหม

### Exports หลัก

| Export | ประเภท | บรรทัด | หน้าที่ |
|---|---|---:|---|
| `Character` | interface | 12 | Legacy character data model (flat struct) |
| `CombatState` | interface | 94 | Per-turn combat state (hasAction, hasBonusAction, hasReaction, movementLeft, ...) |
| `buildCharacterState(c, combat?)` | fn | 113 | สร้าง CharacterState สำหรับ Action System |
| `canTakeAction(c, actionId, combat?)` | fn | 144 | เช็คว่าทำ action ได้ไหม |

### Dependencies

```typescript
import type { CharacterState } from "./actionSystem";
import { getAvailableActions } from "./actionSystem";
```

### สถานะการใช้งาน

- **UI (DnDSolo.tsx)**: ❌ ไม่ได้ใช้ — DnDSolo ใช้ `Character` interface ของตัวเอง inline ไม่ได้ import จากไฟล์นี้
- **Engine modules**: ✅ ใช้โดย engine/magic.ts, engine/movement.ts, engine/effects.ts, engine/rest.ts, engine/skills.ts — **แต่ใช้แค่เป็น type import** (ส่วนใหญ่แค่ `import type { AbilityName }`) ไม่ได้ใช้ Character interface ของไฟล์นี้
- **Tests**: ✅ ใช้โดย test_actions.ts

⚠️ **Technical Debt**: Character interface นี้ทับซ้อนกับ `engine/character.ts` (รุ่นใหม่ที่เป็น aggregate root)
น่าจะถูกแทนที่ด้วย engine/character.ts ในอนาคต ดู [08-gaps/technical-debt.md](../08-gaps/technical-debt.md)

---

## gameState.ts
**Path**: `src/lib/gameState.ts` | **บรรทัด**: 494 | **Exports**: 31 | **ใช้ใน UI?**: ❌ ไม่โดยตรง — ใช้ผ่าน `engineAdapters.ts`

### หน้าที่

**Domain 30: Game State** — single source of truth ของสถานะเกมทั้งหมด
แบ่งเป็น 5 sub-systems:

1. **30.1 Character State** — HP/position/conditions/resources/active effects/death saves per character
2. **30.2 World State** — time/weather/lighting/current location/NPC states
3. **30.3 Combat State** — initiative/turn/round/active effects/lair & legendary tracking
4. **30.4 Persistence** — SaveSnapshot + validate/migrate
5. **30.5 State Update Pipeline** — Action → Rule Engine → Event → Mutate State

ไฟล์นี้ออกแบบตามหลัก **immutability** — ทุก mutation function คืน object ใหม่ (เช่น `applyDamage(char, amount)` คืน CharacterState ใหม่)
มี `GameState` class ที่รวม state ทั้งหมด + มี method `applyAction()` สำหรับ run State Update pipeline

### Exports หลัก

#### 30.1 Character State

| Export | ประเภท | บรรทัด | หน้าที่ |
|---|---|---:|---|
| `CharacterState` | interface | 24 | HP, conditions, resources, activeEffects, deathSaves |
| `ActiveEffect` | interface | 40 | effect instance (id, sourceId, duration, modifiers, concentrationBy) |
| `createCharacterState(spec)` | fn | 52 | สร้าง character state ใหม่ |
| `applyDamage(char, amount, damageType?)` | fn | 75 | ลด HP (temp HP absorbs ก่อน) |
| `applyHeal(char, amount)` | fn | 94 | เพิ่ม HP |
| `addTempHp(char, amount)` | fn | 99 | เพิ่ม temp HP (ใช้ max ไม่ stack) |
| `addCondition(char, conditionId)` | fn | 103 | เพิ่ม condition (dedupe) |
| `removeCondition(char, conditionId)` | fn | 108 | ลบ condition |
| `isDead(char)`, `isUnconscious(char)`, `isStable(char)` | fn | 112-122 | ตรวจสถานะ HP=0 |

#### 30.2 World State

| Export | ประเภท | บรรทัด | หน้าที่ |
|---|---|---:|---|
| `WorldState` | interface | 128 | time, weather, lighting, currentLocationId, npcStates |
| `NPCWorldState` | interface | 136 | npcId, locationId, alive, attitude, currentActivity |
| `createWorldState(spec)` | fn | 144 | สร้าง world state |
| `setNPCState(world, npcId, state)` | fn | 154 | update NPC state |

#### 30.3 Combat State

| Export | ประเภท | บรรทัด | หน้าที่ |
|---|---|---:|---|
| `CombatState` | interface | 174 | active, round, currentTurnIndex, initiativeOrder, lairActionsTriggered |
| `createCombatState()` | fn | 184 | สร้าง combat state ว่าง |
| `startCombat(initiativeOrder)` | fn | 196 | เริ่ม combat (sort initiative desc) |
| `endCombat(state)` | fn | 208 | จบ combat |
| `nextTurn(state)` | fn | 219 | ไป turn ถัดไป (handle round rollover + lair/legendary reset) |
| `currentCombatant(state)` | fn | 231 | ดึง combatant ปัจจุบัน |

#### 30.4 Persistence

| Export | ประเภท | บรรทัด | หน้าที่ |
|---|---|---:|---|
| `SaveSnapshot` | interface | 239 | version, savedAt, worldTimeSeconds, campaign, characters, world, combat, history |
| `HistoryEntry` | interface | 250 | id, timestamp, description, type, payload |
| `createSnapshot(spec)` | fn | 258 | สร้าง snapshot จาก current state |
| `validateSnapshot(snap)` | fn | 278 | type guard — ตรวจ structure |
| `migrateSnapshot(snap, targetVersion)` | fn | 292 | migrate version (ปัจจุบันแค่ bump version) |

#### 30.5 State Update Pipeline

| Export | ประเภท | บรรทัด | หน้าที่ |
|---|---|---:|---|
| `StateUpdateAction` | interface | 311 | type, actorId, targetIds, ruleId, modifiers, payload |
| `StateUpdateResult` | interface | 320 | success, applied, effects, events, note |
| `GameStateBundle` | interface | 332 | campaign + characters + world + combat + history |
| `applyStateUpdate(state, action)` | fn | 340 | run pipeline (resolve damage/heal/condition, emit events) |
| `GameState` | class | 420 | singleton-style class: รวม state + `applyAction()` + `snapshot()` + `loadSnapshot()` |

### Dependencies

```typescript
import type { GameTime } from "./time.js";
import type { CampaignState } from "./world.js";
```

ใช้ pure functions เท่านั้น (ไม่ import จาก engine/)

### สถานะการใช้งาน

- **UI (DnDSolo.tsx)**: ❌ ไม่ได้ import โดยตรง — แต่ `engineAdapters.ts` ใช้ `createCharacterState` + `SaveSnapshot` type + `LegacySave` จากที่นี่
- **Engine modules**: ✅ ใช้โดย engineAdapters.ts (Section 10: `characterToState()`, Section 9: save/load versioning)
- **Tests**: ✅ ใช้โดย test_all_domains, test_comprehensive

⚠️ **สถานะจริง**: `GameState` class และ `applyStateUpdate` pipeline **ยังไม่ได้ถูกใช้ใน UI** — DnDSolo.tsx ยังจัดการ state แบบ inline ด้วย `useState` ของ React ไม่ได้ delegate มาที่ GameState
ดู [08-gaps/unwired-engine.md](../08-gaps/unwired-engine.md) สำหรับรายละเอียดการ wire ในอนาคต

---

## สรุปหมวด Core Data

| ไฟล์ | บรรทัด | บทบาทในระบบ | ใช้จริง? |
|---|---:|---|---|
| gameData.ts | 961 | พจนานุกรม SRD (classes, races, items, conditions) | ✅ ใช้หนักใน UI |
| character.ts | 148 | Legacy Character interface | ⚠️ ใช้แค่ type imports ใน engine/ |
| gameState.ts | 494 | Domain 30 — State Update pipeline + SaveSnapshot | ⚠️ ใช้ผ่าน engineAdapters แต่ GameState class ยังไม่ wire |

**ประเด็นสำคัญ**:
1. `gameData.ts` คือไฟล์ที่ "หนัก" ที่สุดในด้าน data — เป็น single source of truth เมื่อ API fail
2. `character.ts` (legacy) และ `engine/character.ts` (v2) **ทับซ้อนกัน** — ต้องเลือกใช้อันเดียวในอนาคต
3. `gameState.ts` มี State Update pipeline ที่สมบูรณ์ แต่ UI ยังไม่ได้ใช้ — เป็น "unwired engine" ที่สำคัญที่สุดส่วนหนึ่ง

ดูเพิ่มเติม:
- [engine-submodules.md](engine-submodules.md) — สำหรับ `engine/character.ts` รุ่นใหม่
- [adapters.md](adapters.md) — สำหรับการ bridge gameState.ts เข้า UI
- [08-gaps/unwired-engine.md](../08-gaps/unwired-engine.md) — สำหรับแผนการ wire GameState class
