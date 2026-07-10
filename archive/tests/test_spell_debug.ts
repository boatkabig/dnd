import { getSpell, OPEN5E_BASE } from "../src/lib/open5e";

(async () => {
  // Direct fetch with iexact
  const url = `${OPEN5E_BASE}/spells/?name__iexact=fireball&limit=1&document__gamesystem__key=5e-2024`;
  console.log("URL:", url);
  const res = await fetch(url);
  console.log("Status:", res.status);
  const data = await res.json() as any;
  console.log("Count:", data.count);
  if (data.results && data.results.length > 0) {
    console.log("First key:", data.results[0].key);
    console.log("First name:", data.results[0].name);
    // Now fetch the full object via direct slug
    const fullUrl = `${OPEN5E_BASE}/spells/${data.results[0].key}/?document__gamesystem__key=5e-2024`;
    console.log("\nFull URL:", fullUrl);
    const fullRes = await fetch(fullUrl);
    console.log("Full status:", fullRes.status);
    if (fullRes.ok) {
      const full = await fullRes.json() as any;
      console.log("Got:", full.name, "Lv." + full.level);
    }
  }

  console.log("\n=== Now test getSpell('fireball') ===");
  const spell = await getSpell("fireball", "2024");
  console.log("Result:", spell ? `${spell.name} Lv.${spell.level}` : "null");
})();
