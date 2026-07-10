# Task: D&D Engine Chapters 02-10 (Software Architecture Level)

**Task ID**: engine-chapters-02-10
**Agent**: main
**Status**: ✅ Complete

## Summary

Created 9 architecture-level TypeScript files under `src/lib/engine/`, each as a
complete D&D 5e engine design document following the style established by
Chapter 01 (`character.ts`). Total: ~6,153 lines of new engine code.

## Files Created

| File | Chapter | Lines | Purpose |
|------|---------|-------|---------|
| `dice.ts`            | 09 | 541 | Pure dice engine (parser, roll, adv/dis, crit, seedable RNG) |
| `actionEconomy.ts`   | 02 | 580 | Action types table, ActionTracker, validation, Ready/Delay queue |
| `equipment.ts`       | 05 | 613 | Items, 16 equipment slots, attunement, weapon mastery, armor |
| `effects.ts`         | 06 | 862 | 15 conditions, effect modifiers, triggers, concentration |
| `skills.ts`          | 07 | 633 | 18 skills, check resolution, contests, group checks, passive |
| `movement.ts`        | 08 | 682 | 3-layer architecture, pathfinding (A*), forced movement |
| `magic.ts`           | 04 | 805 | Spells, slot manager, concentration, ritual, upcast |
| `combat.ts`          | 03 | 771 | Flow controller, attack pipeline, damage, death saves, OA |
| `rest.ts`            | 10 | 666 | Short/Long rest, Hit Dice, downtime, exhaustion |

## Architecture Principles Applied

1. **Data-Driven**: Every game element (action types, items, conditions, spells,
   skills, terrain, downtime activities, resources) is defined as a JSON-like
   data table. Adding new content requires zero code changes.
2. **Pure Functions**: All resolution functions take inputs → return outputs.
   No side effects, no mutation of global state.
3. **Decoupled via Interfaces**: Each chapter exports interfaces + types +
   pure functions. Cross-chapter references use TYPE-only imports where possible.
4. **JSDoc Architecture Headers**: Every file begins with a chapter header
   explaining: version, target compatibility, architecture, core principles,
   lifecycle/flow diagrams, and cross-references to other chapters.
5. **Deterministic Mode**: All dice functions accept a `seed` parameter for
   reproducible testing via `mulberry32` PRNG.

## Cross-Chapter Dependency Graph

```
dice.ts (foundation, no deps)
  ↑
  ├── skills.ts        (uses rollD20, rollContest, passiveCheck)
  ├── magic.ts         (uses rollD20, rollDamage)
  ├── combat.ts        (uses rollD20, rollDamage)
  └── rest.ts          (uses rollDamage for Hit Dice)

equipment.ts (no engine deps; exports DamageType used by combat/magic)
  ↑
  ├── combat.ts        (imports DamageType)
  └── magic.ts         (imports DamageType)

effects.ts (imports AbilityName from character)
  ↑
  └── rest.ts          (imports ActiveEffect, clearOnShortRest/LongRest)

character.ts (Chapter 01 — pre-existing, 945 lines)
  ↑
  ├── actionEconomy.ts (no direct import; uses Character conceptually)
  ├── effects.ts       (imports AbilityName)
  ├── skills.ts        (imports AbilityName)
  ├── movement.ts      (imports AbilityName, CreatureSize, SpeedSet)
  └── magic.ts         (imports AbilityName)

movement.ts (imports from character; exports Position used by combat)
  ↑
  └── combat.ts        (imports Position)

magic.ts (imports from character, dice, equipment)
  ↑
  └── rest.ts          (imports SpellSlotState, restoreAllSlots, restorePactMagicSlots)

actionEconomy.ts (no engine deps; standalone resource tracker)
  (no upward deps — used by combat in future integration)
```

## Typecheck Result

`npx tsc --noEmit` returns **ZERO errors** for all `src/lib/engine/*.ts` files
and all of `src/lib/` generally. (Pre-existing errors in `scripts/`,
`examples/`, `upload/`, `skills/` directories are unrelated to this task — they
were present before the work began.)

## Required Exports Per Chapter

All exports specified in the task requirements are present:

