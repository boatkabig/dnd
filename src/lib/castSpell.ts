"use client";

/**
 * Generic SRD spell caster — extracted from DnDSolo.tsx (Phase 4 de-monolith).
 *
 * Resolves ANY Open5e spell from its data (damage / save-for-half / spell-attack /
 * auto-hit / buff / AoE / conditions), applying results to the passed character +
 * combat clones and returning { cc, cb, endsTurn }. Pure w.r.t. component state:
 * the only component-owned things it needs — the log-entry factory + id counter —
 * are injected via CombatDeps. Moved verbatim (entrySystem/nextId → deps.*).
 */
import { fetchSpell, type NormalizedSpell } from "./srd";
import { canCast2024 } from "./engine/magic";
import { computeAC, spellAtkMod, spellDC } from "./spells";
import { CLASSES, applyDamageModifiers, mod, monSave } from "./gameData";
import {
  rollFormula, rollD20, coverForTarget, spellLegalityMessageTh, attackerHasAdvVs, hasDisadv,
} from "./characterStats";
import { applyBuffToCharacter } from "./buffs";
import { hitEnemy, gridDistance } from "./combatMath";
import { d } from "./dndSoloShared";
import { attackVisibilityModifier } from "./engine/vision";
import { isConcentrationSpellName, toSpellDisplayName } from "./engine/effects";
import { emitCastSpell, emitHeal } from "./engineAdapters";
import { type CombatDeps } from "./combatResolve";

