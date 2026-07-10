# 03 — Combat System

> ระบบ Combat ของ D&D 5e / 2024 — initiative, attack resolution, damage, death saves, grapple/shove, opportunity attacks
>
> **สถานะรวม**: กฎ Combat ส่วนใหญ่ implement ใน `engine/combat.ts` (817 บรรทัด) ครบถ้วน แต่ **UI (`DnDSolo.tsx`) ไม่ได้ใช้ engine นี้** — ใช้ inline logic + `gameData.ts` helpers แทน

## ภาพรวม Combat Lifecycle

```
createCombat() → startCombat() → [startTurn() → action → endTurn() → nextCombatant()] → endCombat()
```

Combat ใน D&D 5e ประกอบด้วย:
1. **Initiative** — ทอย d20 + DEX เพื่อจัดลำดับ
2. **Rounds** — แต่ละ round ทุก combatant ได้ action 1 ครั้ง
3. **Turn** — ประกอบด้วย Action + Bonus Action + Reaction + Movement + Free interaction
4. **Attack Resolution** — d20 + bonus vs target AC
5. **Damage Application** — resistance/vulnerability/immunity pipeline
6. **Death Saves** — 3 สำเร็จ = stable, 3 ล้มเหลว = death

## กฎที่ Implement

### Initiative

**ไฟล์**: `src/lib/engine/combat.ts:730-755` (`rollInitiative`, `sortInitiative`)

D&D 5e: ทอย d20 + DEX modifier เพื่อกำหนดลำดับ combat

```typescript
export function rollInitiative(
  dexModifier: number,
  advantage: boolean = false,
  seed?: number,
): { roll: number; total: number } {
  const r = rollD20(dexModifier, advantage ? "advantage" : "none", { seed });
  return { roll: r.die, total: r.total };
}

// Tie-break: initiative desc → DEX mod desc → player wins
export function sortInitiative(combatants): typeof combatants {
  return [...combatants].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if ((b.dexMod ?? 0) !== (a.dexMod ?? 0)) return (b.dexMod ?? 0) - (a.dexMod ?? 0);
    return (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0);
  });
}
```

**สถานะ**: ✅ Engine; ❌ UI (UI เก็บ initiative ใน enemy objects แล้ว sort inline)

### Surprise (D&D 2024)

**ไฟล์**: `src/lib/engine/combat.ts:758-795` (`setSurprised`, `canActThisTurn`)

D&D 2024 เปลี่ยนกฎ Surprise อย่างสิ้นเชิง:
- **2024**: Surprised creature ทอย Initiative ด้วย **Disadvantage** แต่ยังได้ action ปกติ
- **2014**: Surprised creature skip turn แรกทั้งหมด (ไม่ได้ action/reaction/movement)

```typescript
/**
 * D&D 2024: Surprise is NOT a condition and does NOT skip turns.
 * A surprised creature simply has Disadvantage on its Initiative roll.
 */
export function setSurprised(state: CombatState, characterId: string): CombatState {
  return {
    ...state,
    initiativeOrder: state.initiativeOrder.map(c =>
      c.characterId === characterId ? { ...c, surprised: true } : c
    ),
  };
}

// 2024: surprise does NOT prevent acting — only conscious check applies
export function canActThisTurn(combatant: Combatant): boolean {
  return combatant.conscious;
}
```

**สถานะ**: ✅ Engine (D&D 2024 compliant); ❌ UI (UI ไม่ implement surprise ที่จริงจัง)

### Attack Resolution

**ไฟล์**: `src/lib/engine/combat.ts:280-365` (`resolveAttack`)

Pipeline การโจมตีตาม D&D 5e:
1. ทอย d20 (+ adv/dis ถ้ามี)
2. **Nat 1** = automatic miss
3. **Nat 20** = automatic hit + critical
4. อื่น ๆ: hit ถ้า `d20 + attackBonus >= effectiveAC` (AC + cover bonus)
5. Full cover (`coverAC >= 999`) = unhittable

