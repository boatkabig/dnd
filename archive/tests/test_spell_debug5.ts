import { OPEN5E_BASE, normalizeSpell, type Open5eSpellRaw, type Open5eListResponse } from "../src/lib/open5e";

(async () => {
  // Manual version of getSpell
  console.log("Step 1: try direct slug /spells/fireball/");
  try {
    const directUrl = `${OPEN5E_BASE}/spells/fireball/?document__gamesystem__key=5e-2024`;
    const directRes = await fetch(directUrl);
    console.log("Direct status:", directRes.status);
    if (directRes.ok) {
      const direct = await directRes.json() as Open5eSpellRaw;
      console.log("Direct got:", direct.name);
    }
  } catch (e: any) {
    console.log("Direct err:", e.message);
  }

  console.log("\nStep 2: name__iexact fallback");
  try {
    const params = new URLSearchParams();
    params.set("name__iexact", "fireball");
    params.set("limit", "1");
    const url = `${OPEN5E_BASE}/spells/?${params}&document__gamesystem__key=5e-2024`;
    console.log("URL:", url);
    const res = await fetch(url);
    console.log("Status:", res.status);
    const data = await res.json() as Open5eListResponse<Open5eSpellRaw>;
    console.log("Count:", data.count, "results.length:", data.results.length);
    if (data.results.length > 0) {
      const first = data.results[0];
      console.log("First name:", first.name);
      console.log("First has casting_time:", typeof first.casting_time);
      const normalized = normalizeSpell(first, "2024");
      console.log("Normalized:", normalized.name, "Lv." + normalized.level);
    }
  } catch (e: any) {
    console.log("Fallback err:", e.message);
  }
})();
