# 03 — Rule Coverage Matrix

> Matrix ว่ากฎ D&D 5e / 2024 แต่ละข้อ implement ที่ไฟล์ไหน และใช้ใน UI จริงไหม
>
> **สำคัญ**: โปรเจกต์มีระบบกฎสองชั้น:
> 1. **`src/lib/engine/` (v2)** — Pure functions ออกแบบตาม "D&D Engine Design Document" ครอบคลุมกฎ D&D 2024 แต่ **ไม่ได้ใช้ใน UI**
> 2. **`src/lib/*.ts` (v1)** — Helpers ที่ `DnDSolo.tsx` ใช้จริง (เช่น `gameData.ts`, `engineAdapters.ts`) ครอบคลุมกฎ D&D 2024 บางส่วน
>
> คอลัมน์ "ใช้ใน UI?" หมายถึงถูกเรียกจาก `DnDSolo.tsx` (ผ่าน adapter หรือตรง ๆ)

## สรุปสถานะรวม

| หมวด | ทั้งหมด | ✅ Implement | ⚠️ Partial | ❌ Missing |
|---|---:|---:|---:|---:|
| Combat | 16 | 9 | 5 | 2 |
| Magic | 14 | 8 | 4 | 2 |
| Movement | 12 | 7 | 3 | 2 |
| Conditions | 15 | 15 | 0 | 0 |
| Buff/Debuff | 8 | 5 | 2 | 1 |
| Rest & Exhaustion | 11 | 8 | 2 | 1 |
| Exploration & Travel | 13 | 7 | 4 | 2 |
| Vision & Lighting | 7 | 5 | 1 | 1 |
| Stealth & Detection | 6 | 5 | 1 | 0 |
| Cover & Positioning | 8 | 6 | 1 | 1 |
| Environment & Hazards | 7 | 4 | 2 | 1 |
| Time & Calendar | 4 | 3 | 1 | 0 |
| Dungeon & Encounter | 5 | 3 | 2 | 0 |
| **รวม** | **126** | **85** | **28** | **13** |

---

## Combat Rules

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| Initiative (d20 + DEX) | ✅ | `engine/combat.ts: rollInitiative, sortInitiative` | ❌ | engine v2; UI ใช้ inline sort |
| Initiative tie-break (DEX → player) | ✅ | `engine/combat.ts: sortInitiative` | ❌ | D&D 5e: tie-break DM call |
| Surprise (2024: disadv on Init) | ✅ | `engine/combat.ts: setSurprised, canActThisTurn` | ❌ | D&D 2024 — 2014 skip-turn ถูกยกเลิก |
| Combat round/turn lifecycle | ✅ | `engine/combat.ts: createCombat, nextTurn, endCombat` | ❌ | UI จัดการเองใน component state |
| Action economy (Action/Bonus/Reaction) | ✅ | `engine/actionEconomy.ts: validateAction, consumeAction` | ❌ | UI ไม่ enforce อย่างเคร่งครัด |
| Attack resolution (roll vs AC) | ✅ | `engine/combat.ts: resolveAttack` | ⚠️ | UI มี logic ของตัวเองที่ `DnDSolo.tsx:1753+` |
| Critical hit (nat 20 → double dice) | ✅ | `engine/combat.ts: calculateCriticalDamage, doubleDiceExpression` | ⚠️ | UI inline crit logic |
| Fumble (nat 1 → auto miss) | ✅ | `engine/combat.ts: resolveAttack (roll.die === 1)` | ⚠️ | UI inline |
| Damage type system (13 types) | ✅ | `engine/combat.ts: DAMAGE_TYPES`, `gameData.ts: DAMAGE_TYPES` | ✅ | UI ใช้ `applyDamageModifiers` |
| Resistance/Vulnerability/Immunity | ✅ | `engine/combat.ts: applyDamage`, `gameData.ts: applyDamageModifiers` | ✅ | UI ใช้ gameData version |
| Sneak Attack dice | ✅ | `engine/combat.ts: AttackRequest.sneakAttackDice` | ❌ | engine only; UI ไม่ได้ wire |
| Power Attack (GWM/Sharpshooter -5/+10) | ⚠️ | `engine/combat.ts: AttackRequest.powerAttack` | ❌ | Field มี แต่ resolveAttack ไม่ได้ใช้ |
| Death saves (3 success/3 fail) | ✅ | `engine/combat.ts: rollDeathSave, reviveFromDowned` | ❌ | engine only |
| Death save: nat 20 revive, nat 1 = 2 fail | ✅ | `engine/combat.ts: rollDeathSave` | ❌ | engine only |
| Opportunity attacks | ✅ | `engine/combat.ts: getOpportunityAttackTargets`, `engine/movement.ts: getOpportunityAttackers` | ❌ | UI ไม่บังคับ |
| Grapple/Shove (2024: STR save DC) | ✅ | `engine/combat.ts: resolveContestedAction` | ❌ | engine ใช้กฎ 2024; UI ใช้ `gameData.grappleCheck` (2014 style) |
| Flanking (optional) | ⚠️ | `engine/combat.ts: isFlanking`, `cover.ts: isFlanking` | ❌ | Optional rule; default off |
| Lair actions (initiative 20) | ✅ | `engine/combat.ts: CombatState.lairInitiative` | ❌ | engine only |
| Legendary/Mythic actions | ✅ | `engine/actionEconomy.ts: legendary/mythic/lair types` | ❌ | engine only |
| Two-Weapon Fighting | ✅ | `gameData.ts: canDualWield`, `actionEconomy.ts: two_weapon_attack` | ✅ | UI ใช้ `canDualWield` |

