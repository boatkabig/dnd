# 03 — Magic System

> ระบบ Spell ของ D&D 5e / 2024 — spell slots, casting types, concentration, ritual casting, upcasting, components
>
> **สถานะรวม**: `engine/magic.ts` (878 บรรทัด) implement ครอบคลุมเกือบครบ แต่ UI ใช้ `gameData.ts` (simplified) + `srd.ts`/`open5e.ts` (API) แทน

## ภาพรวม Spell Pipeline

```
1. castSpell(req) → validate (slots? components? line of sight?)
2. expendSlot() → consume from SpellSlotManager
3. resolveSpell() → apply attack/save/heal/auto effect per target
4. applyConcentration() → track concentration if spell is concentration
5. trigger on_cast, on_spell_hit events (via Effects system)
```

## Spell Casting Types (5 ประเภท)

**ไฟล์**: `src/lib/engine/magic.ts:157-179` (`SpellcastingType`, `SpellcastingCapability`)

| Type | Class | Behavior |
|---|---|---|
| `prepared` | Cleric, Druid, Paladin, Wizard | เตรียม N spells/day, เปลี่ยนหลัง Long Rest |
| `known` | Bard, Ranger, Sorcerer, Warlock (non-pact) | Fixed list, learn new on level up |
| `spellbook` | Wizard | Has spellbook; prepares subset |
| `pact_magic` | Warlock | Separate slot pool, refresh on short rest |
| `innate` | Monsters, races | Fixed spells, 1/day or at-will; no slots |

```typescript
export interface SpellcastingCapability {
  type: SpellcastingType;
  ability: AbilityName;              // INT, WIS, CHA
  spellSaveDC: number;               // 8 + PB + spellcastingMod
  spellAttackBonus: number;          // PB + spellcastingMod
  ritualCasting: boolean;
  preparedSpellIds: string[];
  spellbookSpellIds?: string[];      // Wizard only
  innateUsages?: Record<string, { per: "day" | "short_rest" | "long_rest"; max: number; current: number }>;
}
```

**สถานะ**: ✅ Engine; ❌ UI (UI เก็บแค่ "known spells" list ไม่ได้แยกประเภท)

## กฎที่ Implement

### Spell Slot Progression

**ไฟล์**: `src/lib/engine/magic.ts:267-348` (`FULL_CASTER_SLOTS`, `PACT_MAGIC_SLOTS`)

#### Standard Slots (Full Casters Lv.1-20)

```typescript
export const FULL_CASTER_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // L1
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // L2
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // L3
  // ...
  [4, 3, 3, 3, 3, 2, 2, 1, 1], // L20
];
```

#### Pact Magic (Warlock) — All Slots Same Level

```typescript
export const PACT_MAGIC_SLOTS: Array<{ count: number; level: number }> = [
  { count: 1, level: 1 }, // L1
  { count: 2, level: 1 }, // L2
  // ...
  { count: 4, level: 5 }, // L17-20
];
```

#### Half-Caster Slots (Paladin/Ranger)

```typescript
export function createHalfCasterSlots(characterLevel: number): SpellSlotState {
  const effectiveLevel = Math.ceil(characterLevel / 2); // round up
  return createFullCasterSlots(effectiveLevel);
}
```

**สถานะ**: ✅ Engine + UI (UI ใช้ `gameData.SLOT_TABLE` และ `HALF_CASTER_SLOTS`)

### Slot Manipulation

**ไฟล์**: `src/lib/engine/magic.ts:358-453`

| Function | หน้าที่ |
|---|---|
| `canCastSpell(state, spellLevel)` | ตรวจว่ามี slot (รวม upcast) หรือ pact magic |
| `expendSpellSlot(state, spellLevel)` | ใช้ slot ต่ำสุดก่อน (เผื่อ upcast) |
| `restoreAllSlots(state)` | Long Rest — เติม standard slots |
| `restorePactMagicSlots(state)` | Short Rest — เติม pact slots (Warlock) |
| `restoreSlots(state, list)` | Arcane Recovery — เติมบาง slot |

```typescript
export function canCastSpell(state: SpellSlotState, spellLevel: number): boolean {
  if (spellLevel === 0) return true; // Cantrip — no slot
  // Check standard slots (spellLevel or higher)
  for (let lv = spellLevel; lv <= 9; lv++) {
    if (state.slots[lv]?.current > 0) return true;
  }
  // Check pact magic (only if spell level <= pact slot level)
  if (state.pactMagicSlots) {
    for (const lv of Object.keys(state.pactMagicSlots)) {
      if (parseInt(lv) >= spellLevel && state.pactMagicSlots[lv].current > 0) return true;
    }
  }
  return false;
}
```

