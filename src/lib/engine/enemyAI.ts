// Pure, testable per-enemy combat AI turn. Extracted verbatim from DnDSolo's
// former local `enemyTurn`. NO React import — clean lib deps are imported
// directly; all component/module-local deps are injected via `deps`.
import { generateFullPlan, type PlanningContext, type Goal } from "../planning";
import { weaponByName, mod, applyDamageModifiers, INCAPACITATING_CONDS } from "../gameData";
import { planMultiattackSequence } from "./combatBridge";
import { checkConcentration, concentrationCheckDC, isConcentrationSpellName } from "./effects";
import { emitDamageTaken } from "../engineAdapters";

export interface EnemyAIDeps {
  attackMod: (c: any, w: any) => number;
  rollD20: (modv: number, adv?: "none" | "advantage" | "disadvantage") => { die: number; total: number; [k: string]: any };
  rollFormula: (formula: string) => { total: number; rolls: number[]; [k: string]: any };
  hitEnemy: (cbLike: any, target: any, amount: number) => number;
  enemyHasAttackDisadv: (e: any) => boolean;
  exhaustionPenalty: (c: any) => number;
  saveMod: (c: any, abil: string) => number;
  hasFeature: (c: any, key: string) => boolean;
  hasConcentration: (cc: any) => boolean;
  getActiveConcentrationBuff: (cc: any) => any;
  gridDistance: (a: { x: number; y: number }, b: { x: number; y: number }) => number;
  entrySystem: (text: string) => any;
  nextId: () => number;
}