## Magic Rules

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| Spell slot progression (Lv 1-20) | ✅ | `engine/magic.ts: FULL_CASTER_SLOTS`, `gameData.ts: SLOT_TABLE` | ✅ | UI ใช้ `SLOT_TABLE` |
| Pact Magic (Warlock, short-rest refresh) | ✅ | `engine/magic.ts: PACT_MAGIC_SLOTS, createPactMagicSlots` | ❌ | engine only |
| Half-caster slots (Paladin/Ranger) | ✅ | `engine/magic.ts: createHalfCasterSlots`, `gameData.ts: HALF_CASTER_SLOTS` | ✅ | UI ใช้ `HALF_CASTER_SLOTS` |
| Cantrips (no slot) | ✅ | `engine/magic.ts: canCastSpell (level 0)` | ✅ | UI inline |
| Spellcasting types (5 ประเภท) | ✅ | `engine/magic.ts: SpellcastingType` | ❌ | engine only |
| Prepared spells (2024 fixed table) | ✅ | `engine/magic.ts: maxPreparedSpells2024` | ❌ | D&D 2024 fixed table |
| Spell save DC (8 + PB + mod) | ✅ | `engine/magic.ts: SpellcastingCapability.spellSaveDC` | ❌ | engine; UI คำนวณ inline |
| Spell attack bonus (PB + mod) | ✅ | `engine/magic.ts: SpellcastingCapability.spellAttackBonus` | ❌ | engine only |
| Concentration (1 spell/caster) | ✅ | `engine/magic.ts: canConcentrate, beginConcentration`, `effects.ts: breakConcentration` | ❌ | engine; UI มี `concentrationDC` ใน adapter |
| Concentration DC (max(10, dmg/2), cap 30) | ✅ | `engine/magic.ts: concentrationCheckDC`, `engineAdapters.ts: concentrationDC` | ✅ | D&D 2024 cap 30 |
| Concentration on damage taken | ✅ | `engine/combat.ts: applyDamage (concentrationCheckRequired)` | ❌ | engine only |
| Ritual casting (2024 universal) | ✅ | `engine/magic.ts: canCastAsRitual, canCastRitual, ritualCastingTime` | ❌ | D&D 2024 — any prepared caster |
| Spell components (V/S/M) | ✅ | `engine/magic.ts: checkComponents, SpellComponent` | ❌ | engine only |
| Material cost & focus substitution | ✅ | `engine/magic.ts: checkComponents` | ❌ | engine only |
| Upcasting (scalingDamage) | ✅ | `engine/magic.ts: castSpell (slotLevel scaling)` | ❌ | engine only |
| Spell schools (8 schools) | ✅ | `engine/magic.ts: SpellSchool` | ❌ | engine only |
| Spell attack vs AC | ✅ | `engine/magic.ts: castSpell (kind="attack")` | ❌ | engine only |
| Spell save (half/none/full on success) | ✅ | `engine/magic.ts: castSpell (kind="save")` | ❌ | engine only |
| AoE damage spell | ✅ | `engine/magic.ts: castSpell (kind="aoe_damage")` | ❌ | engine; UI ใช้ `aoe.ts` แยก |
| Auto-hit spell (Magic Missile) | ✅ | `engine/magic.ts: castSpell (kind="auto")` | ❌ | engine only |
| Spell list lookup from SRD | ✅ | `srd.ts`, `open5e.ts` | ✅ | UI ดึงผ่าน `/api/srd` และ `/api/open5e` |

