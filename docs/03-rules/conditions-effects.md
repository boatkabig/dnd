# 03 — Conditions & Effects

> 15 standard D&D 5e conditions + buff/debuff effect system
>
> **สถานะรวม**: มีสองระบบขนาน:
> 1. **`src/lib/conditions.ts`** (418 บรรทัด, v1) — 15 conditions pure data + apply/remove/tick; **ใช้ใน UI**
> 2. **`src/lib/engine/effects.ts`** (865 บรรทัด, v2) — Effect system + conditions + modifier pipeline + triggers; **engine only**

## ความแตกต่าง Condition vs Effect (D&D 5e)

| | Condition | Effect |
|---|---|---|
| แหล่งกำเนิด | Rules-defined (15 standards) | Spell/Feature/Item |
| Stacking | Replaced (ยกเว้น Exhaustion) | Data-driven per effect |
| ตัวอย่าง | Blinded, Poisoned, Prone | Bless, Haste, Hex, Slow |
| Tracking | `conditions.ts` | `effects.ts` |

## 15 Standard Conditions

ทั้ง 15 conditions ถูก define ครบในทั้งสองไฟล์:

| # | Condition | nameTh | ผลกระทบหลัก | Duration Default |
|---:|---|---|---|---|
| 1 | Blinded | ตาบอด | disadv attacks, auto-fail perception, enemy adv | until short rest |
| 2 | Charmed | ถูกเสน่ห์ | ไม่โจมตี charmer ได้, charmer adv social | concentration |
| 3 | Deafened | หูหนวก | auto-fail hearing checks | rounds |
| 4 | Frightened | หวาดกลัว | disadv checks/attacks while source visible, can't approach | concentration |
| 5 | Grappled | ถูกจับ | speed 0, หายถ้า grappler incapacitated/moved | permanent |
| 6 | Incapacitated | ไร้ความสามารถ | ไม่ทำ action/reaction ได้ | rounds |
| 7 | Invisible | ล่องหน | adv attacks, enemy disadv, hide anywhere | concentration |
| 8 | Paralyzed | ชา | incapacitated + auto-fail STR/DEX + melee crit | concentration |
| 9 | Petrified | กลายเป็นหิน | incapacitated + weight ×10 + auto-fail STR/DEX | permanent |
| 10 | Poisoned | ถูกพิษ | disadv attacks + checks | rounds |
| 11 | Prone | ล้ม | crawl only, melee adv vs, ranged disadv vs | permanent |
| 12 | Restrained | ถูกตรึง | speed 0 + disadv attacks + enemy adv + DEX disadv | rounds |
| 13 | Stunned | มึนงง | incapacitated + auto-fail STR/DEX/CON + enemy adv | rounds |
| 14 | Unconscious | หมดสติ | incapacitated + drop items + melee crit + auto-fail STR/DEX | permanent |
| 15 | Exhaustion | อ่อนเพลีย | D&D 2024: -2/level D20 + -5 ft/level Speed, Lv6 = death | until long rest |

### Condition Definition Structure

**ไฟล์**: `src/lib/conditions.ts:26-51`

```typescript
export interface ConditionDef {
  id: ConditionId;
  name: string;
  nameTh: string;
  description: string;
  descriptionTh: string;
  // Mechanical effects
  attackDisadvantage?: boolean;
  attackAdvantageAgainstYou?: boolean;
  checkDisadvantage?: boolean;
  saveDisadvantage?: { abilities: string[] };
  speedMultiplier?: number;            // 0 = can't move, 0.5 = half
  incapacitates?: boolean;
  autoFailSaves?: string[];
  autoFailChecks?: string[];
  dropsConcentration?: boolean;
  cannotSpeak?: boolean;
  cannotMove?: boolean;
  fallsProne?: boolean;
  // Interaction
  stacks?: boolean;
  replaces?: ConditionId[];
  cancels?: ConditionId[];
  // Duration
  defaultDurationType?: DurationType;
}
```

