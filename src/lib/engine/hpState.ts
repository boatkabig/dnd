/**
 * ============================================================================
 * D&D Engine — Death / Damage / Heal State Machine (D&D 2024)
 * ============================================================================
 *
 * Centralizes the HP-0 rules that were previously duplicated (and drifting)
 * across every damage/heal call site. Pure functions operating on the EXISTING
 * live character shape (`cc` in DnDSolo/store) — see
 * `.claude/plans/dnd-hp0-state-machine.md` for full rules + rationale.
 *
 * Rules implemented here:
 *   - tempHp absorbs damage first, before HP reduction.
 *   - Drop to 0 HP (non-instant): HP=0, add "unconscious" condition, fresh
 *     death saves {0,0} (not Stable).
 *   - Massive damage: if the damage overflow past 0 HP >= max HP, instant death.
 *   - Damage while already at 0 HP (not dead): +1 death-save failure
 *     (+2 on a critical hit), even if the damage is fully absorbed by tempHp.
 *   - Damage while already at 0 HP whose raw amount >= max HP: instant death
 *     (checked against the damage taken, not the tempHp-reduced remainder).
 *   - Healing from 0 HP to >=1 HP: clears death saves, removes "unconscious".
 *
 * Deferred (not implemented here — see spec): 1d4-hour auto-recovery timer,
 * Medicine check / Healer's Kit stabilize action, nonlethal knockout.
 */

export interface HpCharacterState {
  hp: number;
  maxHp: number;
  tempHp: number;
  deathSaves: { s: number; f: number };
  conditions: string[];
  dead: boolean;
}

export interface DamageResult {
  hp: number;
  tempHp: number;
  deathSaves: { s: number; f: number };
  conditions: string[];
  dead: boolean;
  /** True if this instance of damage just dropped the character from >0 HP to 0. */
  justDowned: boolean;
  /** True if this damage triggered the massive-damage instant-death rule. */
  instantDeath: boolean;
}

const UNCONSCIOUS = "unconscious";

function addCondition(conditions: string[], condition: string): string[] {
  return conditions.includes(condition) ? [...conditions] : [...conditions, condition];
}

function removeCondition(conditions: string[], condition: string): string[] {
  return conditions.includes(condition) ? conditions.filter((c) => c !== condition) : [...conditions];
}

/**
 * Apply damage to a character, honoring tempHp-first absorption, drop-to-0
 * (fresh dying + Unconscious), massive-damage instant death, and death-save
 * failures from damage taken while already at 0 HP. Side-effect-free.
 */
export function applyDamage(
  character: HpCharacterState,
  amount: number,
  opts: { critical?: boolean } = {},
): DamageResult {
  if (character.dead || amount <= 0) {
    return {
      hp: character.hp,
      tempHp: character.tempHp,
      deathSaves: { ...character.deathSaves },
      conditions: [...character.conditions],
      dead: character.dead,
      justDowned: false,
      instantDeath: false,
    };
  }

  // tempHp absorbs first, at every seam.
  let tempHp = character.tempHp;
  let remaining = amount;
  if (tempHp > 0) {
    const absorbed = Math.min(tempHp, remaining);
    tempHp -= absorbed;
    remaining -= absorbed;
  }

  // Already down at 0 HP (unconscious, not dead): further damage adds death-save
  // failure(s) instead of reducing HP further — even a hit fully absorbed by
  // tempHp still counts as "taking damage" for this purpose.
  if (character.hp <= 0) {
    // Instant death: a hit whose raw damage amount >= max HP kills a character
    // already at 0 HP outright, regardless of tempHp absorption (2024 RAW:
    // damage *taken* is what's checked, not the tempHp-reduced remainder).
    if (amount >= character.maxHp && character.maxHp > 0) {
      return {
        hp: 0,
        tempHp,
        deathSaves: { ...character.deathSaves },
        conditions: [...character.conditions],
        dead: true,
        justDowned: false,
        instantDeath: true,
      };
    }

    // Any damage taken at 0 HP fails a death save, even if fully absorbed by
    // tempHp (2024 RAW: "if you take any damage" — absorption still counts as
    // taking damage per official ruling).
    const failInc = opts.critical ? 2 : 1;
    const failures = character.deathSaves.f + failInc;
    const dead = failures >= 3;
    return {
      hp: 0,
      tempHp,
      deathSaves: { s: character.deathSaves.s, f: failures },
      conditions: [...character.conditions],
      dead,
      justDowned: false,
      instantDeath: false,
    };
  }

  // Character was above 0 HP before this damage.
  const hpBefore = character.hp;
  const newHpRaw = hpBefore - remaining;

  if (newHpRaw > 0) {
    return {
      hp: newHpRaw,
      tempHp,
      deathSaves: { ...character.deathSaves },
      conditions: [...character.conditions],
      dead: false,
      justDowned: false,
      instantDeath: false,
    };
  }

  // Dropping to (or past) 0 HP.
  const overflow = -newHpRaw; // damage remaining once HP hit 0
  if (overflow >= character.maxHp && character.maxHp > 0) {
    return {
      hp: 0,
      tempHp,
      deathSaves: { ...character.deathSaves },
      conditions: [...character.conditions],
      dead: true,
      justDowned: false,
      instantDeath: true,
    };
  }

  return {
    hp: 0,
    tempHp,
    deathSaves: { s: 0, f: 0 },
    conditions: addCondition(character.conditions, UNCONSCIOUS),
    dead: false,
    justDowned: true,
    instantDeath: false,
  };
}

