"use client";

/**
 * Tactical combat overlay — extracted from DnDSolo.tsx (Phase 2 de-monolith).
 *
 * Presentational combat UI: battle grid + movement, initiative strip, enemy list,
 * companion card, and the action menus (attack / spell / item / class features /
 * flee / death save). All state and behavior live in the parent and arrive via
 * props; the spell-menu's async fetch-then-cast is lifted to onCastSpell so this
 * component stays free of setThinking/setLog/fetchSpell. JSX moved verbatim.
 */
import React from "react";
import { gridDistance } from "@/lib/combatMath";
import { hasFeature } from "@/lib/characterStats";
import { mod, canDualWield } from "@/lib/gameData";
import { hasPowerAttackFeat } from "@/lib/engine/progression";
import { buildSidekick, SIDEKICK_BASES } from "@/lib/engine/sidekick";
import { CombatEnemyList } from "@/components/game/CombatView";

export interface CombatOverlayProps {
  combat: any;
  c: any;
  cls: any;
  meleeW: any;
  rangedW: any;
  thinking: boolean;
  downed: boolean;
  combatMenu: string;
  setCombatMenu: (m: "" | "spell" | "item") => void;
  combatTargetId: string | null;
  setCombatTargetId: (uid: string) => void;
  powerAttackOn: boolean;
  setPowerAttackOn: (fn: (v: boolean) => boolean) => void;
  playerCombatAction: (kind: string, payload?: any) => void;
  onCastSpell: (idx: string) => void;
  knownSpellsList: string[];
  combatItems: string[];
}

