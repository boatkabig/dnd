# 03 — Rest & Exhaustion

> Short Rest / Long Rest / Hit Dice / Resource Recovery / Exhaustion (D&D 2024)
>
> **สถานะรวม**: `engine/rest.ts` (726 บรรทัด) implement ครอบคลุมครบตาม D&D 2024 rules แต่ **UI ไม่ได้ใช้** — UI มีปุ่ม Short Rest / Long Rest แต่ไม่ได้เรียก engine pipeline

## ภาพรวม Rest Pipeline

```
1. canRest(restType, environment, lastLongRestHoursAgo) → validate (safe? 16hr gap?)
2. performShortRest / performLongRest → apply recovery rules
3. checkInterruption(restType, interruptionType, minutesIntoRest) → if interrupted, rest fails
4. trigger on_rest event → Effects system clears until_short_rest / until_long_rest
```

## ประเภท Rest

**ไฟล์**: `src/lib/engine/rest.ts:60-84`

| Rest Type | Duration | ผล |
|---|---|---|
| Short Rest | 1 ชม. (60 นาที) | ใช้ Hit Dice heal, refresh short-rest resources, refresh Pact Magic |
| Long Rest | 8 ชม. (480 นาที) | HP → max, restore **ALL** Hit Dice (2024), restore all slots, clear effects, exhaustion -1 |

```typescript
export const REST_TYPES: Record<RestType, RestTypeDef> = {
  short_rest: {
    type: "short_rest", name: "Short Rest",
    durationMinutes: 60,
    description: "1 hour of rest. Spend Hit Dice to recover HP. Refresh short-rest resources.",
  },
  long_rest: {
    type: "long_rest", name: "Long Rest",
    durationMinutes: 480,
    description: "8 hours of rest (6 sleeping, 2 light activity). Restore HP to max, recover half Hit Dice, refresh all spell slots, reduce exhaustion by 1.",
  },
};
```

⚠️ **ความขัดแย้ง**: Description บอกว่า Long Rest "recover **half** Hit Dice" ซึ่งเป็นกฎ **2014** — แต่ `recoverHitDice` จริง ๆ แล้ว restore ALL (ตามกฎ 2024) — ความคลาดเคลื่อนเล็กน้อยใน docstring

## กฎที่ Implement

### Hit Dice Pool

**ไฟล์**: `src/lib/engine/rest.ts:94-120` (`HitDicePool`, `createHitDicePool`)

D&D 5e: แต่ละ class level ให้ 1 Hit Die ตาม class hit die type (d6/d8/d10/d12)
- Sorcerer/Wizard: d6
- Bard/Cleric/Druid/Monk/Rogue/Warlock: d8
- Fighter/ Paladin/Ranger: d10
- Barbarian: d12

```typescript
export interface HitDicePool {
  bySize: Record<string, { max: number; current: number }>; // { "d8": 5, "d6": 2 }
  totalMax: number;
  totalCurrent: number;
}

export function createHitDicePool(
  classLevels: Array<{ level: number; hitDie: number }>,
): HitDicePool {
  const bySize: Record<string, { max: number; current: number }> = {};
  let totalMax = 0;
  for (const cl of classLevels) {
    const size = `d${cl.hitDie}`;
    if (!bySize[size]) bySize[size] = { max: 0, current: 0 };
    bySize[size].max += cl.level;
    bySize[size].current += cl.level;
    totalMax += cl.level;
  }
  return { bySize, totalMax, totalCurrent: totalMax };
}
```

### Spending Hit Dice (Short Rest)

**ไฟล์**: `src/lib/engine/rest.ts:126-146` (`spendHitDie`)

```typescript
export function spendHitDie(
  pool: HitDicePool,
  dieSize: string,
  conModifier: number,
  seed?: number,
): { heal: number; newPool: HitDicePool } {
  const entry = pool.bySize[dieSize];
  if (!entry || entry.current <= 0) return { heal: 0, newPool: pool };

  const heal = rollDamage(`1${dieSize}`, false, { seed }).total + conModifier;
  const newPool: HitDicePool = {
    bySize: { ...pool.bySize, [dieSize]: { ...entry, current: entry.current - 1 } },
    totalMax: pool.totalMax,
    totalCurrent: pool.totalCurrent - 1,
  };
  return { heal: Math.max(1, heal), newPool }; // min 1 HP per HD
}
```

### Long Rest: Restore ALL Hit Dice (D&D 2024)

**ไฟล์**: `src/lib/engine/rest.ts:148-164` (`recoverHitDice`)

