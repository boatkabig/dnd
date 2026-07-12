"use client";

/**
 * Player weapon-attack resolver — extracted from DnDSolo.tsx (Phase 3 de-monolith).
 *
 * The single biggest chunk of the old playerCombatAction: resolves one weapon
 * attack end-to-end (range, to-hit through the engine bridge, crit, Sneak Attack,
 * Divine Smite, Weapon Mastery, GWM/Sharpshooter power-attack, Poison/Venom,
 * cover, resistance, on-hit feature triggers, kill). Operates on the passed
 * character/combat clones and returns the updated { cc, cb }. Component-owned
 * inputs — the selected target, the power-attack toggle, the ref-reading feature
 * check, and logging — arrive via ctx. Moved verbatim.
 */
import {
  rollD20, rollFormula, attackMod, sneakDice, critThreshold, hasFeature,
  coverForTarget, attackerHasAdvVs, hasDisadv,
} from "./characterStats";
import { hitEnemy, gridDistance } from "./combatMath";
import { d } from "./dndSoloShared";
import { WEAPON_MASTERIES, applyDamageModifiers, mod, profByLevel, monSave } from "./gameData";
import { attackVisibilityModifier } from "./engine/vision";
import { resolveBridgeAttack, toDamageType } from "./bridgeAttack";
import { featDamageBonus, powerAttackModifiers } from "./engine/progression";
import { emitAttack, emitHit, emitDamageDealt, emitKill, emitDeath, queryFeatureTriggers } from "./engineAdapters";
import { applyPendingChanges, type CombatDeps } from "./combatResolve";

export interface WeaponAttackCtx {
  /** The player-selected enemy uid (falls back to first alive when unset). */
  targetId?: string | null;
  /** GWM/Sharpshooter −5/+10 toggle state. */
  powerAttackOn: boolean;
  /** Feature check that reads live combatant features (component-owned refs). */
  characterHasFeatureById: (id: string, key: string) => boolean;
  /** Log-entry factory + id counter. */
  deps: CombatDeps;
}