## Movement Rules

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| Speed (walk/fly/swim/climb/burrow) | ✅ | `engine/movement.ts: SpeedCapability, calculateSpeed` | ❌ | engine; UI ใช้ character.speed แบบง่าย |
| Grid distance (Chebyshev) | ✅ | `engine/movement.ts: gridDistance, distanceInFeet` | ❌ | UI ใช้ `cover.ts: getDistance` (Manhattan) |
| Difficult terrain (2× cost) | ✅ | `engine/movement.ts: TERRAIN_TYPES.difficult` | ❌ | engine only |
| Climbing/Swimming cost (2×) | ✅ | `engine/movement.ts: MOVEMENT_COST_MULTIPLIERS` | ❌ | engine only |
| Dash action (×2 movement) | ✅ | `engine/movement.ts: applyDash, getDashMultiplier` | ❌ | engine only |
| Disengage (no opp attack) | ✅ | `engine/movement.ts: applyDisengage`, `actionEconomy.ts: disengage` | ❌ | engine only |
| Stand from Prone (half move) | ⚠️ | `actionEconomy.ts: stand_from_prone cost: {movement: 0}` | ❌ | cost ผิด — ควรเป็น movement: speed/2 |
| Opportunity attacks (leaving reach) | ✅ | `engine/movement.ts: getOpportunityAttackers` | ❌ | engine only |
| Forced movement (push/pull/drag/teleport) | ✅ | `engine/movement.ts: resolveForcedMovement`, `cover.ts: createPush/Pull/Knockback/Teleport/Fall` | ❌ | engine + lib มีสองเวอร์ชัน |
| Forced movement never provokes | ✅ | `engine/movement.ts: resolveForcedMovement (provokedOpportunityAttacks: false)` | ❌ | engine only |
| Flying rules (hover vs move) | ✅ | `engine/movement.ts: FlyingState, checkFallRisk` | ❌ | engine only |
| A* pathfinding | ✅ | `engine/movement.ts: findPath` | ❌ | engine only; UI ไม่มี grid rendering |
| Encumbrance (variant rule) | ✅ | `engine/movement.ts: SpeedCapabilityInput.encumbranceLevel` | ❌ | engine only |
| Creature size space/reach | ✅ | `engine/movement.ts: SIZE_SPACE, SIZE_REACH` | ❌ | engine only |
| Split movement (move-attack-move) | ⚠️ | `actionEconomy.ts: consumeMovement` | ❌ | engine รองรับ; UI ไม่ track |

## Conditions (15 Standard D&D 5e)

