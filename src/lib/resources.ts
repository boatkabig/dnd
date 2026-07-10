/**
 * Resources System — Central resource management.
 *
 * Resources are NOT tied to Class directly — they're generic pools that
 * any system (Character, Combat, Magic, Features, Items) can use.
 *
 * 18 sub-systems (10.1–10.18)
 *
 * Architecture:
 *   Character → Resources (generic pools) → used by Magic/Features/Items/Combat
 *
 * Data Driven:
 *   { name: "Ki", max: "level", recovery: "ShortRest" }
 *   NOT: if class == "Monk": ki -= 1
 */

/* ======================================================================
 * 10.1 RESOURCE TYPE
 * ====================================================================== */

export type ResourceType = "limited_uses" | "points" | "charges" | "slots" | "dice_pool" | "counter" | "pool";
export type RecoveryType = "short_rest" | "long_rest" | "dawn" | "none" | "recharge_5_6" | "recharge_6" | "manual";

/* ======================================================================
 * 10.17 RESOURCE TRACKING
 * ====================================================================== */

export interface Resource {
  id: string;
  name: string;
  nameTh: string;
  type: ResourceType;
  current: number;
  max: number | string;     // number or formula like "level" or "proficiency_bonus"
  min: number;              // minimum (usually 0)
  recovery: RecoveryType;
  source: string;           // "Fighter", "Wizard", "Item:Wand of Fireballs"
  // 10.11 Recharge
  rechargeDice?: string;    // "1d6" for monster recharge
  rechargeThreshold?: number; // 5 for "recharge 5-6"
  // 10.15 Limits
  canOverflow?: boolean;    // can exceed max temporarily
  tempBonus?: number;       // temporary increase to max
  // 10.18 Events
  onConsume?: string;
  onRecover?: string;
}

/* ======================================================================
 * RESOURCE REGISTRY
 * ====================================================================== */

export class ResourceRegistry {
  private resources: Map<string, Resource> = new Map();

  /** Register a new resource */
  register(res: Resource): void {
    this.resources.set(res.id, res);
  }

  /** Get a resource by ID */
  get(id: string): Resource | undefined {
    return this.resources.get(id);
  }

  /** Get all resources */
  getAll(): Resource[] {
    return Array.from(this.resources.values());
  }

  /* 10.7 CONSUMPTION */
  consume(id: string, amount: number = 1): boolean {
    const res = this.resources.get(id);
    if (!res) return false;
    if (res.current < amount) return false;
    res.current -= amount;
    return true;
  }

  /** Check if enough resource available */
  hasEnough(id: string, amount: number = 1): boolean {
    const res = this.resources.get(id);
    if (!res) return false;
    return res.current >= amount;
  }

  /* 10.8 RECOVERY */
  recover(id: string, amount?: number): void {
    const res = this.resources.get(id);
    if (!res) return;
    const max = this.resolveMax(res);
    if (amount !== undefined) {
      res.current = Math.min(max + (res.tempBonus || 0), res.current + amount);
    } else {
      res.current = max + (res.tempBonus || 0);
    }
  }

  /* 10.9 SHORT REST RECOVERY */
  recoverOnShortRest(): string[] {
    const recovered: string[] = [];
    for (const [id, res] of Array.from(this.resources)) {
      if (res.recovery === "short_rest") {
        this.recover(id);
        recovered.push(res.name);
      }
    }
    return recovered;
  }

  /* 10.10 LONG REST RECOVERY */
  recoverOnLongRest(): string[] {
    const recovered: string[] = [];
    for (const [id, res] of Array.from(this.resources)) {
      if (res.recovery === "long_rest" || res.recovery === "short_rest") {
        this.recover(id);
        recovered.push(res.name);
      }
    }
    return recovered;
  }

  /* 10.11 RECHARGE (monster abilities) */
  rollRecharge(): string[] {
    const recharged: string[] = [];
    for (const [id, res] of Array.from(this.resources)) {
      if (res.recovery === "recharge_5_6" || res.recovery === "recharge_6") {
        const roll = Math.floor(Math.random() * 6) + 1;
        const threshold = res.rechargeThreshold || 6;
        if (roll >= threshold) {
          res.current = this.resolveMax(res);
          recharged.push(res.name);
        }
      }
    }
    return recharged;
  }

  /* 10.16 MODIFICATION */
  modify(id: string, delta: number): void {
    const res = this.resources.get(id);
    if (!res) return;
    res.current = Math.max(res.min, res.current + delta);
    const max = this.resolveMax(res) + (res.tempBonus || 0);
    if (!res.canOverflow && res.current > max) res.current = max;
  }

  setTempBonus(id: string, bonus: number): void {
    const res = this.resources.get(id);
    if (res) res.tempBonus = bonus;
  }

  resetTempBonus(id: string): void {
    const res = this.resources.get(id);
    if (res) res.tempBonus = 0;
  }

  /* 10.14 SCALING — resolve max formula */
  resolveMax(res: Resource): number {
    if (typeof res.max === "number") return res.max;
    // Formula resolution would need context — return 0 for unknown formulas
    return 0;
  }

  /** Update max based on character level (for level-scaling resources) */
  updateMax(id: string, newMax: number): void {
    const res = this.resources.get(id);
    if (!res) return;
    const oldMax = this.resolveMax(res);
    const diff = newMax - oldMax;
    res.max = newMax;
    // If max increased, add the difference to current
    if (diff > 0) res.current = Math.min(newMax, res.current + diff);
    else res.current = Math.min(res.current, newMax);
  }