**สถานะ**: ✅ Engine; ❌ UI (UI ใช้ `gameData.SLOT_TABLE` เก็บ array ไม่ได้ track current/max)

### Prepared Spells (D&D 2024 Fixed Table)

**ไฟล์**: `src/lib/engine/magic.ts:195-216` (`maxPreparedSpells2024`)

D&D 2024 เปลี่ยนจาก 2014:
- **2014**: prepared spells = `caster level + spellcasting modifier`
- **2024**: fixed table per class (decoupled from ability modifier)

```typescript
export function maxPreparedSpells2024(className: string, level: number): number {
  // D&D 2024 fixed-table progression (RPGBot transition guide)
  const baseTable: number[] = [
    4, 5, 6, 7, 9, 10, 11, 12, 14, 15,  // Lv.1-10
    17, 18, 19, 20, 22, 22, 22, 22, 22, 22, // Lv.11-20
  ];
  let max = baseTable[Math.min(19, Math.max(0, level - 1))];
  if (className === "wizard") max += 2;        // Wizards get slightly more
  if (className === "warlock") max = Math.max(2, max - 2);
  // Rangers & Paladins (half-casters) follow smaller progression
  if (className === "ranger" || className === "paladin") {
    max = Math.max(2, Math.floor(max / 2));
  }
  return max;
}
```

**สถานะ**: ✅ Engine (D&D 2024 compliant); ❌ UI

### Ritual Casting (D&D 2024 Universal)

**ไฟล์**: `src/lib/engine/magic.ts:225-243` (`canCastAsRitual`) + 549-575 (`canCastRitual`, `ritualCastingTime`)

D&D 2024:
- **ใด ๆ** prepared caster ที่มี ritual-tagged spell prepared → cast as ritual ได้
- **Wizard Ritual Adept**: cast ritual จาก spellbook โดยไม่ต้อง prepare (Wizard-specific feature)

```typescript
export function canCastAsRitual(
  capability: SpellcastingCapability,
  spellId: string,
  isRitualTagged: boolean,
  isWizardWithSpellbookRitual: boolean = false,
): { canCast: boolean; reason: string } {
  if (!isRitualTagged) return { canCast: false, reason: "Spell does not have the Ritual tag." };
  // D&D 2024: any prepared caster can ritual-cast a prepared spell
  if (capability.preparedSpellIds.includes(spellId)) {
    return { canCast: true, reason: "D&D 2024: prepared spell with Ritual tag." };
  }
  // Wizard Ritual Adept: cast from spellbook without preparing
  if (isWizardWithSpellbookRitual && capability.spellbookSpellIds?.includes(spellId)) {
    return { canCast: true, reason: "Wizard Ritual Adept: spell is in spellbook." };
  }
  return { canCast: false, reason: "Spell not prepared and not in spellbook." };
}
```

**Ritual casting time**: +10 minutes (action/bonus_action spells) หรือ +1 hour (1+ hour spells)

**สถานะ**: ✅ Engine; ❌ UI

### Concentration

**ไฟล์**: `src/lib/engine/magic.ts:459-533` + `src/lib/engine/effects.ts:611-648` + `src/lib/engineAdapters.ts:636-642`

D&D 5e:
- 1 concentration spell ต่อ caster
- รับ damage → CON save DC = `max(10, damage/2)`
- D&D 2024: DC cap ที่ **30** (2014: ไม่จำกัด)
- ล้มเหลว → spell หายทันที
- ยกเลิกได้ตลอด (no action required)

```typescript
// magic.ts
export function concentrationCheckDC(damageTaken: number): number {
  return Math.min(30, Math.max(10, Math.floor(damageTaken / 2))); // 2024 cap
}

export function checkConcentration(conc, damageTaken, conSaveRoll, conSaveMod) {
  const dc = concentrationCheckDC(damageTaken);
  const total = conSaveRoll + conSaveMod;
  const success = total >= dc;
  return { maintained: success, dc, total, updated: { ...conc, lastCheck: { ... } } };
}

// effects.ts — concentration break cleanup
export function breakConcentration(activeEffects: ActiveEffect[], targetCharacterId: string): ActiveEffect[] {
  return activeEffects.filter(ae =>
    !(ae.targetCharacterId === targetCharacterId && ae.isConcentration)
  );
}
```