export async function castSRDSpell(spellIndex: string, slotLevel: number, cc: any, cb: any, entries: any[], deps: CombatDeps, targetId?: string | null): Promise<{ cc: any; cb: any; endsTurn: boolean }> {
  const sp: NormalizedSpell | null = await fetchSpell(spellIndex, slotLevel, cc.level);
  if (!sp) {
    entries.push(deps.entrySystem(`⚠️ โหลดเวท "${spellIndex}" จาก SRD ไม่ได้`));
    return { cc, cb, endsTurn: true };
  }
  // === Phase 3: D&D 2024 spell-legality gate (engine/magic.canCast2024) ===
  // Enforces known/prepared + valid slot (incl. upcast) BEFORE any slot is
  // spent or cast event emitted. Illegal casts are blocked with a Thai
  // message and do NOT consume the turn (endsTurn:false) or a slot.
  const legality = canCast2024({
    spellLevel: sp.level,
    slotLevel,
    slots: cc.slots || [],
    isKnownOrPrepared: (cc.knownSpells || []).includes(spellIndex),
  });
  if (!legality.ok) {
    entries.push(deps.entrySystem(spellLegalityMessageTh(sp.name, sp.level, slotLevel, legality.reason)));
    return { cc, cb, endsTurn: false };
  }
  entries.push(deps.entrySystem(`✨ กำลังร่าย ${sp.name} (Lv.${sp.level} ${sp.school})${slotLevel > sp.level ? ` อัปเคสต์เป็น slot ${slotLevel}` : ""}`));

  // Emit cast spell event (for features/items that trigger on spell cast)
  emitCastSpell("player", spellIndex, sp.level, cb.enemies.filter((e: any) => e.hpNow > 0).map((e: any) => e.uid));

  // Deduct slot (cantrips are free)
  let nc = { ...cc, conditions: [...cc.conditions] };
  let ncb = { ...cb, enemies: cb.enemies.map((e: any) => ({ ...e })) };
  if (sp.level > 0) {
    nc.slots = nc.slots.map((v: number, i: number) => (i === slotLevel - 1 ? v - 1 : v));
  }

  let endsTurn = true;
  if (sp.bonusAction) endsTurn = false;

  // Single-target resolution: hit whichever enemy the player selected via the
  // shared targetId state (the SAME target-selection convention weapon
  // attacks use — see doWeaponAttack's `payload` lookup), falling back to the
  // first living enemy if nothing is selected or the selection has died.
  const pickTarget = (pool: any[]) =>
    pool.find((e: any) => e.uid === targetId && e.hpNow > 0) || pool.find((e: any) => e.hpNow > 0);
  // AoE origin: center on the selected enemy's grid position when one is chosen
  // (reusing the same enemy-selection UI), else fall back to the player's own
  // position — the previous, always-on default.
  const aoeOrigin = (targetId && ncb.enemyPositions?.[targetId]) || ncb.playerPos;

  if (sp.kind === "heal") {
    const h = rollFormula(sp.heal || "1d8");
    const healAmount = h.total + mod(nc.abilities[CLASSES[nc.cls].castAbil]);
    const oldHp = nc.hp;
    nc.hp = Math.min(nc.maxHp, nc.hp + healAmount);
    // Emit heal event
    emitHeal("player", "player", healAmount);
    // Reset death saves on any healing (D&D 5e rule)
    if (oldHp <= 0 && nc.hp > 0) {
      nc.deathSaves = { s: 0, f: 0 };
      entries.push(deps.entrySystem(`✨ ${sp.name}: ฟื้น ${healAmount} HP → ${nc.hp}/${nc.maxHp} · Death saves reset`));
    } else {
      entries.push(deps.entrySystem(`✨ ${sp.name}: ฟื้น ${healAmount} HP → ${nc.hp}/${nc.maxHp}`));
    }
  } else if (sp.kind === "attack") {
    const alive = ncb.enemies.filter((e: any) => e.hpNow > 0);
    // AoE targeting: use actual distance from the chosen origin
    let targets: any[] = [];
    if (sp.aoeType && sp.aoeSize) {
      const aoeRadiusSquares = Math.ceil(sp.aoeSize / 5);
      targets = alive.filter((e: any) => {
        const ePos = ncb.enemyPositions?.[e.uid];
        if (!ePos || !aoeOrigin) return true; // fallback if no positions
        const dist = gridDistance(aoeOrigin, ePos);
        return dist <= aoeRadiusSquares;
      });
      if (targets.length === 0) { const t = pickTarget(alive); targets = t ? [t] : []; } // fallback: hit selected/nearest
      entries.push(deps.entrySystem(`🌐 AoE ${sp.aoeType} ${sp.aoeSize}ft กระทบ ${targets.length} เป้าหมาย`));
    } else {
      const t = pickTarget(alive);
      targets = t ? [t] : [];
    }
    for (const t of targets) {
      // 2024 unseen-attacker/target via engine/vision (spell attack rolls).
      const sAttackerSeesTarget = !(t.conditions && t.conditions.includes("invisible"));
      const sTargetSeesAttacker = !(nc.hiddenAdv || ncb.invisible);
      const sVisMod = attackVisibilityModifier(sAttackerSeesTarget, sTargetSeesAttacker);
      let adv: "none" | "advantage" | "disadvantage" = (sVisMod === "advantage" || t.glow || t.conditions?.includes("glowing") || attackerHasAdvVs(t)) ? "advantage" : "none";
      if (sVisMod === "disadvantage" || hasDisadv(nc)) adv = adv === "advantage" ? "none" : "disadvantage";
      let atkModTotal = spellAtkMod(nc);
      // Bless applies to spell attacks too
      if ((nc.buffs || []).some((b: any) => b.name === "Bless")) {
        atkModTotal += d(4);
      }
      // D&D 2024 cover (engine/vision.coverBetween) raises the target's effective AC.
      const sCover = coverForTarget(ncb, t.uid);
      const sEffectiveAC = t.ac - (t.conditions?.includes("slow") ? 2 : 0) + sCover.bonus;
      const atk = rollD20(atkModTotal, adv);
      if (t.glow) t.glow = false;
      const hit = atk.die !== 1 && (atk.die === 20 || atk.total >= sEffectiveAC);
      if (sCover.bonus > 0) entries.push(deps.entrySystem(`🛡️ ${t.th}: ${sCover.label} (+${sCover.bonus} AC = ${sEffectiveAC})`));
      let extra: string | null = null;
      if (hit) {
        const dr = rollFormula(sp.damage || "1d6");
        let dmg = dr.total;
        if (atk.die === 20) dmg += rollFormula(sp.damage || "1d6").total;
        // Hunter's Mark / Hex apply to spell attacks too
        if ((nc.buffs || []).some((b: any) => b.name === "Hunter's Mark")) dmg += rollFormula("1d6").total;
        if ((nc.buffs || []).some((b: any) => b.name === "Hex")) dmg += rollFormula("1d6").total;
        // === NEW: apply spell damage type resistance/immunity/vulnerability ===
        const sDmgType = (sp.damageType || "force").toLowerCase();
        const resistedDmg = applyDamageModifiers(dmg, sDmgType, {
          resistances: t.damageResistances,
          vulnerabilities: t.damageVulnerabilities,
          immunities: t.damageImmunities,
        });
        const resistTag =
          resistedDmg === 0 && dmg > 0 ? ` 🛡️IMMUNE`
          : resistedDmg < dmg ? ` 🛡️resist -${dmg - resistedDmg}`
          : resistedDmg > dmg ? ` 💥vuln +${resistedDmg - dmg}`
          : "";
        dmg = resistedDmg;
        hitEnemy(ncb, t, dmg);
        extra = `${sp.damageType || "force"} ${dmg}${resistTag} → ${t.th} ${t.hpNow <= 0 ? "dead!" : `${t.hpNow} HP left`}`;
        if (sp.conditionsAdd && sp.conditionsAdd.length > 0) {
          for (const cond of sp.conditionsAdd) {
            if (!t.conditions) t.conditions = [];
            if (!t.conditions.includes(cond)) t.conditions.push(cond);
            extra += ` · ${cond}`;
          }
        }
      }
      entries.push({ id: deps.nextId(), type: "roll", title: `${sp.name} → ${t.th}`, roll: atk, vsAc: t.ac, success: hit, extra });
    }
  } else if (sp.kind === "save") {
    const dc = spellDC(nc);
    const alive = ncb.enemies.filter((e: any) => e.hpNow > 0);
    // AoE targeting: use actual distance from the chosen origin
    let targets: any[] = [];
    if (sp.aoeType && sp.aoeSize) {
      const aoeRadiusSquares = Math.ceil(sp.aoeSize / 5);
      targets = alive.filter((e: any) => {
        const ePos = ncb.enemyPositions?.[e.uid];
        if (!ePos || !aoeOrigin) return true;
        const dist = gridDistance(aoeOrigin, ePos);
        return dist <= aoeRadiusSquares;
      });
      if (targets.length === 0) { const t = pickTarget(alive); targets = t ? [t] : []; }
      entries.push(deps.entrySystem(`🌐 AoE ${sp.aoeType} ${sp.aoeSize}ft กระทบ ${targets.length} เป้าหมาย (DC ${dc})`));
    } else {
      const t = pickTarget(alive);
      targets = t ? [t] : [];
    }
    // AoE damage rolled once
    const aoeRoll = sp.damage ? rollFormula(sp.damage) : null;
    for (const t of targets) {
      const saveAbil = sp.saveAbility || "dex";
      // Restrained enemies have disadvantage on DEX saves
      let saveAdv: "none" | "disadvantage" = "none";
      if (saveAbil === "dex" && t.conditions && t.conditions.includes("restrained")) saveAdv = "disadvantage";
      // D&D 2024 cover (engine/vision.coverBetween): half/three-quarter cover
      // adds its bonus to the defender's DEX saving throws (Fireball etc.).
      const saveCover = saveAbil === "dex" ? coverForTarget(ncb, t.uid) : { bonus: 0, label: "" };
      const banePenalty = t.conditions?.includes("bane") ? d(4) : 0;
      // D&D 2024 Slow: -2 penalty to DEX saving throws (the -2 to AC is applied
      // separately, see the "attack" branch above and weaponAttack.ts).
      const slowSavePenalty = saveAbil === "dex" && t.conditions?.includes("slow") ? 2 : 0;
      const sv = rollD20(monSave(t, saveAbil) + saveCover.bonus - banePenalty - slowSavePenalty, saveAdv);
      const failed = sv.total < dc;
      let dmg = failed ? (aoeRoll?.total || 0) : sp.saveSuccess === "half" ? Math.floor((aoeRoll?.total || 0) / 2) : 0;
      // === NEW: apply spell damage type resistance/immunity/vulnerability ===
      // For half-damage-on-save, the resistance stacks (i.e. half then half again = quarter).
      const sDmgType = (sp.damageType || "").toLowerCase();
      if (sDmgType && dmg > 0) {
        dmg = applyDamageModifiers(dmg, sDmgType, {
          resistances: t.damageResistances,
          vulnerabilities: t.damageVulnerabilities,
          immunities: t.damageImmunities,
        });
      }
      hitEnemy(ncb, t, dmg);
      let extra = `${dmg} ${sp.damageType || ""} → ${t.th} ${t.hpNow <= 0 ? "dead!" : `${t.hpNow} HP left`}${banePenalty ? ` · Bane -${banePenalty}` : ""}`;
      if (sp.conditionsAdd && sp.conditionsAdd.length > 0 && failed) {
        for (const cond of sp.conditionsAdd) {
          if (!t.conditions) t.conditions = [];
          if (!t.conditions.includes(cond)) t.conditions.push(cond);
          extra += ` · ${cond}`;
        }
      }
      entries.push({ id: deps.nextId(), type: "roll", title: `${sp.name} → ${t.th} (${saveAbil.toUpperCase()} save DC ${dc})`, roll: sv, dc, success: failed, extra });
    }
  } else if (sp.kind === "auto") {
    // Auto-hit spell (Magic Missile style). Data-driven via sp.darts field if present.
    const alive = ncb.enemies.filter((e: any) => e.hpNow > 0);
    // Detect magic-missile pattern: index === "magic-missile" OR sp.darts > 0 OR sp.damage === "1d4+1"
    const dartsCount = sp.index === "magic-missile"
      ? 3 + (slotLevel - 1)
      : (sp as any).darts ? (sp as any).darts : 1;
    const dartDamage = sp.index === "magic-missile" ? "1d4+1" : (sp.damage || "1d6");
    if (dartsCount > 1 || sp.index === "magic-missile") {
      const parts: string[] = [];
      // Magic Missile is force damage per SRD; for other auto-hit spells, fall back to sp.damageType.
      const sDmgType = (sp.index === "magic-missile" ? "force" : (sp.damageType || "force")).toLowerCase();
      for (let dart = 0; dart < dartsCount; dart++) {
        const tgt = pickTarget(ncb.enemies);
        if (!tgt) break;
        const dr = rollFormula(dartDamage);
        // === NEW: apply resistance/immunity/vulnerability to each dart ===
        const dartDmg = applyDamageModifiers(dr.total, sDmgType, {
          resistances: tgt.damageResistances,
          vulnerabilities: tgt.damageVulnerabilities,
          immunities: tgt.damageImmunities,
        });
        hitEnemy(ncb, tgt, dartDmg);
        parts.push(`dart ${dart + 1}: ${dartDmg}${dartDmg < dr.total ? " (resist)" : dartDmg === 0 && dr.total > 0 ? " (immune)" : dartDmg > dr.total ? " (vuln)" : ""} → ${tgt.th}${tgt.hpNow <= 0 ? " dead!" : ""}`);
      }
      entries.push(deps.entrySystem(`✨ ${sp.name}: โดนอัตโนมัติ · ${parts.join(" · ")}`));
    } else {
      // Generic auto-hit
      const dr = rollFormula(sp.damage || "1d6");
      const tgt = pickTarget(alive);
      if (tgt) {
        // === NEW: apply resistance/immunity/vulnerability ===
        const sDmgType = (sp.damageType || "force").toLowerCase();
        const dmg = applyDamageModifiers(dr.total, sDmgType, {
          resistances: tgt.damageResistances,
          vulnerabilities: tgt.damageVulnerabilities,
          immunities: tgt.damageImmunities,
        });
        hitEnemy(ncb, tgt, dmg);
        entries.push({ id: deps.nextId(), type: "roll", title: `${sp.name} → ${tgt.th}`, roll: { die: 0, other: null, mod: 0, total: 0, adv: "none" }, success: true, extra: `Auto-hit: ${dmg} ${sp.damageType || "force"} → ${tgt.th} ${tgt.hpNow <= 0 ? "dead!" : `${tgt.hpNow} HP left`}` });
      }
    }
  } else if (sp.kind === "buff") {
    // Concentration buff. Apply via buff system so it gets tracked + ticked.
    // Spell-name → buff metadata mapping (data-driven approach)
    const buffMap: Record<string, { duration: number; effectDesc: string }> = {
      "shield":           { duration: 1,  effectDesc: "+5 AC (reaction, 1 รอบ)" },
      "mage-armor":       { duration: -1, effectDesc: "AC 13 + DEX (8 ชม.)" },
      "spirit-guardians": { duration: 10, effectDesc: "ศัตรูโดน 3d8/รอบ (WIS save ลดครึ่ง)" },
      "spiritual-weapon": { duration: 10, effectDesc: "โจมตีเอง 1d8+WIS/รอบ" },
      "bless":            { duration: 10, effectDesc: "+1d4 โจมตี/save" },
      "haste":            { duration: 10, effectDesc: "+2 AC, ได้เปรียบ DEX, ความเร็ว x2, +1 action/รอบ" },
      "shield-of-faith":  { duration: 10, effectDesc: "+2 AC" },
      "bane":             { duration: 10, effectDesc: "-1d4 โจมตี/save (ศัตรู)" },
      "hunter-s-mark":    { duration: 60, effectDesc: "+1d6 ดาเมจต่อการโจมตี" },
      "hex":              { duration: 60, effectDesc: "+1d6 ดาเมจ + disadv ability" },
      "faerie-fire":      { duration: 10, effectDesc: "adv โจมตีใส่เป้า (glow)" },
      "slow":             { duration: 10, effectDesc: "ครึ่งความเร็ว, -2 AC, -2 save" },
    };
    const buffMeta = buffMap[sp.index] || { duration: 10, effectDesc: sp.desc.slice(0, 80) };
    const buffName = toSpellDisplayName(sp.name);
    // D&D 2024 single-concentration: casting a new concentration spell ends the
    // previous one. Which buffs are concentration is owned by the engine
    // (engine/effects.isConcentrationSpellName) — this is the single source of
    // truth; do not hand-maintain a second "concentration: true" list here.
    const isConcentration = isConcentrationSpellName(buffName);
    if (isConcentration) {
      const superseded = (nc.buffs || []).filter(
        (b: any) => isConcentrationSpellName(b.name) && b.name !== buffName,
      );
      if (superseded.length > 0) {
        nc = { ...nc, buffs: (nc.buffs || []).filter((b: any) => !(isConcentrationSpellName(b.name) && b.name !== buffName)) };
        if (superseded.some((b: any) => b.name === "Spirit Guardians")) ncb.spiritGuardians = false;
        entries.push(deps.entrySystem(`🌀 เลิกสมาธิจาก ${superseded.map((b: any) => b.name).join(", ")} (ร่ายสมาธิใหม่: ${buffName})`));
      }
    }
    // Apply buff via applyBuffToCharacter
    nc = applyBuffToCharacter({ name: buffName, type: "buff", duration: buffMeta.duration, source: "spell", effect_desc: buffMeta.effectDesc }, nc);
    // Special flags
    if (sp.index === "mage-armor") { nc.mageArmor = true; nc.ac = computeAC(nc); }
    if (sp.index === "spirit-guardians") ncb.spiritGuardians = true;
    if (sp.index === "spiritual-weapon") { ncb.spiritualWeapon = true; ncb.swRounds = 10; if (!ncb.bonusUsed) { ncb.bonusUsed = true; endsTurn = false; } }
    if (sp.index === "shield") { nc.ac = computeAC(nc); endsTurn = false; }
    if (sp.index === "faerie-fire") {
      // Mark all visible enemies as glowing
      ncb.enemies.forEach((e: any) => { if (e.hpNow > 0) e.glow = true; });
    }
    if (sp.index === "haste") {
      ncb.haste = true;
      // Haste gives +1 action — already tracked via buff
    }
    entries.push(deps.entrySystem(`✨ ${sp.name}: ${buffMeta.effectDesc}${isConcentration ? " (concentration)" : ""}`));
    // Apply conditionsAdd (Hold Person, etc.)
    if (sp.conditionsAdd && sp.conditionsAdd.length > 0) {
      const alive = ncb.enemies.filter((e: any) => e.hpNow > 0);
      for (const cond of sp.conditionsAdd) {
        // Single-target conditions apply to the selected enemy; AoE to all in range
        const primary = pickTarget(alive);
        const targets = sp.aoeType ? alive : (primary ? [primary] : []);
        for (const t of targets) {
          if (!t.conditions) t.conditions = [];
          if (!t.conditions.includes(cond)) {
            t.conditions.push(cond);
            entries.push(deps.entrySystem(`   → ${t.th} ติดสภาวะ ${cond}`));
          }
        }
      }
    }
  } else {
    // utility — narrate effect
    entries.push(deps.entrySystem(`✨ ${sp.name}: ${sp.desc.slice(0, 150)}${sp.desc.length > 150 ? "..." : ""}`));
  }

  // End invisibility if attacking
  if (sp.kind === "attack" || sp.kind === "save" || sp.kind === "auto") {
    if (ncb.invisible) { ncb.invisible = false; entries.push(deps.entrySystem("🫥 You become visible again (casting ends invisibility)")); }
    nc.hiddenAdv = false;
  }

  return { cc: nc, cb: ncb, endsTurn };
}

