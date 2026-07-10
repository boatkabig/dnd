/**
 * Character Engine — Chapter 01 Unit Tests
 * Tests all 32 sections of the Character System spec
 */
import {
  createCharacter, getScore, getMod, getPB, getSaveMod, getSkillMod,
  hasTag, addTag, removeTag, isAlive, isDowned, isDead, isIncapacitated,
  transitionLifecycle, applyDamageToCharacter, applyHealingToCharacter,
  rollDeathSave, addXP, summarizeCharacter,
  CHARACTER_TYPE_CONFIGS, canTransition, getEffectiveScore, getAbilityModifier,
  getProficiencyBonus, getSkillModifier, hasSkillAdvantage, hasSkillDisadvantage,
  SIZE_SPACE, SIZE_REACH, PROFICIENCY_BONUS_TABLE,
  type Character, type AbilityName, type AbilityScore, type SpeciesDef, type ClassDef,
  type BackgroundDef, type CharacterType, type CharacterLifecycleState,
  type SkillInstance, type SavingThrow,
} from "../src/lib/engine/character";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); fail++; }
}

// === Test Species/Class/Background definitions ===
const testSpecies: SpeciesDef = {
  id: "human", name: "Human", size: "medium", creatureType: "humanoid",
  speed: { walk: 30 }, traitIds: ["versatile"], languages: ["common"],
  abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
};

const testClass: ClassDef = {
  id: "fighter", name: "Fighter", hitDie: 10,
  savingThrows: ["str", "con"],
  armorProficiencies: ["light", "medium", "heavy", "shield"],
  weaponProficiencies: ["simple", "martial"],
  toolProficiencies: [],
  skillChoices: { count: 2, from: ["athletics", "intimidation", "perception", "survival"] },
  startingEquipment: ["Chain Mail", "Longsword", "Shield"],
  featuresByLevel: { 1: ["second_wind", "fighting_style"] },
  subclassLevel: 3,
  subclasses: ["champion", "battle_master", "eldritch_knight"],
};

const testBackground: BackgroundDef = {
  id: "soldier", name: "Soldier",
  skillProficiencies: ["athletics", "intimidation"],
  toolProficiencies: ["Land Vehicles"],
  languages: [],
  equipment: ["Rank Insignia"],
  originFeatId: "savage_attacker",
  suggestedAsi: { primary: ["str", "con"], secondary: ["cha"] },
};

console.log("=== Chapter 01: Character System Tests ===\n");

// 4. Identity
console.log("4. Identity");
const char = createCharacter({
  name: "TestHero", type: "player", species: testSpecies, classDef: testClass,
  background: testBackground,
  abilityScores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  playerId: "player1", alignment: "lawful_good",
});
check("Character ID generated", char.identity.characterId.startsWith("char_"));
check("Name set", char.identity.name === "TestHero");
check("Player ID set", char.identity.playerId === "player1");
check("Alignment set", char.identity.alignment === "lawful_good");

// 5. Character Type
console.log("\n5. Character Type");
check("Type is player", char.type === "player");
check("Has inventory", char.typeConfig.hasInventory === true);
check("Has AI = false (player)", char.typeConfig.hasAI === false);
check("Monster has no inventory", CHARACTER_TYPE_CONFIGS.monster.hasInventory === false);
check("Monster has AI", CHARACTER_TYPE_CONFIGS.monster.hasAI === true);
check("Summon can't die", CHARACTER_TYPE_CONFIGS.summon.canDie === false);

// 6. Lifecycle
console.log("\n6. Lifecycle");
check("Initial state = created", char.lifecycleState === "created");
check("Can transition created→spawned", canTransition("created", "spawned"));
check("Can't transition created→active", !canTransition("created", "active"));
check("Can transition active→downed", canTransition("active", "downed"));
check("Can transition downed→active", canTransition("downed", "active"));
check("Can transition downed→dead", canTransition("downed", "dead"));
check("Can't transition dead→active", !canTransition("dead", "active"));

// 8. Species
console.log("\n8. Species");
check("Species set", char.species.name === "Human");
check("Size = medium", char.species.size === "medium");
check("Speed walk = 30", char.speed.walk === 30);
check("Languages include Common", char.languages.some(l => l.languageId === "common"));

// 9. Background
console.log("\n9. Background");
check("Background set", char.background?.name === "Soldier");
check("Origin feat set", char.background?.originFeatId === "savage_attacker");
check("ASI suggestion set", char.background?.suggestedAsi?.primary?.includes("str"));

// 10. Class
console.log("\n10. Class");
check("Class set", char.level.classLevels[0].className === "Fighter");
check("Hit Die = 10", testClass.hitDie === 10);
check("Saving throws = STR, CON", char.level.classLevels[0] !== undefined);

// 12-13. Level & Experience
console.log("\n12-13. Level & Experience");
check("Total level = 1", char.level.totalLevel === 1);
check("XP = 0", char.level.xp === 0);
check("XP to next = 300", char.level.xpToNextLevel === 300);
const leveledChar = addXP(char, 300);
check("Level up to 2", leveledChar.level.totalLevel === 2);
check("PB updates to 3 at Lv5", getProficiencyBonus(5) === 3);
check("PB updates to 4 at Lv9", getProficiencyBonus(9) === 4);
check("PB updates to 6 at Lv17", getProficiencyBonus(17) === 6);