export interface HealResult {
  hp: number;
  deathSaves: { s: number; f: number };
  conditions: string[];
  dead: boolean;
  /** True if this heal brought the character from 0 HP back up to >=1 HP. */
  revived: boolean;
}

/**
 * Apply healing to a character. Healing from 0 HP to >=1 HP clears death
 * saves, removes the Unconscious condition, and ends Stable. A dead character
 * cannot be healed by this path (revive-from-death is out of scope). Side-effect-free.
 */
export function applyHeal(character: HpCharacterState, amount: number): HealResult {
  if (character.dead || amount <= 0) {
    return {
      hp: character.hp,
      deathSaves: { ...character.deathSaves },
      conditions: [...character.conditions],
      dead: character.dead,
      revived: false,
    };
  }

  const wasDowned = character.hp <= 0;
  const hp = Math.min(character.maxHp, character.hp + amount);

  if (wasDowned && hp > 0) {
    return {
      hp,
      deathSaves: { s: 0, f: 0 },
      conditions: removeCondition(character.conditions, UNCONSCIOUS),
      dead: false,
      revived: true,
    };
  }

  return {
    hp,
    deathSaves: { ...character.deathSaves },
    conditions: [...character.conditions],
    dead: false,
    revived: false,
  };
}

/* ============================================================================
 * Live-character adapters
 * ----------------------------------------------------------------------------
 * The live game uses a loose, ad-hoc `cc`/`nc` object (and the store's typed
 * PlayerState). These helpers read the HP-relevant slice out of such an object
 * and (for the *To variants) write the result back onto it, so every seam can
 * route through applyDamage/applyHeal without re-deriving the field mapping.
 * ========================================================================== */

interface LiveHpFields {
  hp: number;
  maxHp: number;
  tempHp?: number;
  deathSaves?: { s: number; f: number };
  conditions?: string[];
  dead?: boolean;
}

/** Read the HP-relevant slice out of a loose live character object. */
export function readHpState(c: LiveHpFields): HpCharacterState {
  return {
    hp: c.hp,
    maxHp: c.maxHp,
    tempHp: c.tempHp || 0,
    deathSaves: c.deathSaves ? { ...c.deathSaves } : { s: 0, f: 0 },
    conditions: Array.isArray(c.conditions) ? c.conditions : [],
    dead: c.dead || false,
  };
}

/** Apply damage and fold the result back onto a mutable live character object. */
export function applyDamageTo(c: LiveHpFields, amount: number, opts: { critical?: boolean } = {}): DamageResult {
  const r = applyDamage(readHpState(c), amount, opts);
  c.hp = r.hp;
  c.tempHp = r.tempHp;
  c.deathSaves = r.deathSaves;
  c.conditions = r.conditions;
  c.dead = r.dead;
  return r;
}

/** Apply healing and fold the result back onto a mutable live character object. */
export function applyHealTo(c: LiveHpFields, amount: number): HealResult {
  const r = applyHeal(readHpState(c), amount);
  c.hp = r.hp;
  c.deathSaves = r.deathSaves;
  c.conditions = r.conditions;
  return r;
}
