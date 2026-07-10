/**
 * Engine wiring test suite — verifies three fixes to src/lib/engine/{combat,actionEconomy,effects}.ts:
 *
 *   1. resolveAttack() returns the REAL attack roll detail (d20 value(s), advantage/
 *      disadvantage resolution, each additive modifier with its source, final total,
 *      hit/miss/crit) instead of a fabricated RollResult.
 *   2. The turn loop (startTurn/endTurn) is wired to actionEconomy: budgets reset at
 *      turn start (1 action, 1 bonus action, movement = speed, reaction refreshes),
 *      and spend/guard helpers prevent overspend.
 *   3. The turn loop is wired to effects.ts's trigger system: on_turn_start /
 *      on_turn_end triggers fire, and durations tick, at turn boundaries.
 *
 * Standalone script (own pass/fail counters, process.exit(1) on failure) — run via
 * the vitest legacy harness (tests/legacy-scripts.test.ts).
 */
import assert from "assert";
import {
  createCombat, nextTurn, startTurn, endTurn, getCurrentCombatant,
  resolveAttack, getActionTracker, spendAction, spendMovement,
  type Combatant, type AttackRequest,
} from "../src/lib/engine/combat";
import { roll } from "../src/lib/engine/dice";
import { getActionDefinition } from "../src/lib/engine/actionEconomy";
import { applyEffect, type EffectDef } from "../src/lib/engine/effects";