export function resolveWeaponAttack(
  w: any, label: string, cc: any, cb: any, entries: any[], ctx: WeaponAttackCtx,
): { cc: any; cb: any } {
      const target = cb.enemies.find((e: any) => e.uid === ctx.targetId && e.hpNow > 0) || cb.enemies.find((e: any) => e.hpNow > 0);
      if (!target || !w) return { cc, cb };
      // === D&D 2024 Range Rules ===
      // 1 grid square = 5 ft
      // Melee: reach 5 ft = 1 square, reach 10 ft = 2 squares (Glaive/Halberd/Pike/Lance/Whip)
      // Ranged: rangeNormal/rangeLong in feet → convert to squares (/5)
      //   Within rangeNormal: normal attack
      //   Beyond rangeNormal but within rangeLong: disadvantage
      //   Beyond rangeLong: can't attack
      const targetPos = cb.enemyPositions?.[target.uid] || { x: 0, y: 0 };
      const dist = cb.playerPos ? gridDistance(cb.playerPos, targetPos) : 1;
      const distFeet = dist * 5;
      const isRanged = w.ranged === true;
      // Reach weapons (Glaive, Halberd, Pike, Lance, Whip) have reach 10 ft = 2 squares
      const reachFeet = w.reach || 5;
      const reachSquares = Math.floor(reachFeet / 5);
      if (!isRanged) {
        // Melee weapon
        if (dist > reachSquares) {
          entries.push(ctx.deps.entrySystem(`⚠️ เป้าหมาย ${target.th} อยู่ไกลเกินไป (${dist} ช่อง = ${distFeet} ฟุต) — อาวุธระยะประชิด (reach ${reachFeet} ฟุต = ${reachSquares} ช่อง) ต้องเข้าใกล้ก่อน`));
          return { cc, cb };
        }
      } else {
        // Ranged weapon — check normal/long range
        const normalRange = w.rangeNormal || 25;  // default short range
        const longRange = w.rangeLong || 100;     // default long range
        const normalSquares = Math.floor(normalRange / 5);
        const longSquares = Math.floor(longRange / 5);
        if (dist > longSquares) {
          entries.push(ctx.deps.entrySystem(`⚠️ เป้าหมาย ${target.th} อยู่ไกลเกินระยะโจมตี (${dist} ช่อง = ${distFeet} ฟุต > long range ${longRange} ฟุต) — ยิงไม่ถึง`));
          return { cc, cb };
        }
        if (dist > normalSquares) {
          entries.push(ctx.deps.entrySystem(`📍 ยิงในระยะไกล (${distFeet} ฟุต > normal ${normalRange} ฟุต) — เสียเปรียบ`));
        }
      }
      // Ranged attacks at long range have disadvantage
      let rangedDisadv = false;
      if (isRanged) {
        const normalRange = w.rangeNormal || 25;
        const normalSquares = Math.floor(normalRange / 5);
        if (dist > normalSquares) rangedDisadv = true;
      }
      // Ranged attacks while enemy is adjacent (within 5 ft) have disadvantage (D&D 5e RAW)
      let meleeAdjacentDisadv = isRanged && dist <= 1;
      // Ranged attacks against prone target have disadvantage (melee has advantage vs prone)
      let proneRangedDisadv = isRanged && target.conditions && target.conditions.includes("prone");
      // === D&D 2024 Cover System (engine/vision.coverBetween) ===
      // Cover is computed by tracing the player→target line and treating any
      // living enemy on that line as half cover (a creature grants half cover).
      const coverRes = coverForTarget(cb, target.uid);
      const targetCoverAC = coverRes.bonus;
      const targetCoverLabel = coverRes.label;
      // Apply cover bonus to target's effective AC for this attack
      const effectiveTargetAC = target.ac - (target.conditions?.includes("slow") ? 2 : 0) + targetCoverAC;
      // === D&D 2024 unseen-attacker / unseen-target (engine/vision) ===
      // targetSeesAttacker=false when the player is hidden/invisible
      // → attacker advantage; attackerSeesTarget=false when the target is
      // Invisible (and player has no special sense) → attacker disadvantage.
      const attackerSeesTarget = !(target.conditions && target.conditions.includes("invisible"));
      const targetSeesAttacker = !(cc.hiddenAdv || cb.invisible);
      const visMod = attackVisibilityModifier(attackerSeesTarget, targetSeesAttacker);
      // Advantages: unseen attacker, target glowing (Faerie Fire), target has advantage-conditions, Help action, Vex mastery
      let adv: "none" | "advantage" | "disadvantage" = (visMod === "advantage" || target.glow || target.conditions?.includes("glowing") || target.helpBuff || cc.vexTarget === target.uid || attackerHasAdvVs(target)) ? "advantage" : "none";
      // Consume helpBuff + vexTarget on attack (D&D 5e: advantage lasts until first attack)
      if (target.helpBuff) {
        target.helpBuff = false;
        entries.push(ctx.deps.entrySystem(`🤝 Help advantage consumed`));
      }
      if (cc.vexTarget === target.uid) {
        cc.vexTarget = null;
        entries.push(ctx.deps.entrySystem(`⚔️ Vex advantage consumed`));
      }
      // Disadvantages: unseen target, player's debuff conditions, ranged long range, prone target (ranged only), melee adjacent (ranged only)
      if (visMod === "disadvantage" || hasDisadv(cc) || rangedDisadv || proneRangedDisadv || meleeAdjacentDisadv) adv = adv === "advantage" ? "none" : "disadvantage";
      // Bless buff: +1d4 to attack rolls (data-driven: read from active buffs)
      let atkModTotal = attackMod(cc, w);
      let blessDie = 0;
      if ((cc.buffs || []).some((b: any) => b.name === "Bless")) {
        blessDie = d(4);
        atkModTotal += blessDie;
      }
      // Bane debuff: -1d4 to attack rolls
      let baneDie = 0;
      if ((cc.buffs || []).some((b: any) => b.name === "Bane")) {
        baneDie = d(4);
        atkModTotal -= baneDie;
      }
      // Task #14: GWM/Sharpshooter −5/+10 power attack. The engine gates on the
      // feat being present AND the weapon qualifying (heavy melee / ranged); the
      // −5 is applied to the roll here and the matching +10 to damage below.
      const powerAtk = powerAttackModifiers(cc.feats || [], w, ctx.powerAttackOn);
      if (powerAtk.applies) atkModTotal += powerAtk.toHit;
      // Note: Exhaustion penalty is already applied inside attackMod() — do NOT subtract again here
      // (D&D 2024: -2/level to all D20 Tests including attack rolls)
      // === Engine seam (1c-b): resolve the to-hit + base weapon damage through
      // combatBridge → resolveAttack, so the d20 roll, crit and base damage come
      // from the tested engine instead of hand-rolled inline dice. Feature dice
      // (sneak, smite, Hunter's Mark, masteries, …) are still layered on below.
      const dmgDie = w.versatileDmg && (w.properties || []).includes("versatile") ? w.versatileDmg : w.dmg;
      const abilDmgMod = mod(cc.abilities[w.abil]) + (w.plus || 0);
      const baseDamageExpr = abilDmgMod !== 0 ? `${dmgDie}${abilDmgMod >= 0 ? "+" : ""}${abilDmgMod}` : dmgDie;
      const engineDmgType = toDamageType(w.damageType || w.dmgType);
      const bridgeRes = resolveBridgeAttack({
        attacker: { id: "player", name: cc.name, ac: cc.ac, hp: cc.hp, maxHp: cc.maxHp, speed: cc.speed || 30 },
        // Pass the target's BASE ac + cover separately so the engine forms the
        // effective AC itself; empty resistances (see CombatView) → engine base
        // damage is unresisted and the final resist below applies exactly once.
        target: { id: target.uid, name: target.th, ac: target.ac - (target.conditions?.includes("slow") ? 2 : 0), hp: Math.max(1, target.hpNow), maxHp: target.hp },
        attackBonus: atkModTotal,
        damageExpr: baseDamageExpr,
        damageType: engineDmgType,
        advantage: adv === "advantage",
        disadvantage: adv === "disadvantage",
        coverAC: targetCoverAC,
      });
      // Reconstruct the roll-ticket shape the log renderer expects.
      const atk = { die: bridgeRes.roll, other: null, mod: atkModTotal, total: bridgeRes.total, adv };
      if (target.glow) target.glow = false;
      const critOn = critThreshold(cc);
      const hit = bridgeRes.hit;
      // Phase 2: Auto-crit vs paralyzed/unconscious within 5ft (D&D 2024)
      // Also auto-crit vs petrified (DM ruling — typically counts as incapacitated)
      const targetIncapacitated = target.conditions && (target.conditions.includes("paralyzed") || target.conditions.includes("unconscious") || target.conditions.includes("petrified"));
      const isAutoCrit = hit && targetIncapacitated && dist <= 1; // melee within 5ft
      // Engine crits on a natural 20; the app additionally crits on the class
      // crit threshold (Champion 19-20) and auto-crit vs incapacitated.
      const isCrit = bridgeRes.critical || isAutoCrit || (hit && bridgeRes.roll >= critOn);
      let extra: string | null = null;
      if (isAutoCrit) {
        if (extra === null) extra = "";
        extra += `💀 AUTO-CRIT (target incapacitated within 5ft)`;
      }
      if (targetCoverAC > 0) {
        // Show cover info in the roll entry
        if (extra === null) extra = "";
        extra += `🛡️ ${targetCoverLabel} (+${targetCoverAC} AC = ${effectiveTargetAC})`;
      }
      if (hit) {
        // === D&D 2024 Weapon Damage ===
        // Base weapon damage (dice + ability mod, doubled on a natural-20 crit)
        // already computed by the engine above; feature dice are layered on next.
        let dmg = bridgeRes.damage;
        // B4: Track last weapon damage roll for Savage Attacker reroll
        (cb as any)._lastWeaponDamageRoll = { formula: dmgDie, total: dmg, damageType: w.dmgType || "slashing" };
        let parts = [`${dmgDie}+${abilDmgMod}${w.plus ? ` (อาวุธ +${w.plus})` : ""}${w.versatileDmg && dmgDie === w.versatileDmg ? " (2H)" : ""} = ${dmg}`];
        // Task #14: GWM/Sharpshooter +10 damage (paired with the −5 to-hit above).
        if (powerAtk.applies) { dmg += powerAtk.damage; parts.push(`${powerAtk.reason === "sharpshooter" ? "Sharpshooter" : "GWM"} +${powerAtk.damage}`); }
        // Phase 4: Fighting Style — Dueling grants +2 damage with a one-handed melee weapon.
        const duelBonus = featDamageBonus(cc.feats || [], w);
        if (duelBonus > 0) { dmg += duelBonus; parts.push(`Dueling +${duelBonus}`); }
        if (blessDie > 0) parts.push(`Bless +${blessDie}`);
        if (baneDie > 0) parts.push(`Bane -${baneDie}`);
        // D&D 2024 Critical Hit: roll ALL damage dice twice (weapon dice + Sneak Attack + Hunter's Mark + Smite + Hex + any other dice)
        // Source: D&D Beyond Free Rules 2024 "Critical Hits": "If the attack involves other damage dice, such as from the Rogue's Sneak Attack feature, you also roll those dice twice."
        // We accomplish this by doubling the dice count via a critMultiplier flag that the additional-damage blocks check.
        const critMultiplier = isCrit ? 2 : 1;
        if (isCrit && !bridgeRes.critical) {
          // Champion improved-crit / auto-crit vs incapacitated: the engine only
          // doubles weapon dice on a natural 20, so add the extra weapon dice here.
          const cr = rollFormula(dmgDie);
          dmg += cr.total;
          parts.push(`CRIT(${critOn}-20) +${cr.total} (weapon dice doubled)`);
        } else if (isCrit) {
          parts.push(`CRIT (nat 20, weapon dice doubled)`);
        }
        // Sneak Attack: D&D 5e/2024 RAW — advantage on attack roll OR ally within 5ft of target
        // In solo play (no allies), only advantage qualifies
        // D&D 2024: Sneak Attack dice ARE doubled on crit (same as 5e — verbatim from PHB 2024)
        if (hasFeature(cc, "sneak_attack")) {
          const sneakEligible = adv === "advantage" || attackerHasAdvVs(target);
          if (sneakEligible) {
            const nDice = sneakDice(cc.level) * critMultiplier; // Double on crit (D&D 2024)
            const sn = rollFormula(`${nDice}d6`);
            dmg += sn.total; parts.push(`Sneak Attack ${nDice}d6 +${sn.total}${isCrit ? " (crit ×2)" : ""}`);
          }
        }
        // Hunter's Mark buff: +1d6 damage (doubled on crit — D&D 2024)
        if ((cc.buffs || []).some((b: any) => b.name === "Hunter's Mark")) {
          const hmDice = 1 * critMultiplier;
          const hm = rollFormula(`${hmDice}d6`);
          dmg += hm.total; parts.push(`Hunter's Mark +${hm.total}${isCrit ? " (crit ×2)" : ""}`);
        }
        // === D&D 2024 Weapon Mastery ===
        // Only Fighter, Paladin, Ranger, Barbarian, Monk (and some feats) get Weapon Mastery
        const hasMastery = ["fighter", "paladin", "ranger", "barbarian", "monk"].includes(cc.cls);
        if (hasMastery && w.mastery) {
          const masteryKey = w.mastery as string;
          const masteryInfo = WEAPON_MASTERIES[masteryKey];
          if (masteryInfo) {
            switch (masteryKey) {
              case "cleave": {
                // Deal weapon damage to another enemy within 5 ft (no ability mod)
                const adjacent = cb.enemies.find((e: any) => e.hpNow > 0 && e.uid !== target.uid && cb.enemyPositions[e.uid] && gridDistance(cb.playerPos, cb.enemyPositions[e.uid]) <= 1);
                if (adjacent) {
                  const cleaveDmg = rollFormula(dmgDie).total;
                  hitEnemy(cb, adjacent, cleaveDmg);
                  parts.push(`⚔️ Cleave → ${adjacent.th} +${cleaveDmg}`);
                }
                break;
              }
              case "graze": {
                // On miss, deal ability mod damage — but we're in hit block, so graze doesn't apply here
                // (graze is handled in the miss block below)
                break;
              }
              case "push": {
                // Push target 10 ft (2 squares) away if Large or smaller
                if (cb.enemyPositions[target.uid]) {
                  const ep = cb.enemyPositions[target.uid];
                  const dx = ep.x - cb.playerPos.x;
                  const dy = ep.y - cb.playerPos.y;
                  const pushX = ep.x + (dx !== 0 ? Math.sign(dx) * 2 : 0);
                  const pushY = ep.y + (dy !== 0 ? Math.sign(dy) * 2 : 0);
                  if (pushX >= 0 && pushX < (cb.grid?.w || 12) && pushY >= 0 && pushY < (cb.grid?.h || 10)) {
                    cb.enemyPositions[target.uid] = { x: pushX, y: pushY };
                    parts.push(`💨 Push 10ft → (${pushX},${pushY})`);
                  }
                }
                break;
              }
              case "sap": {
                // Target has disadvantage on next attack roll
                if (!target.conditions) target.conditions = [];
                if (!target.conditions.includes("sap_effect")) {
                  target.conditions.push("sap_effect");
                  parts.push(" Sap (disadv next atk)");
                }
                break;
              }
              case "slow": {
                // Reduce target speed by 10 ft (2 squares) until start of next turn
                target.speedReduced = (target.speedReduced || 0) + 10;
                parts.push(" Slow (-10ft speed)");
                break;
              }
              case "topple": {
                // Force CON save or fall prone
                const toppleDC = 8 + profByLevel(cc.level) + mod(cc.abilities[w.abil]);
                const sv = rollD20(monSave(target, "con"));
                if (sv.total < toppleDC) {
                  if (!target.conditions) target.conditions = [];
                  if (!target.conditions.includes("prone")) {
                    target.conditions.push("prone");
                    parts.push(` Topple! CON ${sv.total}<${toppleDC} → Prone`);
                  }
                }
                break;
              }
              case "vex": {
                // Gain advantage on next attack against this target
                cc.vexTarget = target.uid;
                parts.push(" Vex (adv next atk vs target)");
                break;
              }
              case "nick": {
                // Nick: bonus action attack with off-hand weapon uses full damage die (no ability mod reduction)
                // Handled in dual_wield logic — just log it
                break;
              }
            }
          }
        }
        // Hex buff: +1d6 damage (doubled on crit — D&D 2024)
        if ((cc.buffs || []).some((b: any) => b.name === "Hex")) {
          const hxDice = 1 * critMultiplier;
          const hx = rollFormula(`${hxDice}d6`);
          dmg += hx.total; parts.push(`Hex +${hx.total}${isCrit ? " (crit ×2)" : ""}`);
        }
        // Barbarian Rage bonus (feature-based)
        if (hasFeature(cc, "rage") && cc.raging && w.abil === "str") {
          const rageDmg = cc.level >= 9 ? 3 : 2;
          dmg += rageDmg; parts.push(`Rage +${rageDmg}`);
        }
        // Paladin Divine Smite — D&D 5e RAW: player chooses to smite after hitting
        // We auto-smite if toggle is on (default: on) and slots available
        if (hasFeature(cc, "divine_smite") && cc.divineSmiteReady && cc.slots && cc.slots.some((v: number) => v > 0) && cc.divineSmiteToggle !== false) {
          // Find lowest available slot
          let slotIdx = -1;
          for (let li = 0; li < cc.slots.length; li++) {
            if (cc.slots[li] > 0) { slotIdx = li; break; }
          }
          if (slotIdx >= 0) {
            cc.slots = cc.slots.map((v: number, i: number) => i === slotIdx ? v - 1 : v);
            const smiteDice = (2 + slotIdx) * critMultiplier; // 2d8 + 1d8 per slot above 1, doubled on crit (D&D 2024)
            const sm = rollFormula(`${smiteDice}d8`);
            dmg += sm.total; parts.push(`Divine Smite ${smiteDice}d8 +${sm.total} (slot ${slotIdx + 1})${isCrit ? " (crit ×2)" : ""}`);
          }
        }
        // Monk Flurry of Blows (ki)
        if (w.venom && !cc.venomUsed) {
          cc.venomUsed = true;
          const sv = rollD20(monSave(target, "con"));
          if (sv.total < 15) {
            const p = rollFormula("2d10");
            dmg += p.total; parts.push(`🐍 poison +${p.total} (CON save ${sv.total} < 15)`);
          } else parts.push(`🐍 poison resisted (CON save ${sv.total} ≥ 15)`);
        }
        // Bardic Inspiration die (1d6 at Lv1)
        if (cb.bardicInspiration) {
          const bi = d(6);
          dmg += bi; parts.push(`Bardic Inspiration +${bi}`);
          cb.bardicInspiration = false;
        }
        // === NEW: D&D 5e damage type resistance/immunity/vulnerability ===
        // Apply AFTER all damage modifiers (crit, sneak, hunter's mark, hex, smite, etc.)
        // so the resistance applies to the final total, not just the weapon die.
        // Weapon damage type defaults to "slashing" when not specified (per spec).
        const wDmgType = (w.damageType || w.dmgType || "slashing").toLowerCase();
        const resistedDmg = applyDamageModifiers(dmg, wDmgType, {
          resistances: target.damageResistances,
          vulnerabilities: target.damageVulnerabilities,
          immunities: target.damageImmunities,
        });
        if (resistedDmg === 0 && dmg > 0) parts.push(`🛡️ IMMUNE (${wDmgType})`);
        else if (resistedDmg < dmg) parts.push(`🛡️ RESIST (${wDmgType}) -${dmg - resistedDmg}`);
        else if (resistedDmg > dmg) parts.push(`💥 VULNERABLE (${wDmgType}) +${resistedDmg - dmg}`);
        dmg = resistedDmg;
        // Bless die (+1d4 to attack rolls, not damage — already applied to atk in real 5e but we simplified)
        hitEnemy(cb, target, dmg);
        extra = `${parts.join(" · ")} = ${dmg} damage → ${target.th} ${target.hpNow <= 0 ? "dead!" : `${target.hpNow} HP left`}`;
        // Emit events for feature triggers (data-driven)
        emitAttack("player", target.uid, w.th);
        if (hit) {
          emitHit("player", target.uid, w.th, dmg);
          emitDamageDealt("player", target.uid, dmg, wDmgType);
          // Query feature triggers for on_hit (e.g. savage_attacker, poison_weapon)
          const hitTriggers = queryFeatureTriggers("on_hit", "player", target.uid, { weapon: w.th, damage: dmg }, ctx.characterHasFeatureById);
          if (hitTriggers.length > 0) {
            const applied = applyPendingChanges(hitTriggers, cc, cb, (t) => entries.push(ctx.deps.entrySystem(t)));
            cc = applied.cc; cb = applied.cb;
            // Re-find target after pending changes may have updated enemy list
            const updatedTarget = cb.enemies.find((e: any) => e.uid === target.uid);
            if (updatedTarget) target.hpNow = updatedTarget.hpNow;
          }
          // Check for kill
          if (target.hpNow <= 0) {
            emitKill("player", target.uid);
            emitDeath(target.uid, "player");
            entries.push(ctx.deps.entrySystem(`💀 ${target.th} ล้มลง!`));
          }
        }
      }
      // === D&D 2024 Weapon Mastery: Graze (on miss, deal ability mod damage) ===
      if (!hit && w.mastery === "graze") {
        const hasMastery = ["fighter", "paladin", "ranger", "barbarian", "monk"].includes(cc.cls);
        if (hasMastery) {
          const grazeDmg = Math.max(1, mod(cc.abilities[w.abil]));
          hitEnemy(cb, target, grazeDmg);
          extra = `Graze: +${grazeDmg} ${w.abil.toUpperCase()} mod damage → ${target.th} ${target.hpNow <= 0 ? "dead!" : `${target.hpNow} HP left`}`;
          emitDamageDealt("player", target.uid, grazeDmg, "slashing");
          if (target.hpNow <= 0) {
            emitKill("player", target.uid);
            entries.push(ctx.deps.entrySystem(`💀 ${target.th} ล้มลงจาก Graze!`));
          }
        }
      }
      entries.push({ id: ctx.deps.nextId(), type: "roll", title: `${label} ${target.th} (${w.th})`, roll: atk, vsAc: effectiveTargetAC, success: hit, extra });
      cc.hiddenAdv = false;
      if (cb.invisible) { cb.invisible = false; entries.push(ctx.deps.entrySystem("🫥 You become visible again (attacking ends invisibility)")); }
  return { cc, cb };
}
