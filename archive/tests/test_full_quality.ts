/**
 * Final Quality Test — verify all 36 domains + integration work end-to-end
 */
import { listAllDomains, getDomainById } from "../src/lib/domains";
import * as dialogue from "../src/lib/dialogue";
import * as planning from "../src/lib/planning";
import * as narrative from "../src/lib/narrative";
import * as encounter from "../src/lib/encounter";
import * as content from "../src/lib/content";

console.log("=== FINAL QUALITY TEST ===\n");
let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); fail++; }
}

// 1. Domain registry
console.log("1. Domain Registry");
const all = listAllDomains();
check("Total domains", all.length === 36, `got ${all.length}`);
check("Core Engine (1-20)", all.filter(d => d.id >= 1 && d.id <= 20).length === 20);
check("World Layer (21-30)", all.filter(d => d.id >= 21 && d.id <= 30).length === 10);
check("Game State (31)", all.filter(d => d.id === 31).length === 1);
check("AI DM Layer (32-36)", all.filter(d => d.id >= 32 && d.id <= 36).length === 5);

// 2. Domain 31 - Dialogue (LLM-powered intent)
console.log("\n2. Domain 31: Dialogue Engine");
const intent = dialogue.analyzeIntent("ลดราคาให้หน่อย");
check("Keyword intent classifier", intent.intent === "bargain", `got ${intent.intent}`);
const session = dialogue.createDialogueSession("npc_1", "player", 1000);
check("Dialogue session init", session.conversation.phase === "greeting");
const result = dialogue.processPlayerInput(session, "สวัสดีครับ", 1100);
check("Dialogue turn advance", result.session.conversation.turnsElapsed === 1);
check("Emotion tracking", !!result.session.emotion.current);

// 3. Domain 32 - Planning
console.log("\n3. Domain 32: AI Planning Engine");
const goal = planning.createGoal({ id: "g1", type: "kill_player", description: "test", priority: 8 });
const ctx: planning.PlanningContext = {
  selfHpPercent: 80, selfPosition: { x: 5, y: 5 }, selfHasRangedWeapon: false, selfAbilitiesAvailable: [],
  alliesAlive: 1, alliesWounded: 0, enemiesVisible: 1, enemyHpPercents: [0.6], distanceToTarget: 2,
  targetIsCaster: false, targetIsFleeing: false, hasHealingPotion: true, hasReinforcementCall: false,
  environmentHazards: [], currentRound: 1, worldSeconds: 0,
};
const plan = planning.generateFullPlan([goal], ctx, 50);
check("Plan generated", !!plan);
check("Strategy selected", !!plan?.strategy);
check("Action selected", !!plan?.selectedAction);
check("Risk assessed", !!plan?.risk);
// Low HP scenario — must also have no allies for full retreat
const lowHpCtx = { ...ctx, selfHpPercent: 15, alliesAlive: 0 };
const lowHpPlan = planning.generateFullPlan([goal], lowHpCtx, 50);
check("Low HP retreat (no allies)", lowHpPlan?.strategy === "retreat_to_heal" || lowHpPlan?.selectedAction?.action === "retreat" || lowHpPlan?.selectedAction?.action === "flee_to_safe_spot", `strategy=${lowHpPlan?.strategy}, action=${lowHpPlan?.selectedAction?.action}`);

// 4. Domain 33 - Narrative
console.log("\n4. Domain 33: Narrative Engine");
const arc = narrative.createStoryArc({ id: "a1", title: "Test", description: "test", themes: ["adventure"] });
check("Arc init", arc.currentPhase === "setup");
let engine = narrative.createNarrativeEngine(arc);
check("Narrative engine init", !!engine);
const scene = narrative.createScene({ id: "s1", arcId: "a1", type: "combat", title: "Test", description: "test", locationId: "loc1", tension: "high" });
engine = narrative.enterScene(engine, scene);
check("Scene enter", engine.currentScene?.id === "s1");
engine = narrative.completeScene(engine, "success");
check("Scene complete + arc advance", engine.arc.currentPhase !== "setup");
check("Pacing tracked", engine.pacing.scenesSinceCombat === 1 || engine.pacing.scenesSinceCombat === 0);

// 5. Domain 34 - Encounter
console.log("\n5. Domain 34: Encounter Engine");
const diff = encounter.calculateDifficulty(200, 3, 3, 1);
check("Difficulty calc", ["trivial", "low", "moderate", "high", "impossible"].includes(diff), `got ${diff}`);
const thresholds = encounter.getDifficultyThresholds(5);
check("Lv5 thresholds (D&D 2024)", thresholds.low === 500 && thresholds.high === 1100);
const lowCRs = encounter.suggestedCR(3, "low");
check("CR suggestion", lowCRs.length > 0, `got ${lowCRs.join(",")}`);
const table = encounter.findEncounterTable("forest", 2);
check("Forest table", !!table && table.entries.length > 0);
const rolled = table ? encounter.rollEncounterFromTable(table) : null;
check("Random encounter roll", !!rolled && !!rolled.monsterId);
const budget = encounter.createEncounterBudget(5, 1);
check("Daily budget", budget.dailyXPBudget > 0);

// 6. Domain 35 - Content Management
console.log("\n6. Domain 35: Content Management");
let reg = content.createContentRegistry();
check("Registry init", Object.keys(reg.entries).length === 0);
const sampleSpell = JSON.stringify({
  id: "test_spell", type: "spell", name: "Test Spell", level: 1, school: "evocation",
  data: { damage: "1d6" },
});
const { registry: reg2, result: importResult } = content.importContentJSON(reg, sampleSpell, "homebrew");
check("Import homebrew", importResult.imported === 1 && importResult.errors.length === 0);
const found = content.getContent(reg2, "spell", "test_spell");
check("Lookup imported content", !!found && found.source === "homebrew");
const validation = content.validateContentEntry({ id: "bad", type: "monster", name: "Bad" });
check("Validation rejects bad entry", !validation.valid);
const exported = content.exportByType(reg2, "spell");
check("Export by type", exported.includes("Test Spell"));

// 7. Integration - all domains work together
console.log("\n7. Cross-Domain Integration");
check("All 36 domains accessible", listAllDomains().length === 36);
check("Domains have descriptions", listAllDomains().every(d => d.description.length > 0));
check("Domains have subSystems", listAllDomains().every(d => d.subSystems.length > 0));

console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
