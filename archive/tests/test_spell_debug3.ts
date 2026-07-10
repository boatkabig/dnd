import { OPEN5E_BASE } from "../src/lib/open5e";

(async () => {
  const url = `${OPEN5E_BASE}/spells/?name__iexact=fireball&limit=1&document__gamesystem__key=5e-2024`;
  const res = await fetch(url);
  const data = await res.json() as any;
  if (data.results.length > 0) {
    const first = data.results[0];
    console.log("school:", JSON.stringify(first.school));
    console.log("school?.key:", first.school?.key);
    console.log("classes:", JSON.stringify(first.classes));
    console.log("casting_time:", JSON.stringify(first.casting_time));
  }
})();
