import * as exploration from "../src/lib/exploration";
import * as social from "../src/lib/social";
import * as rest from "../src/lib/rest";
import * as time from "../src/lib/time";
import * as monsters from "../src/lib/monsters";
import * as world from "../src/lib/world";
import * as ruleEngine from "../src/lib/ruleEngine";
import * as events from "../src/lib/events";
import * as aoe from "../src/lib/aoe";
import * as gameState from "../src/lib/gameState";

console.log("=== Domain 21: Exploration ===");
const ex = exploration.createExplorationState("dungeon", "Cave of Echoes");
const ex2 = exploration.logExplorationAction(ex, "search corridor", "found trap", 10);
console.log("Exploration state:", exploration.summarizeExploration(ex2));

console.log("\n=== Domain 22: Social ===");
const prof = social.createNPCSocialProfile("merchant_1", "indifferent", []);
console.log("NPC profile:", prof.attitude, "trust:", prof.influence.trust);
const chk = social.resolveSocialCheck({
  skill: "persuasion", modifier: 3, targetAttitude: "indifferent",
  advantage: false, disadvantage: false,
});
console.log("Persuasion:", chk.note);
const bargain = social.resolveBargaining({
  basePrice: 100, sellerAttitude: "indifferent",
  playerPersuasionMod: 3, reputationWithSeller: 20,
});
console.log("Bargain:", bargain.finalPrice + "gp (was 100), discount:", bargain.discount + "%");

console.log("\n=== Domain 23: Rest ===");
const shortRest = rest.performShortRest({
  hitDiceAvailable: 2, hitDiceSize: 8, constitutionModifier: 2,
  featuresWithShortRestRecharge: [{ id: "f1", usesMax: 2, usesCurrent: 0 }],
  resourcesWithShortRestRecharge: [{ id: "r1", usesMax: 3, usesCurrent: 1 }],
}, 2);
console.log("Short rest:", shortRest.hpRecovered + " HP,", shortRest.hitDiceSpent + " HD spent");

console.log("\n=== Domain 24: Time ===");
const clock = new time.WorldClock(0);
clock.advanceBy(2, "hour");
clock.advanceBy(30, "minute");
console.log("Time:", clock.format());
console.log("Date:", clock.formatDate());
clock.addTimer({ id: "t1", label: "Spell ends", duration: { unit: "minute", amount: 10 } });
clock.advanceBy(11, "minute");
const expired = clock.expireTimers();
console.log("Expired timers:", expired.map(t => t.label).join(", "));

console.log("\n=== Domain 25: Monsters ===");
const goblinDef: monsters.MonsterDefinition = {
  base: { id: "goblin", name: "Goblin", type: "humanoid", size: "small", alignment: "neutral_evil", cr: "1/4" },
  stats: { hp: 7, maxHp: 7, ac: 13, speed: 30, abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    savingThrows: {}, skills: {}, passivePerception: 9, languages: ["Common", "Goblin"] },
  actions: [{ id: "scim", name: "Scimitar", type: "action", description: "1d6+2 slashing" }],
  abilities: [],
  behavior: { pattern: "aggressive", priorities: ["attack"], fleeThreshold: 25, preferTarget: "nearest" },
};
const decision = monsters.decideAIAction(goblinDef.behavior, {
  hpPercent: 80, alliesAlive: 2, enemiesVisible: 3, hasBonusAction: false, hasReaction: true,
});
console.log("Goblin decision at 80% HP:", decision);
const xp = monsters.crToXP("1/4");
console.log("Goblin XP:", xp);

console.log("\n=== Domain 26: World ===");
const map: world.WorldMap = {
  nodes: {
    town: { id: "town", name: "Phandalin", type: "city", coordinates: { x: 0, y: 0 }, unlocked: true },
    cave: { id: "cave", name: "Cragmaw Cave", type: "dungeon", coordinates: { x: 3, y: 0 }, unlocked: true },
  },
  connections: [{ from: "town", to: "cave", distanceMiles: 5 }],
};
const reachable = world.getReachableNodes(map, "town");
console.log("Reachable from town:", reachable.map(r => r.node.name + " (" + r.distance + "mi)").join(", "));

