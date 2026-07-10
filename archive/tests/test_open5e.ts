import { getSpell, getCreature, listSpells, listCreatures, getMagicItem, getClass, search } from "../src/lib/open5e";

(async () => {
  console.log("=== Test getSpell('fireball') ===");
  const spell = await getSpell("fireball", "2024");
  console.log("Result:", spell ? `${spell.name} (Lv.${spell.level} ${spell.school})` : "null");
  if (spell) {
    console.log("  damage:", spell.damage, "save:", spell.saveAbility, "aoe:", spell.aoeType, spell.aoeSize);
    console.log("  classes:", spell.classes);
  }

  console.log("\n=== Test getCreature('goblin') ===");
  const creature = await getCreature("goblin", "2024");
  console.log("Result:", creature ? `${creature.name} CR ${creature.cr} (${creature.xp} XP)` : "null");
  if (creature) {
    console.log("  AC:", creature.ac, "HP:", creature.hp, "abilities:", creature.abilities);
    console.log("  actions:", creature.actions.length, "traits:", creature.traits.length);
  }

  console.log("\n=== Test listSpells (limit 5) ===");
  const list = await listSpells({ limit: 5 });
  console.log("Count:", list.count, "first 5:", list.results.map(s => `${s.name} (Lv.${s.level})`));

  console.log("\n=== Test listCreatures (CR 1, limit 5) ===");
  const clist = await listCreatures({ cr: 1, limit: 5 });
  console.log("Count:", clist.count, "first 5:", clist.results.map(c => `${c.name} (CR ${c.cr}, ${c.xp} XP)`));

  console.log("\n=== Test getMagicItem('cloak-of-protection') ===");
  const item = await getMagicItem("cloak-of-protection", "2024");
  console.log("Result:", item ? `${item.name} (${item.rarity})` : "null");

  console.log("\n=== Test getClass('wizard') ===");
  const cls = await getClass("wizard", "2024");
  console.log("Result:", cls ? `${cls.name} hitDie d${cls.hitDie} saves ${cls.saves.join(",")}` : "null");

  console.log("\n=== Test search('fireball') ===");
  const sresults = await search("fireball", "2024");
  console.log("Count:", sresults.count, "top 3:", sresults.results.slice(0, 3).map(r => `${r.objectName} (${r.objectModel})`));
})();
