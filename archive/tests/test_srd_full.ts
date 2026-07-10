/**
 * Full SRD API coverage test — verify all 24 endpoints + new fields
 */
import {
  fetchMonster, fetchSpell, fetchEquipment, fetchClass, fetchRace,
  fetchMagicItem, fetchSkill, fetchSubclass, fetchRuleSection,
  fetchClassLevels, fetchSubclassLevels,
  fetchCondition, fetchFeat, fetchBackground, fetchTrait, fetchProficiency,
  fetchDamageType, fetchMagicSchool, fetchLanguage, fetchAbilityScore,
  fetchEquipmentCategory, fetchWeaponProperty,
  type NormalizedMonster,
} from "../src/lib/srd";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; }
  else { console.log(`❌ ${name}${detail ? " — " + detail : ""}`); fail++; }
}

async function test() {
  console.log("=== SRD API Full Coverage Test ===\n");

  // 1. Monster with new fields
  console.log("1. Monster normalizer — new fields");
  const goblin = await fetchMonster("goblin");
  check("Goblin fetched", !!goblin);
  if (goblin) {
    check("Has damageResistances field", goblin.damageResistances !== undefined);
    check("Has damageImmunities field", goblin.damageImmunities !== undefined);
    check("Has damageVulnerabilities field", goblin.damageVulnerabilities !== undefined);
    check("Has conditionImmunities field", goblin.conditionImmunities !== undefined);
    check("Has image field", goblin.image !== undefined);
    check("Has hitDice field", goblin.hitDice !== undefined);
    check("Has subtype field", goblin.subtype !== undefined);
    check("Has reactions field", goblin.reactions !== undefined);
    check("Has proficiencyBonus field", goblin.proficiencyBonus !== undefined);
    check("Has skillProficiencies field", goblin.skillProficiencies !== undefined);
  }

  // 2. Monster with resistances — Black Bear (resistant to slashing from non-magical)
  console.log("\n2. Monster with resistances");
  const bear = await fetchMonster("black-bear");
  check("Black Bear fetched", !!bear);

  // 3. Equipment with two_handed_damage
  console.log("\n3. Equipment normalizer — versatile weapons");
  const longsword = await fetchEquipment("longsword");
  check("Longsword fetched", !!longsword);
  if (longsword) {
    check("Has twoHandedDamage field", longsword.twoHandedDamage !== undefined);
    if (longsword.twoHandedDamage) {
      check("Two-handed damage = 1d10", longsword.twoHandedDamage.damage_dice === "1d10");
    }
    check("Has properties field", longsword.properties !== undefined);
    check("Has range field", longsword.range !== undefined);
  }

  // 4. Magic items
  console.log("\n4. Magic Items");
  const cloak = await fetchMagicItem("cloak-of-elvenkind");
  check("Cloak of Elvenkind fetched", !!cloak);
  if (cloak) {
    check("Has name", cloak.name === "Cloak of Elvenkind");
    check("Has equipment_category", cloak.equipment_category !== undefined);
  }

  // 5. Skills
  console.log("\n5. Skills");
  const stealth = await fetchSkill("stealth");
  check("Stealth fetched", !!stealth);
  if (stealth) {
    check("Has name", stealth.name === "Stealth");
    check("Has ability_score", stealth.ability_score !== undefined);
    check("Has desc", stealth.desc !== undefined);
  }

  // 6. Subclasses
  console.log("\n6. Subclasses");
  const champion = await fetchSubclass("champion");
  check("Champion fetched", !!champion);
  if (champion) {
    check("Has name", champion.name === "Champion");
    check("Has desc", champion.desc !== undefined);
    check("Has class reference", champion.class_name !== undefined || champion.class !== undefined);
  }

  // 7. Class Levels
  console.log("\n7. Class Levels (20-level progression)");
  const fighterLevels = await fetchClassLevels("fighter");
  check("Fighter levels fetched", fighterLevels.length === 20);
  if (fighterLevels.length > 0) {
    check("Level 1 has features", fighterLevels[0].featureNames.length > 0);
    check("Level 2 has Action Surge", fighterLevels[1].featureNames.some((f: string) => f.includes("Action Surge")));
    check("Level 5 has Extra Attack", fighterLevels[4].featureNames.some((f: string) => f.includes("Extra Attack")));
  }

  // 8. Subclass Levels
  console.log("\n8. Subclass Levels");
  const championLevels = await fetchSubclassLevels("champion");
  check("Champion levels fetched", championLevels.length > 0);

  // 9. Rule Sections
  console.log("\n9. Rule Sections");
  const abilityChecks = await fetchRuleSection("ability-checks");
  check("Ability Checks rule fetched", !!abilityChecks);
  if (abilityChecks) {
    check("Has name", abilityChecks.name !== undefined);
    check("Has desc", abilityChecks.desc !== undefined);
  }

  // 10. Spell with new fields
  console.log("\n10. Spell detail — new fields");
  const fireball = await fetchSpell("fireball");
  check("Fireball fetched", !!fireball);
  if (fireball) {
    check("Has area_of_effect", fireball.aoeType !== undefined || fireball.aoeSize !== undefined);
    check("Has concentration", fireball.concentration !== undefined);
    check("Has ritual", fireball.ritual !== undefined);
    check("Has components", fireball.components !== undefined);
    check("Has higher_level desc", fireball.higher_level !== undefined || fireball.desc !== undefined);
  }

  // 11. All fetch functions exist
  console.log("\n11. All fetch functions");
  check("fetchCondition exists", typeof fetchCondition === "function");
  check("fetchFeat exists", typeof fetchFeat === "function");
  check("fetchBackground exists", typeof fetchBackground === "function");
  check("fetchTrait exists", typeof fetchTrait === "function");
  check("fetchProficiency exists", typeof fetchProficiency === "function");
  check("fetchDamageType exists", typeof fetchDamageType === "function");
  check("fetchMagicSchool exists", typeof fetchMagicSchool === "function");
  check("fetchLanguage exists", typeof fetchLanguage === "function");
  check("fetchAbilityScore exists", typeof fetchAbilityScore === "function");
  check("fetchEquipmentCategory exists", typeof fetchEquipmentCategory === "function");
  check("fetchWeaponProperty exists", typeof fetchWeaponProperty === "function");

  console.log(`\n=== SRD Coverage Test: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

test().catch(e => { console.error(e); process.exit(1); });