```typescript
export function resolveAttack(req: AttackRequest, target: ...): AttackResult {
  // Determine advantage state (both = cancel to none)
  let adv: "advantage" | "disadvantage" | "none" = "none";
  if (req.advantage && !req.disadvantage) adv = "advantage";
  else if (req.disadvantage && !req.advantage) adv = "disadvantage";

  const roll = rollD20(req.attackBonus, adv, { seed: req.seed });
  const effectiveAC = target.ac + req.coverAC;

  let hit: boolean;
  let critical = false;
  if (roll.die === 1) hit = false;                          // Nat 1
  else if (roll.die === 20) { hit = true; critical = true; } // Nat 20
  else if (req.coverAC >= 999) hit = false;                  // Full cover
  else hit = roll.total >= effectiveAC;
  // ... damage calculation
}
```

**Sneak Attack**: รองรับผ่าน `AttackRequest.sneakAttackDice` — เพิ่ม damage หลัง hit ( doubled ถ้า crit)

**สถานะ**: ✅ Engine; ⚠️ UI มี logic ของตัวเองที่ `DnDSolo.tsx:1753+`

### Damage Application

**ไฟล์**: `src/lib/engine/combat.ts:410-446` (`applyDamage`) + `src/lib/gameData.ts:822-830` (`applyDamageModifiers`)

Pipeline ความเสียหาย:
1. Immunity → damage = 0
2. Resistance → damage / 2 (round down)
3. Vulnerability → damage × 2
4. Apply to HP

```typescript
export function applyDamage(req: DamageRequest, currentHP: number, isConcentrating: boolean = false): DamageResult {
  let damage = req.amount;
  let modifier: DamageResult["modifier"] = "normal";

  if (req.immunities?.includes(req.damageType)) { damage = 0; modifier = "immune"; }
  else if (req.resistances?.includes(req.damageType)) { damage = Math.floor(damage / 2); modifier = "resisted"; }
  else if (req.vulnerabilities?.includes(req.damageType)) { damage = damage * 2; modifier = "vulnerable"; }

  const newHP = Math.max(0, currentHP - damage);
  // ... concentration check flag
}
```

**13 Damage Types**: slashing, piercing, bludgeoning, fire, cold, lightning, thunder, acid, poison, psychic, necrotic, radiant, force (`engine/combat.ts:452-456`)

**Concentration check on damage**: `applyDamage` flag `concentrationCheckRequired` พร้อม DC = max(10, damage/2) capped at 30 (D&D 2024)

**สถานะ**: ✅ Engine + UI (UI ใช้ `applyDamageModifiers` จาก gameData.ts)

### Critical Hit

**ไฟล์**: `src/lib/engine/combat.ts:699-724` (`calculateCriticalDamage`, `doubleDiceExpression`)

D&D 5e: nat 20 = critical hit → **double damage dice** (modifier ไม่ double)

```typescript
// "1d8+3" → "2d8+3", "2d6" → "4d6", "1d8+1d6" → "2d8+2d6"
export function doubleDiceExpression(expr: string): string {
  return expr.replace(/(\d+)d(\d+)/g, (_, count, sides) => `${parseInt(count) * 2}d${sides}`);
}
```

⚠️ **D&D 2024 update**: crit ไม่ double Sneak Attack / Divine Smite dice อีกต่อไป (เฉพาะ weapon dice) — engine นี้ยัง double ทั้งหมด ซึ่งเป็นพฤติกรรม 2014

**สถานะ**: ✅ Engine (2014 style); ⚠️ ไม่ compliant กับ 2024 ที่ crit เฉพาะ weapon dice

### Death Saves

**ไฟล์**: `src/lib/engine/combat.ts:500-536` (`rollDeathSave`, `reviveFromDowned`)

D&D 5e death save กฎ:
- ทอย d20 (no modifier, ยกเว้น Aura of Protection)
- **10+** = 1 success
- **< 10** = 1 failure
- **Nat 20** = revive ด้วย 1 HP (reset saves)
- **Nat 1** = 2 failures
- **3 successes** = stable (unconscious)
- **3 failures** = death