let pass = 0, fail = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail++; failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name} — ${e.message}`); }
}
function eq(a: any, b: any, msg?: string) { assert.strictEqual(a, b, msg ?? `expected ${b}, got ${a}`); }
function ok(c: boolean, msg?: string) { assert.ok(c, msg); }

/** Find a seed that makes a plain "1d20" roll (no adv/dis) land on `target`. */
function findSeedForD20(target: number): number {
  for (let seed = 0; seed < 2000; seed++) {
    const r = roll("1d20", { seed });
    if (r.terms[0].kept[0] === target) return seed;
  }
  throw new Error(`No seed found for d20=${target}`);
}

/** Find a seed that makes an advantage/disadvantage "1d20" roll produce two distinct dice. */
function findSeedForAdvDis(adv: boolean): number {
  for (let seed = 0; seed < 2000; seed++) {
    const r = roll("1d20", { advantage: adv, disadvantage: !adv, seed });
    if (r.terms[0].rolls[0] !== r.terms[0].rolls[1]) return seed;
  }
  throw new Error("No seed found with distinct adv/dis dice");
}

function makeCombatant(over: Partial<Combatant> & { characterId: string; name: string }): Combatant {
  return {
    initiative: 10,
    isPlayer: true,
    position: { x: 0, y: 0 },
    ac: 15,
    hp: 20,
    maxHp: 20,
    speed: 30,
    reach: 5,
    resistances: [],
    vulnerabilities: [],
    immunities: [],
    conditionIds: [],
    surprised: false,
    deathSaves: { successes: 0, failures: 0 },
    conscious: true,
    ...over,
  };
}

console.log("=== Engine Wiring Test Suite ===\n");

// ============================================================================
// 1. resolveAttack — real roll detail (d20, adv/dis, modifiers by source, crit)
// ============================================================================
console.log("1. resolveAttack — auditable roll detail");

test("Normal hit: rollResult has real d20 breakdown (not fabricated)", () => {
  const seed = findSeedForD20(15); // 15 + 6 = 21 vs AC 15 -> hit, not crit
  const req: AttackRequest = {
    attackerId: "a", targetId: "b",
    modifiers: [
      { source: "ability_mod", value: 3 },
      { source: "proficiency", value: 2 },
      { source: "other", value: 1 },
    ],
    coverAC: 0, damageExpr: "1d8+3", damageType: "slashing", seed,
  };
  const result = resolveAttack(req, { ac: 15, hp: 10 });
  ok(!!result.rollResult, "rollResult must be present");
  eq(result.rollResult!.expression, "1d20");
  eq(result.rollResult!.terms[0].rolls.length, 1, "no adv/dis -> single die rolled");
  eq(result.rollResult!.terms[0].kept[0], 15);
  eq(result.roll, 15, "natural die reported");
  eq(result.total, 21, "total = natural die + sum(modifiers)");
  eq(result.attackModifiers.length, 3);
  eq(result.attackModifiers.reduce((s, m) => s + m.value, 0), 6);
  eq(result.hit, true);
  eq(result.critical, false);
});

test("Advantage: rollResult exposes both dice and the dropped one", () => {
  const seed = findSeedForAdvDis(true);
  const req: AttackRequest = {
    attackerId: "a", targetId: "b",
    modifiers: [{ source: "ability_mod", value: 0 }],
    advantage: true,
    coverAC: 0, damageExpr: "1d6", damageType: "bludgeoning", seed,
  };
  const result = resolveAttack(req, { ac: 30, hp: 10 }); // impossible AC so hit is purely roll-driven unless crit
  eq(result.rollResult!.terms[0].rolls.length, 2, "advantage rolls two d20s");
  ok(result.rollResult!.advantage === true);
  eq(result.advantageUsed, true);
  eq(result.disadvantageUsed, false);
  const kept = result.rollResult!.terms[0].kept[0];
  const dropped = result.rollResult!.terms[0].dropped[0];
  ok(kept >= dropped, "advantage keeps the higher die");
  eq(result.roll, kept);
});

test("Disadvantage: rollResult keeps the lower die", () => {
  const seed = findSeedForAdvDis(false);
  const req: AttackRequest = {
    attackerId: "a", targetId: "b",
    modifiers: [{ source: "ability_mod", value: 0 }],
    disadvantage: true,
    coverAC: 0, damageExpr: "1d6", damageType: "bludgeoning", seed,
  };
  const result = resolveAttack(req, { ac: 1, hp: 10 }); // trivial AC so hit is purely roll-driven unless fumble
  eq(result.rollResult!.terms[0].rolls.length, 2);
  ok(result.rollResult!.disadvantage === true);
  eq(result.disadvantageUsed, true);
  const kept = result.rollResult!.terms[0].kept[0];
  const dropped = result.rollResult!.terms[0].dropped[0];
  ok(kept <= dropped, "disadvantage keeps the lower die");
});

test("Natural 20: always hits and crits regardless of AC", () => {
  const seed = findSeedForD20(20);
  const req: AttackRequest = {
    attackerId: "a", targetId: "b",
    modifiers: [{ source: "ability_mod", value: -5 }],
    coverAC: 0, damageExpr: "1d6", damageType: "bludgeoning", seed,
  };
  const result = resolveAttack(req, { ac: 99, hp: 10 });
  eq(result.hit, true);
  eq(result.critical, true);
  eq(result.roll, 20);
});

test("Natural 1: always misses regardless of bonus", () => {
  const seed = findSeedForD20(1);
  const req: AttackRequest = {
    attackerId: "a", targetId: "b",
    modifiers: [{ source: "ability_mod", value: 99 }],
    coverAC: 0, damageExpr: "1d6", damageType: "bludgeoning", seed,
  };
  const result = resolveAttack(req, { ac: 1, hp: 10 });
  eq(result.hit, false);
  eq(result.critical, false);
  eq(result.roll, 1);
});

// ============================================================================
// 2. Turn loop <-> actionEconomy wiring
// ============================================================================
console.log("\n2. Turn loop wired to actionEconomy (budget reset + spend/guard)");

test("createCombat seeds a full ActionTracker per combatant", () => {
  const state = createCombat([
    makeCombatant({ characterId: "hero", name: "Hero", speed: 30, initiative: 20 }),
    makeCombatant({ characterId: "goblin", name: "Goblin", speed: 25, initiative: 10, isPlayer: false }),
  ]);
  const heroTracker = getActionTracker(state, "hero");
  eq(heroTracker.actionCharges, 1);
  eq(heroTracker.bonusActionCharges, 1);
  eq(heroTracker.reactionAvailable, true);
  eq(heroTracker.movementRemaining, 30);
  const goblinTracker = getActionTracker(state, "goblin");
  eq(goblinTracker.movementRemaining, 25);
});

test("spendAction guards against spending an already-used action", () => {
  let state = createCombat([makeCombatant({ characterId: "hero", name: "Hero" })]);
  const attackDef = getActionDefinition("attack")!;
  const first = spendAction(state, "hero", attackDef);
  eq(first.result.valid, true);
  state = first.state;
  eq(getActionTracker(state, "hero").actionCharges, 0);

  const second = spendAction(state, "hero", attackDef);
  eq(second.result.valid, false, "no action left this turn");
  eq(getActionTracker(second.state, "hero").actionCharges, 0, "state unchanged on invalid spend");
});

test("spendMovement guards against exceeding remaining movement", () => {
  let state = createCombat([makeCombatant({ characterId: "hero", name: "Hero", speed: 30 })]);
  const spend1 = spendMovement(state, "hero", 20);
  eq(spend1.ok, true);
  state = spend1.state;
  eq(getActionTracker(state, "hero").movementRemaining, 10);

  const spend2 = spendMovement(state, "hero", 15);
  eq(spend2.ok, false, "only 10 ft remaining");
  eq(getActionTracker(spend2.state, "hero").movementRemaining, 10, "state unchanged on invalid spend");
});

test("startTurn resets the current combatant's budget; reaction refreshes only on owner's own turn", () => {
  let state = createCombat([
    makeCombatant({ characterId: "hero", name: "Hero", speed: 30, initiative: 20 }),
    makeCombatant({ characterId: "goblin", name: "Goblin", speed: 25, initiative: 10, isPlayer: false }),
  ]);
  eq(getCurrentCombatant(state)!.characterId, "hero");

  // Hero spends action, movement, and reaction.
  state = spendAction(state, "hero", getActionDefinition("attack")!).state;
  state = spendMovement(state, "hero", 30).state;
  state = spendAction(state, "hero", getActionDefinition("opportunity_attack")!).state; // consumes reaction
  let heroTracker = getActionTracker(state, "hero");
  eq(heroTracker.actionCharges, 0);
  eq(heroTracker.movementRemaining, 0);
  eq(heroTracker.reactionAvailable, false);

  // End hero's turn, advance to goblin, start goblin's turn.
  state = endTurn(state).state;
  state = nextTurn(state);
  eq(getCurrentCombatant(state)!.characterId, "goblin");
  state = startTurn(state).state;

  // Goblin's turn starting must NOT refresh hero's reaction (2024: refreshes on OWN turn only).
  heroTracker = getActionTracker(state, "hero");
  eq(heroTracker.reactionAvailable, false, "hero's reaction stays spent during goblin's turn");
  eq(heroTracker.actionCharges, 0, "hero's action stays spent during goblin's turn");

  // Advance back to hero: nextTurn + startTurn must reset hero's full budget.
  state = endTurn(state).state;
  state = nextTurn(state);
  eq(getCurrentCombatant(state)!.characterId, "hero");
  state = startTurn(state).state;
  heroTracker = getActionTracker(state, "hero");
  eq(heroTracker.actionCharges, 1, "action budget reset");
  eq(heroTracker.bonusActionCharges, 1, "bonus action budget reset");
  eq(heroTracker.movementRemaining, 30, "movement reset to speed");
  eq(heroTracker.reactionAvailable, true, "reaction refreshed on owner's own turn start");
});

// ============================================================================
// 3. Turn loop <-> effects.ts trigger wiring
// ============================================================================
console.log("\n3. Turn loop wired to effects trigger system (fires + ticks durations)");

const poisonTick: EffectDef = {
  id: "test_poison_tick", name: "Poison (test)", category: "ongoing_damage",
  description: "Deals damage at the start of the owner's turn.",
  duration: { type: "rounds", max: 2 },
  stacking: "replace",
  modifiers: [],
  triggers: [{ trigger: "on_turn_start", action: "deal_damage", damageExpr: "1d4", damageType: "poison" }],
};

const regenOnEnd: EffectDef = {
  id: "test_regen_end", name: "Regeneration (test)", category: "buff",
  description: "Heals at the end of the owner's turn.",
  duration: { type: "rounds", max: 5 },
  stacking: "replace",
  modifiers: [],
  triggers: [{ trigger: "on_turn_end", action: "heal", healExpr: "1d4" }],
};

// NOTE: uses a distinct effectId from poisonTick — effects.ts's applyEffect() looks
// up "existing" by effectId only (not also targetCharacterId), so two different
// combatants sharing one effectId would collide. That's a pre-existing effects.ts
// quirk outside this task's one specified bug fix; sidestepped here rather than
// silently masked.
const goblinPoisonTick: EffectDef = {
  ...poisonTick,
  id: "test_poison_tick_goblin",
};

test("startTurn fires on_turn_start triggers for the current combatant", () => {
  let state = createCombat([makeCombatant({ characterId: "hero", name: "Hero", initiative: 20 })]);
  const applied = applyEffect(state.activeEffects, poisonTick, "hero");
  state = { ...state, activeEffects: applied.activeEffects };

  const { triggers } = startTurn(state);
  eq(triggers.length, 1);
  eq(triggers[0].action, "deal_damage");
  eq(triggers[0].damageExpr, "1d4");
  eq(triggers[0].damageType, "poison");
});

test("endTurn fires on_turn_end triggers and ticks durations for the current combatant only", () => {
  let state = createCombat([
    makeCombatant({ characterId: "hero", name: "Hero", initiative: 20 }),
    makeCombatant({ characterId: "goblin", name: "Goblin", initiative: 10, isPlayer: false }),
  ]);
  const heroApplied = applyEffect(state.activeEffects, poisonTick, "hero");
  const bothApplied = applyEffect(heroApplied.activeEffects, regenOnEnd, "hero");
  const goblinApplied = applyEffect(bothApplied.activeEffects, goblinPoisonTick, "goblin");
  state = { ...state, activeEffects: goblinApplied.activeEffects };

  const beforeGoblin = state.activeEffects.find(ae => ae.targetCharacterId === "goblin")!;
  eq(beforeGoblin.remainingRounds, 2);

  const end1 = endTurn(state); // hero's turn ends
  eq(end1.triggers.length, 1, "on_turn_end trigger fires for hero");
  eq(end1.triggers[0].action, "heal");
  state = end1.state;

  const heroPoison = state.activeEffects.find(ae => ae.targetCharacterId === "hero" && ae.effectId === "test_poison_tick");
  ok(!!heroPoison, "hero poison still present after 1 tick (started at 2 rounds)");
  eq(heroPoison!.remainingRounds, 1);

  const goblinPoison = state.activeEffects.find(ae => ae.targetCharacterId === "goblin" && ae.effectId === "test_poison_tick_goblin");
  ok(!!goblinPoison, "goblin's effect must NOT tick on hero's turn end");
  eq(goblinPoison!.remainingRounds, 2, "goblin's duration untouched while it is not goblin's turn");

  // Tick hero's turn again -> poison expires and is removed.
  const end2 = endTurn(state);
  state = end2.state;
  const heroPoisonAfter = state.activeEffects.find(ae => ae.targetCharacterId === "hero" && ae.effectId === "test_poison_tick");
  ok(!heroPoisonAfter, "hero poison removed once duration reaches 0");
});

// ============================================================================
console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
