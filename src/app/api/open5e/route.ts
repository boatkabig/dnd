import { NextRequest, NextResponse } from "next/server";
import {
  probe,
  listSpells,
  getSpell,
  listCreatures,
  getCreature,
  listMagicItems,
  getMagicItem,
  listClasses,
  getClass,
  listSpecies,
  listBackgrounds,
  listFeats,
  listConditions,
  listWeapons,
  listArmor,
  search,
  // New enum/reference endpoints
  listAbilities,
  listSkills,
  listDamageTypes,
  listSpellSchools,
  listWeaponProperties,
  listSizes,
  listEnvironments,
  listAlignments,
  listLanguages,
  listItemRarities,
  type Edition,
} from "@/lib/open5e";

export const runtime = "nodejs";
// Phase 3: allow static caching of GET responses (was force-dynamic = no cache)
// List/detail endpoints are stable SRD data — safe to cache for 1 hour
export const revalidate = 3600; // 1 hour ISR cache

/**
 * Phase 3: In-memory cache for Open5e responses.
 * Key = full URL search params. Value = { data, expiresAt }.
 * TTL = 1 hour (matches revalidate). Cache hit = skip upstream fetch entirely.
 * This protects against Open5e SPOF — once cached, offline still works.
 */
const responseCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached(key: string): any | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: any): void {
  // Cap cache size to prevent memory bloat (LRU-ish — evict oldest)
  if (responseCache.size > 500) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Phase 3: Retry wrapper with exponential backoff for Open5e API calls */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message;
      const isRetryable =
        msg.includes("fetch failed") ||
        msg.includes("timeout") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("network") ||
        msg.includes("socket hang up") ||
        /\b5\d{2}\b/.test(msg);
      if (attempt < maxRetries && isRetryable) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

/**
 * Open5e v2 proxy — drop-in replacement for /api/srd with 2024 SRD support.
 *
 * Modes (all via query string):
 *   ?probe=1                                              → { ok: boolean, edition }
 *   ?list=spells&edition=2024&page=1&limit=50             → { count, results, next }
 *   ?list=spells&level=3&school=evocation&classFilter=wizard&searchFilter=fire
 *   ?list=creatures&cr=1&type=humanoid&searchFilter=goblin
 *   ?list=magicitems&rarity=rare&searchFilter=shield
 *   ?list=classes|species|backgrounds|feats|conditions|weapons|armor
 *   ?list=abilities|skills|damagetypes|spellschools|weaponproperties|sizes|environments|alignments|languages|itemrarities
 *     ↑ universal D&D 5e/2024 enum data (no edition filter)
 *   ?spell=fireball&edition=2024                          → single spell detail
 *   ?creature=goblin&edition=2024                         → single creature detail
 *   ?magicitem=cloak-of-protection&edition=2024           → single item detail
 *   ?class=wizard&edition=2024                            → single class detail
 *   ?search=fireball&edition=2024                         → federated search
 *
 * Edition guard: every upstream call appends document__gamesystem__key=5e-${edition}
 * so 2024-mode requests never leak 2014 content.
 */

const VALID_LISTS = new Set([
  "spells", "creatures", "magicitems", "classes", "species",
  "backgrounds", "feats", "conditions", "weapons", "armor",
  // Universal D&D 5e/2024 enum/reference data (no edition filter)
  "abilities", "skills", "damagetypes", "spellschools",
  "weaponproperties", "sizes", "environments", "alignments",
  "languages", "itemrarities",
]);

function parseEdition(req: NextRequest): Edition {
  const e = req.nextUrl.searchParams.get("edition");
  return e === "2014" ? "2014" : "2024";
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const edition = parseEdition(req);
  // Phase 3: cache key = full search params string
  const cacheKey = sp.toString();

  // Check cache first (skip for probe — always fresh)
  if (!sp.get("probe")) {
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });
    }
  }

  try {
    // ─── Probe ────────────────────────────────────────────────────────
    if (sp.get("probe")) {
      const result = await withRetry(() => probe());
      return NextResponse.json({ ...result, edition });
    }

    // ─── Federated search ─────────────────────────────────────────────
    const searchQuery = sp.get("search");
    if (searchQuery) {
      const results = await withRetry(() => search(searchQuery, edition));
      setCached(cacheKey, results);
      return NextResponse.json(results, { headers: { "X-Cache": "MISS" } });
    }

    // ─── Single-resource detail ───────────────────────────────────────
    const spellSlug = sp.get("spell");
    if (spellSlug) {
      const r = await withRetry(() => getSpell(spellSlug, edition));
      if (r) { setCached(cacheKey, r); return NextResponse.json(r, { headers: { "X-Cache": "MISS" } }); }
      return NextResponse.json({ error: `Spell '${spellSlug}' not found` }, { status: 404 });
    }
    const creatureSlug = sp.get("creature");
    if (creatureSlug) {
      const r = await withRetry(() => getCreature(creatureSlug, edition));
      if (r) { setCached(cacheKey, r); return NextResponse.json(r, { headers: { "X-Cache": "MISS" } }); }
      return NextResponse.json({ error: `Creature '${creatureSlug}' not found` }, { status: 404 });
    }
    const magicItemSlug = sp.get("magicitem");
    if (magicItemSlug) {
      const r = await withRetry(() => getMagicItem(magicItemSlug, edition));
      if (r) { setCached(cacheKey, r); return NextResponse.json(r, { headers: { "X-Cache": "MISS" } }); }
      return NextResponse.json({ error: `Magic item '${magicItemSlug}' not found` }, { status: 404 });
    }
    const classSlug = sp.get("class");
    if (classSlug) {
      const r = await withRetry(() => getClass(classSlug, edition));
      if (r) { setCached(cacheKey, r); return NextResponse.json(r, { headers: { "X-Cache": "MISS" } }); }
      return NextResponse.json({ error: `Class '${classSlug}' not found` }, { status: 404 });
    }

    // ─── List endpoints ───────────────────────────────────────────────
    const listType = sp.get("list");
    if (listType) {
      if (!VALID_LISTS.has(listType)) {
        return NextResponse.json({ error: `Invalid list type: ${listType}. Valid: ${[...VALID_LISTS].join(", ")}` }, { status: 400 });
      }
      const page = sp.get("page") ? parseInt(sp.get("page")!) : undefined;
      const limit = sp.get("limit") ? parseInt(sp.get("limit")!) : 50;
      const searchFilter = sp.get("searchFilter") ?? undefined;

      switch (listType) {
        case "spells": {
          const r = await listSpells({
            edition, page, limit,
            level: sp.get("level") ? parseInt(sp.get("level")!) : undefined,
            school: sp.get("school") ?? undefined,
            classFilter: sp.get("classFilter") ?? undefined,
            search: searchFilter,
          });
          return NextResponse.json(r);
        }
        case "creatures": {
          const r = await listCreatures({
            edition, page, limit,
            cr: sp.get("cr") ? parseFloat(sp.get("cr")!) : undefined,
            crMin: sp.get("crMin") ? parseFloat(sp.get("crMin")!) : undefined,
            crMax: sp.get("crMax") ? parseFloat(sp.get("crMax")!) : undefined,
            type: sp.get("type") ?? undefined,
            search: searchFilter,
          });
          return NextResponse.json(r);
        }
        case "magicitems": {
          const r = await listMagicItems({
            edition, page, limit,
            rarity: sp.get("rarity") ?? undefined,
            search: searchFilter,
          });
          return NextResponse.json(r);
        }
        case "classes": {
          const r = await listClasses(edition);
          return NextResponse.json({ count: r.length, results: r });
        }
        case "species": {
          const r = await listSpecies(edition);
          return NextResponse.json({ count: r.length, results: r });
        }
        case "backgrounds": {
          const r = await listBackgrounds(edition);
          return NextResponse.json({ count: r.length, results: r });
        }
        case "feats": {
          const r = await listFeats(edition);
          return NextResponse.json({ count: r.length, results: r });
        }
        case "conditions": {
          const r = await listConditions(edition);
          return NextResponse.json({ count: r.length, results: r });
        }
        case "weapons": {
          const r = await listWeapons(edition);
          return NextResponse.json({ count: r.length, results: r });
        }
        case "armor": {
          const r = await listArmor(edition);
          return NextResponse.json({ count: r.length, results: r });
        }
        // ─── Universal enum/reference endpoints (no edition filter) ────────
        case "abilities": {
          const r = await listAbilities();
          return NextResponse.json({ count: r.length, results: r });
        }
        case "skills": {
          const r = await listSkills();
          return NextResponse.json({ count: r.length, results: r });
        }
        case "damagetypes": {
          const r = await listDamageTypes();
          return NextResponse.json({ count: r.length, results: r });
        }
        case "spellschools": {
          const r = await listSpellSchools();
          return NextResponse.json({ count: r.length, results: r });
        }
        case "weaponproperties": {
          const r = await listWeaponProperties();
          return NextResponse.json({ count: r.length, results: r });
        }
        case "sizes": {
          const r = await listSizes();
          return NextResponse.json({ count: r.length, results: r });
        }
        case "environments": {
          const r = await listEnvironments();
          return NextResponse.json({ count: r.length, results: r });
        }
        case "alignments": {
          const r = await listAlignments();
          return NextResponse.json({ count: r.length, results: r });
        }
        case "languages": {
          const r = await listLanguages();
          return NextResponse.json({ count: r.length, results: r });
        }
        case "itemrarities": {
          const r = await listItemRarities();
          return NextResponse.json({ count: r.length, results: r });
        }
      }
    }

    return NextResponse.json({
      error: "Missing required parameter",
      usage: "/api/open5e?probe=1 | ?list=spells | ?spell=fireball | ?creature=goblin | ?magicitem=cloak-of-protection | ?class=wizard | ?search=fireball",
      edition,
    }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/open5e] failure:", msg);
    return NextResponse.json({ error: "Open5e proxy failed: " + msg, edition }, { status: 502 });
  }
}
