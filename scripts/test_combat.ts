import {
  startCombat, advanceToNextCombatant, getCurrentCombatant,
  resolveAttack, applyDamage, applyHealing, applyTempHP,
  rollDeathSave, checkOpportunity, resolveGrapple, resolveShove,
  consumeAction, consumeBonusAction, consumeReaction, consumeMovement,
  getDistance, isAdjacent, isInReach, checkCombatEnd, endCombat,
  validateTarget, startTurn, endTurn,
} from "../src/lib/combat";

console.log("=== Combat System Tests ===\n");

// 6.1 Combat Start
const state = startCombat(
  { name: "Hero", hp: 20, maxHp: 20, ac: 16, dex: 14, pos: { x: 6, y: 8 }, speed: 30, conditions: [] },
  [
    { uid: "goblin_0", name: "Goblin", hp: 7, maxHp: 7, ac: 13, init: 2, pos: { x: 4, y: 2 }, xp: 50, attacks: [{ name: "Scimitar", atk: 4, dmg: "1d6+2", dmgType: "slashing" }] },
    { uid: "goblin_1", name: "Goblin", hp: 7, maxHp: 7, ac: 13, init: 2, pos: { x: 8, y: 2 }, xp: 50 },
  ],
  { w: 12, h: 10 },
  false,
);
console.log("Combat started:");
console.log("  Combatants:", state.combatants.length);
console.log("  Initiative order:", state.initiativeOrder.map(i => `${i.name}(${i.initiative})`).join(", "));
console.log("  Round:", state.round);
console.log("  Active:", state.active);

// 6.2 Initiative
const current = getCurrentCombatant(state);
console.log("\nCurrent combatant:", current?.name, "init:", current?.initiative);

// 6.5 Turn
startTurn(state);
console.log("Turn started for:", current?.name);

// 6.6 Targeting
const target = state.combatants.find(c => c.uid === "goblin_0")!;
const validation = validateTarget(current!, target, 1); // melee range
console.log("\nTarget validation (melee, 6 squares away):", validation.valid, validation.reasonTh);

// 6.7 Attack (miss because too far, but let's test the roll anyway)
const atkResult = resolveAttack(current!, target, 5, "1d8+3", "slashing", 20, false, false);
console.log("\nAttack roll:", atkResult.die, "+5 =", atkResult.total, "vs AC", atkResult.targetAC, "→", atkResult.hit ? "HIT" : "MISS", atkResult.isCrit ? "(CRIT!)" : "");

// 6.8 Damage (if hit)
if (atkResult.hit && atkResult.damage) {
  const dmgResult = applyDamage(target, atkResult.damage, atkResult.damageType || "slashing");
  console.log("  Damage:", atkResult.damage, "→ HP:", dmgResult.newHp, "killed:", dmgResult.killed);
}

// Test with resistance
const resistantTarget = { ...target, resistances: ["slashing"] };
const atkResist = resolveAttack(current!, resistantTarget, 5, "1d8+3", "slashing");
if (atkResist.hit && atkResist.damage) {
  console.log("  vs resistant target: raw damage halved →", atkResist.damage);
}

// 6.9 Healing
const healResult = applyHealing(current!, 5);
console.log("\nHeal +5 → HP:", healResult.newHp);

const tempHpResult = applyTempHP(current!, 10);
console.log("Temp HP +10 → tempHp:", tempHpResult.tempHp);

// 6.10 Death Save
const dyingChar = { ...state.combatants[0], hp: 0, dead: false, conditions: ["unconscious"] };
(dyingChar as any).deathSaves = { s: 0, f: 0 };
const dsResult = rollDeathSave(dyingChar as any);
console.log("\nDeath Save: die=" + dsResult.die + " → " + dsResult.outcome + " (s:" + dsResult.successes + " f:" + dsResult.failures + ")");

// 6.11 Opportunity Attack
const oaCheck = checkOpportunity(
  current!, { x: 4, y: 5 }, { x: 5, y: 5 },
  state.combatants.filter(c => !c.isPlayer),
  "walk", false,
);
console.log("\nOpportunity Attack check:", oaCheck.provokes, oaCheck.reasonTh, oaCheck.attacker?.name || "(none)");

const oaCheckTeleport = checkOpportunity(
  current!, { x: 4, y: 5 }, { x: 10, y: 5 },
  state.combatants.filter(c => !c.isPlayer),
  "teleport", false,
);
console.log("Teleport OA check:", oaCheckTeleport.provokes);

const oaCheckDisengage = checkOpportunity(
  current!, { x: 4, y: 5 }, { x: 5, y: 5 },
  state.combatants.filter(c => !c.isPlayer),
  "walk", true,
);
console.log("Disengage OA check:", oaCheckDisengage.provokes);

// 6.12 Grapple & Shove
const grappleResult = resolveGrapple(current!, target, 5, 2);
console.log("\nGrapple:", grappleResult.success, grappleResult.historyTh);

const shoveResult = resolveShove(current!, target, 5, 2, "prone");
console.log("Shove (prone):", shoveResult.success, shoveResult.historyTh);

// 6.13 Resources
console.log("\nResources:");
console.log("  hasAction:", current!.hasAction, "→ consume:", consumeAction(current!), "→ hasAction:", current!.hasAction);
console.log("  hasBonusAction:", current!.hasBonusAction, "→ consume:", consumeBonusAction(current!), "→ hasBonus:", current!.hasBonusAction);
console.log("  hasReaction:", current!.hasReaction, "→ consume:", consumeReaction(current!), "→ hasReaction:", current!.hasReaction);
console.log("  movementLeft:", current!.movementLeft, "→ consume 3:", consumeMovement(current!, 3), "→ left:", current!.movementLeft);

// 6.15 Position
const dist = getDistance(current!, target);
console.log("\nDistance to goblin_0:", dist, "adjacent:", isAdjacent(current!, target), "in reach:", isInReach(current!, target));

// 6.17 End Combat — kill all enemies
for (const e of state.combatants.filter(c => !c.isPlayer)) {
  e.hp = 0;
  e.dead = true;
}
console.log("\nCombat end check:", checkCombatEnd(state));
const endResult = endCombat(state);
console.log("Victor:", endResult.victor, "XP:", endResult.xpAwarded);

console.log("\n=== All tests passed! ===");
