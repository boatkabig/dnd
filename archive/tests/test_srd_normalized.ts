// Test by calling the API route directly with absolute URLs
const BASE = "http://localhost:3000";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
}

async function fetchJSON(url: string): Promise<any> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.json();
}

async function test() {
  console.log("=== SRD API Coverage Test (via HTTP) ===\n");

  // 1. Skeleton — has damage_immunities + vulnerabilities
  console.log("1. Monster: Skeleton (immune to poison, vulnerable to bludgeoning)");
  const skeleton = await fetchJSON(`${BASE}/api/srd?monster=skeleton`);
  check("Fetched", !!skeleton?.name);
  check("damage_immunities = ['poison']", JSON.stringify(skeleton.damage_immunities) === '["poison"]', `got: ${JSON.stringify(skeleton.damage_immunities)}`);
  check("damage_vulnerabilities = ['bludgeoning']", JSON.stringify(skeleton.damage_vulnerabilities) === '["bludgeoning"]', `got: ${JSON.stringify(skeleton.damage_vulnerabilities)}`);
  check("condition_immunities not empty", Array.isArray(skeleton.condition_immunities) && skeleton.condition_immunities.length > 0);
  check("has image", typeof skeleton.image === "string");
  check("has hit_dice", typeof skeleton.hit_dice === "string");
  check("has proficiency_bonus", typeof skeleton.proficiency_bonus === "number");
  check("has subtype (none for skeleton)", skeleton.subtype === undefined || typeof skeleton.subtype === "string");

  // 2. Goblin — skill proficiencies
  console.log("\n2. Monster: Goblin (has Stealth proficiency)");
  const goblin = await fetchJSON(`${BASE}/api/srd?monster=goblin`);
  check("Fetched", !!goblin?.name);
  const stealthProf = (goblin.proficiencies || []).find((p: any) => p.proficiency?.index === "skill-stealth");
  check("Has Stealth proficiency", !!stealthProf, `proficiencies: ${JSON.stringify((goblin.proficiencies || []).map((p:any) => p.proficiency?.index))}`);
  check("Stealth value = 6", stealthProf?.value === 6);
  check("Has image", typeof goblin.image === "string");
  check("Has hit_dice = '2d6'", goblin.hit_dice === "2d6");
  check("Has subtype = 'goblinoid'", goblin.subtype === "goblinoid");
  check("Has proficiency_bonus = 2", goblin.proficiency_bonus === 2);

  // 3. Red Dragon Wyrmling — immune to fire, has legendary actions
  console.log("\n3. Monster: Red Dragon Wyrmling (immune to fire)");
  const dragon = await fetchJSON(`${BASE}/api/srd?monster=red-dragon-wyrmling`);
  check("Fetched", !!dragon?.name);
  check("damage_immunities = ['fire']", JSON.stringify(dragon.damage_immunities) === '["fire"]');
  check("Has legendary_actions", Array.isArray(dragon.legendary_actions));

  // 4. Equipment — longsword versatile
  console.log("\n4. Equipment: Longsword (versatile 1d10)");
  const longsword = await fetchJSON(`${BASE}/api/srd?equipment=longsword`);
  check("Fetched", !!longsword?.name);
  check("Has two_handed_damage", longsword.two_handed_damage !== undefined);
  check("Two-handed = 1d10", longsword.two_handed_damage?.damage_dice === "1d10");
  check("Has properties array", Array.isArray(longsword.properties) && longsword.properties.length > 0);
  check("Versatile in properties", longsword.properties.some((p: any) => p.index === "versatile"));

  // 5. Magic Item
  console.log("\n5. Magic Item: Cloak of Elvenkind");
  const cloak = await fetchJSON(`${BASE}/api/srd?magic-item=cloak-of-elvenkind`);
  check("Fetched", !!cloak?.name);
  check("Name = 'Cloak of Elvenkind'", cloak.name === "Cloak of Elvenkind");

  // 6. Subclass
  console.log("\n6. Subclass: Champion");
  const champion = await fetchJSON(`${BASE}/api/srd?subclass=champion`);
  check("Fetched", !!champion?.name);
  check("Name = 'Champion'", champion.name === "Champion");
  check("Has desc", Array.isArray(champion.desc) || typeof champion.desc === "string");
  check("Has class reference", champion.class !== undefined);

  // 7. Class Levels (via route ?class-levels=fighter)
  console.log("\n7. Class Levels: Fighter (20 levels)");
  const fighterLevels = await fetchJSON(`${BASE}/api/srd?class-levels=fighter`);
  check("20 levels fetched", Array.isArray(fighterLevels) && fighterLevels.length === 20, `got ${fighterLevels.length}`);
  if (Array.isArray(fighterLevels) && fighterLevels.length >= 5) {
    check("Lv1 has features", Array.isArray(fighterLevels[0].features) && fighterLevels[0].features.length > 0);
    check("Lv2 has Action Surge", fighterLevels[1].features.some((f: any) => f.name?.includes("Action Surge")));
    check("Lv5 has Extra Attack", fighterLevels[4].features.some((f: any) => f.name?.includes("Extra Attack")));
  }

  // 8. Rule Section
  console.log("\n8. Rule Section: Ability Checks");
  const rule = await fetchJSON(`${BASE}/api/srd?rule-section=ability-checks`);
  check("Fetched", !!rule?.name);

  // 9. Skill detail
  console.log("\n9. Skill: Stealth");
  const stealth = await fetchJSON(`${BASE}/api/srd?skill=stealth`);
  check("Fetched", !!stealth?.name);
  check("Name = 'Stealth'", stealth.name === "Stealth");
  check("Ability = DEX", stealth.ability_score?.index === "dex");

  // 10. Spell — fireball AoE
  console.log("\n10. Spell: Fireball");
  const fireball = await fetchJSON(`${BASE}/api/srd?spell=fireball`);
  check("Fetched", !!fireball?.name);
  check("Has area_of_effect", fireball.area_of_effect !== undefined);
  check("AoE = sphere 20ft", fireball.area_of_effect?.type === "sphere" && fireball.area_of_effect?.size === 20);
  check("Has higher_level desc", Array.isArray(fireball.higher_level) && fireball.higher_level.length > 0);
  check("Has material component", typeof fireball.material === "string");
  check("Has subclasses", Array.isArray(fireball.subclasses));

  // 11. All 24 list endpoints
  console.log("\n11. All 24 list endpoints");
  const endpoints = ["ability-scores","alignments","backgrounds","classes","conditions","damage-types","equipment","equipment-categories","feats","features","languages","magic-items","magic-schools","monsters","proficiencies","races","rule-sections","rules","skills","spells","subclasses","subraces","traits","weapon-properties"];
  for (const ep of endpoints) {
    const data = await fetchJSON(`${BASE}/api/srd?list=${ep}`);
    check(`List ${ep} (count=${data.count})`, data.count > 0, `count=${data.count}`);
  }

  console.log(`\n=== SRD Coverage Test: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

test().catch(e => { console.error(e); process.exit(1); });