### ตัวอย่าง: Paralyzed

```typescript
// conditions.ts:111-119
paralyzed: {
  id: "paralyzed", name: "Paralyzed", nameTh: "ชา",
  description: "Incapacitated, can't move or speak. STR/DEX saves auto-fail. Attacks within 5ft have advantage and are critical hits.",
  descriptionTh: "ไร้ความสามารถ, เคลื่อนไหว/พูดไม่ได้, STR/DEX save ล้มเหลวอัตโนมัติ, โจมตีในระยะ 5 ฟุตได้เปรียบและเป็นคริติคอล",
  incapacitates: true, cannotMove: true, cannotSpeak: true,
  autoFailSaves: ["str", "dex"],
  attackAdvantageAgainstYou: true,
  defaultDurationType: "concentration",
},
```

### Apply / Remove / Tick

**ไฟล์**: `src/lib/conditions.ts:207-417`

```typescript
export function applyCondition(
  activeConditions: ConditionInstance[],
  conditionId: ConditionId,
  source: ConditionSource,
  sourceName?: string,
  durationType?: DurationType,
  durationValue?: number,
  immunityList: ConditionId[] = [],
  round: number = 1,
): { conditions: ConditionInstance[]; result: ApplyResult } {
  // 1. ตรวจ immunity
  if (immunityList.includes(conditionId)) return { ... };
  // 2. ประมวลผล cancels/replaces
  if (def.cancels) { /* remove cancelled */ }
  if (def.replaces) { /* remove replaced */ }
  // 3. ตรวจ stacks — ถ้าไม่ stacks และมีอยู่แล้ว → replace (refresh duration)
  // 4. Apply new instance
  // 5. Exhaustion: stack level +1
  if (conditionId === "exhaustion") {
    instance.level = existing ? (existing.level || 1) + 1 : 1;
  }
  // ...
}

// Tick durations per round
export function tickConditionDurations(
  activeConditions: ConditionInstance[],
  isEndOfRound: boolean = true,
): { conditions: ConditionInstance[]; expired: ConditionId[] } {
  // Decrement roundsRemaining, remove if 0
  // "until_end_of_turn" expire at end of round
  // "permanent" / "instant" never expire
}
```

### Condition Query Helpers

**ไฟล์**: `src/lib/conditions.ts:334-371`

```typescript
export function hasAttackDisadvantage(activeConditions: ConditionInstance[]): boolean
export function hasAttackAdvantageAgainstYou(activeConditions: ConditionInstance[]): boolean
export function hasCheckDisadvantage(activeConditions: ConditionInstance[]): boolean
export function isIncapacitated(activeConditions: ConditionInstance[]): boolean
export function cannotMove(activeConditions: ConditionInstance[]): boolean
export function autoFailSave(activeConditions: ConditionInstance[], ability: string): boolean
export function autoFailCheck(activeConditions: ConditionInstance[], skill: string): boolean
export function getExhaustionLevel(activeConditions: ConditionInstance[]): number
```

UI shortcuts (`gameData.ts:80-83`):
```typescript
export const DISADV_CONDS = ["poisoned", "frightened", "restrained", "blinded", "prone", "stunned", "paralyzed", "exhausted"];
export const CHECK_DISADV_CONDS = ["poisoned", "frightened", "blinded", "exhausted"];
export const ENEMY_ADV_CONDS = ["restrained", "blinded", "prone", "paralyzed", "stunned", "unconscious", "petrified", "grappled"];
export const INCAPACITATING_CONDS = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"];
```

## Effect System (engine v2)

**ไฟล์**: `src/lib/engine/effects.ts` (865 บรรทัด)

### Effect Categories (8 ประเภท)

```typescript
export type EffectCategory =
  | "buff"           // Bless, Haste
  | "debuff"         // Bane, Slow
  | "aura"           // Aura of Protection
  | "ongoing_damage" // Poison, Bleeding
  | "transformation" // Polymorph, Wild Shape
  | "condition"      // standard D&D condition
  | "passive"        // from equipment/feature
  | "custom";
```