D&D 2024 เปลี่ยนจาก 2014:
- **2024**: restore **ALL** spent Hit Dice
- **2014**: restore half total (min 1)

```typescript
export function recoverHitDice(pool: HitDicePool): HitDicePool {
  // D&D 2024: restore ALL Hit Dice to max
  const bySize: Record<string, { max: number; current: number }> = {};
  let totalCurrent = 0;
  for (const [size, entry] of Object.entries(pool.bySize)) {
    bySize[size] = { max: entry.max, current: entry.max };
    totalCurrent += entry.max;
  }
  return { bySize, totalMax: pool.totalMax, totalCurrent };
}
```

### Rest Requirements (D&D 2024)

**ไฟล์**: `src/lib/engine/rest.ts:188-245` (`canRest`)

D&D 2024:
- หลัง Long Rest ต้องรอ **16 ชม.** ก่อนเริ่ม Long Rest ใหม่ (2014: 24 ชม.)
- สภาพแวดล้อมต้อง **safe** (no hostiles nearby)
- **Extreme weather** ทำ Long Rest ไม่ได้ถ้าไม่มี shelter

```typescript
export function canRest(
  restType: RestType,
  environment: RestEnvironment,
  lastLongRestHoursAgo: number = 17,
): RestRequirement {
  if (restType === "long_rest") {
    // D&D 2024: must wait at least 16 hours between Long Rests
    if (lastLongRestHoursAgo < 16) {
      return { valid: false,
        reason: `ต้องรออย่างน้อย 16 ชั่วโมงหลัง Long Rest ก่อนหน้า (D&D 2024 — เหลือ ${16 - lastLongRestHoursAgo} ชม.)`,
        requiredMinutes: 480 };
    }
    if (environment.weather === "extreme") return { valid: false, ... };
    if (environment.hasHostilesNearby) return { valid: false, ... };
  }
  // Short Rest: แค่เช็ค hostiles
  return { valid: true, requiredMinutes: 60 };
}
```

### Rest Interruption (D&D 2024)

**ไฟล์**: `src/lib/engine/rest.ts:249-353` (`checkInterruption`)

D&D 2024 interruption triggers:
- **Rolling Initiative** (combat)
- **Casting a spell other than a cantrip**
- **Taking any damage** (NEW in 2024 — ไม่มีใน 2014)
- **1 hour of walking or physical exertion** (Long Rest only)

| Trigger | Short Rest | Long Rest |
|---|---|---|
| Combat | ❌ Hard-interrupt | ❌ Hard-interrupt (≥1 hr → Short Rest benefits) |
| Non-cantrip spell | ❌ Hard-interrupt | ❌ Hard-interrupt (≥1 hr → Short Rest benefits) |
| Damage taken | ❌ Hard-interrupt (NEW) | ❌ Hard-interrupt (NEW, ≥1 hr → Short Rest benefits) |
| 1 hr exertion | (no effect) | ❌ Interrupts (can resume with +1 hr) |

```typescript
export function checkInterruption(
  restType: RestType,
  interruption: InterruptionType,
  minutesIntoRest: number,
  totalInterruptionMinutes: number = 0,
): RestInterruption {
  const hardInterrupts: InterruptionType[] = ["combat", "non_cantrip_spell", "damage_taken"];
  const isHardInterrupt = hardInterrupts.includes(interruption);

  if (restType === "short_rest") {
    // Short Rest: any hard interrupt cancels — no benefits, no resume
    if (isHardInterrupt) cancelsRest = true;
  } else { // long_rest
    if (isHardInterrupt) {
      cancelsRest = true;
      if (minutesIntoRest >= 60) grantsShortRestBenefitsInstead = true; // D&D 2024
      canResume = true; // D&D 2024: can resume with +1 hour per interruption
    }
  }
  // ...
}
```

### Short Rest Execution

**ไฟล์**: `src/lib/engine/rest.ts:397-439` (`performShortRest`)

Pipeline:
1. Spend Hit Dice (player chooses how many) — heal = sum of rolls + CON mod each
2. Restore short-rest resources to max
3. Restore Pact Magic slots (if Warlock)
4. Clear effects with duration `until_short_rest`

