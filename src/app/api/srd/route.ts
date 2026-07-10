import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SRD_BASE = "https://www.dnd5eapi.co/api/2014";

/**
 * Full server-side proxy for the D&D 5e SRD API (dnd5eapi.co).
 *
 * The SRD API doesn't send CORS headers, so a browser fetch from a different
 * origin fails. Everything goes through here.
 *
 * Covers ALL 24 SRD endpoints (matches dnd5eapi.co/api/2014 root listing):
 *   ability-scores, alignments, backgrounds, classes, conditions, damage-types,
 *   equipment, equipment-categories, feats, features, languages, magic-items,
 *   magic-schools, monsters, proficiencies, races, rule-sections, rules, skills,
 *   spells, subclasses, subraces, traits, weapon-properties
 *
 * Modes (all via query string):
 *   ?probe=1                          -> { ok: boolean }
 *   ?list=<endpoint>                  -> { count, results: [{index,name,url}] }
 *                                        (for spells: ?spellClass=wizard&spellLevel=1)
 *   ?<type>=<index>                   -> single resource detail
 *   ?class-levels=<classIndex>        -> /classes/<classIndex>/levels (20 levels of progression)
 *   ?subclass-levels=<subclassIndex>  -> /subclasses/<subclassIndex>/levels (subclass feature progression)
 *
 * Detail type → endpoint mapping (kebab-case query key → SRD endpoint):
 *   monster, spell, equipment, magic-item, condition, class, race, feature,
 *   skill, subclass, ability-score, background, damage-type, equipment-category,
 *   feat, language, magic-school, proficiency, subrace, trait, weapon-property,
 *   rule, rule-section
 */
const VALID_LISTS = new Set([
  // All 24 endpoints from dnd5eapi.co/api/2014 root
  "ability-scores", "alignments", "backgrounds", "classes", "conditions",
  "damage-types", "equipment", "equipment-categories", "feats", "features",
  "languages", "magic-items", "magic-schools", "monsters", "proficiencies",
  "races", "rule-sections", "rules", "skills", "spells", "subclasses",
  "subraces", "traits", "weapon-properties",
]);

// Maps kebab-case query parameter → SRD endpoint (plural)
const VALID_DETAILS: Record<string, string> = {
  monster: "monsters",
  spell: "spells",
  equipment: "equipment",
  "magic-item": "magic-items",
  condition: "conditions",
  class: "classes",
  race: "races",
  feature: "features",
  skill: "skills",
  subclass: "subclasses",
  "ability-score": "ability-scores",
  background: "backgrounds",
  "damage-type": "damage-types",
  "equipment-category": "equipment-categories",
  feat: "feats",
  language: "languages",
  "magic-school": "magic-schools",
  proficiency: "proficiencies",
  subrace: "subraces",
  trait: "traits",
  "weapon-property": "weapon-properties",
  rule: "rules",
  "rule-section": "rule-sections",
};

async function fetchJSON(path: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${SRD_BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeIndex(idx: string): string {
  return String(idx).toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const probe = searchParams.get("probe");
  const list = searchParams.get("list");
  // Sub-path levels queries (?class-levels=fighter → /classes/fighter/levels)
  const classLevelsIdx = searchParams.get("class-levels");
  const subclassLevelsIdx = searchParams.get("subclass-levels");
  // For detail lookups, check each known detail key
  let detailKey: string | null = null;
  let detailVal: string | null = null;
  for (const k of Object.keys(VALID_DETAILS)) {
    const v = searchParams.get(k);
    if (v) { detailKey = k; detailVal = v; break; }
  }

  try {
    // ---- probe ----
    if (probe === "1") {
      const r = await fetchJSON(`/monsters/goblin`, 4000);
      return NextResponse.json({ ok: !!r });
    }

    // ---- class levels (?class-levels=fighter → /classes/fighter/levels) ----
    if (classLevelsIdx) {
      const idx = sanitizeIndex(classLevelsIdx);
      if (!idx) return NextResponse.json({ error: "Bad class-levels index" }, { status: 400 });
      const data = await fetchJSON(`/classes/${idx}/levels`);
      if (!data) return NextResponse.json({ error: "SRD class-levels fetch failed", index: idx }, { status: 502 });
      return NextResponse.json(data);
    }

    // ---- subclass levels (?subclass-levels=champion → /subclasses/champion/levels) ----
    if (subclassLevelsIdx) {
      const idx = sanitizeIndex(subclassLevelsIdx);
      if (!idx) return NextResponse.json({ error: "Bad subclass-levels index" }, { status: 400 });
      const data = await fetchJSON(`/subclasses/${idx}/levels`);
      if (!data) return NextResponse.json({ error: "SRD subclass-levels fetch failed", index: idx }, { status: 502 });
      return NextResponse.json(data);
    }

    // ---- list ----
    if (list) {
      if (!VALID_LISTS.has(list)) {
        return NextResponse.json({ error: `Unknown list: ${list}`, validLists: Array.from(VALID_LISTS) }, { status: 400 });
      }
      // For spells, support class & level filtering via SRD API query params
      const qs: string[] = [];
      const spellClass = searchParams.get("spellClass");
      const spellLevel = searchParams.get("spellLevel");
      if (list === "spells") {
        if (spellClass) qs.push(`classes=${encodeURIComponent(spellClass)}`);
        if (spellLevel !== null && spellLevel !== "") qs.push(`level=${encodeURIComponent(spellLevel)}`);
      }
      const q = qs.length > 0 ? `?${qs.join("&")}` : "";
      const data = await fetchJSON(`/${list}${q}`);
      if (!data) return NextResponse.json({ error: "SRD list fetch failed" }, { status: 502 });
      return NextResponse.json(data);
    }

    // ---- detail ----
    if (detailKey && detailVal) {
      const endpoint = VALID_DETAILS[detailKey];
      const idx = sanitizeIndex(detailVal);
      if (!idx) return NextResponse.json({ error: "Bad index" }, { status: 400 });
      const data = await fetchJSON(`/${endpoint}/${idx}`);
      if (!data) return NextResponse.json({ error: "SRD detail fetch failed", index: idx }, { status: 502 });
      return NextResponse.json(data);
    }

    return NextResponse.json({
      error: "Provide ?probe=1, ?list=<endpoint>, ?<type>=<index>, ?class-levels=<classIndex>, or ?subclass-levels=<subclassIndex>",
      validLists: Array.from(VALID_LISTS),
      validDetails: Object.keys(VALID_DETAILS),
      levelQueries: ["class-levels", "subclass-levels"],
    }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "SRD proxy failed: " + msg }, { status: 502 });
  }
}