### Effect Duration (8 ประเภท)

```typescript
export type EffectDurationType =
  | "instant"              // applies once
  | "rounds"               // N rounds (1 round = 6s in combat)
  | "minutes"              // out of combat
  | "hours"
  | "concentration"        // until concentration breaks
  | "until_short_rest"
  | "until_long_rest"
  | "permanent";
```

### Stacking Rules (4 ประเภท)

```typescript
export type StackingRule =
  | "replace"    // new replaces old (default for conditions)
  | "stack"      // multiple instances allowed
  | "refresh"    // extend duration
  | "ignore";    // if already applied, no-op
```

### Modifier Pipeline (8 targets)

```typescript
export type ModifierTarget =
  | "attack_roll"       | "damage_roll"      | "ac"
  | "saving_throw"      | "skill_check"      | "speed"
  | "initiative"        | "ability_score"    | "spell_save_dc"
  | "spell_attack";

export interface EffectModifier {
  target: ModifierTarget;
  bonus?: number;          // flat bonus (+1 AC)
  diceBonus?: string;      // dice bonus (+1d4 from Bless)
  advantage?: boolean;
  disadvantage?: boolean;
  filter?: string;         // "str" / "stealth" / etc.
  condition?: string;      // "against fiends"
}
```

### Trigger System (16 triggers)

```typescript
export type EffectTrigger =
  | "on_attack"             | "on_hit"              | "on_miss"
  | "on_damage_dealt"       | "on_damage_taken"     | "on_turn_start"
  | "on_turn_end"           | "on_round_start"      | "on_round_end"
  | "on_kill"               | "on_death"            | "on_concentration_check"
  | "on_save"               | "on_skill_check"      | "on_critical_hit"
  | "on_critical_fail";
```

ตัวอย่าง use case: **Fire Shield** (on_damage_taken → deal_damage 2d8 fire to attacker), **Aura of Protection** (on_save → grant_bonus +PB), **Bless** (on_attack_roll → diceBonus "+1d4")

### Apply / Remove / Tick

```typescript
// effects.ts:445-496
export function applyEffect(
  activeEffects: ActiveEffect[],
  effectDef: EffectDef,
  targetCharacterId: string,
  sourceCharacterId?: string,
  metadata?: Record<string, unknown>,
): { activeEffects: ActiveEffect[]; newEffect: ActiveEffect | null } {
  // Stack handling: ignore / refresh / replace / new instance
  // ...
}

export function tickEffect(activeEffects: ActiveEffect[], characterId: string): ActiveEffect[]
export function tickAllEffects(activeEffects: ActiveEffect[]): ActiveEffect[]
export function breakConcentration(activeEffects: ActiveEffect[], targetCharacterId: string): ActiveEffect[]
export function clearOnShortRest(activeEffects: ActiveEffect[]): ActiveEffect[]
export function clearOnLongRest(activeEffects: ActiveEffect[]): ActiveEffect[]
```

### Modifier Aggregation

```typescript
export function getAllModifiers(
  activeEffects: ActiveEffect[],
  characterId: string,
  target: ModifierTarget,
  filter?: string,
): Array<{ modifier: EffectModifier; source: string }>

export function getTotalBonus(activeEffects, characterId, target, filter?): number
export function hasAdvantage(activeEffects, characterId, target, filter?): boolean
export function hasDisadvantage(activeEffects, characterId, target, filter?): boolean
export function getDiceBonuses(activeEffects, characterId, target, filter?): string[]
```

## UI Buff Tracking (v1 simplified)

**ไฟล์**: `src/lib/engineAdapters.ts:886-926`

UI ใช้ simplified buff tracking แยกจาก engine:

