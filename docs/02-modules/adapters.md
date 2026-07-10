# 02 — Adapter Layer

> `src/lib/engineAdapters.ts` — สะพานเดียวระหว่าง `DnDSolo.tsx` (UI) กับ domain modules + EventBus singletons
> 925 บรรทัด, 53 exports, **ใช้ใน UI?**: ✅ ใช้โดยตรง (importer เดียวคือ DnDSolo.tsx)

## ภาพรวม

`engineAdapters.ts` เป็นไฟล์สำคัญที่สุดในการ migrate — เป็นที่เดียวที่ DnDSolo.tsx
เรียกเข้าไปใช้ domain modules แบบ structured (ไม่ใช่ inline logic)

แบ่งเป็น 12 sections:

| Section | หน้าที่ | สถานะ |
|---:|---|---|
| 1 | Time Adapter — WorldClock singleton + legacy {day, hour} conversion | ✅ ใช้ใน UI |
| 2 | Event Bus Adapter — EventBus singleton + 17 emit* helpers | ✅ ใช้ใน UI |
| 3 | Rule Engine Adapter — RuleRegistry singleton + resolveAttackRoll | ⚠️ ใช้บางส่วน |
| 4 | Game State Adapter — LegacySave migration (v1→v2→v3) | ✅ ใช้ใน UI |
| 5 | AoE Adapter — selectEnemiesInAoE (simplified) | ✅ ใช้ใน UI |
| 6 | Condition Helpers — INCAPACITATING/DISADV/ADV condition lists | ✅ ใช้ใน UI |
| 7 | Concentration Tracking — CONCENTRATION_SPELLS set + concentrationDC | ✅ ใช้ใน UI |
| 8 | Buff Modifier Helpers — getAttackModifiers + getACModifier (Bless, Bane, Hunter's Mark, Hex, Shield, ฯลฯ) | ✅ ใช้ใน UI |
| 9 | Save/Load with Versioning — saveGame/loadGame/deleteSave (localStorage) | ✅ ใช้ใน UI |
| 10 | Character State Sync — characterToState (legacy character → gameState CharacterState) | ⚠️ มีแต่ไม่ได้ wire |
| 11 | Monster Adapter — fetchMonsterForCombat (Open5e → legacy fallback) | ✅ ใช้ใน UI |
| 12 | Effects Engine Adapter — applyBuffToCharacter, removeBuffFromCharacter, tickBuffDurations | ✅ ใช้ใน UI |

---

## 1. Time Adapter (Section 1)

### หน้าที่
แทนที่ inline `gameTime { day, hour }` ของ DnDSolo.tsx ด้วย `WorldClock` singleton (จาก `time.ts`)

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `getWorldClock()` | 27 | singleton — start at 08:00 day 1 |
| `initWorldClockFromLegacy(legacy)` | 35 | migrate {day, hour} → WorldClock |
| `worldClockToLegacy(clock)` | 42 | WorldClock → {day, hour} (UI compat) |
| `advanceHours(hours)` | 50 | advance time + คืน {day, hour} |
| `advanceMinutes(minutes)` | 56 |  |
| `scheduleEvent(spec)` | 63 | schedule time-based event |
| `checkScheduledEvents()` | 68 | check fired events (call each turn end) |

### Dependencies
```typescript
import { WorldClock } from "./time";
```

### สถานะการใช้งาน
- ✅ DnDSolo.tsx import: `initWorldClockFromLegacy`, `worldClockToLegacy`, `getWorldClock`, `advanceHours` (as `engineAdvanceHours`)

---

## 2. Event Bus Adapter (Section 2)

### หน้าที่
EventBus singleton + 17 emit* helpers สำหรับ combat events
รวมถึง `FEATURE_TRIGGERS` table — data-driven feature listener registry (poison_weapon, riposte, relentless_endurance, polearm_master, savage_attacker)

`queryFeatureTriggers()` + `getTriggeredFeatures()` — combat loop เรียกเพื่อหา features ที่ trigger จาก event

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `getEventBus()` | 78 | singleton — register default listeners |
| `emitGameEvent(event)` | 86 |  |
| `emitAttack(sourceId, targetId, weapon?)` | 98 |  |
| `emitHit(sourceId, targetId, weapon?, damage?)` | 108 |  |
| `emitDamageDealt(sourceId, targetId, amount, damageType?)` | 118 |  |
| `emitDamageTaken(targetId, amount, damageType?, sourceId?)` | 128 |  |
| `emitHeal(sourceId, targetId, amount)` | 138 |  |
| `emitKill(killerId, victimId)` | 148 |  |
| `emitDeath(characterId, killerId?)` | 158 |  |
| `emitTurnStart(characterId, round)` | 168 |  |
| `emitTurnEnd(characterId, round)` | 178 |  |
| `emitCastSpell(casterId, spellId, level, targetIds?)` | 188 |  |
| `emitConditionApplied(targetId, conditionId, sourceId?)` | 198 |  |
| `PendingStateChange` (interface) | 217 | data model สำหรับ feature trigger results |
| `queryFeatureTriggers(eventType, sourceId, targetId, payload, characterHasFeature)` | 359 | query pending state changes |
| `getTriggeredFeatures(eventType, characterId, characterHasFeature)` | 391 | convenience wrapper |
| `listFeatureTriggers()` | 402 | ดูตารางทั้งหมด (for DM hint) |

### Dependencies
```typescript
import { EventBus, type GameEvent, type EventListener } from "./events";
```

### สถานะการใช้งาน
- ✅ DnDSolo.tsx import: `emitAttack`, `emitHit`, `emitDamageDealt`, `emitDamageTaken`, `emitHeal`, `emitKill`, `emitDeath`, `emitTurnStart`, `emitTurnEnd`, `emitCastSpell`, `emitConditionApplied`, `queryFeatureTriggers`, `getTriggeredFeatures`, `PendingStateChange`

ดูเพิ่มเติม: [05-events/event-bus.md](../05-events/event-bus.md)

---

## 3. Rule Engine Adapter (Section 3)

### หน้าที่
RuleRegistry singleton + `resolveAttackRoll()` — data-driven alternative สำหรับ inline `attackMod + d20 vs AC`
`validateAction()` — check ว่า rule อนุญาต action นี้ไหม

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `getRuleRegistry()` | 412 | singleton — register COMMON_RULES |
| `resolveAttackRoll(ruleId, baseRoll, modifiers, targetAC, adv?, dis?)` | 428 | data-driven attack resolution |
| `validateAction(ruleId, ctx)` | 467 | check rule allows action |

### Dependencies
```typescript
import { RuleRegistry, COMMON_RULES, validateRule } from "./ruleEngine";
```

### สถานะการใช้งาน
- ⚠️ DnDSolo.tsx **ไม่ได้ import** ฟังก์ชันเหล่านี้ — ใช้ inline `attackMod + d20 vs AC` อยู่
- ⚠️ เป็น "available but unwired" — พร้อมใช้แต่ DnDSolo ยังไม่เรียก

---

## 4. Game State Adapter (Section 4)

### หน้าที่
Legacy save migration v1 → v2 → v3:
- v1 → v2: add map, history ถ้า missing
- v2 → v3: add gameTime, quests, buffs, feats, deathSaves, conditions

`SAVE_VERSION = 3` (current)
`LegacySave` interface — shape ที่ DnDSolo.tsx ใช้ save/load

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `SAVE_VERSION` | 506 | `3` |
| `LegacySave` (interface) | 508 | { c, scene, log, combat, history, map, gameTime?, quests?, version? } |
| `migrateLegacySave(raw)` | 521 | v1 → v2 → v3 |

### Dependencies
```typescript
import type { Quest } from "./gameData";
```

### สถานะการใช้งาน
- ✅ DnDSolo.tsx import: `LegacySave` (type), ใช้ผ่าน `saveGame`/`loadGame` (Section 9)

---

## 5. AoE Adapter (Section 5)

### หน้าที่
Simplified AoE target selection — แปลง spell area_of_effect → grid-based enemy selection
ใช้ Chebyshev distance (8-way) สำหรับ grid

⚠️ Simplified version ของ `aoe.ts` — ไม่รองรับ cone, line, cylinder shapes แบบเต็ม

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `SimpleEnemy` (interface) | 550 | { uid, th, hpNow, ac, conditions?, ... } |
| `selectEnemiesInAoE(enemies, enemyPositions, playerPos, aoeType?, aoeSize?)` | 560 | grid-based selection |

### Dependencies
```typescript
import * as aoe from "./aoe";
```
(แต่จริง ๆ แล้ว `selectEnemiesInAoE` ไม่ได้เรียกใช้อะไรจาก aoe.ts — มีแค่ import เฉย ๆ)

### สถานะการใช้งาน
- ⚠️ DnDSolo.tsx **ไม่ได้ import** ตรง ๆ — แต่มี logic คล้าย ๆ กัน inline อยู่ใน `castSRDSpell`

---

## 6. Condition Helpers (Section 6)

### หน้าที่
Read enemy conditions สำหรับ combat modifiers
เป็น version ที่ "รวม" condition lists จาก `gameData.ts` (DISADV_CONDS, ENEMY_ADV_CONDS, INCAPACITATING_CONDS) เป็น helper functions

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `INCAPACITATING_CONDITIONS` | 585 | ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"] |
| `ATTACK_DISADVANTAGE_CONDITIONS` | 589 | ["prone", "restrained", "blinded", "frightened", "poisoned"] |
| `ATTACKER_ADVANTAGE_VS_CONDITIONS` | 593 | ["restrained", "blinded", "paralyzed", "petrified", "prone", "stunned", "unconscious", "grappled"] |
| `enemyHasAttackDisadvantage(enemy)` | 598 |  |
| `attackerHasAdvantageVs(enemy)` | 603 |  |
| `enemyIsIncapacitated(enemy)` | 608 |  |

### Dependencies
ไม่มี

### สถานะการใช้งาน
- ⚠️ DnDSolo.tsx **ไม่ได้ import** — มี inline logic คล้าย ๆ กัน

---

## 7. Concentration Tracking (Section 7)

### หน้าที่
Track concentration spells — ONE spell at a time per caster
`CONCENTRATION_SPELLS` — Set ของชื่อ spell ที่เป็น concentration (Bless, Haste, Shield Of Faith, Hold Person, ฯลฯ — 36 spells)
`concentrationDC(damage)` — D&D 2024: `max(10, damage/2)`, capped at 30

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `CONCENTRATION_SPELLS` | 616 | Set ของ 36 concentration spells |
| `hasConcentrationBuff(character)` | 627 | check ว่ากำลัง concentrate อยู่ไหม |
| `getActiveConcentrationBuff(character)` | 631 | ดึง buff ที่กำลัง concentrate |
| `concentrationDC(damage)` | 636 | DC = max(10, damage/2), cap 30 |

### Dependencies
ไม่มี

### สถานะการใช้งาน
- ⚠️ DnDSolo.tsx **ไม่ได้ import** — มี inline concentration logic

---

## 8. Buff Modifier Helpers (Section 8)

### หน้าที่
Compute attack/AC modifiers จาก active buffs
รองรับ: Bless (+1d4 atk), Bane (-1d4 atk), Hunter's Mark (+1d6 dmg), Hex (+1d6 dmg), Faerie Fire (advantage), Shield (+5 AC), Shield Of Faith (+2 AC), Haste (+2 AC), Slow (-2 AC)

⚠️ **Rolls dice inline** — ไม่ได้ใช้ engine/dice.ts หรือ diceEngine.ts (ใช้ `Math.random()` ตรง ๆ)

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `AttackModifiers` (interface) | 644 | { bonusToHit, bonusToDamage, advantage, disadvantage, notes } |
| `getAttackModifiers(character, target?)` | 653 | compute from buffs |
| `getACModifier(character)` | 696 | compute AC mod from buffs |

### Dependencies
ไม่มี (ใช้ Math.random)

### สถานะการใช้งาน
- ⚠️ DnDSolo.tsx **ไม่ได้ import** — มี inline buff logic คล้าย ๆ กัน

---

## 9. Save/Load with Versioning (Section 9)

### หน้าที่
localStorage save/load สำหรับ legacy save format
`SAVE_KEY = "dnd-solo-save-v3"`

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `saveGame(payload)` | 714 | localStorage.setItem |
| `loadGame()` | 723 | localStorage.getItem + migrateLegacySave |
| `deleteSave()` | 734 | localStorage.removeItem |

### Dependencies
```typescript
// ใช้ migrateLegacySave จาก Section 4
```

### สถานะการใช้งาน
- ✅ DnDSolo.tsx import: `saveGame` (as `engineSaveGame`), `loadGame` (as `engineLoadGame`), `deleteSave` (as `engineDeleteSave`)

---

## 10. Character State Sync (Section 10)

### หน้าที่
แปลง legacy character object (flat struct จาก gameData.ts) เป็น `CharacterState` ของ gameState.ts
ใช้สำหรับ save versioning + bridge ไปยัง State Update pipeline ในอนาคต

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `characterToState(c)` | 747 | legacy character → CharacterState |

### Dependencies
```typescript
import { createCharacterState } from "./gameState";
```

### สถานะการใช้งาน
- ⚠️ DnDSolo.tsx **ไม่ได้ import** — เป็น "available but unwired"

---

## 11. Monster Adapter (Section 11)

### หน้าที่
`fetchMonsterForCombat(monsterId)` — ดึง monster จาก **Open5e v2 (2024)** ก่อน, fallback ไป **srd.ts (2014)**
แปลงเป็น legacy combatant shape ที่ DnDSolo.tsx คาดหวัง:
`{ uid, id, th, hp, hpNow, ac, atk, dmg, init, xp, sv, cr, attacks, specialAbilities, legendaryActions, actions, ... }`

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `fetchMonsterForCombat(monsterId)` | 780 | async — Open5e → fallback to srd |

### Dependencies
```typescript
import { fetchMonster as srdFetchMonster, type NormalizedMonster } from "./srd";
import { getCreature as open5eGetCreature, creatureToLegacyCombatant, type NormalizedCreature } from "./open5e";
```

### สถานะการใช้งาน
- ✅ DnDSolo.tsx import: `fetchMonsterForCombat`

ดูเพิ่มเติม: [content-api.md](content-api.md)

---

## 12. Effects Engine Adapter (Section 12)

### หน้าที่
Apply/remove/tick buff durations — bridge ระหว่าง spell "buff" kind handler และ effects.ts EffectEngine
ปัจจุบันใช้ inline logic ง่าย ๆ (ไม่ได้ delegate ไป effects.ts จริง)

### Exports

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `applyBuffToCharacter(buff, character)` | 886 | add buff (refresh duration if exists) — Mage Armor ตั้ง flag |
| `removeBuffFromCharacter(character, buffName)` | 903 |  |
| `tickBuffDurations(character)` | 910 | tick -1 round, คืน [newChar, expiredBuffNames] |

### Dependencies
ไม่มี — pure inline logic

### สถานะการใช้งาน
- ⚠️ DnDSolo.tsx **ไม่ได้ import ตรง** — มี inline buff logic อยู่แล้ว

---

## ภาพรวมการใช้งานใน UI

| Section | Export ที่ DnDSolo ใช้จริง | สัดส่วน |
|---:|---|---:|
| 1 (Time) | `initWorldClockFromLegacy`, `worldClockToLegacy`, `getWorldClock`, `advanceHours` | 4/7 (57%) |
| 2 (EventBus) | 13 emit* + query/getTriggered + PendingStateChange | 17/17 (100%) |
| 3 (Rule Engine) | (none) | 0/3 (0%) |
| 4 (Game State) | `LegacySave` (type only) | 1/3 (33%) |
| 5 (AoE) | (none) | 0/2 (0%) |
| 6 (Conditions) | (none) | 0/6 (0%) |
| 7 (Concentration) | (none) | 0/4 (0%) |
| 8 (Buff Modifiers) | (none) | 0/3 (0%) |
| 9 (Save/Load) | `saveGame`, `loadGame`, `deleteSave` | 3/3 (100%) |
| 10 (Char State Sync) | (none) | 0/1 (0%) |
| 11 (Monster) | `fetchMonsterForCombat` | 1/1 (100%) |
| 12 (Effects) | (none) | 0/3 (0%) |
| **รวม** | **20 จาก 53 exports** | **38%** |

## Dependencies (Imports)

```typescript
// Domain modules
import { WorldClock } from "./time";
import { EventBus, type GameEvent, type EventListener } from "./events";
import { RuleRegistry, COMMON_RULES, validateRule } from "./ruleEngine";
import type { SaveSnapshot } from "./gameState";
import type { Quest } from "./gameData";
import { createCharacterState } from "./gameState";
import { fetchMonster as srdFetchMonster, type NormalizedMonster } from "./srd";
import { getCreature as open5eGetCreature, creatureToLegacyCombatant, type NormalizedCreature } from "./open5e";

// Late import (Section 5)
import * as aoe from "./aoe";
```

⚠️ **ไม่ import อะไรจาก `engine/`** — engineAdapters เป็น bridge ระหว่าง UI กับ domain modules (v1)
ไม่ได้ bridge เข้า `engine/` (v2)

## Importers

| Importer | บรรทัดที่ใช้ | หน้าที่ |
|---|---|---|
| `src/components/DnDSolo.tsx` | ~80 บรรทัด import | UI integration |
| `scripts/test_adapters.ts` | test file | ทดสอบ adapter functions |
| `scripts/test_comprehensive.ts` | test file | integration test |
| `scripts/test_eventbus.ts` | test file | EventBus test |

## ประเด็นสำคัญ

1. **engineAdapters ไม่ได้ bridge เข้า engine/** — ทั้งหมดเป็น domain modules (v1)
   การ wire engine/ รุ่นใหม่เข้า UI ยังเป็น gap ใหญ่

2. **38% ของ exports ใช้จริง** — ส่วนที่เหลือเป็น "available but unwired"
   บางส่วนมี inline logic ซ้ำใน DnDSolo.tsx (Conditions, Concentration, Buff Modifiers)

3. **Inline dice rolling** — `getAttackModifiers` ใช้ Math.random() ไม่ผ่าน diceEngine หรือ engine/dice.ts
   ทำให้ replay ไม่ได้

4. **Migration path** — เมื่อ wire engine/ รุ่นใหม่, engineAdapters ควร:
   - Section 3: ใช้ engine/combat.ts resolveAttack แทน RuleRegistry
   - Section 7-8: ใช้ engine/effects.ts แทน inline buff logic
   - Section 10: ใช้ gameState.ts GameState class แทน LegacySave
   - Section 12: ใช้ engine/effects.ts EffectEngine แทน inline

ดูแผนเพิ่มเติม: [09-roadmap/migration-plan.md](../09-roadmap/migration-plan.md)