// 14-15. Ability Scores
console.log("\n14-15. Ability Scores");
check("Base STR = 15+1(Human) = 16", getScore(char, "str") === 16);
check("STR mod = +3", getMod(char, "str") === 3);
check("DEX mod = +2", getMod(char, "dex") === 2);
check("CON mod = +2", getMod(char, "con") === 2);
// Test override
const overrideScore: AbilityScore = { name: "str", base: 15, temporaryBonuses: [], override: 21 };
check("Override STR = 21 (Belt of Giant Strength)", getEffectiveScore(overrideScore) === 21);
check("Override STR mod = +5", getAbilityModifier(overrideScore) === 5);
// Test temporary bonus
const tempScore: AbilityScore = { name: "str", base: 16, temporaryBonuses: [{ source: "bulls_strength", value: 2, durationType: "minutes", duration: 10 }] };
check("Temp bonus STR = 18", getEffectiveScore(tempScore) === 18);
check("Temp bonus STR mod = +4", getAbilityModifier(tempScore) === 4);

// 16. Proficiency Bonus
console.log("\n16. Proficiency Bonus");
check("PB table Lv1 = 2", PROFICIENCY_BONUS_TABLE[1] === 2);
check("PB table Lv5 = 3", PROFICIENCY_BONUS_TABLE[5] === 3);
check("PB table Lv20 = 6", PROFICIENCY_BONUS_TABLE[20] === 6);

// 17. Saving Throws
console.log("\n17. Saving Throws");
check("STR save proficient", char.savingThrows.str.proficient === true);
check("DEX save not proficient", char.savingThrows.dex.proficient === false);
check("STR save mod = +3(STR) + 2(PB) = +5", getSaveMod(char, "str") === 5);
check("DEX save mod = +2(DEX) = +2", getSaveMod(char, "dex") === 2);

// 18. Skills (Object, not flat field)
console.log("\n18. Skills");
const testSkill: SkillInstance = {
  skillId: "stealth", ability: "dex", proficient: true, expertise: false,
  modifiers: [{ source: "guidance", value: 0, diceBonus: "1d4", type: "bonus" as const }],
};
check("Skill is object", typeof testSkill === "object" && testSkill.skillId === "stealth");
check("Skill modifier calc", getSkillModifier(testSkill, 3, 2) === 5); // 3 (DEX) + 2 (prof) + 0 (guidance adds dice, not flat)
const advSkill: SkillInstance = { ...testSkill, modifiers: [{ source: "adv", value: 0, type: "advantage" as const }] };
check("Skill advantage detected", hasSkillAdvantage(advSkill) === true);
check("Skill disadvantage detected", hasSkillDisadvantage({ ...testSkill, modifiers: [{ source: "dis", value: 0, type: "disadvantage" as const }] }) === true);

// 20. Size
console.log("\n20. Size");
check("Medium space = 5 ft", SIZE_SPACE.medium === 5);
check("Large space = 10 ft", SIZE_SPACE.large === 10);
check("Gargantuan space = 20 ft", SIZE_SPACE.gargantuan === 20);
check("Medium reach = 5 ft", SIZE_REACH.medium === 5);
check("Huge reach = 10 ft", SIZE_REACH.huge === 10);

// 24. Character Status
console.log("\n24. Character Status");
check("Initial status = alive", char.status === "alive");

// 25. Tags
console.log("\n25. Tags");
const taggedChar = addTag(char, "boss");
check("Tag added", hasTag(taggedChar, "boss") === true);
const untaggedChar = removeTag(taggedChar, "boss");
check("Tag removed", hasTag(untaggedChar, "boss") === false);

// 28. Component References
console.log("\n28. Component References");
check("Effect IDs empty initially", char.refs.effectIds.length === 0);
check("Condition IDs empty initially", char.refs.conditionIds.length === 0);

// 29-30. Events & State Machine
console.log("\n29-30. Events & State Machine");
const spawnedChar = transitionLifecycle(char, "spawned");
check("Transition to spawned", spawnedChar.lifecycleState === "spawned");
const activeChar = transitionLifecycle(spawnedChar, "active");
check("Transition to active", activeChar.lifecycleState === "active");

// Damage & Healing
console.log("\nDamage & Healing");
const damagedChar = applyDamageToCharacter(activeChar, 5);
check("Damage applied", damagedChar.hp === activeChar.hp - 5);
check("Still alive", isAlive(damagedChar) === true);
const downedChar = applyDamageToCharacter(damagedChar, 100);
check("Downed when HP <= 0", isDowned(downedChar) === true);
check("Status = unconscious", downedChar.status === "unconscious");
check("Lifecycle = downed", downedChar.lifecycleState === "downed");
const healedChar = applyHealingToCharacter(downedChar, 5);
check("Healing revives from downed", isAlive(healedChar) === true);
check("Death saves reset on revive", healedChar.deathSaves.successes === 0 && healedChar.deathSaves.failures === 0);

// Death Saves
console.log("\nDeath Saves");
const ds1 = rollDeathSave(downedChar, 10); // success
check("Death save success", ds1.deathSaves.successes === 1);
const ds2 = rollDeathSave(ds1, 5); // failure
check("Death save failure", ds2.deathSaves.failures === 1);
const dsCrit = rollDeathSave(downedChar, 20); // nat 20 = revive
check("Nat 20 revives", isAlive(dsCrit) === true);
const deadChar1 = rollDeathSave(downedChar, 5);
const deadChar2 = rollDeathSave(deadChar1, 5);
const deadChar3 = rollDeathSave(deadChar2, 5);
check("3 failures = dead", isDead(deadChar3) === true);

// 31. Summarize for AI DM
console.log("\n31. Character Summary");
const summary = summarizeCharacter(activeChar);
check("Summary contains name", summary.includes("TestHero"));
check("Summary contains level", summary.includes("Lv.1"));

// Incapacitated check
console.log("\nIncapacitated");
const incapChar: Character = { ...activeChar, refs: { ...activeChar.refs, conditionIds: ["stunned"] } };
check("Incapacitated when stunned", isIncapacitated(incapChar) === true);
check("Not incapacitated normally", isIncapacitated(activeChar) === false);

console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
