/**
 * SRD content client — Open5e API v2 (2024 SRD 5.2) ONLY.
 *
 * Historical note: this module used to proxy dnd5eapi.co (the 2014 SRD) via the
 * /api/srd route and normalize BOTH sources into a common shape. Per the locked
 * content-layer decision (Open5e v2 / 5e-2024 is the single content source), the
 * dnd5eapi.co / 2014 fetch + normalize paths and the /api/srd proxy have been
 * removed. All content now comes from lib/open5e.ts.
 *
 * The exported shapes below are UNCHANGED, so existing importers (DnDSolo,
 * CharacterCreation, engineAdapters, combatBridge, spells) keep compiling and
 * behaving. When Open5e is unreachable, these functions degrade gracefully
 * (null / empty list) exactly as the callers already expect (the UI has a local
 * bestiary fallback for "SRD API unreachable").
 */

/* ----------------- types ----------------- */
export interface SRDListItem {
  index: string;
  name: string;
  url: string;
}

export interface SRDListResponse {
  count: number;
  results: SRDListItem[];
}

export interface NormalizedSpell {
  index: string;
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  components: string[];
  material?: string;
  desc: string;
  higher_level?: string;
  classes: string[];
  subclasses: string[];
  // Combat mechanics (derived):
  kind: "attack" | "save" | "auto" | "heal" | "buff" | "utility";
  damage?: string;          // dice formula at the chosen slot/char level
  damageType?: string;
  damageScaling?: "slot" | "character" | "none"; // slot = damage_at_slot_level, character = cantrip scaling
  saveAbility?: string;     // "dex" | "con" | "wis" | "str" | "int" | "cha"
  saveSuccess?: "half" | "none";
  heal?: string;
  aoeType?: string;         // "sphere" | "cone" | "cylinder" | "line" | "cube"
  aoeSize?: number;
  attackType?: "ranged" | "melee";
  conditionsAdd?: string[]; // conditions applied on hit/fail
  bonusAction?: boolean;
  isCantrip: boolean;
}

// Subset of castSRDSpell's buffMap: only self-beneficial buffs belong here
// (they help the caster and carry no attack roll, save, or damage of their
// own). Enemy-debuff spells (bane, slow, faerie fire) and spells that always
// carry a damage field (hex, hunter's mark, spiritual weapon) are
// deliberately excluded — if Open5e ever omits their save/attack/damage
// field, this set must not let them slip through and get misclassified as
// "buff", which would apply their effect to the caster instead of the enemy.
// Note: of the six listed, only shield, mage-armor, and shield-of-faith
// currently activate the "buff" branch in practice — bless, haste, and
// spirit-guardians carry a save/damage field in Open5e's data today and are
// intercepted by the attack/save precedence above before reaching this check.
const BUFF_SPELL_INDICES = new Set([
  "shield",
  "mage-armor",
  "spirit-guardians",
  "bless",
  "haste",
  "shield-of-faith",
]);

// Open5e's normalized spell payload exposes the save but not the applied
// condition/effect. Keep the missing combat metadata in one conversion map so
// save spells reach castSRDSpell's existing failed-save condition branch.
const DEBUFF_CONDITIONS: Record<string, string[]> = {
  "faerie-fire": ["glowing"],
  "bane": ["bane"],
  "slow": ["slow"],
};

function conditionsForSpell(index: string): string[] | undefined {
  const conditions = DEBUFF_CONDITIONS[index];
  return conditions ? [...conditions] : undefined;
}

function deriveSpellKind({
  index,
  attackRoll,
  saveAbility,
  damage,
  concentration,
}: {
  index: string;
  attackRoll?: boolean;
  saveAbility?: string;
  damage?: string;
  concentration: boolean;
}): NormalizedSpell["kind"] {
  // Preserve the existing attack/save/auto precedence. Known buff-map spells
  // become buffs only when they have no direct combat resolution to perform.
  if (attackRoll) return "attack";
  if (saveAbility) return "save";
  if (damage && !concentration) return "auto";
  if (BUFF_SPELL_INDICES.has(index) && !damage) return "buff";
  return "utility";
}
/* ----------------- caching ----------------- */
const listCache = new Map<string, SRDListResponse>();

