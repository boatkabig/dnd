/**
 * Combat Bridge test suite — verifies src/lib/engine/combatBridge.ts:
 *
 *   1. parseMultiattack() reads a creature's Multiattack action TEXT (not
 *      attacks.length) into a structured plan — fixed named attacks, repeated
 *      named attacks, and flexible "any combination" pools.
 *   2. buildAttackRequestFromCreatureAttack() maps a stat-block attack to
 *      performAttack()-ready pieces, including the Open5e quirk where
 *      damage_type is null and the real type only lives in extra_damage_type.
 *   3. startBridgeCombat() maps party + enemy (Open5e v2 NormalizedCreature)
 *      inputs into the engine's Combatant shape: AC, HP, speed (already feet,
 *      no conversion), reach/size footprint derived from creature size,
 *      senses, resistances — and rolls initiative via the engine's own seeded
 *      RNG (rollInitiative), not a parallel one.
 *   4. getCombatView() projects initiative order / current combatant / round
 *      / phase / per-actor budgets / active effects.
 *   5. performAttack() spends the "attack" action via actionEconomy, resolves
 *      via combat.ts's resolveAttack, and applies damage immutably.
 *   6. moveBy() spends movement budget in feet.
 *   7. endTurn() advances the turn, separates on_turn_end (departing) from
 *      on_turn_start (arriving) triggers, and resets budgets.
 *   8. runEnemyTurn() is a minimal hook: it only executes the caller-decided
 *      intent (attack/move/pass) and ends the turn — no AI logic of its own.
 *   9. A real Open5e v2 monster (Brown Bear) pulled via lib/open5e.ts's
 *      getCreature() loader — but served from a cached fixture
 *      (scripts/fixtures/open5e-brown-bear.json) so the test is deterministic
 *      and offline. It still runs the full real loader path (fetch →
 *      normalizeCreature → parseMultiattack) to prove Multiattack parsing
 *      against a faithful Open5e v2 stat block rather than an invented string.
 *      Every other test above is seeded/offline.
 *
 * Standalone script (own pass/fail counters, process.exit(1) on failure) — run via
 * the vitest legacy harness (tests/legacy-scripts.test.ts).
 */
import assert from "assert";
import {
  startBridgeCombat,
  getCombatView,
  performAttack,
  moveBy,
  endTurn,
  runEnemyTurn,
  parseMultiattack,
  buildAttackRequestFromCreatureAttack,
  type PartyMemberInput,
} from "../src/lib/engine/combatBridge";
import { roll } from "../src/lib/engine/dice";
import { getCombatant } from "../src/lib/engine/combat";
import { applyEffect, type EffectDef } from "../src/lib/engine/effects";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getCreature, setOpen5eFetch } from "../src/lib/open5e";
import type { NormalizedCreature, NormalizedCreatureAttack, NormalizedCreatureAction } from "../src/lib/open5e";

