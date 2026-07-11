"use client";

/**
 * XP + leveling engine — extracted from DnDSolo.tsx (de-monolith refactor).
 *
 * gainXP awards XP and applies every level-up that the new total crosses (Lv.1-20):
 * HP gain, hit dice, spell-slot growth (preserving used slots), per-day resource
 * resets, AC recompute, and the newly-unlocked class/subclass features + ASI /
 * Expertise / subclass-choice prompts. Pure w.r.t. component state: it clones the
 * character, returns the new one, and emits player-facing lines through the
 * pushEntry callback (was entries.push(entrySystem(...)) inline — no behavior change).
 */
import { XP_THRESHOLDS, CLASSES, mod, profByLevel } from "./gameData";
import { computeAC, getSlotTable } from "./spells";
import { getExtendedFeatures } from "./featuresExtended";
import { needsSubclassChoice, getSubclassById } from "./engine/progression";

export function gainXP(cc: any, amount: number, pushEntry: (t: string) => void) {
  let nc = { ...cc, xp: cc.xp + amount };
  pushEntry(`+${amount} XP (รวม ${nc.xp})`);
  while (nc.level < 20 && nc.xp >= XP_THRESHOLDS[nc.level]) {
    const cls = CLASSES[nc.cls];
    const hpGain = Math.floor(cls.hitDie / 2) + 1 + mod(nc.abilities.con);
    nc = {
      ...nc, level: nc.level + 1,
      maxHp: nc.maxHp + hpGain, hp: nc.hp + hpGain,
      hitDiceLeft: Math.min(nc.level + 1, (nc.hitDiceLeft || 0) + 1),
    };
    if (cls.caster) {
      const newSlotsMax = getSlotTable(nc.cls, nc.level);
      // Preserve used slots — add new slots from level up
      const oldSlotsMax = nc.slotsMax || [];
      const newSlots = newSlotsMax.map((max: number, i: number) => {
        const oldMax = oldSlotsMax[i] || 0;
        const oldCur = nc.slots[i] || 0;
        // Gain the difference (new slots from level-up are filled)
        return Math.min(max, oldCur + (max - oldMax));
      });
      nc.slotsMax = newSlotsMax;
      nc.slots = newSlots;
    }
    // Replenish per-day resources
    nc.rageUsed = 0;
    nc.kiUsed = 0;
    nc.sorceryPoints = nc.level;
    nc.layOnHandsPool = nc.level * 5;
    nc.bardicInspirationUsed = 0;
    nc.ac = computeAC(nc);
    pushEntry(`🎉 LEVEL UP! → Level ${nc.level} (Max HP +${hpGain}, Proficiency +${profByLevel(nc.level)})`);
    // Phase 2: use extended features (Lv.1-20) instead of FEATURES (Lv.1-5 only)
    const allFeatures = getExtendedFeatures()[nc.cls] || {};
    (allFeatures[nc.level] || []).forEach((f: any) => {
      pushEntry(`✨ ปลดความสามารถใหม่: ${f.th} — ${f.desc}`);
      if (f.k === "asi") nc.pendingAsi = (nc.pendingAsi || 0) + 1;
      // D&D 5e/2024: Bard gets Expertise at Lv.3, Lv.10 (gains 2 Expertise picks each time)
      // Rogue gets Expertise at Lv.1, Lv.6 (gains 2 Expertise picks each time)
      // We track pending Expertise picks via `nc.pendingExpertise`
      if (f.k === "expertise") {
        nc.pendingExpertise = (nc.pendingExpertise || 0) + 2;
        pushEntry(`🎯 Expertise unlock! เลือก 2 สกิลเพิ่ม proficiency ×2 — เปิดที่ character sheet → Skills tab`);
      }
    });
    // Phase 4: subclass — prompt at unlock level, then grant subclass features on level-up.
    if (needsSubclassChoice(nc.cls, nc.level, nc.subclass)) {
      pushEntry(`🎓 เลือก Subclass ได้แล้ว! เปิดหน้าตัวละครเพื่อเลือกสาย (subclass) ของ ${CLASSES[nc.cls].th}`);
    } else if (nc.subclass) {
      const sub = getSubclassById(nc.subclass);
      (sub?.features?.[nc.level] || []).forEach((f: any) => {
        pushEntry(`✨ ${sub!.th}: ${f.th} — ${f.desc}`);
      });
    }
  }
  return nc;
}