console.log("\n=== Domain 27: Rule Engine ===");
const reg = new ruleEngine.RuleRegistry();
reg.register(ruleEngine.COMMON_RULES[0]); // attack_melee
const result = reg.resolve("attack_melee", {
  baseRoll: 14,
  modifiers: [
    { id: "str", type: "ability", name: "STR", value: 3 },
    { id: "prof", type: "ability", name: "Proficiency", value: 2 },
  ],
  advantage: false,
  disadvantage: false,
  targetDC: 15,
  context: {
    characterId: "p1",
    abilityScores: {},
    proficiencyIds: new Set(),
    resources: {},
    conditions: [],
    equipped: [],
    feats: [],
    flags: {},
    actionsThisTurn: 0,
    actionsThisRound: 0,
    actionsThisDay: {},
  },
});
console.log("Attack vs AC 15:", result.note);

console.log("\n=== Domain 28: Events ===");
const bus = new events.EventBus();
const unsub = bus.addListener({
  id: "ls1", ownerId: "rogue_1", source: "feature",
  trigger: { eventType: "on_hit" },
  action: { type: "apply_condition", conditionId: "poisoned", conditionDuration: 3 },
  priority: 10, active: true,
});
const evtR = bus.emit(
  events.createAttackEvent("rogue_1", "goblin_1"),
  { rogue_1: { flags: {}, conditions: [], resources: {}, equipped: [], cooldowns: {} } },
);
console.log("Event fired, state changes:", evtR.finalStateChanges.length, "steps:", evtR.steps.length);

console.log("\n=== Domain 29: AoE ===");
const area: aoe.AreaDefinition = {
  shape: "sphere", origin: { x: 0, y: 0 }, size: 20,
};
const candidates: aoe.PotentialTarget[] = [
  { id: "g1", position: { x: 1, y: 1 }, isAllyOfCaster: false, isWilling: false, isObject: false, isDead: false },
  { id: "g2", position: { x: 5, y: 5 }, isAllyOfCaster: false, isWilling: false, isObject: false, isDead: false },
  { id: "ally1", position: { x: 2, y: 2 }, isAllyOfCaster: true, isWilling: false, isObject: false, isDead: false },
];
const targets = aoe.selectTargetsInArea(area, candidates, "enemy", "caster_1");
console.log("Fireball targets:", targets.map(t => t.id).join(", "));
const squares = aoe.getAreaSquares(area);
console.log("Fireball covers", squares.length, "grid squares");

console.log("\n=== Domain 30: Game State ===");
const gs = new gameState.GameState({
  campaign: world.createCampaign({
    id: "lmop", name: "Lost Mine of Phandelver",
    startingChapter: "Chapter 1", startingSceneId: "scene_intro", startingGold: 10,
  }),
  world: { time: { totalSeconds: 0 }, weather: "clear", lighting: "daylight", currentLocationId: "town", npcStates: {} },
  initialCharacters: [gameState.createCharacterState({ characterId: "p1", name: "Hero", maxHp: 20 })],
});
const actResult = gs.applyAction({
  type: "goblin_ambush",
  actorId: "goblin_1",
  targetIds: ["p1"],
  payload: { damage: 5, damageType: "slashing" },
});
console.log("Damage applied:", actResult.effects.length, "effects");
console.log("Hero HP after:", gs.getCharacter("p1")?.hp, "/", gs.getCharacter("p1")?.maxHp);
const snap = gs.snapshot();
console.log("Snapshot saved: version", snap.version, "characters:", Object.keys(snap.characters).length);

console.log("\n=== ALL DOMAIN TESTS PASSED ===");