UI มี simplified version ที่ `engineAdapters.ts`:
```typescript
export function concentrationDC(damage: number): number {
  return Math.max(10, Math.floor(damage / 2)); // ⚠️ ไม่มี cap 30 ตาม 2024
}
```

**สถานะ**: ✅ Engine (2024 cap 30); ⚠️ UI adapter ไม่มี cap

### Spell Cast Pipeline

**ไฟล์**: `src/lib/engine/magic.ts:632-773` (`castSpell`)

รองรับ 9 spell kinds: attack, save, heal, buff, debuff, auto, utility, summon, aoe_damage

```typescript
export function castSpell(req: SpellCastRequest, targets: ...): SpellCastResult {
  // Upcast damage calculation
  let damageExpr = spell.damage || "";
  if (spell.scalingDamage && slotLevel > spell.level) {
    const upcastLevels = slotLevel - spell.level;
    for (let i = 0; i < upcastLevels; i++) damageExpr += "+" + spell.scalingDamage;
  }

  switch (spell.kind) {
    case "attack": // spell attack vs AC
    case "save":
    case "aoe_damage": // target makes save, half/none/full on success
    case "heal":
    case "auto": // Magic Missile — auto-hit, no save
    case "buff":
    case "debuff":
    case "utility":
    case "summon":
  }
  // Returns: effects[] (per target), attackRolls[], damageRolls[], logSummary
}
```

**Save success handling**: `saveSuccess: "half" | "none" | "full"`
- `"half"` — half damage on save (e.g. Fireball)
- `"none"` — no damage on save (e.g. Disintegrate)
- `"full"` — full effect even on save (rare; usually buffs)

**สถานะ**: ✅ Engine; ❌ UI (UI มี inline spell resolution ที่ `DnDSolo.tsx:1966+`)

### Components (V/S/M)

**ไฟล์**: `src/lib/engine/magic.ts:805-827` (`checkComponents`)

D&D 5e spell components:
- **V** (Verbal) — ต้องพูด; silenced/ผูกปากไม่ได้ผล
- **S** (Somatic) — ต้องมีมือว่าง (บางกรณี)
- **M** (Material) — ต้องมีวัตถุ; Spellcasting Focus (Arcane/Holy Symbol) แทนได้ถ้าไม่มี cost

```typescript
export function checkComponents(
  spell: SpellDef,
  hasVerbalCapability: boolean,
  hasSomaticCapability: boolean,
  hasMaterial: boolean,
  hasFocus: boolean,
): ComponentCheckResult {
  const missing: string[] = [];
  if (spell.components.verbal && !hasVerbalCapability) missing.push("verbal");
  if (spell.components.somatic && !hasSomaticCapability) missing.push("somatic");
  if (spell.components.material) {
    const needsActualMaterial = !!spell.components.materialCost; // มี cost = ต้องมีของจริง
    if (needsActualMaterial && !hasMaterial) {
      missing.push("material");
      return { valid: false, missingComponents: missing, missingMaterial: spell.components.material };
    }
    if (!needsActualMaterial && !hasMaterial && !hasFocus) {
      missing.push("material_or_focus"); // Focus แทนได้
    }
  }
  return { valid: missing.length === 0, missingComponents: missing };
}
```

**สถานะ**: ✅ Engine; ❌ UI (UI ไม่ track components)

### Spell Schools (8 Schools)

**ไฟล์**: `src/lib/engine/magic.ts:54-62`

```typescript
export type SpellSchool =
  | "abjuration"   | "conjuration"  | "divination"   | "enchantment"
  | "evocation"    | "illusion"     | "necromancy"   | "transmutation";
```

รองรับ `SchoolSpecialization` (`magic.ts:833-841`) — สำหรับ Wizard Savant features (DC bonus, attack bonus, scribe time discount)

**สถานะ**: ✅ Engine; ❌ UI (UI แสดง school ใน spell list แต่ไม่ apply specialization)

### Spell Definition (Pure Data)

**ไฟล์**: `src/lib/engine/magic.ts:113-151` (`SpellDef`)

โครงสร้าง spell definition เป็น pure data — เพิ่ม spell ใหม่ไม่ต้องแก้ code:

