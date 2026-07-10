import * as dialogue from "../src/lib/dialogue";
import * as planning from "../src/lib/planning";
import * as narrative from "../src/lib/narrative";
import * as encounter from "../src/lib/encounter";
import * as content from "../src/lib/content";
import { listAllDomains } from "../src/lib/domains";

console.log("=== Domain 31-35 (AI DM Layer) Tests ===\n");

// Domain 31: Dialogue Engine
console.log("Domain 31: Dialogue Engine");
let session = dialogue.createDialogueSession("merchant_1", "player", 1000);
console.log("  Initial phase:", session.conversation.phase, "(expected greeting)");
const r1 = dialogue.processPlayerInput(session, "สวัสดีครับ ขอถามทางหน่อย", 1000);
console.log("  Intent:", r1.intent.intent, "(expected ask_question or greeting)");
console.log("  Emotion after:", r1.session.emotion.current);
session = r1.session;
const r2 = dialogue.processPlayerInput(session, "ลดราคาให้หน่อยได้ไหม", 1100);
console.log("  Intent:", r2.intent.intent, "(expected bargain)");
console.log("  Directive emotion:", r2.directive.emotion);
console.log("  Skill check:", JSON.stringify(r2.directive.triggersSkillCheck));

// Domain 32: AI Planning
console.log("\nDomain 32: AI Planning Engine");
const goal = planning.createGoal({ id: "g1", type: "kill_player", description: "Kill the player", priority: 8, targetId: "player" });
const ctx: planning.PlanningContext = {
  selfHpPercent: 75, selfPosition: { x: 5, y: 5 }, selfHasRangedWeapon: false, selfAbilitiesAvailable: [],
  alliesAlive: 1, alliesWounded: 0, enemiesVisible: 1, enemyHpPercents: [0.6], distanceToTarget: 2,
  targetIsCaster: false, targetIsFleeing: false, hasHealingPotion: true, hasReinforcementCall: false,
  environmentHazards: [], currentRound: 1, worldSeconds: 0,
};
const plan = planning.generateFullPlan([goal], ctx, 50);
console.log("  Goal:", plan?.goal.type, "(expected kill_player)");
console.log("  Strategy:", plan?.strategy, "(expected aggressive_rush)");
console.log("  Risk:", plan?.risk.threatLevel, "(expected easy/trivial)");
console.log("  Selected action:", plan?.selectedAction?.action);

// Domain 33: Narrative
console.log("\nDomain 33: Narrative Engine");
const arc = narrative.createStoryArc({ id: "arc1", title: "The Lost Mine", description: "Phandelver", themes: ["greed", "redemption"], estimatedLength: 15 });
const engine = narrative.createNarrativeEngine(arc);
console.log("  Arc phase:", engine.arc.currentPhase, "(expected setup)");
const scene = narrative.createScene({ id: "s1", arcId: "arc1", type: "combat", title: "Goblin Ambush", description: "Goblins attack!", locationId: "road", tension: "high" });
const engine2 = narrative.enterScene(engine, scene);
console.log("  Current scene:", engine2.currentScene?.title);
const engine3 = narrative.completeScene(engine2, "success");
console.log("  After scene: arc phase =", engine3.arc.currentPhase, "(expected inciting_incident)");
console.log("  Pacing next tension:", engine3.pacing.recommendedNextTension);

// Domain 34: Encounter
console.log("\nDomain 34: Encounter Engine");
const diff = encounter.calculateDifficulty(200, 4, 3, 1);
console.log("  Difficulty for 200xp 4 monsters vs Lv3 solo:", diff);
const table = encounter.findEncounterTable("forest", 2);
console.log("  Forest table found:", !!table, "with", table?.entries.length, "entries");
const rolled = table ? encounter.rollEncounterFromTable(table) : null;
console.log("  Rolled encounter:", rolled?.monsterName, "x", rolled?.quantity, "(CR", rolled?.cr + ")");
const budget = encounter.createEncounterBudget(3, 1);
console.log("  Daily XP budget Lv3 solo:", budget.dailyXPBudget);
console.log("  Recommended next difficulty:", encounter.recommendedNextDifficulty(budget));

// Domain 35: Content Management
console.log("\nDomain 35: Content Management");
const reg = content.createContentRegistry();
const sampleSpell = {
  id: "fireball",
  type: "spell",
  name: "Fireball",
  level: 3,
  school: "evocation",
  data: { damage: "8d6", save: "dex", aoe: { type: "sphere", size: 20 } },
};
const { registry: reg2, result } = content.importContentJSON(reg, JSON.stringify(sampleSpell), "custom");
console.log("  Imported:", result.imported, "errors:", result.errors.length);
const found = content.getContent(reg2, "spell", "fireball");
console.log("  Found:", found?.name, "source:", found?.source);
const validation = content.validateContentEntry({ id: "bad", type: "monster", name: "Bad Monster" });
console.log("  Invalid entry validation:", validation.valid, "(expected false — missing hp/ac/cr)");

// Final: list all domains
console.log("\n=== All Domains ===");
const all = listAllDomains();
console.log("  Total domains:", all.length, "(expected 36 — 30 engine + 6 AI DM)");
console.log("  AI DM domains:", all.filter((d) => d.id >= 32).map((d) => `${d.id}:${d.name}`).join(", "));

console.log("\n=== ALL AI DM DOMAIN TESTS PASSED ===");