export function runEnemyTurn(
  deps: EnemyAIDeps,
  e: any,
  cb: any,
  cc: any,
  nc: any,
  entries: any[],
  aliveEnemies: any[],
  enemyHasAdv: boolean,
  uncannyUsed: boolean
): { stop: boolean; uncannyUsed: boolean } {
    const {
      attackMod, rollD20, rollFormula, hitEnemy, enemyHasAttackDisadv,
      exhaustionPenalty, saveMod, hasFeature, hasConcentration,
      getActiveConcentrationBuff, gridDistance, entrySystem, nextId,
    } = deps;
      if (e.hpNow <= 0 || nc.hp <= 0) return { stop: false, uncannyUsed };
      // D&D 2024: Surprise no longer skips the enemy's first turn (just Disadvantage on Initiative)
      // The `surprised` flag is UI-only — enemies still act normally
      if (e.surprised) {
        e.surprised = false; // clear flag for UI display only — do NOT skip turn
      }
      // Skip if enemy is incapacitated (stunned/paralyzed/etc)
      if (e.conditions && e.conditions.some((c: string) => INCAPACITATING_CONDS.includes(c))) {
        entries.push(entrySystem(`😵 ${e.th} ไร้ความสามารถ — เสียเทิร์น`));
        return { stop: false, uncannyUsed };
      }
      // Phase 2: Charmed enemies can't attack the charmer (D&D 2024)
      // (simplified: charmed enemies skip attack entirely — can't target charmer)
      if (e.conditions && e.conditions.includes("charmed")) {
        entries.push(entrySystem(`💕 ${e.th} ถูกเสน่ห์ — ไม่สามารถโจมตีผู้เสกได้ (เสียเทิร์น)`));
        return { stop: false, uncannyUsed };
      }
      // Phase 2: Deafened enemies can't be surprised by sound + have disadvantage on Perception (already handled)
      // (no combat skip — deafened just affects Perception, not attacks directly)
      // Phase 2: Frightened enemies have disadvantage on ability checks + can't move closer to source (already in DISADV_CONDS)
      // === Domain 32: AI Planning Engine — Tactical AI ===
      // Build planning context for this enemy
      const ePos = cb.enemyPositions?.[e.uid];
      const distToPlayer = ePos && cb.playerPos ? gridDistance(ePos, cb.playerPos) : 1;
      const enemyHpPercent = (e.hpNow / (e.hp || e.hpNow || 1)) * 100;
      const planCtx: PlanningContext = {
        selfHpPercent: enemyHpPercent,
        selfPosition: ePos || { x: 0, y: 0 },
        selfHasRangedWeapon: !!(e.attacks && e.attacks.some((a: any) => a.range && a.range > 1)),
        selfAbilitiesAvailable: (e.specialAbilities || []).map((s: any) => s.name || "ability"),
        alliesAlive: aliveEnemies.filter((ae: any) => ae.uid !== e.uid).length,
        alliesWounded: aliveEnemies.filter((ae: any) => ae.uid !== e.uid && ae.hpNow < (ae.hp || ae.hpNow) * 0.5).length,
        enemiesVisible: 1, // just the player
        enemyHpPercents: [nc.hp / nc.maxHp],
        distanceToTarget: distToPlayer,
        targetIsCaster: !!(cc.knownSpells && cc.knownSpells.length > 0),
        targetIsFleeing: false,
        hasHealingPotion: false,
        hasReinforcementCall: !!(e.legendaryActions && e.legendaryActions.length > 0),
        environmentHazards: [],
        currentRound: cb.round || 1,
        worldSeconds: 0,
      };
      // Generate tactical plan for this enemy
      const enemyGoal: Goal = {
        id: `goal_${e.uid}`,
        type: "kill_player",
        description: `Defeat ${nc.name}`,
        priority: 8,
        targetId: "player",
        completed: false,
        failed: false,
      };
      const plan = generateFullPlan([enemyGoal], planCtx, 50);
      const selectedAction = plan?.selectedAction;
      const riskAssessment = plan?.risk;
      // Log the AI decision (for player visibility — shows enemy is "thinking")
      if (selectedAction) {
        entries.push(entrySystem(`🧠 ${e.th} AI: ${selectedAction.action} (utility ${selectedAction.expectedUtility}, risk ${selectedAction.riskScore})`));
      }
      // If high risk + low HP, enemy flees instead of attacking
      if (riskAssessment && (riskAssessment.threatLevel === "deadly" || riskAssessment.threatLevel === "lethal") && enemyHpPercent < 25) {
        entries.push(entrySystem(`🏃 ${e.th} ประเมินว่าอันตรายเกินไป (${riskAssessment.threatLevel}) — พยายามหนี!`));
        // Try to move away from player (opposite direction)
        if (cb.playerPos && ePos && cb.enemyPositions && !e.conditions?.includes("restrained")) {
          const dx = ePos.x - cb.playerPos.x;
          const dy = ePos.y - cb.playerPos.y;
          const newX = ePos.x + Math.sign(dx || 1);
          const newY = ePos.y + Math.sign(dy || 1);
          if (newX >= 0 && newX < (cb.grid?.w || 12) && newY >= 0 && newY < (cb.grid?.h || 10)) {
            const occupied = cb.enemies.some((other: any) => other.uid !== e.uid && other.hpNow > 0 && cb.enemyPositions[other.uid]?.x === newX && cb.enemyPositions[other.uid]?.y === newY);
            if (!occupied) {
              cb.enemyPositions[e.uid] = { x: newX, y: newY };
              entries.push(entrySystem(`   → ${e.th} ถอยไป (${newX},${newY})`));
            }
          }
        }
        return { stop: false, uncannyUsed }; // skip attacking this turn
      }
      // Movement: use planning decision (move_closer vs hold vs retreat)
      if (cb.playerPos && cb.enemyPositions && cb.enemyPositions[e.uid]) {
        const ePos2 = cb.enemyPositions[e.uid];
        const dist = gridDistance(ePos2, cb.playerPos);
        if (dist > 1) {
          if (e.conditions && e.conditions.includes("restrained")) {
            // skip movement
          } else if (selectedAction && selectedAction.action === "retreat") {
            // Tactical retreat (handled above for high risk)
          } else if (selectedAction && selectedAction.action === "hold_position") {
            // Don't move — guard position
            entries.push(entrySystem(`🛡️ ${e.th} ยืนประจำการ — รอผู้เล่นเข้ามา`));
          } else {
            // Move toward player (default aggressive)
            // Phase 4: Slow mastery effect — enemy with speedReduced skips movement this turn
            if ((e.speedReduced || 0) > 0) {
              entries.push(entrySystem(`🐌 ${e.th} ช้าลง (Slow) — ไม่เคลื่อนที่เทิร์นนี้`));
              e.speedReduced = Math.max(0, (e.speedReduced || 0) - 10); // consume one stack
            } else {
            const dx = cb.playerPos.x - ePos2.x;
            const dy = cb.playerPos.y - ePos2.y;
            let newX = ePos2.x, newY = ePos2.y;
            if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
              newX = ePos2.x + Math.sign(dx);
            } else if (dy !== 0) {
              newY = ePos2.y + Math.sign(dy);
            }
            const occupied = cb.enemies.some((other: any) => other.uid !== e.uid && other.hpNow > 0 && cb.enemyPositions[other.uid]?.x === newX && cb.enemyPositions[other.uid]?.y === newY);
            if (!occupied && newX >= 0 && newX < (cb.grid?.w || 12) && newY >= 0 && newY < (cb.grid?.h || 10)) {
              // Phase 2: Trigger Ready Action if enemy moves adjacent to player
              const newDist = Math.max(Math.abs(newX - cb.playerPos.x), Math.abs(newY - cb.playerPos.y));
              if (cb.readyAction && newDist <= 1 && e.hpNow > 0) {
                entries.push(entrySystem(`⏰ Ready Action triggered! ${e.th} เข้าใกล้ — โจมตี Reaction`));
                // Trigger ready attack on this enemy
                cb.readyAction = null; // consume ready action
                // Perform a quick attack (simplified — uses player's melee weapon)
                const meleeWEntry = weaponByName(cc.weapon);
                const meleeW = meleeWEntry ? meleeWEntry[1] : null;
                if (meleeW) {
                  const atkMod = attackMod(cc, meleeW);
                  const atk = rollD20(atkMod, "advantage"); // ready attack has advantage (held action)
                  const hit2 = atk.die !== 1 && (atk.die === 20 || atk.total >= e.ac);
                  if (hit2) {
                    const dr = rollFormula(meleeW.dmg);
                    const dmg = dr.total + mod(cc.abilities[meleeW.abil]) + (meleeW.plus || 0);
                    hitEnemy(cb, e, dmg);
                    entries.push({ id: nextId(), type: "roll", title: `⏰ Ready → ${e.th}`, roll: atk, vsAc: e.ac, success: true, extra: `${dmg} ${meleeW.dmg} → ${e.th} ${e.hpNow <= 0 ? "dead!" : `${e.hpNow} HP`}` });
                  } else {
                    entries.push({ id: nextId(), type: "roll", title: `⏰ Ready → ${e.th}`, roll: atk, vsAc: e.ac, success: false, extra: "miss" });
                  }
                }
              }
              cb.enemyPositions[e.uid] = { x: newX, y: newY };
            }
            } // end else (not slowed)
          }
        }
      }
      // === Range check: enemy can only attack if within reach ===
      // D&D 5e: melee enemies must be adjacent (dist ≤ 1, or dist ≤ 2 for reach weapons)
      // Ranged enemies must be within their range
      const currentDist = ePos && cb.playerPos ? gridDistance(ePos, cb.playerPos) : 1;
      const enemyHasRanged = !!(e.attacks && e.attacks.some((a: any) => a.range && a.range > 5));
      const enemyReach = e.reach || 5; // most monsters have 5 ft reach
      const enemyReachSquares = Math.floor(enemyReach / 5);
      // Check if player is invisible or hidden — enemy can't target what it can't see
      const playerInvisible = cb.invisible || nc.hiddenAdv;
      if (playerInvisible) {
        // D&D 5e: invisible targets can't be targeted directly
        // Enemy has disadvantage on attacks AND must guess the square
        // For solo play simplification: enemy can't attack invisible player unless adjacent
        if (currentDist > 1) {
          entries.push(entrySystem(`🙈 ${e.th} ไม่เห็นผู้เล่น (หายตัว/ซ่อน) — มองหาอยู่ (dist ${currentDist} squares)`));
          return { stop: false, uncannyUsed }; // skip this enemy's turn
        }
        // If adjacent, enemy can try to attack with disadvantage (guessing square)
        entries.push(entrySystem(`🙈 ${e.th} โจมตีมืด ๆ (ผู้เล่นหายตัว) — เสียเปรียบ`));
      }
      // Range check: if too far, skip attack (already moved, but still too far)
      if (!enemyHasRanged && currentDist > enemyReachSquares) {
        entries.push(entrySystem(`📏 ${e.th} อยู่ไกลเกินไป (${currentDist} squares > reach ${enemyReachSquares}) — เคลื่อนที่มาแล้วแต่ยังไม่ถึง`));
        return { stop: false, uncannyUsed }; // can't attack this turn
      }
      if (enemyHasRanged && currentDist > 1) {
        // Ranged enemy: check if player is within range
        const enemyRangeNormal = e.rangeNormal || 25;
        const enemyRangeLong = e.rangeLong || 100;
        const normalSquares = Math.floor(enemyRangeNormal / 5);
        const longSquares = Math.floor(enemyRangeLong / 5);
        if (currentDist > longSquares) {
          entries.push(entrySystem(`📏 ${e.th} อยู่ไกลเกินระยะยิง (${currentDist} squares > long range ${longSquares})`));
          return { stop: false, uncannyUsed };
        }
      }
      // Multi-attack: use Open5e structured attacks if available, otherwise legacy e.attacks[] / fallback
      // Open5e structured attacks come from `e.structuredAttacks[]` (NormalizedCreatureAttack[])
      // Legacy e.attacks[] come from BESTIARY {atk, dmg, name} format
      // Multiattack: prefer the plan parsed from the stat block's Multiattack action
      // text (engine combatBridge.planMultiattackSequence → e.g. Bite + Claw), falling
      // back to raw structured attacks, then legacy attack list, then a single attack.
      const maSeq = planMultiattackSequence(e.actions);
      const structuredAtks = (maSeq ?? e.structuredAttacks) as any[] | undefined;
      const numAttacks = maSeq
        ? maSeq.length
        : (structuredAtks && structuredAtks.length > 1
            ? Math.min(structuredAtks.length, 3)  // Multiattack: up to 3 attacks from Open5e
            : (e.attacks && e.attacks.length > 1 ? Math.min(2, e.attacks.length) : 1));
      for (let atkIdx = 0; atkIdx < numAttacks; atkIdx++) {
        if (nc.hp <= 0) break;
        // Pick attack data: prefer Open5e structured → legacy e.attacks[] → fallback to e.atk/e.dmg
        let atkData: any;
        if (structuredAtks && structuredAtks[atkIdx]) {
          // Open5e structured attack — convert to legacy shape
          const sa = structuredAtks[atkIdx];
          atkData = {
            name: sa.name || e.th + " attack",
            atk: sa.toHit,
            dmg: `${sa.damageDice || "1d6"}${sa.damageBonus ? `+${sa.damageBonus}` : ""}`,
            dmgType: sa.damageType,
            // Open5e provides reach/range — convert to legacy range format
            range: sa.reach ? Math.floor(sa.reach / 5) : (sa.range ? Math.floor(sa.range / 5) : 1),
          };
        } else if (e.attacks && e.attacks[atkIdx]) {
          atkData = e.attacks[atkIdx];
        } else {
          atkData = { atk: e.atk, dmg: e.dmg, name: "Attack" };
        }
        const defAdv = cb.dodge || cb.invisible || nc.hiddenAdv;
        let adv: "none" | "advantage" | "disadvantage" = "none";
        // Enemy gets advantage if player has weakness conditions
        if (enemyHasAdv && !defAdv) adv = "advantage";
        // Enemy has disadvantage from its own conditions (prone/restrained/blinded/poisoned/frightened)
        if (enemyHasAttackDisadv(e)) {
          adv = adv === "advantage" ? "none" : "disadvantage";
        }
        // Player invisible/hidden → enemy attacks with disadvantage
        if (playerInvisible) {
          adv = adv === "advantage" ? "none" : "disadvantage";
        }
        // D&D 5e RAW: Ranged attacks while target is adjacent have disadvantage
        const isEnemyRanged = atkData.range && atkData.range > 5;
        if (isEnemyRanged && currentDist <= 1) {
          adv = adv === "advantage" ? "none" : "disadvantage";
        }
        // D&D 5e RAW: Player prone → melee attacks against player have advantage, ranged have disadvantage
        if (nc.conditions.includes("prone")) {
          if (!isEnemyRanged) adv = adv === "disadvantage" ? "none" : "advantage";
          else adv = adv === "advantage" ? "none" : "disadvantage";
        }
        // Player defensive effects force disadvantage
        if (!enemyHasAdv && defAdv) adv = "disadvantage";

        // === D&D 2024: Exhaustion penalty applies to enemy attack rolls too ===
        let enemyAtkMod = atkData.atk;
        const banePenalty = e.conditions?.includes("bane") ? rollFormula("1d4").total : 0;
        enemyAtkMod -= banePenalty;
        const enemyExhaustPenalty = exhaustionPenalty(e);
        if (enemyExhaustPenalty > 0) enemyAtkMod -= enemyExhaustPenalty;

        // Phase 4: Sap mastery effect — enemy with sap_effect has disadvantage on next attack
        if (e.conditions && e.conditions.includes("sap_effect")) {
          adv = adv === "advantage" ? "none" : "disadvantage";
          // Consume sap_effect (lasts until next attack)
          e.conditions = e.conditions.filter((c: string) => c !== "sap_effect");
        }

        const atk = rollD20(enemyAtkMod, adv);
        // D&D 5e RAW: nat 20 = critical hit, nat 1 = automatic miss
        const isEnemyCrit = atk.die === 20;
        const hit = atk.die !== 1 && (atk.die === 20 || atk.total >= nc.ac);
        let extra = banePenalty ? `Bane -${banePenalty}` : "";
        if (hit) {
          let dmgR = rollFormula(atkData.dmg);
          let dmg = dmgR.total;
          // D&D 2024: Critical hit doubles ONLY weapon/attack damage dice (not bonus dice)
          if (isEnemyCrit) {
            const critDice = rollFormula(atkData.dmg.replace(/[+-]\d+$/, "") || atkData.dmg);
            dmg += critDice.rolls.reduce((a, b) => a + b, 0);
          }
          // Restrained enemy deals half damage on melee (simplified)
          if (e.conditions && e.conditions.includes("restrained")) {
            dmg = Math.floor(dmg / 2);
            extra += ` (ลดครึ่งจาก Restrained)`;
          }
          // === D&D 5e RAW: Apply player's damage resistance/immunity/vulnerability ===
          const enemyDmgType = (atkData.dmgType || "slashing").toLowerCase();
          // Rage grants resistance to bludgeoning/piercing/slashing (D&D 2024)
          // Build effective resistances = character's resistances + Rage's B/P/S if raging
          const isRaging = (nc.buffs || []).some((b: any) => b.name === "Rage");
          const rageResistances = isRaging ? ["bludgeoning", "piercing", "slashing"] : [];
          const effectiveResistances = Array.from(new Set([
            ...(nc.damageResistances || []),
            ...rageResistances,
          ]));
          const modifiedDmg = applyDamageModifiers(dmg, enemyDmgType, {
            resistances: effectiveResistances,
            vulnerabilities: nc.damageVulnerabilities,
            immunities: nc.damageImmunities,
          });
          if (modifiedDmg === 0 && dmg > 0) extra += ` · 🛡️ IMMUNE (${enemyDmgType})`;
          else if (modifiedDmg < dmg) extra += ` · 🛡️ RESIST (${enemyDmgType}) -${dmg - modifiedDmg}`;
          else if (modifiedDmg > dmg) extra += ` · 💥 VULNERABLE (${enemyDmgType}) +${modifiedDmg - dmg}`;
          dmg = modifiedDmg;

          extra = `${atkData.name}: ${atkData.dmg}${isEnemyCrit ? " (CRIT)" : ""} = ${dmg}${extra ? " ·" + extra : ""}`;
          // Breath weapons / special damage
          if (e.breath) {
            // D&D 2024: Exhaustion penalty applies to player's saving throws too
            let breathSaveMod = saveMod(nc, e.breath.save || "dex") - exhaustionPenalty(nc);
            const sv = rollD20(breathSaveMod);
            const breathDmg = rollFormula(e.breath.dmg);
            const finalBreath = sv.total >= e.breath.dc ? Math.floor(breathDmg.total / 2) : breathDmg.total;
            extra += ` · ${e.breath.type} breath ${e.breath.dmg} = ${finalBreath} (${e.breath.save?.toUpperCase()} save ${sv.total} vs DC ${e.breath.dc}${exhaustionPenalty(nc) > 0 ? ` -${exhaustionPenalty(nc)} exhaust` : ""})`;
            dmg += finalBreath;
          }
          if (e.poison) {
            // D&D 2024: Exhaustion penalty applies to saves
            let poisonSaveMod = saveMod(nc, "con") - exhaustionPenalty(nc);
            const sv = rollD20(poisonSaveMod);
            let psR = rollFormula(e.poison.dmg);
            let ptotal = psR.total;
            if (isEnemyCrit) ptotal += rollFormula(e.poison.dmg).rolls.reduce((a, b) => a + b, 0);
            const pdmg = sv.total >= e.poison.dc ? Math.floor(ptotal / 2) : ptotal;
            extra += ` · CON save ${sv.total} vs DC ${e.poison.dc} → poison +${pdmg}`;
            dmg += pdmg;
          }
          // Uncanny Dodge (Rogue Lv.5): halve first hit each round
          if (hasFeature(nc, "uncanny_dodge") && !uncannyUsed) {
            dmg = Math.floor(dmg / 2);
            uncannyUsed = true;
            extra += ` · 🌀 Uncanny Dodge halved → ${dmg}`;
          }
          nc.hp = Math.max(0, nc.hp - dmg);

          // Emit damage taken event (for features like relentless_endurance, uncanny_dodge already applied above)
          if (dmg > 0) emitDamageTaken("player", dmg, "slashing", e.uid);

          // Concentration check: if player has any concentration buff and took damage, must make CON save.
          // DC + pass/fail owned by the engine (engine/effects.checkConcentration → D&D 2024 DC = max(10, dmg/2), cap 30).
          if (dmg > 0 && hasConcentration(nc)) {
            const concBuff = getActiveConcentrationBuff(nc);
            const concSave = rollD20(saveMod(nc, "con"));
            const conc = checkConcentration(dmg, concSave.die, saveMod(nc, "con"));
            if (!conc.success) {
              // Lose concentration — remove buff
              nc.buffs = nc.buffs.filter((b: any) => b.name !== concBuff.name);
              if (concBuff.name === "Mage Armor") nc.mageArmor = false;
              if (concBuff.name === "Spirit Guardians") cb.spiritGuardians = false;
              entries.push(entrySystem(`💔 เสียสมาธิ! ${concBuff.name} สลายไป (CON save ${conc.total} < DC ${conc.dc})`));
            } else {
              entries.push(entrySystem(`🛡️ รักษาสมาธิ ${concBuff.name} ไว้ได้ (CON save ${conc.total} ≥ DC ${conc.dc})`));
            }
          }

          if (cb.spiritGuardians && dmg > 0 && nc.hp > 0) {
            const dc = concentrationCheckDC(dmg);
            const sv = rollD20(saveMod(nc, "con"));
            if (sv.total < dc) {
              cb.spiritGuardians = false;
              entries.push(entrySystem(`💫 เสียสมาธิ! (CON save ${sv.total} vs DC ${dc}) Spirit Guardians สลายไป`));
            }
          }
        }
        entries.push({ id: nextId(), type: "roll", title: `${e.th} ${atkData.name}`, roll: atk, vsAc: nc.ac, success: hit, extra: hit ? extra + ` → your HP ${nc.hp}` : null });
        if (nc.hp <= 0) {
          // D&D 2024: dropping to 0 HP / falling unconscious ends all concentration.
          // (Which buffs are concentration is owned by engine/effects.isConcentrationSpellName.)
          const droppedConc = (nc.buffs || []).filter((b: any) => isConcentrationSpellName(b.name));
          if (droppedConc.length > 0) {
            nc.buffs = (nc.buffs || []).filter((b: any) => !isConcentrationSpellName(b.name));
            if (droppedConc.some((b: any) => b.name === "Spirit Guardians")) cb.spiritGuardians = false;
            entries.push(entrySystem(`💔 หมดสติ — เสียสมาธิ: ${droppedConc.map((b: any) => b.name).join(", ")} สลายไป`));
          }
          entries.push(entrySystem(`💀 ${nc.name} ล้มลงหมดสติ! ต้องทอย Death Saving Throw`));
          break;
        }
      }
      if (nc.hp <= 0) return { stop: true, uncannyUsed };
      return { stop: false, uncannyUsed };
  }