```typescript
export function rollDeathSave(current, roll, bonus = 0): DeathSaveResult {
  let successes = current.successes;
  let failures = current.failures;
  let state: DeathSaveResult["state"] = "unconscious";

  const total = roll + bonus;
  if (roll === 20) {
    state = "revived";
    successes = 0; failures = 0;        // reset on nat 20
  } else if (total >= 10) {
    successes += 1;
    if (successes >= 3) state = "stable";
  } else {
    if (roll === 1) failures += 2;       // nat 1 = 2 fails
    else failures += 1;
    if (failures >= 3) state = "dead";
  }

  return { successes, failures, state, roll };
}
```

**สถานะ**: ✅ Engine; ❌ UI (UI ไม่ได้ track death saves อย่างเป็นระบบ)

### Opportunity Attacks

**ไฟล์**: `src/lib/engine/combat.ts:553-570` (`getOpportunityAttackTargets`) + `src/lib/engine/movement.ts:482-507` (`getOpportunityAttackers`)

D&D 5e: ออกจาก enemy reach โดยไม่ Disengage → provokes opportunity attack

```typescript
export function getOpportunityAttackers(
  from: Position, to: Position, threats: ThreatRange[],
): ThreatRange[] {
  return threats.filter(threat => {
    const wasInReach = isWithinReach(from, threat.position, threat.reach);
    const isInReach = isWithinReach(to, threat.position, threat.reach);
    return wasInReach && !isInReach; // only leaving reach provokes
  });
}
```

**สถานะ**: ✅ Engine; ❌ UI (UI ไม่ enforce opportunity attacks จริง)

### Grapple / Shove (D&D 2024 — Saving Throw)

**ไฟล์**: `src/lib/engine/combat.ts:577-670` (`resolveContestedAction`)

D&D 2024 เปลี่ยนกฎ Grapple/Shove อย่างสิ้นเชิง:
- **2024**: เป็น Unarmed Strike; **target ทอย saving throw** (STR หรือ DEX เลือกเอง)
- **2014**: contested check (Athletics vs Athletics/Acrobatics)

```typescript
export function resolveContestedAction(req: ContestedActionRequest): ContestedActionResult {
  // D&D 2024: Save DC = 8 + attacker's STR mod + attacker's PB
  const saveDC = 8 + req.attackerAthleticsMod + (req.attackerProficiencyBonus || 0);

  // Defender picks the better save (STR or DEX) — D&D 2024 rule
  const bestSaveMod = Math.max(req.targetDefenseMod, req.targetDexSaveMod ?? req.targetDefenseMod);

  const tgtRoll = rollD20(bestSaveMod, targetSaveAdv, { seed: req.seed });
  const success = tgtRoll.total < saveDC; // target failed save → attacker succeeds

  if (success) {
    if (req.type === "grapple") conditionApplied = "grappled";
    else if (req.type === "shove_prone") conditionApplied = "prone";
    else if (req.type === "shove_push") pushDistance = 5; // 10 ft with Push mastery
  }
  // ...
}
```

⚠️ **ความขัดแย้ง**: `gameData.ts:943-947` มี `grappleCheck` ที่ใช้กฎ 2014 (contested check) — UI ใช้ version นี้

```typescript
// gameData.ts — 2014 style (UI ใช้อันนี้)
export function grappleCheck(attackerMod: number, defenderMod: number) {
  const r = Math.floor(Math.random() * 20) + 1 + attackerMod;
  const dc = 8 + defenderMod;
  return { success: r >= dc, roll: r, dc };
}
```

**สถานะ**: ✅ Engine (2024 compliant); ⚠️ UI ใช้ gameData ที่เป็น 2014 style

### Flanking (Optional Rule)

**ไฟล์**: `src/lib/engine/combat.ts:682-693` (`isFlanking`) + `src/lib/cover.ts:160-170`

D&D 5e optional rule: พันธมิตรอยู่คนละด้านของ target → advantage บน melee attacks

```typescript
export function isFlanking(
  attackerPos: Position, targetPos: Position, allyPositions: Position[],
): boolean {
  const dx = attackerPos.x - targetPos.x;
  const dy = attackerPos.y - targetPos.y;
  const opposite: Position = { x: targetPos.x - dx, y: targetPos.y - dy };
  return allyPositions.some(p => p.x === opposite.x && p.y === opposite.y);
}
```

