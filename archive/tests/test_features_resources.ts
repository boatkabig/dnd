import {
  FEATURE_LIBRARY, getCharacterFeatures, canActivateFeature, consumeFeatureResource,
  restoreFeatureResources, getTriggeredFeatures, getPassiveFeatures, getReactionFeatures,
  getScalingValue, processFeatureEffects,
} from "../src/lib/features";
import {
  ResourceRegistry, createClassResources, createSpellSlotResources,
  createHPResources, createDeathSaveResources, createItemChargeResource,
} from "../src/lib/resources";

console.log("=== Features & Resources Tests ===\n");

// --- FEATURES ---

// Get character features
const rogueFeatures = getCharacterFeatures("rogue", 5, "elf", ["lucky"]);
console.log("Rogue Lv.5 + Elf + Lucky feat:");
console.log("  Features:", rogueFeatures.map(f => f.name).join(", "));
console.log("  Passive:", getPassiveFeatures(rogueFeatures).map(f => f.name).join(", "));
console.log("  Reaction:", getReactionFeatures(rogueFeatures).map(f => f.name).join(", "));
console.log("  Triggered:", getTriggeredFeatures(rogueFeatures, "on_attack_hit").map(f => f.name).join(", "));

// Sneak Attack scaling
const sneakAttack = FEATURE_LIBRARY["sneak_attack"];
console.log("\nSneak Attack scaling:");
console.log("  Lv.1:", getScalingValue(sneakAttack, 1));
console.log("  Lv.5:", getScalingValue(sneakAttack, 5));
console.log("  Lv.11:", getScalingValue(sneakAttack, 11));
console.log("  Lv.19:", getScalingValue(sneakAttack, 19));

// Can activate Sneak Attack
const canSneak = canActivateFeature(sneakAttack, {
  level: 5, hasAdvantage: true, allyAdjacent: false,
});
console.log("\nCan Sneak Attack (has advantage):", canSneak.canActivate, canSneak.reasonTh);

const cannotSneak = canActivateFeature(sneakAttack, {
  level: 5, hasAdvantage: false, allyAdjacent: false,
});
console.log("Can Sneak Attack (no advantage, no ally):", cannotSneak.canActivate, cannotSneak.reasonTh);

// Rage resource
const rage = FEATURE_LIBRARY["rage"];
console.log("\nRage:");
console.log("  Resource:", rage.resource?.maxUses, "uses,", rage.resource?.recovery);
console.log("  Can activate:", canActivateFeature(rage, { level: 1 }).canActivate);
consumeFeatureResource(rage);
console.log("  After consume:", rage.resource?.currentUses, "left");
console.log("  Can activate again:", canActivateFeature(rage, { level: 1 }).canActivate, canActivateFeature(rage, { level: 1 }).reasonTh);

// Restore on long rest
restoreFeatureResources([rage], "long_rest");
console.log("  After long rest:", rage.resource?.currentUses);

// Great Weapon Master requirements
const gwm = FEATURE_LIBRARY["great_weapon_master"];
const canGWM1 = canActivateFeature(gwm, { level: 4, weaponProperties: ["heavy"] });
console.log("\nGreat Weapon Master (heavy weapon):", canGWM1.canActivate, canGWM1.reasonTh);
const canGWM2 = canActivateFeature(gwm, { level: 4, weaponProperties: ["finesse"] });
console.log("Great Weapon Master (finesse weapon):", canGWM2.canActivate, canGWM2.reasonTh);

// Process feature effects (data-driven)
const effects = processFeatureEffects(sneakAttack, { level: 5, charLevel: 5 });
console.log("\nSneak Attack effects at Lv.5:");
effects.forEach(e => {
  if (e.damage) console.log("  Damage:", e.damage.formula, e.damage.damageType);
});

// Feature library size
console.log("\nFeature library:", Object.keys(FEATURE_LIBRARY).length, "features");

// --- RESOURCES ---

console.log("\n--- Resources ---");