```typescript
export interface SpellDef {
  id: string; name: string; nameTh?: string;
  level: SpellLevel;          // 0-9
  school: SpellSchool;
  castingTime: CastingTime;   // action/bonus_action/reaction/minute/hour/special
  range: SpellRange;          // self/touch/number (ft)
  duration: SpellDuration;    // instant/rounds/minutes/hours/concentration/permanent/until_dispelled
  maxDuration?: number;
  concentration: boolean;
  ritual: boolean;
  kind: SpellKind;            // attack/save/heal/buff/debuff/auto/utility/summon/aoe_damage
  components: SpellComponent;
  description: string; descriptionTh?: string;
  // Attack spells
  attackType?: "melee" | "ranged";
  damage?: string;            // "8d6"
  damageType?: DamageType;
  scalingDamage?: string;     // upcast damage e.g. "+1d6"
  // Save spells
  saveAbility?: AbilityName;
  saveSuccess?: "half" | "none" | "full";
  // AoE
  aoeType?: "sphere" | "cone" | "line" | "cube" | "cylinder";
  aoeSize?: number;
  // Buff/Debuff
  conditionsApplied?: string[];
  effectIds?: string[];
  classes: string[];
  source?: string;
  tags?: string[];
}
```

**สถานะ**: ✅ Engine; ❌ UI (UI ดึง spell definitions จาก SRD/Open5e API ไม่ได้ใช้ SpellDef)

### Spell List Lookup (SRD/Open5e)

**ไฟล์**: `src/lib/srd.ts` (1,295 บรรทัด) + `src/lib/open5e.ts` (1,687 บรรทัด)

UI ดึง spell data จาก API ที่ runtime:
- `/api/srd` → dnd5eapi.co (2014 SRD, fallback)
- `/api/open5e` → Open5e v2 (2024 SRD, primary)

```typescript
// open5e.ts — 2024 SRD primary source
export async function getCreature(id: string): Promise<NormalizedCreature | null>
export async function getSpell(id: string): Promise<NormalizedSpell | null>
export function creatureToLegacyCombatant(c: NormalizedCreature): any
```

**สถานะ**: ✅ ใช้ใน UI จริง

## กฎที่ยังไม่ Implement

- **Counterspell / Dispel Magic resolution** — ไม่มี ability check vs DC
- **Wish / Limited Wish** — ไม่มี stress effects
- **Simulacrum** — ไม่มี HP tracking แยก
- **Polymorph / True Polymorph / Wild Shape** — `EffectCategory.transformation` มี แต่ไม่มี stat block swap
- **Magic item charges (staff/wand)** — ไม่มี charge tracking
- **Spell scroll use** — ไม่มี DC = 10 + spell level check
- **Upcast heal scaling** — `castSpell` heal branch ไม่ได้ scaling
- **Sorcerer Metamagic** (Quickened, Twinned, Empowered, etc.) — ไม่มี
- **Warlock Invocations** — ไม่มี
- **Druid Wild Shape stat swap** — มี `wild_shape` resource แต่ไม่มี stat block swap

## D&D 2024 vs 2014 Differences

| กฎ | D&D 2014 | D&D 2024 | Engine ใช้ |
|---|---|---|:---:|
| Prepared spells | level + spellcasting modifier | Fixed table per class | ✅ 2024 |
| Ritual casting | Class-specific features | Universal for prepared casters | ✅ 2024 |
| Concentration DC cap | Uncapped | Capped at 30 | ✅ 2024 (engine) / ⚠️ Uncapped (adapter) |
| Critical hit + spell dice | Double Sneak Attack / Smite on crit | Spell dice NOT doubled on crit | ❌ 2014 style |
| Cantrip scaling | Level 5/11/17 (extra die) | Same | ✅ |
| Healing spells | bonus action + spell level | Same — minor wording changes | ✅ |
| Spell components | V/S/M | Same — minor: focus rules clarified | ✅ |
| Magic Missile | Auto-hit, multiple d20s debate | Auto-hit, all darts strike simultaneously | ✅ (`kind: "auto"`) |

## อ้างอิง

- [coverage-matrix.md](coverage-matrix.md) — Matrix ภาพรวม
- [02-modules/engine-submodules.md](../02-modules/engine-submodules.md#magicts) — magic.ts รายละเอียด
- [02-modules/content-api.md](../02-modules/content-api.md) — SRD/Open5e integration
- [conditions-effects.md](conditions-effects.md) — Concentration effect tracking
- [rest-exhaustion.md](rest-exhaustion.md) — Slot recovery on rest
- D&D Beyond Free Rules 2024 — "Spells", "Concentration", "Ritual Casting"