**สถานะ**: ✅ Implement; ⚠️ Default `flankingEnabled: false` (optional rule)

### Action Economy

**ไฟล์**: `src/lib/engine/actionEconomy.ts` (581 บรรทัด)

รองรับครบทั้ง 8 action types: action, bonus_action, reaction, movement, free, legendary, mythic, lair

```typescript
export const STANDARD_ACTIONS: ActionDefinition[] = [
  { id: "attack",          cost: { action: 1 } },
  { id: "cast_spell",      cost: { action: 1 } },
  { id: "dash",            cost: { action: 1 } },
  { id: "disengage",       cost: { action: 1 } },
  { id: "dodge",           cost: { action: 1 } },
  { id: "help",            cost: { action: 1 } },
  { id: "hide",            cost: { action: 1 } },
  { id: "ready",           cost: { action: 1 } },
  { id: "search",          cost: { action: 1 } },
  { id: "use_object",      cost: { action: 1 } },
  { id: "shove",           cost: { action: 1 } },
  { id: "grapple",         cost: { action: 1 } },
  { id: "two_weapon_attack", cost: { bonus_action: 1 } },
  { id: "opportunity_attack", cost: { reaction: 1 } },
  { id: "stand_from_prone",   cost: { movement: 0 } }, // ⚠️ ควรเป็น speed/2
];
```

**Multi-Action**: `grantExtraAction` รองรับ Action Surge / Haste

**สถานะ**: ✅ Engine; ❌ UI (UI ไม่ enforce action economy อย่างเคร่งครัด)

## กฎที่ยังไม่ Implement

- **Two-Weapon Fighting style modifier** — off-hand damage ไม่ได้ +ability mod แม้มี Fighting Style
- **Great Weapon Master / Sharpshooter power attack** — `AttackRequest.powerAttack` field มี แต่ `resolveAttack` ไม่ได้ใช้
- **Polearm Master opportunity attack on enter reach** — ไม่มี trigger พิเศษ
- **Sentinel feat** (op attack speed = 0) — ไม่มี
- **Reach weapon interaction with non-adjacent** — ไม่ได้ special-case
- **Mounts / mounted combat** — ไม่มี
- **Underwater combat** (disadv on ranged non-crossbow, fire/cold resistance) — ไม่มี
- **Falling damage** — ไม่มี (`1d6` bludgeoning per 10 ft)
- **Suffocation / drowning** — ไม่มี

## D&D 2024 vs 2014 Differences

| กฎ | D&D 2014 | D&D 2024 | Engine ใช้ |
|---|---|---|:---:|
| Surprise | Skip turn 1 | Disadvantage on Initiative | ✅ 2024 |
| Grapple/Shove | Contested Athletics check | Target STR/DEX save (DC = 8 + STR + PB) | ✅ 2024 (engine) / ⚠️ 2014 (gameData) |
| Critical hit | Double all dice | Double weapon dice only (no Sneak Attack/Smite) | ❌ 2014 style (double all) |
| Two-Weapon Fighting | Bonus action off-hand attack | Same — no major change | ✅ |
| Opportunity attacks | On leaving reach | Same — but Disengage is now a Bonus Action option for some | ✅ |
| Exhaustion | Tiered system (6 levels) | Flat -2/level D20 + -5 ft/level Speed | ✅ 2024 (gameData) |
| Encounter difficulty | Easy/Medium/Hard/Deadly | Low/Moderate/High (3 tiers) | ✅ 2024 (gameData) |
| Weapon Mastery | ไม่มี | ใหม่ใน 2024 — Push/Sap/Cleave/etc. | ⚠️ Data มี แต่ไม่ enforce |

## อ้างอิง

- [coverage-matrix.md](coverage-matrix.md) — Matrix ภาพรวมทั้งหมด
- [02-modules/engine-submodules.md](../02-modules/engine-submodules.md#combatts) — combat.ts รายละเอียด
- [movement.md](movement.md) — Opportunity attacks รายละเอียด
- [conditions-effects.md](conditions-effects.md) — สถานะที่ combat ใช้
- D&D Beyond Free Rules 2024 — "Combat", "Grappling, Shoving", "Initiative"