ทั้ง 15 conditions ถูก define ทั้งใน `src/lib/conditions.ts` (v1, ใช้ใน UI) และ `src/lib/engine/effects.ts` (v2, engine only)

| Condition | v1 (`conditions.ts`) | v2 (`engine/effects.ts`) | UI? | หมายเหตุ |
|---|:---:|:---:|:---:|---|
| Blinded | ✅ | ✅ | ✅ | auto-fail perception |
| Charmed | ✅ | ✅ | ⚠️ | ใช้ใน narrative เท่านั้น |
| Deafened | ✅ | ✅ | ⚠️ | narrative |
| Frightened | ✅ | ✅ | ✅ | disadv + cannot approach |
| Grappled | ✅ | ✅ | ✅ | speed 0 |
| Incapacitated | ✅ | ✅ | ✅ | can't act |
| Invisible | ✅ | ✅ | ✅ | adv/disadv on attacks |
| Paralyzed | ✅ | ✅ | ✅ | auto-fail STR/DEX, melee crit |
| Petrified | ✅ | ✅ | ⚠️ | permanent |
| Poisoned | ✅ | ✅ | ✅ | disadv attacks/checks |
| Prone | ✅ | ✅ | ✅ | crawl + adv/disadv |
| Restrained | ✅ | ✅ | ✅ | speed 0 |
| Stunned | ✅ | ✅ | ✅ | incapacitated + auto-fail |
| Unconscious | ✅ | ✅ | ✅ | auto-fail STR/DEX, melee crit |
| Exhaustion (2024) | ✅ | ✅ | ✅ | -2/level D20, -5 ft/level Speed, Lv6=death |

ดูรายละเอียดที่ [conditions-effects.md](conditions-effects.md)

## Buff/Debuff System

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| Effect duration (rounds/minutes/hours/perm) | ✅ | `engine/effects.ts: EffectDuration, EffectDurationType` | ❌ | engine only |
| Stacking rules (replace/stack/refresh/ignore) | ✅ | `engine/effects.ts: StackingRule, applyEffect` | ❌ | engine only |
| Modifier pipeline (8 targets) | ✅ | `engine/effects.ts: ModifierTarget, getAllModifiers` | ❌ | engine only |
| Trigger system (16 triggers) | ✅ | `engine/effects.ts: EffectTrigger, fireTriggers` | ❌ | engine only |
| Concentration break cleanup | ✅ | `engine/effects.ts: breakConcentration` | ❌ | engine only |
| Buff tick per round | ✅ | `engine/effects.ts: tickEffect, tickAllEffects` | ❌ | engine only |
| UI buff tracking | ⚠️ | `engineAdapters.ts: applyBuffToCharacter, tickBuffDurations` | ✅ | UI ใช้ simplified version |
| Active condition queries | ✅ | `conditions.ts: hasCondition, isIncapacitated, autoFailSave` | ✅ | UI inline |