```typescript
export function performShortRest(req: ShortRestRequest): ShortRestResult {
  let hp = req.currentHP;
  let hitDicePool = req.hitDicePool;
  let totalHeal = 0;

  // 1. Spend Hit Dice
  for (const { dieSize, count } of req.hitDiceToSpend) {
    for (let i = 0; i < count; i++) {
      const result = spendHitDie(hitDicePool, dieSize, req.conModifier, seedCounter);
      if (result.heal > 0) {
        totalHeal += result.heal;
        hitDicePool = result.newPool;
      }
    }
  }
  hp = Math.min(req.maxHP, hp + totalHeal);

  // 2. Restore Pact Magic slots
  if (req.spellSlots?.pactMagicSlots) {
    newSpellSlots = restorePactMagicSlots(req.spellSlots);
  }

  // 3. Restore short-rest resources (Action Surge, Bardic Inspiration L5+, etc.)
  const restoredResources = req.shortRestResources.map(r => r.id);

  // 4. Clear until_short_rest effects
  const newActiveEffects = clearOnShortRest(req.activeEffects);
  // ...
}
```

### Long Rest Execution

**ไฟล์**: `src/lib/engine/rest.ts:482-518` (`performLongRest`)

Pipeline:
1. Restore HP to max (no HD spend needed)
2. Recover **ALL** spent Hit Dice (D&D 2024 change)
3. Restore ALL spell slots (standard + pact magic)
4. Restore all long-rest resources to max
5. Clear effects with duration `until_short_rest` OR `until_long_rest`
6. Reduce exhaustion by 1 (min 0)

```typescript
export function performLongRest(req: LongRestRequest): LongRestResult {
  // 1. HP → max
  const newHP = req.maxHP;
  // 2. Hit Dice recovery (D&D 2024 — ALL)
  const newHitDicePool = recoverHitDice(req.hitDicePool);
  // 3. Spell slots
  let newSpellSlots = req.spellSlots;
  if (newSpellSlots) {
    newSpellSlots = restoreAllSlots(newSpellSlots);
    if (newSpellSlots?.pactMagicSlots) newSpellSlots = restorePactMagicSlots(newSpellSlots);
  }
  // 4. Restore resources
  const restoredResources = req.longRestResources.map(r => r.id);
  // 5. Clear effects
  const newActiveEffects = clearOnLongRest(req.activeEffects);
  // 6. Exhaustion -1 (min 0)
  const newExhaustionLevel = Math.max(0, req.exhaustionLevel - 1);
  // ...
}
```

### Resource Recovery (12 Standard Resources)

**ไฟล์**: `src/lib/engine/rest.ts:626-667` (`STANDARD_RESOURCES`)

| Resource | Max | Recovery | Source |
|---|:---:|---|---|
| Action Surge | 1 | Short Rest | Fighter L2 |
| Action Surge (Improved) | 2 | Short Rest | Fighter L17 |
| Second Wind | 1 | Short Rest | Fighter L1 |
| Bardic Inspiration | 1 | Long Rest (Short Rest at L5+ 2024) | Bard L1 |
| Superiority Dice | 4 | Short Rest | Battle Master L3 |
| Ki Points | 1 | Short Rest | Monk L2 |
| Channel Divinity | 1 | Short Rest | Cleric/Paladin L1 |
| Lay on Hands | 5 | Long Rest | Paladin L1 |
| Rage | 2 | Long Rest | Barbarian L1 |
| Wild Shape | 2 | Short Rest | Druid L2 |
| Indomitable | 1 | Long Rest | Fighter L9 |
| Arcane Recovery | 1 | Long Rest (acts on Short Rest) | Wizard L1 |

### Exhaustion System (D&D 2024)

**ไฟล์**: `src/lib/gameData.ts:50-59` + `src/lib/conditions.ts:75-81`

D&D 2024 เปลี่ยน Exhaustion อย่างสิ้นเชิง:
- **2024**: ระดับ 0-6, แต่ละระดับ = **-2 ต่อ D20 Test** + **-5 ฟุต Speed**, Lv6 = death
- **2014**: ระดับ 0-6, แต่ละระดับมีผลแตกต่างกัน (disadv checks → speed halved → disadv attacks/saves → HP max halved → speed 0 → death)

```typescript
// gameData.ts (UI ใช้) — D&D 2024 compliant
export const EXHAUSTION_LEVELS = 6;
export function exhaustionPenalty(level: number): number {
  return level > 0 ? level * 2 : 0; // -2 per level to D20 Tests
}
export function exhaustionSpeedPenalty(level: number): number {
  return level > 0 ? level * 5 : 0; // -5 ft per level to Speed (D&D 2024)
}
export function isExhaustionDeadly(level: number): boolean {
  return level >= 6; // Level 6 = death
}
```