  /** Convert one resource to another (e.g. Sorcery Points → Spell Slot) */
  convert(fromId: string, toId: string, fromAmount: number, toAmount: number): boolean {
    if (!this.consume(fromId, fromAmount)) return false;
    this.modify(toId, toAmount);
    return true;
  }

  /** Clear all resources */
  clear(): void {
    this.resources.clear();
  }
}

/* ======================================================================
 * 10.2-10.6 STANDARD RESOURCE DEFINITIONS
 * ====================================================================== */

/** Create standard class resources for a character */
export function createClassResources(cls: string, level: number): Resource[] {
  const resources: Resource[] = [];

  switch (cls) {
    case "barbarian":
      resources.push({
        id: "rage", name: "Rage", nameTh: "Rage", type: "limited_uses",
        current: level >= 6 ? 4 : level >= 3 ? 3 : 2,
        max: level >= 6 ? 4 : level >= 3 ? 3 : 2, min: 0,
        recovery: "long_rest", source: "Barbarian",
      });
      break;

    case "bard":
      resources.push({
        id: "bardic_inspiration", name: "Bardic Inspiration", nameTh: "Bardic Inspiration",
        type: "limited_uses",
        current: Math.max(1, Math.floor((10 + 0) / 2 - 5)), // CHA mod, simplified
        max: Math.max(1, 1), min: 0,
        recovery: "long_rest", source: "Bard",
      });
      break;

    case "cleric":
      resources.push({
        id: "channel_divinity", name: "Channel Divinity", nameTh: "Channel Divinity",
        type: "limited_uses", current: 1, max: 1, min: 0,
        recovery: "short_rest", source: "Cleric",
      });
      break;

    case "fighter":
      resources.push({
        id: "second_wind", name: "Second Wind", nameTh: "Second Wind",
        type: "limited_uses", current: 1, max: 1, min: 0,
        recovery: "short_rest", source: "Fighter",
      });
      if (level >= 2) {
        resources.push({
          id: "action_surge", name: "Action Surge", nameTh: "Action Surge",
          type: "limited_uses", current: 1, max: level >= 17 ? 2 : 1, min: 0,
          recovery: "short_rest", source: "Fighter",
        });
      }
      break;

    case "monk":
      resources.push({
        id: "ki", name: "Ki", nameTh: "Ki", type: "points",
        current: level, max: level, min: 0,
        recovery: "short_rest", source: "Monk",
      });
      break;

    case "paladin":
      resources.push({
        id: "lay_on_hands", name: "Lay on Hands", nameTh: "Lay on Hands",
        type: "pool", current: level * 5, max: level * 5, min: 0,
        recovery: "long_rest", source: "Paladin",
      });
      resources.push({
        id: "channel_divinity", name: "Channel Divinity", nameTh: "Channel Divinity",
        type: "limited_uses", current: 1, max: 1, min: 0,
        recovery: "short_rest", source: "Paladin",
      });
      break;

    case "sorcerer":
      resources.push({
        id: "sorcery_points", name: "Sorcery Points", nameTh: "Sorcery Points",
        type: "points", current: level, max: level, min: 0,
        recovery: "long_rest", source: "Sorcerer",
      });
      break;
  }

  return resources;
}

/** Create spell slot resources */
export function createSpellSlotResources(slots: number[], slotsMax: number[]): Resource[] {
  return slots.map((current, i) => ({
    id: `spell_slot_${i + 1}`,
    name: `Spell Slot Lv.${i + 1}`,
    nameTh: `Spell Slot ระดับ ${i + 1}`,
    type: "slots" as ResourceType,
    current,
    max: slotsMax[i],
    min: 0,
    recovery: "long_rest" as RecoveryType,
    source: "Spellcasting",
  }));
}

/** Create HP resources */
export function createHPResources(maxHp: number): Resource[] {
  return [
    {
      id: "hp", name: "Hit Points", nameTh: "HP",
      type: "pool", current: maxHp, max: maxHp, min: 0,
      recovery: "long_rest", source: "Character",
    },
    {
      id: "temp_hp", name: "Temporary HP", nameTh: "Temp HP",
      type: "pool", current: 0, max: 999, min: 0,
      recovery: "none", source: "Character",
    },
    {
      id: "hit_dice", name: "Hit Dice", nameTh: "Hit Dice",
      type: "dice_pool", current: 1, max: 1, min: 0,
      recovery: "long_rest", source: "Character",
    },
  ];
}

/** Create death save resources */
export function createDeathSaveResources(): Resource[] {
  return [
    {
      id: "death_save_success", name: "Death Save Success", nameTh: "Death Save สำเร็จ",
      type: "counter", current: 0, max: 3, min: 0,
      recovery: "none", source: "Character",
    },
    {
      id: "death_save_failure", name: "Death Save Failure", nameTh: "Death Save ล้มเหลว",
      type: "counter", current: 0, max: 3, min: 0,
      recovery: "none", source: "Character",
    },
  ];
}

/* ======================================================================
 * 10.6 ITEM CHARGES
 * ====================================================================== */

export function createItemChargeResource(
  itemName: string, maxCharges: number, rechargeType: RecoveryType = "dawn",
): Resource {
  return {
    id: `item_${itemName.toLowerCase().replace(/\s+/g, "_")}`,
    name: `${itemName} Charges`,
    nameTh: `${itemName} ครั้งใช้งาน`,
    type: "charges",
    current: maxCharges,
    max: maxCharges,
    min: 0,
    recovery: rechargeType,
    source: `Item:${itemName}`,
    rechargeThreshold: rechargeType === "recharge_5_6" ? 5 : 6,
  };
}