/* ----------------- lists ----------------- */
/**
 * List spells for a class + level, backed by Open5e v2 (5e-2024).
 * Returns the same {count, results:[{index,name,url}]} shape the callers expect;
 * `url` is empty because Open5e uses slugs (`index`) rather than SRD detail URLs.
 */
export async function srdListSpells(spellClass?: string, spellLevel?: number): Promise<SRDListResponse> {
  const key = `spells|${spellClass ?? ""}|${spellLevel ?? ""}`;
  if (listCache.has(key)) return listCache.get(key)!;
  try {
    const { listSpells } = await import("./open5e");
    const res = await listSpells({
      classFilter: spellClass ? spellClass.toLowerCase() : undefined,
      level: spellLevel,
      limit: 100,
    });
    const out: SRDListResponse = {
      count: res.count,
      results: res.results.map((r) => ({ index: r.index, name: r.name, url: "" })),
    };
    listCache.set(key, out);
    return out;
  } catch {
    return { count: 0, results: [] };
  }
}

/* ----------------- detail fetchers ----------------- */

/**
 * Fetch a single spell by index/slug, normalized into the legacy NormalizedSpell
 * shape the engine consumes. Source order:
 *   1. Persistent spell cache / seed spells (offline-friendly)
 *   2. Open5e v2 (2024 SRD)
 * If neither resolves, returns null (callers already handle a null spell).
 */