```typescript
// conditions.ts:75-81 — Condition definition
exhaustion: {
  id: "exhaustion", name: "Exhaustion", nameTh: "อ่อนเพลีย",
  description: "D&D 2024 Condition. Each level: -2 to D20 Tests AND -5 ft Speed per level. Level 6 = death.",
  descriptionTh: "D&D 2024: ทุกระดับ -2 ต่อ D20 Test และ -5 ฟุต Speed ต่อระดับ — Lv6: ตาย",
  stacks: true, // exhaustion stacks in levels
  defaultDurationType: "permanent", // removed only by Long Rest
},
```

⚠️ **ความขัดแย้ง**: `engine/rest.ts:681-689` มี `EXHAUSTION_LEVELS` ที่ใช้กฎ **2014** (tiered: speed halved, HP max halved, etc.) — ผิดจาก 2024

```typescript
// engine/rest.ts:681-689 — ⚠️ 2014 style (ไม่ compliant 2024)
export const EXHAUSTION_LEVELS: ExhaustionLevel[] = [
  { level: 0, effects: [], speedMultiplier: 1, hpMaxMultiplier: 1 },
  { level: 1, effects: ["Ability checks disadvantage"], speedMultiplier: 0.5, hpMaxMultiplier: 1 },
  { level: 2, effects: ["Speed halved", "Ability checks disadvantage"], speedMultiplier: 0.5, hpMaxMultiplier: 1 },
  // ... 2014 tiered system
];
```

### Downtime Activities

**ไฟล์**: `src/lib/engine/rest.ts:521-617` (`STANDARD_DOWNTIME`)

8 standard downtime activities (D&D 5e DMG):

| Activity | Days | Cost/Day | Outcome |
|---|:---:|:---:|---|
| Crafting | 1 | 0 gp | Item |
| Training | 250 | 1 gp | Skill proficiency |
| Research | 7 | 5 gp | Information |
| Work | 1 | 0 gp | 5 gp gold |
| Recuperating | 3 | 2 gp | Cure disease/poison/frailty |
| Carousing | 5 | 10 gp | Favor |
| Spell Scribing | 2 | 10 gp | Item (scroll) |
| Religious Service | 1 | 0 gp | Favor |

## กฎที่ยังไม่ Implement

- **Long Rest HP cap** (D&D 2024: ไม่ recover HP ถ้า HP = 0 — ต้อง heal ก่อน) — engine ไม่เช็ก
- **Trance (Elf)** 4h Long Rest แทน 8h — ไม่มี
- **Aspect of the Beast / Natural Recovery** — ไม่มี
- **Dwarven Resilience** (poison adv) — มีใน race trait แต่ไม่ auto-apply
- **Recovery from disease** — recuperating downtime มี แต่ disease condition ไม่มี
- **Food/water requirements** — ไม่มี
- **Sleep exhaustion (no Long Rest)** — ไม่มี
- **Permanent exhaustion** (จาก Raise Dead / อายุ) — ไม่มี

## D&D 2024 vs 2014 Differences

| กฎ | D&D 2014 | D&D 2024 | Engine ใช้ |
|---|---|---|:---:|
| Long Rest interval | 1 per 24 hours | 1 per 16 hours | ✅ 2024 |
| Long Rest Hit Dice | Recover half (min 1) | Recover ALL | ✅ 2024 (engine) / ⚠️ docstring 2014 |
| Short Rest interruption | Combat / spell / 1 hr walk | Combat / non-cantrip spell / **damage taken** | ✅ 2024 |
| Long Rest resumption | Cannot resume | Resume with +1 hr per interruption | ✅ 2024 |
| Exhaustion | 6 tiered levels (different effects) | Flat: -2/level D20, -5 ft/level Speed, Lv6 = death | ✅ 2024 (`gameData`) / ⚠️ 2014 (`engine/rest.ts`) |
| Bardic Inspiration | Long Rest | Short Rest at L5+ | ⚠️ ระบุ "Long Rest" default |
| Short Rest duration | 1 hour (or 8 hr variant) | 1 hour (no variant) | ✅ |
| Long Rest duration | 8 hours (6 sleep + 2 light) | 8 hours (6 sleep + 2 light) | ✅ |
| Long Rest heal | Full HP | Full HP | ✅ |
| Arcane Recovery | Once per Long Rest | Once per Long Rest (acts on Short Rest) | ✅ |

## อ้างอิง

- [coverage-matrix.md](coverage-matrix.md) — Matrix ภาพรวม
- [02-modules/engine-submodules.md](../02-modules/engine-submodules.md#restts) — rest.ts รายละเอียด
- [magic.md](magic.md) — Spell slot recovery
- [conditions-effects.md](conditions-effects.md) — Exhaustion condition + effect cleanup
- D&D Beyond Free Rules 2024 — "Short Rest", "Long Rest", "Exhaustion [Condition]"