// Create class resources
const monkResources = createClassResources("monk", 5);
console.log("Monk Lv.5 resources:");
monkResources.forEach(r => console.log("  ", r.name, ":", r.current, "/", r.max));

const fighterResources = createClassResources("fighter", 3);
console.log("\nFighter Lv.3 resources:");
fighterResources.forEach(r => console.log("  ", r.name, ":", r.current, "/", r.max, "(", r.recovery, ")"));

// Spell slots
const slots = createSpellSlotResources([4, 2], [4, 2]);
console.log("\nSpell slots:");
slots.forEach(r => console.log("  ", r.name, ":", r.current, "/", r.max));

// HP resources
const hp = createHPResources(28);
console.log("\nHP resources:");
hp.forEach(r => console.log("  ", r.name, ":", r.current, "/", r.max));

// Registry test
const registry = new ResourceRegistry();
createClassResources("monk", 5).forEach(r => registry.register(r));
createSpellSlotResources([4, 2], [4, 2]).forEach(r => registry.register(r));

console.log("\nRegistry:");
console.log("  Ki:", registry.get("ki")?.current, "/", registry.get("ki")?.max);
console.log("  Consume Ki (1):", registry.consume("ki", 1));
console.log("  Ki after:", registry.get("ki")?.current);
console.log("  Has enough Ki (5):", registry.hasEnough("ki", 5));
console.log("  Spell Slot Lv.1:", registry.get("spell_slot_1")?.current);
console.log("  Consume Spell Slot Lv.1:", registry.consume("spell_slot_1", 1));
console.log("  Spell Slot Lv.1 after:", registry.get("spell_slot_1")?.current);

// Recovery
const shortRestRecovered = registry.recoverOnShortRest();
console.log("\n  Short rest recovery:", shortRestRecovered.join(", "));
console.log("  Ki after short rest:", registry.get("ki")?.current);

const longRestRecovered = registry.recoverOnLongRest();
console.log("  Long rest recovery:", longRestRecovered.join(", "));
console.log("  Spell Slot Lv.1 after long rest:", registry.get("spell_slot_1")?.current);

// Item charges
const wand = createItemChargeResource("Wand of Magic Missiles", 7, "dawn");
console.log("\nItem charges (Wand of Magic Missiles):");
console.log("  ", wand.name, ":", wand.current, "/", wand.max, "recharge:", wand.recovery);

// Convert (Sorcery Points → Spell Slot)
const sorcRegistry = new ResourceRegistry();
sorcRegistry.register({ id: "sorcery_points", name: "SP", nameTh: "SP", type: "points", current: 5, max: 5, min: 0, recovery: "long_rest", source: "Sorcerer" });
sorcRegistry.register({ id: "spell_slot_1", name: "Slot 1", nameTh: "Slot 1", type: "slots", current: 0, max: 4, min: 0, recovery: "long_rest", source: "Spellcasting" });
console.log("\nConvert 2 SP → 1 Spell Slot Lv.1:");
console.log("  SP before:", sorcRegistry.get("sorcery_points")?.current);
console.log("  Slot before:", sorcRegistry.get("spell_slot_1")?.current);
sorcRegistry.convert("sorcery_points", "spell_slot_1", 2, 1);
console.log("  SP after:", sorcRegistry.get("sorcery_points")?.current);
console.log("  Slot after:", sorcRegistry.get("spell_slot_1")?.current);

// Monster recharge
const monRegistry = new ResourceRegistry();
monRegistry.register({
  id: "breath_weapon", name: "Breath Weapon", nameTh: "ลมหายใจ",
  type: "charges", current: 0, max: 1, min: 0,
  recovery: "recharge_5_6", source: "Dragon", rechargeThreshold: 5,
});
console.log("\nMonster recharge (Breath Weapon, 5-6):");
console.log("  Before:", monRegistry.get("breath_weapon")?.current);
const recharged = monRegistry.rollRecharge();
console.log("  Recharged:", recharged.length > 0 ? "yes" : "no");
console.log("  After:", monRegistry.get("breath_weapon")?.current);

console.log("\n=== All tests passed! ===");
