import { OPEN5E_BASE, normalizeSpell } from "../src/lib/open5e";

(async () => {
  // Step 1: search by name
  const url = `${OPEN5E_BASE}/spells/?name__iexact=fireball&limit=1&document__gamesystem__key=5e-2024`;
  const res = await fetch(url);
  const data = await res.json() as any;
  console.log("Search count:", data.count);
  if (data.results.length > 0) {
    const first = data.results[0];
    console.log("First result keys:", Object.keys(first));
    // Try to normalize
    try {
      const normalized = normalizeSpell(first, "2024");
      console.log("Normalized:", normalized.name, "Lv." + normalized.level);
    } catch (e: any) {
      console.log("Normalize error:", e.message);
    }
  }
})();