export default function CombatOverlay({
  combat, c, cls, meleeW, rangedW, thinking, downed,
  combatMenu, setCombatMenu, combatTargetId, setCombatTargetId,
  powerAttackOn, setPowerAttackOn, playerCombatAction, onCastSpell,
  knownSpellsList, combatItems,
}: CombatOverlayProps) {
  if (!combat) return null;
  return (
    <div style={{ borderTop: "1px solid #6E3448", background: "#1A0F1C", padding: "10px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span className="dnd-display" style={{ color: "#C74B44", fontSize: 14 }}>⚔ ต่อสู้ · รอบที่ {combat.round}</span>
        <span style={{ fontSize: 11, color: "#8A7F9E" }}>🏃 เคลื่อนที่: {combat.movementLeft || 0} ฟุต</span>
      </div>

      {/* TACTICAL BATTLE GRID */}
      {combat.grid && combat.playerPos && (
        <div style={{ marginBottom: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* Battle grid SVG */}
          <div className="combat-grid-wrap" style={{ flex: "1 1 320px", minWidth: 280 }}>
            <svg viewBox={`0 0 ${combat.grid.w * 28} ${combat.grid.h * 28}`} style={{ width: "100%", maxWidth: 380, background: "#0F0A18", border: "1px solid #3A3054", borderRadius: 8 }}>
              {/* Grid lines */}
              {Array.from({ length: combat.grid.w + 1 }).map((_, i) => (
                <line key={"v"+i} x1={i * 28} y1={0} x2={i * 28} y2={combat.grid.h * 28} stroke="#2A2244" strokeWidth="0.5" />
              ))}
              {Array.from({ length: combat.grid.h + 1 }).map((_, i) => (
                <line key={"h"+i} x1={0} y1={i * 28} x2={combat.grid.w * 28} y2={i * 28} stroke="#2A2244" strokeWidth="0.5" />
              ))}
              {/* Clickable squares for movement */}
              {Array.from({ length: combat.grid.h }).map((_, ry) =>
                Array.from({ length: combat.grid.w }).map((_, rx) => {
                  const isPlayer = combat.playerPos.x === rx && combat.playerPos.y === ry;
                  const enemyAt = combat.enemies.find((e: any) => e.hpNow > 0 && combat.enemyPositions[e.uid]?.x === rx && combat.enemyPositions[e.uid]?.y === ry);
                  const deadEnemyAt = combat.enemies.find((e: any) => e.hpNow <= 0 && combat.enemyPositions[e.uid]?.x === rx && combat.enemyPositions[e.uid]?.y === ry);
                  const dist = gridDistance(combat.playerPos, { x: rx, y: ry });
                  const canMove = !isPlayer && !enemyAt && dist * 5 <= (combat.movementLeft || 0) && dist > 0 && !deadEnemyAt;
                  return (
                    <g key={`sq-${rx}-${ry}`}>
                      {/* Highlight movement range */}
                      {canMove && (
                        <rect x={rx * 28 + 1} y={ry * 28 + 1} width={26} height={26} fill="#1E3A2A" stroke="#3B6E5E" strokeWidth="0.5" opacity="0.6" style={{ cursor: "pointer" }}
                          onClick={() => !thinking && !downed && playerCombatAction("move", `${rx},${ry}`)} />
                      )}
                      {/* Player token */}
                      {isPlayer && (
                        <g>
                          <circle cx={rx * 28 + 14} cy={ry * 28 + 14} r={11} fill="#4A7FB5" stroke="#7FB5E0" strokeWidth="2" />
                          <text x={rx * 28 + 14} y={ry * 28 + 18} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">{c.name[0]}</text>
                        </g>
                      )}
                      {/* Enemy token */}
                      {enemyAt && (
                        <g>
                          <circle cx={rx * 28 + 14} cy={ry * 28 + 14} r={11} fill="#B53A3A" stroke="#E0766D" strokeWidth="2" />
                          <text x={rx * 28 + 14} y={ry * 28 + 18} textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700">{enemyAt.th[0]}</text>
                          {/* HP bar under enemy */}
                          <rect x={rx * 28 + 4} y={ry * 28 + 24} width={20} height={3} fill="#3A1A1A" />
                          <rect x={rx * 28 + 4} y={ry * 28 + 24} width={Math.max(0, 20 * (enemyAt.hpNow / enemyAt.hp))} height={3} fill={enemyAt.hpNow / enemyAt.hp > 0.5 ? "#7FA85C" : enemyAt.hpNow / enemyAt.hp > 0.25 ? "#E0A83E" : "#C74B44"} />
                        </g>
                      )}
                      {/* Dead enemy */}
                      {deadEnemyAt && (
                        <text x={rx * 28 + 14} y={ry * 28 + 18} textAnchor="middle" fontSize="14" opacity="0.4">💀</text>
                      )}
                    </g>
                  );
                })
              )}
            </svg>
            <div style={{ fontSize: 10, color: "#6B6284", marginTop: 4, textAlign: "center" }}>
              พื้นเขียว = เคลื่อนที่ได้ · ฟ้า = คุณ · แดง = ศัตรู (กดพื้นเขียวเพื่อเคลื่อนที่)
            </div>
          </div>

          {/* Initiative tracker — horizontal timeline strip */}
          <div style={{ flex: "0 1 200", minWidth: 120 }}>
            <div style={{ fontSize: 11, color: "#B9A96A", fontWeight: 700, marginBottom: 4 }}> Initiative</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {combat.initOrder && combat.initOrder.map((init: any, i: number) => {
              const isCurrent = i === combat.currentInitIdx;
              const isDead = !init.isPlayer && combat.enemies.find((e: any) => e.uid === init.uid)?.hpNow <= 0;
              const enemy = !init.isPlayer ? combat.enemies.find((e: any) => e.uid === init.uid) : null;
              const hpPct = enemy ? Math.max(0, (enemy.hpNow / enemy.hp) * 100) : 100;
              const hpColor = hpPct > 50 ? "#7FA85C" : hpPct > 25 ? "#E0A83E" : "#C74B44";
              return (
                <div key={init.uid} style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  padding: "4px 6px", borderRadius: 6, fontSize: 11, minWidth: 44, minHeight: 44,
                  justifyContent: "center",
                  background: isCurrent ? "#3A2F5C" : isDead ? "#1A1018" : "#1E1830",
                  border: isCurrent ? "2px solid #E0A83E" : "1px solid transparent",
                  opacity: isDead ? 0.4 : 1, position: "relative",
                  boxShadow: isCurrent ? "0 0 8px rgba(224,168,62,0.4)" : "none",
                }}>
                  <span style={{ color: isCurrent ? "#E0A83E" : isDead ? "#8A7F9E" : "#C9BFE0", fontSize: 10 }}>
                    {isCurrent ? "▶" : ""}{init.isPlayer ? "🧙" : "👹"}
                  </span>
                  <span style={{ color: "#8A7F9E", fontSize: 9, maxWidth: 50, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{init.name}</span>
                  <span style={{ color: "#6B6284", fontSize: 9 }}>{init.init}</span>
                  {isDead && <span style={{ fontSize: 8 }}>💀</span>}
                  {/* Mini HP bar for enemies */}
                  {enemy && !isDead && (
                    <div style={{ width: "100%", height: 3, background: "#241E38", borderRadius: 2, marginTop: 2 }}>
                      <div style={{ width: hpPct + "%", height: "100%", background: hpColor, borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        </div>
      )}

      <CombatEnemyList
        enemies={combat.enemies}
        selectedTargetId={combatTargetId}
        onSelectTarget={(uid) => setCombatTargetId(uid)}
        thinking={thinking}
        downed={downed}
      />
      {/* Task #14: companion card — the sidekick auto-assists at end of your turn */}
      {c.sidekick && SIDEKICK_BASES[c.sidekick.baseKey] && (() => {
        const skBlock = buildSidekick(SIDEKICK_BASES[c.sidekick.baseKey], c.sidekick.klass, Math.max(1, Math.min(10, c.sidekick.level || c.level || 1)));
        return (
          <div className="companion-card" style={{ border: "1px solid #3A3054", borderRadius: 8, padding: "8px 10px", margin: "6px 0", background: "rgba(58,47,92,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#C9BFE0", fontWeight: 700 }}>🐕 {skBlock.name}</span>
              <span style={{ fontSize: 11, color: "#8A7F9E" }}>{c.sidekick.klass} · Lv.{skBlock.level}</span>
            </div>
            <div style={{ fontSize: 11, color: "#8A7F9E", marginTop: 2 }}>
              AC {skBlock.ac} · to-hit +{skBlock.attack.toHit} · {skBlock.attack.damageDice}
              {skBlock.attack.damageBonus >= 0 ? `+${skBlock.attack.damageBonus}` : skBlock.attack.damageBonus}
              {skBlock.attacksPerAction > 1 ? ` ×${skBlock.attacksPerAction}` : ""} · โจมตีอัตโนมัติเมื่อจบเทิร์นคุณ
            </div>
          </div>
        );
      })()}
      {downed ? (
        <button className="btn btn-red" style={{ width: "100%", padding: 13 }} disabled={thinking} onClick={() => playerCombatAction("deathsave")}>
          💀 ทอย Death Saving Throw ({c.deathSaves.s}✓ / {c.deathSaves.f}✗)
        </button>
      ) : combatMenu === "spell" ? (
        <div>
          <div style={{ fontSize: 11, color: "#8A7F9E", marginBottom: 6 }}>กดเวทเพื่อร่ายที่ระดับพื้นฐาน</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, maxHeight: 280, overflowY: "auto" }}>
            {knownSpellsList.length === 0 && <div style={{ fontSize: 12, color: "#8A7F9E" }}>ยังไม่ได้เรียนเวท. เปิดสมุดเวทมนตร์ (📜 → เวทมนตร์) เพื่อเรียน</div>}
            {knownSpellsList.map((idx: string) => (
              <button key={idx} className="btn" style={{ textAlign: "left", padding: "6px 10px" }} disabled={thinking} onClick={() => onCastSpell(idx)}>
                ✨ <b>{idx.split("-").map((w:string)=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ")}</b>
              </button>
            ))}
            <button className="btn" onClick={() => setCombatMenu("")}>← กลับ</button>
          </div>
        </div>
      ) : combatMenu === "item" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {combatItems.length === 0 && <div style={{ fontSize: 13, color: "#8A7F9E", gridColumn: "1 / -1" }}>No usable combat items</div>}
          {combatItems.map((it: string, i: number) => (
            <button key={it + i} className="btn" disabled={thinking} onClick={() => playerCombatAction("item", it)}>🧪 {it}</button>
          ))}
          <button className="btn" onClick={() => setCombatMenu("")}>← กลับ</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* UX fix: Primary actions always visible */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button className="btn btn-gold" disabled={thinking} onClick={() => playerCombatAction("attack", combatTargetId)}>⚔️ โจมตี ({meleeW.th})</button>
            {rangedW && <button className="btn btn-gold" disabled={thinking} onClick={() => playerCombatAction("attack_ranged", combatTargetId)}>🏹 ยิง ({rangedW.th})</button>}
            {cls.caster && <button className="btn" disabled={thinking} onClick={() => setCombatMenu("spell")}>✨ ร่ายเวท</button>}
            <button className="btn" disabled={thinking || combatItems.length === 0} onClick={() => setCombatMenu("item")}>🧪 ไอเทม ({combatItems.length})</button>
          </div>
          {/* Task #14: GWM/Sharpshooter −5/+10 power-attack toggle (only shown if the feat is held) */}
          {hasPowerAttackFeat(c.feats || []) && (
            <button
              className={"btn" + (powerAttackOn ? " btn-gold" : "")}
              style={{ fontSize: 12, padding: "5px 10px" }}
              disabled={thinking}
              onClick={() => setPowerAttackOn((v) => !v)}
              title="−5 to-hit / +10 damage (อาวุธ Heavy melee สำหรับ GWM, อาวุธ ranged สำหรับ Sharpshooter)"
            >
              🎯 Power Attack −5/+10: {powerAttackOn ? "เปิด" : "ปิด"}
            </button>
          )}
          {/* Secondary actions — class features + tactical */}
          <details style={{ marginTop: 2 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "#8A7F9E", padding: "4px 0" }}>การกระทำเพิ่มเติม</summary>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
              {hasFeature(c, "second_wind") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.secondWindUsed} onClick={() => playerCombatAction("second_wind")}>🛡️ Second Wind</button>}
              {hasFeature(c, "action_surge") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.actionSurgeUsed} onClick={() => playerCombatAction("action_surge")}>⚡ Action Surge</button>}
              {hasFeature(c, "rage") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.raging || c.rageUsed >= (c.level >= 6 ? 4 : c.level >= 3 ? 3 : 2)} onClick={() => playerCombatAction("rage")}>🔥 Rage</button>}
              {hasFeature(c, "lay_on_hands") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.layOnHandsPool <= 0 || c.hp >= c.maxHp} onClick={() => playerCombatAction("lay_on_hands")}>🤲 LoH ({c.layOnHandsPool})</button>}
              {hasFeature(c, "martial_arts") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.kiUsed >= c.level} onClick={() => playerCombatAction("ki_flurry")}>🥋 Flurry (1ki)</button>}
              {hasFeature(c, "bardic_inspiration") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.bardicInspirationUsed >= (mod(c.abilities.cha) || 1)} onClick={() => playerCombatAction("bardic_inspiration")}>🎵 Bardic</button>}
              {c.heroicInspiration && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("heroic_inspiration")}>⭐ Heroic</button>}
              {hasFeature(c, "preserve_life") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.preserveLifeUsed} onClick={() => playerCombatAction("preserve_life")}>🕊️ Preserve</button>}
              {hasFeature(c, "sneak_attack") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("hide")}>🌫️ ซ่อน</button>}
              <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("dodge")}>🌀 Dodge</button>
              <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("dash")}>🏃 Dash</button>
              <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("help")}>🤝 Help</button>
              <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("ready")}>⏰ Ready</button>
              <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("search")}>🔍 Search</button>
              <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("disengage")}>🚶 Disengage</button>
              <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("grapple")}>🤼 จับตรึง</button>
              <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("shove")}>💪 ผลัก/ล้ม</button>
              {canDualWield(c) && !combat?.bonusUsed && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("dual_wield")}>⚔️⚔️ มือนอก</button>}
              {(c.worn || []).includes("Ring of Invisibility") && !combat.invisible && (
                <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("invisible")}>🫥 ล่องหน</button>
              )}
            </div>
          </details>
          <button className="btn btn-red" disabled={thinking} onClick={() => playerCombatAction("flee")}>🏃 หนี</button>
        </div>
      )}
    </div>
  );
}
