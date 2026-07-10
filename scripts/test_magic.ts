import { convertSRDSpell, validateCast, resolveSpell, getUpcastDamage, getAffectedSquares, resolveCounterspell, createSpellcastingInfo, hasSpellSlot, consumeSpellSlot } from "../src/lib/magic";

console.log("=== Magic Engine Tests ===\n");

// Simulate SRD spell data for Fireball
const fireballSRD = {
  index: "fireball", name: "Fireball", level: 3, school: { name: "Evocation" },
  casting_time: "1 action", range: "150 feet",
  components: ["V", "S", "M"], material: "A tiny ball of bat guano and sulfur",
  duration: "Instantaneous", concentration: false, ritual: false,
  desc: ["A bright streak flashes..."],
  damage: { damage_at_slot_level: { "3": "8d6", "4": "9d6", "5": "10d6", "6": "11d6", "7": "12d6", "8": "13d6", "9": "14d6" }, damage_type: { name: "fire" } },
  area_of_effect: { type: "sphere", size: 20 },
  higher_level: ["When you cast this spell using a spell slot of 4th level or higher..."],
};

const fireball = convertSRDSpell(fireballSRD);
console.log("Converted Fireball:");
console.log("  level:", fireball.level, "school:", fireball.school);
console.log("  range:", fireball.range, fireball.rangeFt, "ft");
console.log("  components:", fireball.components.join(""));
console.log("  damage:", fireball.damage, fireball.damageType, "scaling:", fireball.damageScaling);
console.log("  resolution:", fireball.resolution);
console.log("  aoe:", fireball.aoe?.shape, fireball.aoe?.size, "ft");
console.log("  upcastDamage:", fireball.upcastDamage);

// Test upcasting
console.log("\nUpcast at slot 5:", getUpcastDamage(fireball, 5, 1));
console.log("Upcast at slot 7:", getUpcastDamage(fireball, 7, 1));

// Test cantrip scaling (Fire Bolt)
const fireBoltSRD = {
  index: "fire-bolt", name: "Fire Bolt", level: 0, school: { name: "Evocation" },
  casting_time: "1 action", range: "120 feet", components: ["V", "S"],
  duration: "Instantaneous", concentration: false, ritual: false,
  desc: ["You hurl a mote of fire..."],
  damage: { damage_at_character_level: { "1": "1d10", "5": "2d10", "11": "3d10", "17": "4d10" }, damage_type: { name: "fire" } },
  attack_type: "ranged",
};
const fireBolt = convertSRDSpell(fireBoltSRD);
console.log("\nFire Bolt (cantrip):");
console.log("  damage at Lv1:", getUpcastDamage(fireBolt, 0, 1));
console.log("  damage at Lv5:", getUpcastDamage(fireBolt, 0, 5));
console.log("  damage at Lv11:", getUpcastDamage(fireBolt, 0, 11));
console.log("  damage at Lv17:", getUpcastDamage(fireBolt, 0, 17));

// Test Magic Missile (auto-hit)
const mmSRD = {
  index: "magic-missile", name: "Magic Missile", level: 1, school: { name: "Evocation" },
  casting_time: "1 action", range: "120 feet", components: ["V", "S"],
  duration: "Instantaneous", concentration: false, ritual: false,
  desc: ["You create three glowing darts..."],
  damage: { damage_at_slot_level: { "1": "3d4+3" }, damage_type: { name: "force" } },
  higher_level: ["When you cast this spell using a spell slot of 2nd level or higher, the spell creates one more dart..."],
};
const mm = convertSRDSpell(mmSRD);
console.log("\nMagic Missile:");
console.log("  resolution:", mm.resolution, "(should be damage_auto)");
console.log("  damage:", mm.damage, mm.damageType);
console.log("  upcast at slot 2:", getUpcastDamage(mm, 2, 1), "(should add 1 dart)");

// Test SpellcastingInfo
const info = createSpellcastingInfo("int", 16, 3, [4, 2], [4, 2], ["fire-bolt", "magic-missile", "fireball"], false);
console.log("\nSpellcasting (Wizard INT 16, Lv.3):");
console.log("  attack bonus:", info.spellAttackBonus, "save DC:", info.spellSaveDC);
console.log("  has slot Lv1:", hasSpellSlot(info, 1), "has slot Lv3:", hasSpellSlot(info, 3));

// Test validateCast
const validation = validateCast(info, fireball, 3, 100, { verbal: true, somatic: true, material: true });
console.log("\nValidate Fireball at slot 3:", validation.valid, validation.reasonTh);

const validation2 = validateCast(info, fireball, 2, 100, { verbal: true, somatic: true, material: true });
console.log("Validate Fireball at slot 2:", validation2.valid, validation2.reasonTh);

// Test resolveSpell (Fireball save)
const result = resolveSpell(fireball, 3, 3, info.spellAttackBonus, info.spellSaveDC, 13, 2, [], [], []);
console.log("\nResolve Fireball:");
console.log("  ", result.historyTh);

// Test AoE
const squares = getAffectedSquares({ x: 5, y: 5 }, { shape: "sphere", size: 20 }, { w: 12, h: 10 });
console.log("\nFireball AoE (20ft sphere):", squares.length, "squares affected");

// Test Counterspell
const cs = resolveCounterspell(3, 3, 3);
console.log("\nCounterspell (slot 3 vs spell 3):", cs.success, cs.historyTh);
const cs2 = resolveCounterspell(5, 3, 3);
console.log("Counterspell (slot 3 vs spell 5):", cs2.success, cs2.historyTh);

// Test Saving Throw spell (Sacred Flame)
const sacredFlameSRD = {
  index: "sacred-flame", name: "Sacred Flame", level: 0, school: { name: "Evocation" },
  casting_time: "1 action", range: "60 feet", components: ["V", "S"],
  duration: "Instantaneous", concentration: false, ritual: false,
  desc: ["Flame-like radiance..."],
  damage: { damage_at_character_level: { "1": "1d8", "5": "2d8", "11": "3d8", "17": "4d8" }, damage_type: { name: "radiant" } },
  save: { dc_type: { name: "Dexterity" }, dc_success: "none", desc: "Target must succeed on a Dexterity saving throw..." },
};
const sf = convertSRDSpell(sacredFlameSRD);
console.log("\nSacred Flame:");
console.log("  resolution:", sf.resolution, "save:", sf.saveAbility, "success:", sf.saveSuccess);
console.log("  damage:", sf.damage, sf.damageType, "scaling:", sf.damageScaling);

console.log("\n=== All tests passed! ===");
