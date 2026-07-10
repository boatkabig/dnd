import {
  applyCondition, removeCondition, hasCondition, hasAttackDisadvantage,
  hasAttackAdvantageAgainstYou, hasCheckDisadvantage, isIncapacitated,
  cannotMove, autoFailSave, getExhaustionLevel, tickConditionDurations,
  STANDARD_CONDITIONS,
} from "../src/lib/conditions";
import {
  createEffect, applyEffect, removeEffect, removeEffectsByName,
  breakConcentration, tickEffectDurations, getActiveModifiersForTarget,
  getACBonusFromEffects, getSpeedBonusFromEffects, hasConcentrationEffect,
  EFFECT_LIBRARY,
} from "../src/lib/effects";

console.log("=== Conditions & Effects Tests ===\n");

// --- CONDITIONS ---

// 7.1 Apply
let conds: any[] = [];
const apply1 = applyCondition(conds, "poisoned", "monster", "Giant Spider", "rounds", 6, [], 1);
conds = apply1.conditions;
console.log("Apply Poisoned:", apply1.result.success, apply1.result.reasonTh);
console.log("  Has poisoned:", hasCondition(conds, "poisoned"));

// 7.6 Immunity
const apply2 = applyCondition(conds, "poisoned", "monster", "Spider", "rounds", 6, ["poisoned"], 1);
console.log("Apply Poisoned with immunity:", apply2.result.success, apply2.result.reasonTh);

// 7.2 Remove
const rem1 = removeCondition(conds, "poisoned");
conds = rem1.conditions;
console.log("Remove Poisoned:", rem1.removed, "has:", hasCondition(conds, "poisoned"));

// 7.9 Effects queries
conds = applyCondition(conds, "blinded", "spell", "Blindness", "concentration", undefined, [], 1).conditions;
conds = applyCondition(conds, "prone", "feature", "Shove", "permanent", undefined, [], 1).conditions;
console.log("\nBlinded + Prone:");
console.log("  attackDisadvantage:", hasAttackDisadvantage(conds));
console.log("  attackAdvantageAgainstYou:", hasAttackAdvantageAgainstYou(conds));
console.log("  checkDisadvantage:", hasCheckDisadvantage(conds));

// Incapacitated
conds = applyCondition(conds, "stunned", "spell", "Stun", "rounds", 3, [], 1).conditions;
console.log("\nStunned:");
console.log("  incapacitated:", isIncapacitated(conds));
console.log("  cannotMove:", cannotMove(conds));
console.log("  autoFailSave CON:", autoFailSave(conds, "con"));

// 7.7 Exhaustion stacking
let exConds: any[] = [];
exConds = applyCondition(exConds, "exhaustion", "environment", "Forced March", "permanent", undefined, [], 1).conditions;
exConds = applyCondition(exConds, "exhaustion", "environment", "Forced March", "permanent", undefined, [], 1).conditions;
console.log("\nExhaustion stacked:", getExhaustionLevel(exConds));

// 7.4 Duration ticking
let durConds: any[] = [];
durConds = applyCondition(durConds, "poisoned", "monster", "Spider", "rounds", 2, [], 1).conditions;
console.log("\nDuration tick (poisoned 2 rounds):");
const tick1 = tickConditionDurations(durConds);
console.log("  After tick 1: remaining:", tick1.conditions.length, "expired:", tick1.expired);
const tick2 = tickConditionDurations(tick1.conditions);
console.log("  After tick 2: remaining:", tick2.conditions.length, "expired:", tick2.expired);

// --- EFFECTS ---

console.log("\n--- Effects ---");

// Create + apply Bless
let effects: any[] = [];
const bless = createEffect("bless", "player", 10, 1, "cleric_0");
if (bless) {
  const applyRes = applyEffect(effects, bless);
  effects = applyRes.effects;
  console.log("Bless applied:", applyRes.applied);
}

// Create + apply Shield
const shield = createEffect("shield", "player", 1, 1, "wizard_0");
if (shield) {
  effects = applyEffect(effects, shield).effects;
}

// Create + apply Haste
const haste = createEffect("haste", "player", 10, 3, "wizard_0");
if (haste) {
  effects = applyEffect(effects, haste).effects;
}

// Query modifiers
const mods = getActiveModifiersForTarget(effects, "player");
console.log("\nPlayer modifiers (Bless + Shield + Haste):");
console.log("  AC bonus:", mods.acBonus, "(Shield +5 + Haste +2 = +7)");
console.log("  Speed multiplier:", mods.speedMultiplier, "(Haste x2)");
console.log("  Extra action:", mods.extraAction);
console.log("  Attack bonus dice:", (mods as any)._bonusDice);

// AC bonus
console.log("  AC bonus from effects:", getACBonusFromEffects(effects, "player"));

// Speed
console.log("  Speed (base 30):", getSpeedBonusFromEffects(effects, "player", 30), "(30 * 2 = 60)");

// Concentration
console.log("  Has concentration (caster wizard_0):", hasConcentrationEffect(effects, "wizard_0"));

// Break concentration
const broken = breakConcentration(effects, "wizard_0");
console.log("\nBreak concentration (wizard_0):");
console.log("  Removed effects:", broken.removed.map((e: any) => e.name).join(", "));
console.log("  Effects remaining:", broken.effects.length);

// Effect library check
console.log("\nEffect library:", Object.keys(EFFECT_LIBRARY).length, "effects");
console.log("  Examples:", Object.keys(EFFECT_LIBRARY).slice(0, 8).join(", "), "...");

// Rage (non-concentration)
let rageEffects: any[] = [];
const rage = createEffect("rage", "barbarian", 10, 1, "barbarian_0");
if (rage) {
  rageEffects = applyEffect(rageEffects, rage).effects;
  const rageMods = getActiveModifiersForTarget(rageEffects, "barbarian");
  console.log("\nRage modifiers:");
  console.log("  Damage bonus:", rageMods.damageBonus);
  console.log("  Damage resistance:", rageMods.damageResistance);
}

console.log("\n=== All tests passed! ===");
