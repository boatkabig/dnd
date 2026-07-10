import { OPEN5E_BASE } from "../src/lib/open5e";

(async () => {
  const url = `${OPEN5E_BASE}/spells/?name__iexact=fireball&limit=1&document__gamesystem__key=5e-2024`;
  const res = await fetch(url);
  const data = await res.json() as any;
  const first = data.results[0];
  console.log("damage_types:", JSON.stringify(first.damage_types));
  console.log("saving_throw_ability:", JSON.stringify(first.saving_throw_ability));
  console.log("school:", JSON.stringify(first.school));
})();