## Rest & Exhaustion

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| Short Rest (1 hour, spend Hit Dice) | ✅ | `engine/rest.ts: performShortRest, spendHitDie` | ❌ | engine only |
| Long Rest (8 hour, HP to max) | ✅ | `engine/rest.ts: performLongRest` | ❌ | engine only |
| Long Rest: restore ALL Hit Dice (2024) | ✅ | `engine/rest.ts: recoverHitDice` | ❌ | D&D 2024 (2014 = half) |
| Long Rest: 16 hr between (2024) | ✅ | `engine/rest.ts: canRest (lastLongRestHoursAgo < 16)` | ❌ | D&D 2024 (2014 = 24 hr) |
| Rest interruption (combat/spell/damage) | ✅ | `engine/rest.ts: checkInterruption` | ❌ | D&D 2024 NEW: damageTaken |
| Short Rest: refresh Pact Magic | ✅ | `engine/rest.ts: performShortRest (restorePactMagicSlots)` | ❌ | engine only |
| Long Rest: refresh all spell slots | ✅ | `engine/rest.ts: performLongRest (restoreAllSlots)` | ❌ | engine only |
| Long Rest: reduce exhaustion by 1 | ✅ | `engine/rest.ts: performLongRest (newExhaustionLevel)` | ❌ | engine only |
| Resource recovery (per short/long) | ✅ | `engine/rest.ts: STANDARD_RESOURCES, getResourcesByRecovery` | ❌ | engine; 12 standard resources |
| Exhaustion 2024 (flat -2/level) | ✅ | `gameData.ts: exhaustionPenalty, exhaustionSpeedPenalty`, `conditions.ts: exhaustion` | ✅ | UI ใช้ gameData version |
| Exhaustion 2014 (tiered) | ⚠️ | `engine/rest.ts: EXHAUSTION_LEVELS` | ❌ | engine v2 ใช้ 2014 ผิดสังเกต — ควรเป็น 2024 |
| Hit Dice by class (d6/d8/d10/d12) | ✅ | `engine/rest.ts: HitDicePool, createHitDicePool` | ❌ | engine only |
| Downtime activities | ✅ | `engine/rest.ts: STANDARD_DOWNTIME (8 ประเภท)` | ❌ | engine only |

ดูรายละเอียดที่ [rest-exhaustion.md](rest-exhaustion.md)

## Exploration & Travel

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| Exploration mode (5 โหมด) | ✅ | `exploration.ts: ExplorationMode` | ❌ | engine only |
| Travel plan + time estimate | ✅ | `exploration.ts: estimateTravelTime` | ❌ | engine only |
| Travel pace (Fast/Normal/Slow) | ✅ | `exploration.ts: PACE_EFFECTS` | ❌ | engine; Fast=1.33×, Slow=0.66× |
| Fast pace: -5 detection, no stealth | ✅ | `exploration.ts: PACE_EFFECTS.fast` | ❌ | engine only |
| Slow pace: stealth OK, -encounter | ✅ | `exploration.ts: PACE_EFFECTS.slow` | ❌ | engine only |
| Navigation (Survival/Nature/Map) | ✅ | `exploration.ts: resolveNavigation` | ❌ | engine only |
| Getting lost (1d6 hr penalty) | ✅ | `exploration.ts: resolveNavigation (lost: !success)` | ❌ | engine only |
| Search (Perception/Investigation) | ✅ | `exploration.ts: resolveSearch` | ❌ | engine; passive + active |
| Investigation (clues + insight DC) | ✅ | `exploration.ts: investigateClue` | ❌ | engine only |
| Trap definition + detection | ✅ | `exploration.ts: TrapDefinition, detectTrap, disableTrap` | ❌ | engine only |
| Trap trigger types (5) | ✅ | `exploration.ts: TrapTriggerType` | ❌ | step/open/touch/time/condition |
| Trap disable (fail by 5+ triggers) | ✅ | `exploration.ts: disableTrap (triggered: !success && roll < DC-5)` | ❌ | engine only |
| Random encounter table | ✅ | `exploration.ts: DEFAULT_EVENT_TABLE, rollExplorationEvent` | ❌ | engine; pace modifies weights |
| Foraging/hunting | ❌ | — | ❌ | ไม่ implement |
| Weather effects on travel | ⚠️ | `environment.ts: WEATHER_PRESETS` | ❌ | มี weather แต่ไม่ได้เชื่อมกับ travel |

ดูรายละเอียดที่ [exploration-travel.md](exploration-travel.md)

