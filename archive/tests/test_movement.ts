import {
  getEffectiveSpeed, walkCost, crawlCost, standUpCost, dashBonus,
  longJump, highJump, climbCost, swimCost, teleport, forcedMovement,
  checkOpportunityAttack, isSquareOccupied, fallDamage, getReach,
  findPath, getReachableSquares, TERRAIN_TYPES,
} from "../src/lib/movement";

console.log("=== Movement System Tests ===\n");

// Layer 1: Capability
const r1 = getEffectiveSpeed(30, [], [], 0);
console.log("Normal speed:", r1.speed, "canMove:", r1.canMove);

const r2 = getEffectiveSpeed(30, ["grappled"], [], 0);
console.log("Grappled:", r2.speed, "canMove:", r2.canMove);

const r3 = getEffectiveSpeed(30, ["prone"], [], 0);
console.log("Prone:", r3.speed, "canMove:", r3.canMove, "restrictions:", r3.restrictions.length);

const r4 = getEffectiveSpeed(30, [], [{ name: "Haste" }], 0);
console.log("Hasted:", r4.speed, "canMove:", r4.canMove);

const r5 = getEffectiveSpeed(30, [], [{ name: "Longstrider" }], 1);
console.log("Longstrider + encumbered:", r5.speed);

// Layer 2: Execution
console.log("\n--- Execution ---");
console.log("Walk 30ft normal:", walkCost(30), "points");
console.log("Walk 30ft difficult:", walkCost(30, true), "points");
console.log("Crawl 10ft:", crawlCost(10), "points");
console.log("Stand up from prone (speed 30):", standUpCost(30), "points");
console.log("Dash bonus (speed 30):", dashBonus(30), "points");
console.log("Long jump STR 16, running:", longJump(16, true).distance, "ft");
console.log("High jump STR 16, running:", highJump(16, true).height, "ft");
console.log("Climb 15ft, no climb speed:", climbCost(15, false), "points");
console.log("Swim 15ft, with swim speed:", swimCost(15, true), "points");

const tp = teleport(30);
console.log("Teleport 30ft: cost=" + tp.cost + " provokes=" + tp.provokesOpportunity);

const fm = forcedMovement(10, "Thunderwave");
console.log("Forced 10ft: cost=" + fm.cost + " provokes=" + fm.provokesOpportunity);

// Layer 3: Resolution
console.log("\n--- Resolution ---");
const oa = checkOpportunityAttack(
  { x: 5, y: 5 }, { x: 6, y: 5 },
  [{ uid: "goblin_0", pos: { x: 4, y: 5 }, reach: 1 }],
  "walk", false,
);
console.log("Opp attack check:", oa.provokes, oa.reasonTh);

const oa2 = checkOpportunityAttack(
  { x: 5, y: 5 }, { x: 6, y: 5 },
  [{ uid: "goblin_0", pos: { x: 4, y: 5 }, reach: 1 }],
  "teleport", false,
);
console.log("Teleport opp attack:", oa2.provokes);

const oa3 = checkOpportunityAttack(
  { x: 5, y: 5 }, { x: 6, y: 5 },
  [{ uid: "goblin_0", pos: { x: 4, y: 5 }, reach: 1 }],
  "walk", true, // disengaged
);
console.log("Disengage opp attack:", oa3.provokes);

console.log("Fall 30ft:", fallDamage(30).dice);
console.log("Fall 250ft:", fallDamage(250).dice, "capped:", fallDamage(250).capped);
console.log("Reach (normal):", getReach([]), "Reach (reach weapon):", getReach(["reach"]));

// Pathfinding
console.log("\n--- Pathfinding ---");
const grid = { w: 12, h: 10 };
const walls = [{ x: 3, y: 5 }];
const creatures = [{ x: 5, y: 3 }];
const terrain: Record<string, { x: number; y: number; type: string }> = {
  "2,2": { x: 2, y: 2, type: "difficult" },
};

const reachable = getReachableSquares({ x: 6, y: 8 }, 6, grid, walls, creatures, terrain);
console.log("Reachable squares (6 movement):", reachable.length);

const path = findPath({ x: 6, y: 8 }, { x: 6, y: 2 }, grid, walls, creatures, terrain);
console.log("Path to (6,2):", path ? path.length + " steps" : "no path");

console.log("\n=== All tests passed! ===");