- **Chapter 02**: `ActionType`, `ActionTypeDef`, `ACTION_TYPES`, `ActionCost`,
  `ActionDefinition`, `STANDARD_ACTIONS`, `ActionTracker`, `validateAction()`,
  `canAct()`, `consumeAction()`, `resetTurnActions()`, `resetRoundActions()`
- **Chapter 03**: `CombatState`, `Combatant`, `CombatPhase`, `createCombat()`,
  `startCombat()`, `nextTurn()`, `resolveAttack()`, `applyDamage()`,
  `rollDeathSave()`, `resolveContestedAction()` (grapple/shove), `isFlanking()`
- **Chapter 04**: `SpellDef`, `SpellcastingType`, `SpellcastingCapability`,
  `SpellSlotState`, `castSpell()`, `checkConcentration()`,
  `concentrationCheckDC()`, `canCastAsRitual()`, `restoreAllSlots()`,
  `restorePactMagicSlots()`
- **Chapter 05**: `ItemDef`, `WeaponDef`, `ArmorDef`, `ItemRarity`,
  `ITEM_RARITIES`, `WeaponMastery`, `WEAPON_MASTERIES`, `ARMOR_DEX_CAPS`,
  `EquipmentSlot`, `EQUIPMENT_SLOTS`, `SLOT_COUNT`, `equipItem()`,
  `unequipItem()`, `getAttunedCount()`, `beginAttunement()`, `breakAttunement()`
- **Chapter 06**: `EffectDef`, `EffectDuration`, `EffectDurationType`,
  `StackingRule`, `EffectModifier`, `ModifierTarget`, `EffectTrigger`,
  `STANDARD_CONDITIONS` (15 conditions), `registerCondition()`, `applyEffect()`,
  `removeEffect()`, `tickEffect()`, `tickAllEffects()`, `checkConcentration()`,
  `getAllModifiers()`, `getTotalBonus()`, `hasAdvantage()`, `fireTriggers()`
- **Chapter 07**: `SkillDef`, `STANDARD_SKILLS` (18 skills), `SkillInstance`,
  `resolveCheck()`, `resolveContest()`, `resolveGroupCheck()`,
  `passiveCheckScore()`, `resolveToolCheck()`, `resolveAbilityCheck()`,
  `STANDARD_DCS`, `AdvantageSource`, `resolveAdvantage()`
- **Chapter 08**: `Position`, `MovementMode`, `SpeedCapability`,
  `calculateSpeed()`, `TerrainType`, `TERRAIN_TYPES`,
  `calculateMovementCost()`, `calculatePathCost()`, `findPath()`, `canMoveTo()`,
  `applyDash()`, `applyDisengage()`, `getOpportunityAttackers()`,
  `resolveForcedMovement()`, `FlyingState`, `checkFallRisk()`
- **Chapter 09**: `DiceTerm`, `DiceTermResult`, `RollResult`, `RollOptions`,
  `parseExpression()`, `roll()`, `rollD20()`, `rollDamage()`, `rollTable()`,
  `withSeed()`, `mulberry32()`, `rollContest()`, `passiveCheck()`,
  `enableRollHistory()`, `getRollHistory()`
- **Chapter 10**: `RestType`, `REST_TYPES`, `HitDicePool`, `createHitDicePool()`,
  `spendHitDie()`, `recoverHitDice()`, `RestEnvironment`, `canRest()`,
  `checkInterruption()`, `performShortRest()`, `performLongRest()`,
  `DowntimeType`, `STANDARD_DOWNTIME`, `RecoveryType`, `STANDARD_RESOURCES`,
  `EXHAUSTION_LEVELS`

## Notes for Downstream Agents

1. **No circular imports**: All engine files use type-only imports where
   possible. Runtime imports flow one direction (dice → others).
2. **Character.ts unchanged**: Chapter 01 was pre-existing; I did not modify it.
3. **API stability**: All exports are stable for downstream consumers
   (engineAdapters, UI, AI DM).
4. **Testing**: No tests written (per task instructions: "do not write any
   test code"). The seed parameter on all dice functions enables deterministic
   replay for future test suites.
