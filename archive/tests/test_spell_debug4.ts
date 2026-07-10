import { getSpell } from "../src/lib/open5e";

(async () => {
  console.log("Test 1: getSpell('fireball', '2024')");
  try {
    const spell = await getSpell("fireball", "2024");
    console.log("Result:", spell ? `${spell.name} Lv.${spell.level} ${spell.school}` : "null");
    if (spell) {
      console.log("  damage:", spell.damage, "save:", spell.saveAbility);
      console.log("  aoe:", spell.aoeType, spell.aoeSize);
      console.log("  classes:", spell.classes);
      console.log("  concentration:", spell.concentration, "ritual:", spell.ritual);
    }
  } catch (e: any) {
    console.log("ERROR:", e.message);
    console.log(e.stack);
  }
})();
