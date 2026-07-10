# 02 — Content API Layer

> `src/lib/open5e.ts` + `src/lib/srd.ts` — SRD/Open5e API clients + normalizers + srdProbe
> รวม ~3,000 บรรทัด, ~166 exports — เป็น data ingestion layer ของระบบ

## ภาพรวม

| ไฟล์ | บรรทัด | Exports | ใช้ใน UI? | API |
|---|---:|---:|:---:|---|
| [`open5e.ts`](#open5ets) | 1,687 | 88 | ❌ (ใช้ผ่าน engineAdapters) | api.open5e.com/v2 |
| [`srd.ts`](#srdts) | 1,294 | 78 | ✅ (DnDSolo ใช้โดยตรง) | dnd5eapi.co (via /api/srd proxy) |

### Strategy การดึงข้อมูล

```
┌──────────────────────────────────────────────────────────────┐
│ DnDSolo.tsx (UI)                                              │
│  └── fetchMonsterForCombat(id) → engineAdapters.ts            │
│       ├── 1. open5eGetCreature(id, "2024") ← open5e.ts        │
│       │      ↓ (if null)                                       │
│       └── 2. srdFetchMonster(id) ← srd.ts (fallback 2014)     │
│                                                                │
│  └── fetchSpell(id) → srd.ts (DnDSolo import ตรง)              │
│       └── /api/srd → dnd5eapi.co                              │
└──────────────────────────────────────────────────────────────┘
```

### ทำไมต้องมี 2 API?

| Aspect | Open5e v2 (ใหม่) | dnd5eapi.co (legacy) |
|---|---|---|
| D&D Edition | 2024 SRD (5.2) + 2014 SRD | 2014 SRD เท่านั้น |
| Spells | 1,955 | 319 |
| Creatures | 3,541 | 322 |
| Magic Items | 2,319 | 237 |
| Search | `/v2/search/?query=...` (federated) | ไม่มี |
| Pre-computed fields | experience_points, modifiers, passive_perception | ต้อง parse เอง |
| Edition guard | `document__gamesystem__key=5e-${edition}` | ไม่มี |

**Default edition**: `2024` (engine targets D&D 2024)

---

## open5e.ts
**Path**: `src/lib/open5e.ts` | **บรรทัด**: 1,687 | **Exports**: 88 | **ใช้ใน UI?**: ❌ ใช้ผ่าน engineAdapters (`fetchMonsterForCombat`)

### หน้าที่

Wrapper รอบ `api.open5e.com/v2/` ที่คืน engine-ready normalized objects

**เหตุผลที่ใช้ Open5e v2 (vs dnd5eapi.co)**:
1. First-class D&D 2024 (5.2 SRD) support via `document__gamesystem__key=5e-2024`
2. ข้อมูลเยอะกว่ามาก (1,955 spells / 3,541 creatures / 2,319 magic items)
3. Federated search จริง: `/v2/search/?query=fireball`
4. Pre-computed fields (creature.experience_points, creature.modifiers, creature.passive_perception) — ไม่ต้อง parse เอง
5. CORS enabled — แต่เรายัง proxy ผ่าน `/api/open5e` เพื่อ caching + normalization + edition guard

**Edition guard**: ทุก upstream call MUST append `document__gamesystem__key=5e-${edition}`
เพื่อกัน 2024-mode request รั่วข้อมูล 2014 (และกลับกัน) — function `withEdition(url, edition)`

### โครงสร้างไฟล์

| Section | บรรทัด | หน้าที่ |
|---|---|---|
| 1. Config | 30-32 | `OPEN5E_BASE`, `Edition`, `DEFAULT_EDITION = "2024"` |
| 2. Raw Types | 38-305 | verbatim from Open5e v2 (Spell, Creature, Item, Class, Species, Background, Feat, Condition) |
| 3. Normalized Types | 308-539 | engine-ready interfaces |
| 4. Edition Guard | 565-573 | `withEdition(url, edition)` |
| 5. Fetch Wrapper | 579-598 | `fetchOpen5e<T>(path, edition)` with 8s timeout |
| 6. Normalizers | 604-990 | raw → normalized (8 functions) |
| 7. List/Get/Search Functions | 991-1585 | API call functions |
| 8. Legacy Combatant Converter | 1585-1687 | `creatureToLegacyCombatant()` |

### Exports หลัก

#### Config & Types

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `OPEN5E_BASE` | 30 | `https://api.open5e.com/v2` |
| `Edition` | 31 | `"2014" \| "2024"` |
| `DEFAULT_EDITION` | 32 | `"2024"` |

#### Raw Types (verbatim from Open5e v2 API)

| Export | บรรทัด | API object |
|---|---:|---|
| `Open5eSpellRaw` | 38 | Spell |
| `Open5eCreatureAttack`, `Open5eCreatureAction` | 69-97 | Creature attack/action |
| `Open5eCreatureRaw` | 110 | Creature |
| `Open5eItemRaw` | 161 | Magic Item |
| `Open5eClassFeatureRaw`, `Open5eClassRaw` | 207-242 | Class |
| `Open5eSpeciesTraitRaw`, `Open5eSpeciesRaw` | 243-265 | Species |
| `Open5eBackgroundRaw` | 272 | Background |
| `Open5eFeatRaw` | 288 | Feat |
| `Open5eConditionRaw` | 297 | Condition |

#### Normalized Types (engine-ready)

| Export | บรรทัด | ใช้โดย |
|---|---:|---|
| `NormalizedSpell` | 308 | spells.ts, DnDSolo (ผ่าน srd.ts fetchSpell) |
| `NormalizedCreatureAttack`, `NormalizedCreatureAction`, `NormalizedCreature` | 335-407 | engineAdapters.ts fetchMonsterForCombat |
| `NormalizedItem` | 416 | (ยังไม่ wire) |
| `NormalizedClass` | 462 | (ยังไม่ wire) |
| `NormalizedSpecies` | 488 | (ยังไม่ wire) |
| `NormalizedBackground` | 509 | (ยังไม่ wire) |
| `NormalizedFeat` | 525 | (ยังไม่ wire) |
| `NormalizedCondition` | 534 | (ยังไม่ wire) |
| `Open5eListResponse<T>`, `Open5eSearchResult` | 541-559 | list + search responses |

#### Normalizers (raw → normalized)

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `normalizeSpell(raw, edition)` | 634 | parse casting time, components, damage, save |
| `normalizeCreature(raw, edition)` | 724 | parse attacks, abilities, modifiers, CR → XP |
| `normalizeItem(raw, edition)` | 804 | magic items |
| `normalizeClass(raw, edition)` | 853 | class definitions |
| `normalizeSpecies(raw, edition)` | 894 | species + traits |
| `normalizeBackground(raw, edition)` | 931 | background + benefits |
| `normalizeFeat(raw, edition)` | 966 | feats |
| `normalizeCondition(raw, edition)` | 977 | conditions |

#### List/Get Functions (async)

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `probe()` | 991 | health check — return {ok, edition} |
| `listSpells(opts)`, `getSpell(slug, edition?)` | 1001-1047 | spells |
| `listCreatures(opts)`, `getCreature(slug, edition?)` | 1048-1102 | creatures |
| `listMagicItems(opts)`, `getMagicItem(slug, edition?)` | 1103-1143 | magic items |
| `listClasses(edition?)`, `getClass(slug, edition?)` | 1144-1190 | classes |
| `listSpecies(edition?)` | 1191 | species |
| `listBackgrounds(edition?)` | 1199 | backgrounds |
| `listFeats(edition?)` | 1207 | feats |
| `listConditions(edition?)` | 1215 | conditions |
| `listWeapons(edition?)`, `listArmor(edition?)` | 1223-1240 | equipment |

#### Reference Data Lists (abilities, skills, damage types, schools, sizes, alignments, languages, rarities)

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `listAbilities()`, `listSkills()`, `listDamageTypes()`, `listSpellSchools()`, `listWeaponProperties()`, `listSizes()`, `listEnvironments()`, `listAlignments()`, `listLanguages()`, `listItemRarities()` | 1406-1549 | reference data |

#### Search

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `search(query, edition?)` | 1550 | federated search across spells, creatures, items, ... |

#### Legacy Combatant Converter

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `creatureToLegacyCombatant(c)` | 1585 | แปลง NormalizedCreature → legacy combatant shape ที่ DnDSolo.tsx คาดหวัง |

`creatureToLegacyCombatant` สำคัญมาก — เป็น bridge ระหว่าง structured Open5e data
กับ legacy `{ th, ac, hp, atk, dmg, init, xp, sv, cr, traits, actions, legendaryActions, reactions, bonusActions, structuredAttacks, ... }`
ใช้ structured attacks[] แทน text parsing — แม่นยำกว่า srd.ts

### Dependencies

```typescript
import type { AbilityName } from "./engine/character";  // type only
import type { DamageType } from "./engine/equipment";   // type only
```

⚠️ เป็น type-only imports — open5e.ts ไม่ได้ execute engine/ อะไร

### สถานะการใช้งาน

- **UI (DnDSolo.tsx)**: ❌ ไม่ import ตรง — ใช้ผ่าน `engineAdapters.fetchMonsterForCombat()`
- **engineAdapters.ts**: ✅ import `getCreature`, `creatureToLegacyCombatant`, `NormalizedCreature`
- **API proxy**: `/api/open5e` (235 บรรทัด) — proxy with caching + edition guard
- **Tests**: ✅ ใช้โดย 8 test files (test_open5e_api, test_srd_full, test_srd_normalized, test_comprehensive, ฯลฯ)

### ประเด็นสำคัญ

1. **2024 SRD default** — `DEFAULT_EDITION = "2024"` — engine targets D&D 2024 rules
2. **Edition guard เข้มงวด** — `withEdition()` ต่อท้ายทุก URL เพื่อกัน leak
3. **8s timeout** — `UPSTREAM_TIMEOUT_MS = 8000` กัน hang
4. **Structured attacks** — `creatureToLegacyCombatant` ใช้ structured `attacks[]` ไม่ต้อง parse text
5. **ครอบคลุมกว่า srd.ts** — ทุกประเภทข้อมูล (class, species, background, feat, condition, item, weapon, armor)
   แต่ engineAdapters.ts ยังใช้แค่ creature fetching — ส่วนที่เหลือยังไม่ wire

---

## srd.ts
**Path**: `src/lib/srd.ts` | **บรรทัด**: 1,294 | **Exports**: 78 | **ใช้ใน UI?**: ✅ DnDSolo.tsx import ตรง

### หน้าที่

SRD client + normalizers สำหรับ `dnd5eapi.co` (2014 SRD fallback)
ทุก function ยิงผ่าน `/api/srd` (server-side proxy) ไม่ได้ยิงตรงไป dnd5eapi.co
มี in-memory caching (`cache` Map + `listCache` Map)

ครอบคลุม: spells, monsters, equipment, magic items, conditions, classes, races, subclasses, rule sections, backgrounds, feats, subraces, traits, proficiencies, damage types, magic schools, languages, ability scores, equipment categories, weapon properties, features, alignments

พิเศษ:
- `srdProbe()` — health check (try open5e first, fallback to srd)
- `convertSRDMonsterToDefinition(m)` — แปลง NormalizedMonster → MonsterDefinition (Domain 25)
- `fetchRuleAsLore(ruleIndex)` — แปลง rule section → LoreEntry (Domain 26)

### โครงสร้างไฟล์

| Section | บรรทัด | หน้าที่ |
|---|---|---|
| 1. Types (Normalized*) | 10-140 | NormalizedSpell, NormalizedMonster, NormalizedEquipment, ... |
| 2. Caching | 142-153 | `cache`, `listCache`, `fetchSRD(path)` |
| 3. List Functions | 156-227 | srdListSpells, srdListMonsters, srdListEquipment, ... |
| 4. Normalizers | 215-339 | normalizeSpell (with 2024 healing overrides) |
| 5. Get Functions | 339-600 | fetchSpell, fetchMonster, fetchEquipment, fetchCondition, ... |
| 6. Additional Types + Functions | 603-980 | NormalizedMagicItem, NormalizedSkill, NormalizedSubclassDetail, ... |
| 7. List Functions (more) | 982-1072 | srdListBackgrounds, srdListFeats, srdListSubraces, ... |
| 8. srdProbe | 1074-1094 | health check |
| 9. Domain Adapters | 1119-1255 | convertSRDMonsterToDefinition, fetchMonsterDefinition, fetchRuleAsLore |
| 10. Rules | 1229-1290 | srdListRules, srdListRuleSections, srdListAlignments, fetchAlignment |

### Exports หลัก

#### Types

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `SRDListItem`, `SRDListResponse` | 10-19 | list item shape |
| `NormalizedSpell` | 21 | spell with kind, damage, save, aoe, bonusAction, isCantrip |
| `NormalizedMonster` | 53 | monster with attacks[], specialAbilities, legendaryActions, reactions, damageImmunities, ... |
| `NormalizedEquipment` | 90 | weapon/armor |
| `NormalizedCondition` | 113 |  |
| `NormalizedClass`, `NormalizedRace` | 119-140 |  |
| `NormalizedMagicItem`, `NormalizedSkill`, `NormalizedSubclassDetail`, `NormalizedRuleSection`, `ClassLevelData`, `SubclassLevelData` | 603-651 |  |
| `NormalizedBackground`, `NormalizedFeat`, `NormalizedSubrace`, `NormalizedTrait`, `NormalizedProficiency`, `NormalizedDamageType`, `NormalizedMagicSchool`, `NormalizedLanguage`, `NormalizedAbilityScore`, `NormalizedEquipmentCategory`, `NormalizedWeaponProperty` | 762-980 |  |
| `SRDRule`, `SRDAlignment` | 1229-1279 |  |

#### List Functions

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `srdListSpells(spellClass?, spellLevel?)` | 156 | list spells |
| `srdListMonsters()`, `srdListEquipment()`, `srdListMagicItems()`, `srdListConditions()`, `srdListClasses()`, `srdListRaces()` | 167-213 |  |
| `srdListBackgrounds()`, `srdListFeats()`, `srdListSubraces()`, `srdListTraits()`, `srdListProficiencies()`, `srdListEquipmentCategories()`, `srdListDamageTypes()`, `srdListMagicSchools()`, `srdListLanguages()`, `srdListAbilityScores()`, `srdListWeaponProperties()`, `srdListFeatures()` | 982-1072 |  |
| `srdListRules()`, `srdListRuleSections()`, `srdListAlignments()` | 1256-1279 |  |

#### Get Functions (async, cached)

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `fetchSpell(index, slotLevel?, charLevel?)` | 339 | spell with derived mechanics |
| `fetchMonster(indexRaw)` | 392 | monster with parsed attacks/abilities |
| `fetchEquipment(index)`, `fetchCondition(index)`, `fetchClass(index)`, `fetchRace(index)` | 506-600 |  |
| `fetchMagicItem(index)`, `fetchSkill(index)`, `fetchSubclass(index)`, `fetchRuleSection(index)`, `fetchClassLevels(classIndex)`, `fetchSubclassLevels(subclassIndex)` | 652-761 |  |
| `fetchBackground(index)`, `fetchFeat(index)`, `fetchSubrace(index)`, `fetchTrait(index)`, `fetchProficiency(index)`, `fetchDamageType(index)`, `fetchMagicSchool(index)`, `fetchLanguage(index)`, `fetchAbilityScore(index)`, `fetchEquipmentCategory(index)`, `fetchWeaponProperty(index)` | 770-980 |  |
| `fetchAlignment(index)` | 1286 |  |

#### Normalizer

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `normalizeSpell(m, slotLevel?, charLevel)` | 215 | parse spell + D&D 2024 healing overrides (Healing Word 2d4, Cure Wounds 2d8, ...) |

`normalizeSpell` สำคัญมาก — parse SRD JSON เป็น engine-ready spell
- คำนวณ damage formula (slot-level scaling, character-level scaling)
- คำนวณ heal formula (พร้อม D&D 2024 buff overrides)
- ระบุ spell kind (attack, save, heal, buff, debuff, auto, utility)
- แยก AoE type/size, save ability, conditions added
- แยก bonus action, cantrip flag

#### Probe & Adapters

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `srdProbe()` | 1074 | health check — try open5e first, fallback to srd |
| `convertSRDMonsterToDefinition(m)` | 1119 | NormalizedMonster → MonsterDefinition (Domain 25) |
| `fetchMonsterDefinition(index)` | 1221 | fetch + convert (convenience) |
| `fetchRuleAsLore(ruleIndex)` | 1237 | rule section → LoreEntry (Domain 26) |

### Dependencies

```typescript
import type {
  MonsterDefinition, MonsterStats, MonsterAction, MonsterAbility,
  AIBehavior, CreatureType, CreatureSize, Alignment,
} from "./monsters.js";
import type { LoreEntry } from "./world.js";
```

⚠️ srd.ts เป็น "centralized SRD parsing" — เก็บ adapter functions ไว้ที่นี่
เพื่อให้ domain modules (monsters.ts, world.ts) เป็น pure & testable

### สถานะการใช้งาน

- **UI (DnDSolo.tsx)**: ✅ import ตรง — `fetchSpell`, `fetchMonster`, `srdProbe`, `srdListSpells`, `NormalizedSpell`, `NormalizedMonster`
- **engineAdapters.ts**: ✅ import `fetchMonster as srdFetchMonster` (fallback ใน `fetchMonsterForCombat`)
- **spells.ts**: ✅ import `fetchSpell`
- **Other modules**: ✅ content.ts (type only), dialogue.ts (type only)
- **API proxy**: `/api/srd` (169 บรรทัด) — dnd5eapi.co proxy with caching
- **Tests**: ✅ test_srd_full, test_srd_normalized, test_comprehensive

### ประเด็นสำคัญ

1. **In-memory caching** — `cache` Map + `listCache` Map — ทุก fetchSRD แคชผล
2. **2024 healing overrides** — Healing Word, Mass Healing Word, Cure Wounds, Mass Cure Wounds
   มี hardcoded D&D 2024 buff (2d4, 2d8 แทน 5e's 1d4, 1d8)
3. **Keyword heuristic สำหรับ conditionsAdd** — parse spell description เพื่อหา conditions ที่ applied
4. **Adapter functions สำหรับ domain modules** — `convertSRDMonsterToDefinition` (→ monsters.ts)
   และ `fetchRuleAsLore` (→ world.ts) — ทำให้ domain modules ไม่ต้องรู้จัก SRD format
5. **DnDSolo ใช้ srd.ts โดยตรง** — แต่ engineAdapters ใช้ open5e.ts ก่อน fallback มา srd.ts
   ดังนั้น edition guard ของ Open5e จะไม่ถูกบังคับเมื่อ DnDSolo เรียก fetchSpell/fetchMonster ตรง ๆ

---

## สรุป Content API Layer

### การเปรียบเทียบ

| Aspect | open5e.ts | srd.ts |
|---|---|---|
| API | api.open5e.com/v2 | dnd5eapi.co (via /api/srd) |
| Edition | 2024 (default) + 2014 | 2014 เท่านั้น |
| Data volume | 1,955 spells / 3,541 creatures | 319 spells / 322 creatures |
| Edition guard | ✅ `withEdition()` | ❌ ไม่มี |
| Pre-computed fields | ✅ | ❌ (parse เอง) |
| Search | ✅ federated | ❌ |
| Structured attacks | ✅ | ❌ (parse text) |
| ใช้ใน UI โดยตรง | ❌ | ✅ |
| ใช้ผ่าน engineAdapters | ✅ (primary) | ✅ (fallback) |
| In-memory cache | ❌ | ✅ |
| Server-side proxy | /api/open5e | /api/srd |

### การ Flow ของข้อมูล

#### Monster fetching

```
DnDSolo.tsx → fetchMonsterForCombat(id) [engineAdapters]
  ├── try: open5e.getCreature(id, "2024") → creatureToLegacyCombatant → legacy shape
  └── fallback: srd.fetchMonster(id) → NormalizedMonster → legacy shape
```

#### Spell fetching

```
DnDSolo.tsx → fetchSpell(id, slotLevel, charLevel) [srd]
  └── /api/srd?spell=id → dnd5eapi.co → raw JSON
       → normalizeSpell(m, slotLevel, charLevel) → NormalizedSpell
       (with 2024 healing overrides)
```

#### Spell list (for spellbook UI)

```
DnDSolo.tsx → srdListSpells(spellClass, spellLevel) [srd]
  └── /api/srd?list=spells&spellClass=...&spellLevel=... → SRDListResponse
```

### Gap & Technical Debt

1. **DnDSolo ใช้ srd.ts ตรง ๆ** — ไม่ได้ไปทาง Open5e ก่อน
   ทำให้ D&D 2024 data (พร้อม edition guard) ไม่ถูกใช้สำหรับ spells
   ควร migrate ไปใช้ `open5e.getSpell()` แทน

2. **Adapter functions กระจัดกระจาย** — `convertSRDMonsterToDefinition` อยู่ใน srd.ts
   แต่ `creatureToLegacyCombatant` อยู่ใน open5e.ts
   ควรรวมเป็น layer เดียวกัน

3. **No batch fetching** — ทุก fetch แยกกัน (1 request ต่อ spell/monster)
   ควรมี batch API สำหรับ fetch หลาย spells พร้อมกัน

4. **Caching inconsistent** — srd.ts มี cache, open5e.ts ไม่มี client cache (มีแค่ server-side ใน /api/open5e)

ดูเพิ่มเติม:
- [06-api/routes.md](../06-api/routes.md) — สำหรับ /api/open5e และ /api/srd
- [08-gaps/technical-debt.md](../08-gaps/technical-debt.md) — สำหรับ migration plan