let pass = 0, fail = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail++; failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name} — ${e.message}`); }
}
async function testAsync(name: string, fn: () => Promise<void>) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
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

// ============================================================================
// Fixtures
// ============================================================================

const HERO: PartyMemberInput = {
  id: "hero", name: "Hero",
  abilities: { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 },
  ac: 14, hp: 20, maxHp: 20, speed: 30,
};

function makeCreature(overrides: Partial<NormalizedCreature> & { name: string }): NormalizedCreature {
  return {
    index: overrides.name.toLowerCase().replace(/\s+/g, "-"),
    name: overrides.name,
    size: "Medium", sizeKey: "medium",
    type: "Beast",
    alignment: "unaligned",
    ac: 12, hp: 10, hitDice: "2d8",
    speed: 30,
    speeds: { walk: 30 },
    abilities: { str: 10, dex: 10, con: 10, int: 2, wis: 10, cha: 4 },
    saves: {},
    skills: {},
    passivePerception: 10,
    cr: 1, xp: 100,
    damageVulnerabilities: [], damageResistances: [], damageImmunities: [], conditionImmunities: [],
    senses: "", languages: "",
    actions: [], traits: [], legendaryActions: [], reactions: [], bonusActions: [], mythicActions: [],
    environments: [], creatureSets: [],
    edition: "2024",
    ...overrides,
  };
}

function makeAction(name: string, desc: string, attacks: NormalizedCreatureAttack[] = []): NormalizedCreatureAction {
  return { name, desc, attacks, actionType: "ACTION" };
}

const WOLF = makeCreature({
  name: "Wolf", ac: 13, hp: 11, speed: 40, speeds: { walk: 40 },
  abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
  damageResistances: ["cold"],
  darkvision: 60,
});

console.log("=== Combat Bridge Test Suite ===\n");

// ============================================================================
// 1. parseMultiattack — text parsing, not attack count
// ============================================================================
console.log("1. parseMultiattack — reads Multiattack action text");

test("Fixed named attacks: 'makes one Bite attack and one Claw attack'", () => {
  const actions = [
    makeAction("Bite", "Melee Attack Roll."),
    makeAction("Claw", "Melee Attack Roll."),
    makeAction("Multiattack", "The bear makes one Bite attack and one Claw attack."),
  ];
  const plan = parseMultiattack(actions);
  ok(!!plan, "plan must be found");
  eq(plan!.totalAttacks, 2);
  eq(plan!.fixedEntries.length, 2);
  ok(plan!.fixedEntries.some(e => e.actionName === "Bite" && e.count === 1));
  ok(plan!.fixedEntries.some(e => e.actionName === "Claw" && e.count === 1));
  eq(plan!.optionalActionNames.length, 0);
});

test("Repeated named attack: 'makes two Rend attacks'", () => {
  const actions = [
    makeAction("Rend", "Melee Attack Roll."),
    makeAction("Multiattack", "The owlbear makes two Rend attacks."),
  ];
  const plan = parseMultiattack(actions);
  ok(!!plan);
  eq(plan!.totalAttacks, 2);
  eq(plan!.fixedEntries.length, 1);
  eq(plan!.fixedEntries[0].actionName, "Rend");
  eq(plan!.fixedEntries[0].count, 2);
});

test("Flexible pool: 'makes two attacks, using Scimitar or Shortbow in any combination'", () => {
  const actions = [
    makeAction("Scimitar", "Melee Attack Roll."),
    makeAction("Shortbow", "Ranged Attack Roll."),
    makeAction("Multiattack", "The goblin makes two attacks, using Scimitar or Shortbow in any combination."),
  ];
  const plan = parseMultiattack(actions);
  ok(!!plan);
  eq(plan!.totalAttacks, 2, "general count from 'makes two attacks'");
  eq(plan!.fixedEntries.length, 0, "no attack is tied to a specific count");
  eq([...plan!.optionalActionNames].sort().join(","), "Scimitar,Shortbow");
});

test("No Multiattack action -> null", () => {
  const actions = [makeAction("Bite", "Melee Attack Roll.")];
  eq(parseMultiattack(actions), null);
});

// ============================================================================
// 2. buildAttackRequestFromCreatureAttack — stat-block attack -> request pieces
// ============================================================================
console.log("\n2. buildAttackRequestFromCreatureAttack");

test("damageType falls back to extraDamageType when damageType is undefined (Open5e quirk)", () => {
  const attack: NormalizedCreatureAttack = {
    name: "Bite attack", attackType: "WEAPON", toHit: 5, targetCreatureOnly: false,
    damageDice: "1d8", damageBonus: 3, extraDamageType: "piercing",
  };
  const built = buildAttackRequestFromCreatureAttack(attack);
  eq(built.damageExpr, "1d8+3");
  eq(built.damageType, "piercing");
  eq(built.modifiers.length, 1);
  eq(built.modifiers[0].value, 5);
});

test("falls back to a terminal default when no damage type is present at all", () => {
  const attack: NormalizedCreatureAttack = {
    name: "Slam", attackType: "WEAPON", toHit: 4, targetCreatureOnly: false, damageDice: "1d6",
  };
  const built = buildAttackRequestFromCreatureAttack(attack);
  eq(built.damageType, "bludgeoning");
  eq(built.damageExpr, "1d6", "no bonus -> plain dice expr");
});

// ============================================================================
// 3. startBridgeCombat — party + enemy mapping
// ============================================================================
console.log("\n3. startBridgeCombat — party + enemy mapping");

test("enemy Combatant: ac/hp/speed(ft, no conversion)/reach via size/resistances filtered", () => {
  const state = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 1 });
  const wolfCombatant = getCombatant(state.combat, "wolf1")!;
  eq(wolfCombatant.ac, 13);
  eq(wolfCombatant.hp, 11);
  eq(wolfCombatant.maxHp, 11);
  eq(wolfCombatant.speed, 40, "speed carried through in feet");
  eq(wolfCombatant.reach, 5, "medium creature reach = 5 ft (SIZE_REACH)");
  eq(wolfCombatant.resistances.length, 1);
  eq(wolfCombatant.resistances[0], "cold");
  eq(wolfCombatant.conditionIds.length, 0);
  eq(wolfCombatant.conscious, true);
});

test("enemy profile: size footprint + senses mapped from the stat block", () => {
  const state = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 1 });
  const profile = state.enemyProfiles["wolf1"];
  ok(!!profile);
  eq(profile.size, "medium");
  eq(profile.spaceFeet, 5, "medium creature space = 5 ft (SIZE_SPACE)");
  eq(profile.senses.darkvisionRange, 60);
});

test("deterministic: same seed -> same initiative order (reuses engine's seeded RNG)", () => {
  const s1 = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 42 });
  const s2 = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 42 });
  const order1 = s1.combat.initiativeOrder.map(c => `${c.characterId}:${c.initiative}`).join(",");
  const order2 = s2.combat.initiativeOrder.map(c => `${c.characterId}:${c.initiative}`).join(",");
  eq(order1, order2);
});

// ============================================================================
// 4. getCombatView
// ============================================================================
console.log("\n4. getCombatView — read projection");

test("reflects round/phase/current combatant/budgets", () => {
  const state = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 1 });
  const view = getCombatView(state);
  eq(view.round, 1);
  eq(view.active, true);
  eq(view.order.length, 2);
  ok(!!view.currentCombatantId);
  const current = view.order.find(o => o.id === view.currentCombatantId)!;
  eq(current.actionBudget.action, 1);
  eq(current.actionBudget.reactionAvailable, true);
});

// ============================================================================
// 5. performAttack
// ============================================================================
console.log("\n5. performAttack — spends action, resolves via engine, applies damage");

test("hit: spends the attack action, reduces target HP by exactly result.damage, source state untouched", () => {
  const seed = findSeedForD20(15);
  const state = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 1 });
  const outcome = performAttack(state, {
    attackerId: "hero", targetId: "wolf1",
    modifiers: [{ source: "ability_mod", value: 10 }], // 15 + 10 = 25 vs AC 13 -> guaranteed hit
    damageExpr: "1d6", damageType: "slashing", seed,
  });
  eq(outcome.spend.valid, true);
  ok(!!outcome.result);
  eq(outcome.result!.hit, true);

  const targetBefore = getCombatant(state.combat, "wolf1")!;
  const targetAfter = getCombatant(outcome.state.combat, "wolf1")!;
  eq(targetAfter.hp, targetBefore.hp - outcome.result!.damage);

  eq(outcome.state.combat.actionTrackers["hero"].actionCharges, 0, "attack action spent");
  // immutability of the input state
  eq(state.combat.actionTrackers["hero"].actionCharges, 1);
  eq(getCombatant(state.combat, "wolf1")!.hp, targetBefore.hp);
});

test("miss: full cover -> no damage, hp unchanged", () => {
  const state = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 1 });
  const outcome = performAttack(state, {
    attackerId: "hero", targetId: "wolf1",
    modifiers: [{ source: "ability_mod", value: 0 }],
    coverAC: 999, damageExpr: "1d6", damageType: "slashing", seed: findSeedForD20(10),
  });
  eq(outcome.result!.hit, false);
  eq(getCombatant(outcome.state.combat, "wolf1")!.hp, getCombatant(state.combat, "wolf1")!.hp);
});

test("out of actions: second attack this turn is rejected, state unchanged", () => {
  const state = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 1 });
  const first = performAttack(state, {
    attackerId: "hero", targetId: "wolf1",
    modifiers: [{ source: "x", value: 10 }], damageExpr: "1d6", damageType: "slashing",
  });
  eq(first.spend.valid, true);
  const second = performAttack(first.state, {
    attackerId: "hero", targetId: "wolf1",
    modifiers: [{ source: "x", value: 10 }], damageExpr: "1d6", damageType: "slashing",
  });
  eq(second.spend.valid, false);
  ok(!second.result);
  eq(second.state.combat.actionTrackers["hero"].actionCharges, 0);
});

// ============================================================================
// 6. moveBy
// ============================================================================
console.log("\n6. moveBy — movement budget in feet");

test("within budget: reduces movementRemaining", () => {
  const state = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 1 });
  const moved = moveBy(state, "hero", 10);
  eq(moved.ok, true);
  eq(moved.state.combat.actionTrackers["hero"].movementRemaining, 20);
});

test("exceeding budget: rejected, unchanged", () => {
  const state = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 1 });
  const moved = moveBy(state, "hero", 999);
  eq(moved.ok, false);
  eq(moved.state.combat.actionTrackers["hero"].movementRemaining, 30);
});

// ============================================================================
// 7. endTurn
// ============================================================================
console.log("\n7. endTurn — advance turn, fire start/end triggers, reset budgets");

const testRegenOnEnd: EffectDef = {
  id: "bridge_test_regen", name: "Regen (test)", category: "buff",
  description: "Heals at the end of the owner's turn.",
  duration: { type: "rounds", max: 5 }, stacking: "replace", modifiers: [],
  triggers: [{ trigger: "on_turn_end", action: "heal", healExpr: "1d4" }],
};
const testPoisonOnStart: EffectDef = {
  id: "bridge_test_poison", name: "Poison (test)", category: "ongoing_damage",
  description: "Damages at the start of the owner's turn.",
  duration: { type: "rounds", max: 2 }, stacking: "replace", modifiers: [],
  triggers: [{ trigger: "on_turn_start", action: "deal_damage", damageExpr: "1d4", damageType: "poison" }],
};

test("separates onEnd (departing) vs onStart (arriving) triggers; resets the arriving combatant's budget", () => {
  let state = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 1 });
  const departingId = getCombatView(state).currentCombatantId!;
  const arrivingId = departingId === "hero" ? "wolf1" : "hero";
  const arrivingSpeed = getCombatant(state.combat, arrivingId)!.speed;

  const withDeparting = applyEffect(state.combat.activeEffects, testRegenOnEnd, departingId);
  const withBoth = applyEffect(withDeparting.activeEffects, testPoisonOnStart, arrivingId);
  state = { ...state, combat: { ...state.combat, activeEffects: withBoth.activeEffects } };

  // Prove the reset actually happens: manually spend some of the arriving
  // combatant's movement before the turn boundary.
  state = moveBy(state, arrivingId, 5).state;

  const outcome = endTurn(state);
  eq(outcome.onEndTriggers.length, 1, "departing combatant's on_turn_end trigger fires");
  eq(outcome.onEndTriggers[0].action, "heal");
  eq(outcome.onStartTriggers.length, 1, "arriving combatant's on_turn_start trigger fires");
  eq(outcome.onStartTriggers[0].action, "deal_damage");

  eq(getCombatView(outcome.state).currentCombatantId, arrivingId);
  eq(outcome.state.combat.actionTrackers[arrivingId].movementRemaining, arrivingSpeed, "movement reset despite earlier spend");
});

// ============================================================================
// 8. runEnemyTurn — minimal hook point
// ============================================================================
console.log("\n8. runEnemyTurn — executes exactly the decided intent, then ends the turn");

test("attack intent: performs the attack via the bridge, then ends the turn", () => {
  const state = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 7 });
  const heroBefore = getCombatant(state.combat, "hero")!;
  const seed = findSeedForD20(19);

  const outcome = runEnemyTurn(state, "wolf1", () => ({
    type: "attack", targetId: "hero",
    modifiers: [{ source: "stat_block", value: 20 }], // guaranteed hit
    damageExpr: "1d6", damageType: "slashing", seed,
  }));

  eq(outcome.intent.type, "attack");
  ok(!!outcome.attack);
  eq(outcome.attack!.result!.hit, true);
  const heroAfter = getCombatant(outcome.state.combat, "hero")!;
  eq(heroAfter.hp, heroBefore.hp - outcome.attack!.result!.damage);
  ok(!!outcome.endTurn, "turn was ended as part of the seam");
});

test("pass intent: no attack/move performed, turn still ends", () => {
  const state = startBridgeCombat([HERO], [{ id: "wolf1", creature: WOLF }], { seed: 7 });
  const before = getCombatView(state);
  const outcome = runEnemyTurn(state, "wolf1", () => ({ type: "pass" }));
  eq(outcome.intent.type, "pass");
  ok(!outcome.attack);
  ok(!outcome.move);
  const after = getCombatView(outcome.state);
  ok(after.currentCombatantId !== before.currentCombatantId || after.round !== before.round, "turn advanced");
});

// ============================================================================
// 9. Real Open5e v2 monster action text — served from a cached fixture so the
//    test is deterministic and fully offline. It still exercises the entire
//    real loader path: fetch → normalizeCreature (in lib/open5e.ts) →
//    parseMultiattack, against a faithful Open5e v2 (5e-2024) Brown Bear stat
//    block (see scripts/fixtures/open5e-brown-bear.json). Every other test
//    above is seeded/offline per design.
// ============================================================================

// Load the cached Open5e v2 raw response and route the loader's fetch to it.
const BROWN_BEAR_RAW = readFileSync(
  fileURLToPath(new URL("./fixtures/open5e-brown-bear.json", import.meta.url)),
  "utf8",
);
setOpen5eFetch(async (input) => {
  const url = String(input);
  if (/\/creatures\/brown-bear/.test(url)) {
    return new Response(BROWN_BEAR_RAW, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response("Not Found", { status: 404 });
});

(async () => {
  console.log("\n9. brown-bear Multiattack via lib/open5e.ts's getCreature() loader (cached fixture)");

  await testAsync("brown-bear Multiattack parses to Bite x1 + Claw x1 from real action text", async () => {
    const creature = await getCreature("brown-bear");
    ok(!!creature, "brown-bear must resolve via the Open5e v2 loader (cached fixture)");

    const plan = parseMultiattack(creature!.actions);
    ok(!!plan, "Brown Bear must have a Multiattack action");
    eq(plan!.totalAttacks, 2);
    eq(plan!.fixedEntries.length, 2);
    ok(plan!.fixedEntries.some(e => e.actionName === "Bite" && e.count === 1));
    ok(plan!.fixedEntries.some(e => e.actionName === "Claw" && e.count === 1));

    const bite = creature!.actions.find(a => a.name === "Bite")!.attacks[0];
    const builtBite = buildAttackRequestFromCreatureAttack(bite);
    eq(builtBite.damageExpr, "1d8+3");
    eq(builtBite.damageType, "piercing", "falls back to extraDamageType on real data (Open5e quirk)");

    const claw = creature!.actions.find(a => a.name === "Claw")!.attacks[0];
    const builtClaw = buildAttackRequestFromCreatureAttack(claw);
    eq(builtClaw.damageExpr, "1d4+3");
    eq(builtClaw.damageType, "slashing");
  });

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
})();