export async function fetchSpell(index: string, slotLevel?: number, charLevel = 1): Promise<NormalizedSpell | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  void slotLevel; void charLevel; // kept for signature compatibility with callers
  // D1: Check persistent cache + seed spells first (offline-friendly)
  try {
    const { getSpellFromCache } = await import("./spellCache");
    const cached = getSpellFromCache(idx);
    if (cached) {
      // Return in legacy format
      return {
        index: cached.index,
        name: cached.name,
        level: cached.level,
        school: cached.school,
        castingTime: cached.castingTime,
        range: cached.range,
        components: [
          ...(cached.components.verbal ? ["V"] : []),
          ...(cached.components.somatic ? ["S"] : []),
          ...(cached.components.material ? ["M"] : []),
        ],
        material: cached.components.materialDesc,
        ritual: cached.ritual,
        duration: cached.duration,
        concentration: cached.concentration,
        desc: cached.desc,
        higherLevel: cached.higherLevel,
        classes: cached.classes,
        // Has damage but no attack roll and no save → auto-hit (Magic Missile
        // style); castSRDSpell's "auto" branch is what actually applies this
        // damage. ("aoe_damage" is not a kind castSRDSpell switches on — a
        // spell landing there silently fell through to the no-op "utility"
        // narration branch and never dealt damage.)
        // Guard with !concentration: curse/mark spells like Hex carry a
        // `damage` field too (the bonus damage they add to a LATER attack),
        // but they're concentration buffs, not instant direct-damage spells —
        // without this guard they'd wrongly auto-deal that damage on cast.
        kind: deriveSpellKind({
          index: cached.index,
          attackRoll: cached.attackRoll,
          saveAbility: (cached as any).saveAbility,
          damage: cached.damage,
          concentration: cached.concentration,
        }),
        damage: cached.damage,
        damageType: cached.damageType,
        saveAbility: (cached as any).saveAbility,
        saveSuccess: (cached as any).saveSuccess,
        conditionsAdd: conditionsForSpell(cached.index),
        aoeType: cached.aoeType,
        aoeSize: cached.aoeSize,
        bonusAction: cached.bonusAction,
        isCantrip: cached.isCantrip,
        heal: cached.damage,
        ...(cached.index.includes("healing-word") || cached.index.includes("cure-wounds") ? {
          heal: cached.index.includes("healing-word") ? "2d4" : "2d8",
          kind: "heal" as const,
        } : {}),
      } as unknown as NormalizedSpell;
    }
  } catch {
    // spellCache import failed (e.g., SSR) — continue to API
  }
  // Open5e v2 (2024 SRD support, richer schema)
  try {
    const { getSpell: open5eGetSpell } = await import("./open5e");
    const open5eSpell = await open5eGetSpell(idx, "2024");
    if (open5eSpell) {
      // D1: Cache the fetched spell for offline use
      try {
        const { setCachedSpell } = await import("./spellCache");
        setCachedSpell(idx, open5eSpell);
      } catch { /* cache failed — continue */ }
      // Convert Open5e NormalizedSpell → legacy NormalizedSpell shape
      return {
        index: open5eSpell.index,
        name: open5eSpell.name,
        level: open5eSpell.level,
        school: open5eSpell.school,
        castingTime: open5eSpell.castingTime,
        range: open5eSpell.range,
        components: [
          ...(open5eSpell.components.verbal ? ["V"] : []),
          ...(open5eSpell.components.somatic ? ["S"] : []),
          ...(open5eSpell.components.material ? ["M"] : []),
        ],
        material: open5eSpell.components.materialDesc,
        ritual: open5eSpell.ritual,
        duration: open5eSpell.duration,
        concentration: open5eSpell.concentration,
        desc: open5eSpell.desc,
        higherLevel: open5eSpell.higherLevel,
        classes: open5eSpell.classes,
        // Same derivation as the cached branch above — has damage but no
        // attack roll and no save → "auto" (auto-hit, e.g. Magic Missile),
        // which is the only damage-dealing kind castSRDSpell falls through to
        // correctly when neither an attack roll nor a save applies. Guarded by
        // !concentration so curse/mark spells (e.g. Hex) whose `damage` field
        // represents a later-attack bonus, not an instant hit, aren't
        // misclassified as dealing direct damage on cast.
        kind: deriveSpellKind({
          index: open5eSpell.index,
          attackRoll: open5eSpell.attackRoll,
          saveAbility: open5eSpell.saveAbility,
          damage: open5eSpell.damage,
          concentration: open5eSpell.concentration,
        }),
        damage: open5eSpell.damage,
        damageType: open5eSpell.damageType,
        saveAbility: open5eSpell.saveAbility,
        // D&D 2024: Save success effect varies by spell — many save spells NEGATE the effect entirely
        // (Hold Person, Charm Person, Sleep, Banishment, etc.) while damage spells usually deal half.
        // Open5e doesn't expose dc_success reliably, so we infer from spell behavior:
        // - If spell has damage → "half" (standard D&D damage-save behavior)
        // - If spell has NO damage but has conditionsAdd (Hold/Charm/etc.) → "none" (negate on success)
        // - Otherwise → "none" (no effect on save)
        saveSuccess: open5eSpell.saveAbility
          ? (open5eSpell.damage ? "half" : "none")
          : undefined,
        conditionsAdd: conditionsForSpell(open5eSpell.index),
        aoeType: open5eSpell.aoeType,
        aoeSize: open5eSpell.aoeSize,
        bonusAction: open5eSpell.bonusAction,
        isCantrip: open5eSpell.isCantrip,
        heal: open5eSpell.damage, // for heal spells, damage field holds heal formula
        // Apply D&D 2024 healing spell buff (Healing Word 2d4, Cure Wounds 2d8)
        ...(open5eSpell.index.includes("healing-word") || open5eSpell.index.includes("cure-wounds") ? {
          heal: open5eSpell.index.includes("healing-word") ? "2d4" : "2d8",
          kind: "heal" as const,
        } : {}),
      } as unknown as NormalizedSpell;
    }
  } catch {
    // Open5e unreachable — fall through to graceful null
  }
  return null;
}

/* ----------------- probe ----------------- */
/**
 * Probe the content backend — Open5e v2 (2024 SRD 5.2), the single source.
 * Returns true if Open5e is reachable, false otherwise (the UI then falls back
 * to the bundled local bestiary/spell seed data).
 */
export async function srdProbe(): Promise<boolean> {
  try {
    const r = await fetch("/api/open5e?probe=1");
    if (!r.ok) return false;
    const data = await r.json();
    return !!data?.ok;
  } catch {
    return false;
  }
}