## Vision & Lighting

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| Vision types (5: normal/dark/blindsight/tremorsense/truesight) | ✅ | `vision.ts: VISION_TYPES`, `gameData.ts: VisionType` | ✅ | UI ใช้ gameData |
| Light levels (bright/dim/darkness/magical) | ✅ | `environment.ts: LightLevel`, `gameData.ts: LightLevel` | ✅ | UI ใช้ gameData (3 ระดับ) |
| Light source (torch/lantern/spell) | ✅ | `environment.ts: LightSource, getLightLevelAt` | ❌ | engine only |
| Line of sight (Bresenham) | ✅ | `vision.ts: hasLineOfSight` | ❌ | engine only |
| Magical darkness (only Truesight/Blindsight) | ✅ | `vision.ts: canSeeInLight` | ❌ | engine only |
| Passive perception formula | ✅ | `vision.ts: passivePerception`, `gameData.ts: passivePerception` | ✅ | UI ใช้ gameData |
| Hearing/Sound detection | ⚠️ | `vision.ts: canHearSound` | ❌ | simplified — ไม่ใช้กฎ 5e จริง |

## Stealth & Detection

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| Hide check (need cover/obscured) | ✅ | `stealth.ts: canHide` | ❌ | engine only |
| Stealth roll (d20 + DEX + prof) | ✅ | `stealth.ts: rollStealth` | ❌ | engine only |
| Hidden state tracking | ✅ | `stealth.ts: HiddenState, createHiddenState, updateHiddenFrom` | ❌ | engine only |
| Active search (Perception vs Stealth) | ✅ | `stealth.ts: activeSearch`, `vision.ts: detectWithActive` | ❌ | engine only |
| Invisibility rules | ✅ | `stealth.ts: isInvisible, getDetectionDifficulty` | ❌ | engine only |
| Surprise from stealth | ✅ | `stealth.ts: checkSurprise` | ❌ | engine; ใช้ 2014 surprise รุ่นเก่า |
| Tracking (Survival) | ✅ | `stealth.ts: rollTracking` | ❌ | engine only |

## Cover & Positioning

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| Cover levels (none/half/3-quarter/total) | ✅ | `cover.ts: CoverLevel`, `gameData.ts: COVER_AC_BONUS` | ✅ | UI ใช้ gameData |
| Cover AC bonus (+2/+5) | ✅ | `cover.ts: COVER_AC_BONUS`, `gameData.ts: COVER_AC_BONUS` | ✅ | UI ใช้ gameData |
| Cover DEX save bonus | ✅ | `cover.ts: COVER_DEX_SAVE_BONUS` | ❌ | engine only |
| Cover calculation (Bresenham) | ✅ | `cover.ts: calculateCover` | ❌ | engine only |
| Line of attack | ✅ | `cover.ts: hasLineOfAttack` | ❌ | engine only |
| High ground (homebrew +2) | ⚠️ | `cover.ts: getHighGroundBonus` | ❌ | Homebrew ไม่ใช่กฎ 5e |
| Flanking (optional rule) | ⚠️ | `cover.ts: isFlanking`, `engine/combat.ts: isFlanking` | ❌ | Optional; default off |
| Position triggers (enter/leave area) | ✅ | `cover.ts: checkPositionTriggers` | ❌ | engine only |

## Environment & Hazards

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| Weather (8 types) | ✅ | `environment.ts: WEATHER_PRESETS` | ❌ | engine only |
| Temperature extremes (exhaustion DC) | ✅ | `environment.ts: TEMPERATURE_PRESETS` | ❌ | engine; extreme heat/cold DC 15 |
| Environmental hazards (10 types) | ✅ | `environment.ts: EnvironmentalHazard` | ❌ | engine only |
| Natural effects (earthquake/flood) | ✅ | `environment.ts: NaturalEffect` | ❌ | engine only |
| Magical environment (anti/wild/dead magic) | ✅ | `environment.ts: MagicalEnvironment` | ❌ | engine only |
| Light source burn duration | ⚠️ | `environment.ts: LightSource.duration` | ❌ | field มี แต่ไม่ tick ลง |
| Falling damage | ❌ | — | ❌ | ไม่ implement (1d6 per 10 ft) |
| Suffocation/drowning | ❌ | — | ❌ | ไม่ implement |