```typescript
export function applyBuffToCharacter(buff: {
  character: any;
  name: string;
  effect: string;
  duration?: number; // rounds
}): any

export function removeBuffFromCharacter(character: any, buffName: string): any

export function tickBuffDurations(character: any): [any, string[]] // returns [updatedChar, expiredBuffs]
```

```typescript
export const INCAPACITATING_CONDITIONS = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"];
export const ATTACK_DISADVANTAGE_CONDITIONS = ["poisoned", "frightened", "restrained", "blinded", "prone", "stunned", "paralyzed"];
export const ATTACKER_ADVANTAGE_VS_CONDITIONS = ["restrained", "blinded", "prone", "paralyzed", "stunned", "unconscious", "petrified", "grappled"];

export function enemyHasAttackDisadvantage(enemy: SimpleEnemy): boolean
export function attackerHasAdvantageVs(enemy: SimpleEnemy): boolean
export function enemyIsIncapacitated(enemy: SimpleEnemy): boolean
```

```typescript
export const CONCENTRATION_SPELLS = new Set([
  "bless", "bane", "shield_of_faith", "hold_person", "fly", "haste", ...
]);

export function hasConcentrationBuff(character: any): boolean
export function getActiveConcentrationBuff(character: any): any | null
export function concentrationDC(damage: number): number // ⚠️ ไม่มี cap 30 ตาม 2024
```

## กฎที่ยังไม่ Implement

- **Buff/debuff conditional application** (e.g. Bless ขณะโจมตี fiends) — `EffectModifier.condition` มี field แต่ engine ไม่ได้ enforce
- **Aura effect radius** — `EffectCategory.aura` มี แต่ไม่มี radius tracking จริง
- **Polymorph / Wild Shape stat block swap** — `transformation` category มี แต่ไม่มี implementation
- **Poison damage stacking** — engine รองรับ แต่ UI ไม่ได้ใช้
- **Condition interaction edge cases** (e.g. Charmed + Frightened จาก charmer) — ไม่มี
- **Disease / special conditions** (2014 DMG) — ไม่มี
- **Stunned → Incapacitated chain** — เป็น data relationship แต่ engine ไม่ auto-apply incapacitated เมื่อ stunned

## D&D 2024 vs 2014 Differences

| Condition / Effect | D&D 2014 | D&D 2024 | Engine ใช้ |
|---|---|---|:---:|
| Exhaustion | 6 tiered levels (different effect each) | Flat: -2/level D20 Tests, -5 ft/level Speed, Lv6=death | ✅ 2024 (`gameData.exhaustionPenalty`) |
| Blinded | Disadv on attacks, auto-fail sight checks | Same — minor wording | ✅ |
| Charmed | No attack charmer, charmer adv social | Same | ✅ |
| Frightened | Disadv while source visible | Same — clarified "you can see source" | ✅ |
| Grappled | Speed 0, Athletics check to escape | Same — but DC = 8 + STR + PB (escape via STR save) | ✅ |
| Invisible | Adv on attacks, disadv vs you | Same — but hiding rules clarified | ✅ |
| Poisoned | Disadv attacks + checks | Same | ✅ |
| Prone | Crawl only, melee adv vs, ranged disadv vs | Same | ✅ |
| Stunned | Auto-fail STR/DEX | Same — added CON auto-fail in some interpretations | ✅ |
| Surprise (not condition) | Skip turn 1 | Disadv on Initiative | ✅ 2024 |

## อ้างอิง

- [coverage-matrix.md](coverage-matrix.md) — Matrix ภาพรวม
- [02-modules/engine-submodules.md](../02-modules/engine-submodules.md#effectsts) — effects.ts รายละเอียด
- [combat.md](combat.md) — การใช้ condition ใน attack resolution
- [magic.md](magic.md) — Concentration effect tracking
- [rest-exhaustion.md](rest-exhaustion.md) — Exhaustion + condition cleanup บน rest
- D&D Beyond Free Rules 2024 — "Conditions", "Exhaustion [Condition]"
