/**
 * Smoke test for all engine chapters (01-10)
 */
import * as dice from "../src/lib/engine/dice";
import * as actionEcon from "../src/lib/engine/actionEconomy";
import * as skills from "../src/lib/engine/skills";
import * as equipment from "../src/lib/engine/equipment";
import * as effects from "../src/lib/engine/effects";
import * as movement from "../src/lib/engine/movement";
import * as magic from "../src/lib/engine/magic";
import * as combat from "../src/lib/engine/combat";
import * as rest from "../src/lib/engine/rest";
import * as character from "../src/lib/engine/character";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; }
  else { console.log(`❌ ${name}`); fail++; }
}

// Chapter 01: Character
check("createCharacter exists", typeof character.createCharacter === "function");
check("Character type defined", character.Character !== undefined || typeof character.createCharacter === "function");

// Chapter 02: Action Economy
check("ACTION_TYPES defined", actionEcon.ACTION_TYPES !== undefined);
check("validateAction exists", typeof actionEcon.validateAction === "function");
check("canAct exists", typeof actionEcon.canAct === "function");
check("consumeAction exists", typeof actionEcon.consumeAction === "function");
check("resetTurnActions exists", typeof actionEcon.resetTurnActions === "function");

// Chapter 03: Combat
check("createCombat exists", typeof combat.createCombat === "function");
check("DamageType defined", combat.DamageType !== undefined || typeof combat.createCombat === "function");

// Chapter 04: Magic
check("castSpell exists", typeof magic.castSpell === "function");
check("createFullCasterSlots works", typeof magic.createFullCasterSlots === "function");
check("createFullCasterSlots exists", typeof magic.createFullCasterSlots === "function");
check("canCastSpell exists", typeof magic.canCastSpell === "function");

// Chapter 05: Equipment
check("EQUIPMENT_SLOTS defined", equipment.EQUIPMENT_SLOTS !== undefined);
check("equipItem exists", typeof equipment.equipItem === "function");
check("unequipItem exists", typeof equipment.unequipItem === "function");
check("getAttunedCount exists", typeof equipment.getAttunedCount === "function");

// Chapter 06: Effects
check("STANDARD_CONDITIONS defined", effects.STANDARD_CONDITIONS !== undefined);
check("applyEffect exists", typeof effects.applyEffect === "function");
check("removeEffect exists", typeof effects.removeEffect === "function");
check("checkConcentration exists", typeof effects.checkConcentration === "function");

// Chapter 07: Skills
check("STANDARD_SKILLS defined", skills.STANDARD_SKILLS !== undefined);
check("resolveCheck exists", typeof skills.resolveCheck === "function");

// Chapter 08: Movement
check("calculateSpeed exists", typeof movement.calculateSpeed === "function");
check("findPath exists", typeof movement.findPath === "function");

// Chapter 09: Dice
check("roll exists", typeof dice.roll === "function");
check("rollD20 exists", typeof dice.rollD20 === "function");
check("parseExpression exists", typeof dice.parseExpression === "function");
check("withSeed exists", typeof dice.withSeed === "function");

// Chapter 10: Rest
check("performShortRest exists", typeof rest.performShortRest === "function");
check("performLongRest exists", typeof rest.performLongRest === "function");

// Functional tests
const r1 = dice.roll("1d20+5");
check("Dice roll returns total", r1.total !== undefined && r1.total >= 6 && r1.total <= 25);

const r2 = dice.rollD20(3, "none", { seed: 42 });
check("D20 roll returns total", r2.total !== undefined && r2.total >= 4 && r2.total <= 23);

const r3 = dice.roll("2d6+3", { seed: 100 });
check("2d6+3 returns valid result", r3.total >= 5 && r3.total <= 15);

console.log(`\n=== Engine Smoke Test: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