## Time & Calendar

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| WorldClock (day/hour) | ✅ | `time.ts: WorldClock`, `engineAdapters.ts: getWorldClock` | ✅ | UI ใช้ผ่าน adapter |
| Time advance (hours/minutes) | ✅ | `engineAdapters.ts: advanceHours, advanceMinutes` | ✅ | UI uses adapter |
| Light level by hour | ✅ | `gameData.ts: getLightLevelForHour` | ✅ | UI inline |
| Calendar (custom) | ⚠️ | `time.ts: Calendar` | ❌ | engine; ไม่มี calendar จริงใน UI |

## Dungeon & Encounter

| กฎ | สถานะ | ไฟล์ | ใช้ใน UI? | หมายเหตุ |
|---|:---:|---|:---:|---|
| Encounter difficulty (2024: Low/Mod/High) | ✅ | `gameData.ts: ENCOUNTER_THRESHOLDS, rateEncounterDifficulty` | ✅ | UI ใช้ gameData (D&D 2024 3 tiers) |
| XP budget per character | ✅ | `gameData.ts: ENCOUNTER_THRESHOLDS` | ✅ | UI display |
| Dungeon blueprint (room/connection) | ✅ | `dungeon.ts: DungeonBlueprint, Room, RoomConnection` | ❌ | engine only |
| Procedural dungeon generation | ✅ | `dungeonTables.ts` | ❌ | engine only |
| Lair action initiative 20 | ⚠️ | `engine/combat.ts: lairInitiative` | ❌ | engine; UI ไม่ใช้ |

---

## หมายเหตุสำคัญเกี่ยวกับ Engine v2 ที่ "ครอบคลุมแต่ไม่ได้ใช้"

`src/lib/engine/` (10 ไฟล์, ~7,300 บรรทัด) เป็นการ redesign ระบบใหม่ทั้งหมดตาม "D&D Engine Design Document" แต่ **ไม่มีไฟล์ใดถูก import โดย `DnDSolo.tsx`**:

```
DnDSolo.tsx imports
├── gameData.ts            ✅ (core data + helpers)
├── engineAdapters.ts      ✅ (bridge — แต่ adapter ไม่ได้ import engine/)
├── srd.ts, open5e.ts      ✅ (API clients)
├── cover.ts, vision.ts    ✅ (lib ไม่ใช่ engine/)
├── environment.ts         ✅ (Domain 16-17)
└── exploration.ts         ✅ (Domain 21)
```

หมายความว่ากฎ D&D 2024 ที่ implement ใน `engine/` (เช่น Surprise = disadv on Init, Grapple = STR save DC, Long Rest 16hr) **ไม่ได้ถูกบังคับในเกมจริง** — UI ใช้ logic ของตัวเองที่อาจจะเป็นกฎ 2014 หรือ simplified version

ดูรายละเอียดที่:
- [08-gaps/unwired-engine.md](../08-gaps/unwired-engine.md)
- [08-gaps/missing-rules.md](../08-gaps/missing-rules.md)
- [09-roadmap/migration-plan.md](../09-roadmap/migration-plan.md)

## อ้างอิง

- [combat.md](combat.md) — รายละเอียด Combat system
- [magic.md](magic.md) — รายละเอียด Spell system
- [movement.md](movement.md) — รายละเอียด Movement
- [conditions-effects.md](conditions-effects.md) — รายละเอียด Conditions + Effects
- [rest-exhaustion.md](rest-exhaustion.md) — รายละเอียด Rest + Exhaustion
- [exploration-travel.md](exploration-travel.md) — รายละเอียด Exploration + Travel
- [01-architecture/file-inventory.md](../01-architecture/file-inventory.md) — รายการไฟล์ทั้งหมด
- [02-modules/engine-submodules.md](../02-modules/engine-submodules.md) — รายละเอียด engine/ modules
