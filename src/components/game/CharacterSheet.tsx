"use client";

import React from "react";
import {
  ABILS, ABIL_TH, mod, profByLevel, XP_THRESHOLDS, SKILLS, CONDITIONS_TH,
  BACKGROUNDS, RACES, CLASSES, weaponByName, ARMOR, MAGIC_ITEMS, CONSUMABLES,
  passivePerception, gameTimeToString, ALIGNMENTS, ORIGIN_FEATS,
} from "@/lib/gameData";
import { computeAC, spellAtkMod, spellDC } from "@/lib/spells";
import { getExtendedFeatures } from "@/lib/featuresExtended";
import type { NormalizedSpell } from "@/lib/srd";
import {
  rollFormula, hasFeature, skillMod, saveMod, attackMod, sneakDice, SRD_OK,
} from "../DnDSolo";

export interface CharacterSheetProps {
  c: any;
  cls: any;
  meleeW: any;
  rangedW: any;
  gameTime: { day: number; hour: number };
  maxSpellLv: number;
  knownSpellsList: string[];
  sheetTab: "stats" | "skills" | "items" | "spells";
  setSheetTab: (t: "stats" | "skills" | "items" | "spells") => void;
  setSheetOpen: (open: boolean) => void;
  log: any[];
  scene: string;
  combat: any;
  history: any[];
  thinking: boolean;
  setC: (c: any) => void;
  setLog: (l: any[]) => void;
  persist: (cc: any, sc: string, lg: any[], cb: any, hist: any[]) => void;
  entrySystem: (text: string) => any;
  viewSpellDetail: (index: string) => void;
  openSpellBrowser: () => void;
  learnSpell: (index: string) => void;
  spellBrowserLoading: boolean;
  spellBrowserOpen: boolean;
  availableSpells: { index: string; name: string; level: number }[];
  spellDetail: NormalizedSpell | null;
  spellDetailLoading: boolean;
}

export default function CharacterSheet({
  c, cls, meleeW, rangedW, gameTime, maxSpellLv, knownSpellsList,
  sheetTab, setSheetTab, setSheetOpen, log, scene, combat, history, thinking,
  setC, setLog, persist, entrySystem, viewSpellDetail, openSpellBrowser, learnSpell,
  spellBrowserLoading, spellBrowserOpen, availableSpells, spellDetail, spellDetailLoading,
}: CharacterSheetProps) {
  return (
        <div className="sheet-overlay" onClick={() => setSheetOpen(false)}>
          <div className="sheet-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 0" }}>
              <div>
                <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>{c.name}</span>
                <span style={{ fontSize: 12, color: "#8A7F9E", marginLeft: 8 }}>{RACES[c.race].th} {cls.th} · Level {c.level}{c.background && BACKGROUNDS[c.background] ? ` · ${BACKGROUNDS[c.background].th}` : ""}</span>
              </div>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setSheetOpen(false)}>✕</button>
            </div>
            <div className="sheet-tabs">
              {[["stats", "ค่าสถานะ"], ["skills", "สกิล"], ["items", "อุปกรณ์"], ["spells", "เวทมนตร์"]].map(([k, label]) => (
                <div key={k as string} className={"sheet-tab" + (sheetTab === k ? " active" : "")} onClick={() => setSheetTab(k as any)}>{label as string}</div>
              ))}
            </div>
            <div className="sheet-body">
              {sheetTab === "stats" && (
                <div>
                  <div className="abil-grid">
                    {ABILS.map((a) => (
                      <div key={a} className="abil-box">
                        <div className="name">{ABIL_TH[a]}</div>
                        <div className="modv">{mod(c.abilities[a]) >= 0 ? "+" : ""}{mod(c.abilities[a])}</div>
                        <div className="score">{c.abilities[a]}</div>
                      </div>
                    ))}
                  </div>
                  <div className="sec-label">การต่อสู้</div>
                  <div style={{ fontSize: 13, lineHeight: 1.9 }}>
                    🛡 AC <b>{c.ac}</b> · ❤️ HP <b>{c.hp}/{c.maxHp}</b>{(c.tempHp || 0) > 0 && <span style={{ color: "#7FB5E0" }}> +{c.tempHp} temp</span>} · Proficiency <b>+{profByLevel(c.level)}</b> · ⛺ Hit Dice <b>{c.hitDiceLeft}/{c.level}</b> (d{cls.hitDie})<br />
                    ⚔️ {meleeW.th}: to-hit <b>+{attackMod(c, meleeW)}</b>, damage <b>{meleeW.dmg}{mod(c.abilities[meleeW.abil]) >= 0 ? "+" : ""}{mod(c.abilities[meleeW.abil])}</b>
                    {rangedW && (<><br />🏹 {rangedW.th}: to-hit <b>+{attackMod(c, rangedW)}</b>, damage <b>{rangedW.dmg}{mod(c.abilities[rangedW.abil]) >= 0 ? "+" : ""}{mod(c.abilities[rangedW.abil])}</b></>)}
                    {cls.caster && (<><br />✨ Spell attack <b>+{spellAtkMod(c)}</b> · Spell save DC <b>{spellDC(c)}</b> · Max spell level <b>{maxSpellLv}</b></>)}
                    <br />👁️ Passive Perception: <b>{passivePerception(c)}</b> · 🏃 Speed: <b>{c.speed || 30} ft</b> · ⏰ เวลา: <b>{gameTimeToString(gameTime)}</b>
                    {hasFeature(c, "lay_on_hands") && <><br />🤲 Lay on Hands pool: <b>{c.layOnHandsPool} HP</b></>}
                    {hasFeature(c, "martial_arts") && <><br />🥋 Ki: <b>{c.level - c.kiUsed}/{c.level}</b></>}
                    {hasFeature(c, "rage") && <><br />🔥 Rage uses: <b>{(c.level >= 6 ? 4 : c.level >= 3 ? 3 : 2) - c.rageUsed}/{c.level >= 6 ? 4 : c.level >= 3 ? 3 : 2}</b></>}
                    {hasFeature(c, "bardic_inspiration") && <><br />🎵 Bardic Inspiration: <b>{(mod(c.abilities.cha) || 1) - c.bardicInspirationUsed}/{mod(c.abilities.cha) || 1}</b></>}
                    {hasFeature(c, "sorcery_points") && <><br />💫 Sorcery Points: <b>{c.sorceryPoints}</b></>}
                    <br />⚖️ Alignment: <b>{ALIGNMENTS.find(a => a.id === c.alignment)?.th || c.alignment || "—"}</b>
                    <br />🗣️ ภาษา: <b>{(c.languages || ["Common"]).join(", ")}</b>
                    {c.originFeat && ORIGIN_FEATS[c.originFeat] && <><br />🎯 Origin Feat: <b style={{ color: "#7FA85C" }}>{ORIGIN_FEATS[c.originFeat].th}</b> — {ORIGIN_FEATS[c.originFeat].descriptionTh}</>}
                    {c.toolProficiencies && c.toolProficiencies.length > 0 && <><br />🔧 เครื่องมือ: <b>{c.toolProficiencies.join(", ")}</b></>}
                    {RACES[c.race]?.traits && <><br />🧬 คุณสมบัติเผ่าพันธุ์: <b>{RACES[c.race].traits.join(", ")}</b></>}
                  </div>
                  <div className="sec-label">Saving Throws (การพลิกแพ่ง)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 13 }}>
                    {ABILS.map((a) => (
                      <div key={a}>
                        <span className={CLASSES[c.cls].saves.includes(a) ? "prof" : ""} style={CLASSES[c.cls].saves.includes(a) ? { color: "#E0A83E" } : {}}>
                          {CLASSES[c.cls].saves.includes(a) ? "◆" : "◇"} {ABIL_TH[a]}
                        </span> {saveMod(c, a) >= 0 ? "+" : ""}{saveMod(c, a)}
                      </div>
                    ))}
                  </div>
                  <div className="sec-label">ความสามารถประจำคลาส</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                    {/* Phase 2: use extended features (Lv.1-20) */}
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((lv) => ((getExtendedFeatures()[c.cls]?.[lv]) || []).map((f: any) => {
                      const unlocked = c.level >= lv;
                      let status: string | null = null;
                      if (unlocked) {
                        if (f.k === "second_wind") status = c.secondWindUsed ? "used" : "ready";
                        if (f.k === "action_surge") status = c.actionSurgeUsed ? "used" : "ready";
                        if (f.k === "preserve_life") status = c.preserveLifeUsed ? "used" : "ready";
                        if (f.k === "arcane_recovery") status = c.arcaneRecoveryUsed ? "used" : "ready";
                        if (f.k === "sneak_attack") status = `+${sneakDice(c.level)}d6`;
                      }
                      return (
                        <div key={f.k + lv} style={{ marginBottom: 6, opacity: unlocked ? 1 : 0.4 }}>
                          <b style={{ color: unlocked ? "#E0A83E" : "#8A7F9E", fontSize: 12 }}>{unlocked ? "◆" : "🔒"} Lv.{lv} — {f.th}</b>
                          {status && <span style={{ fontSize: 10, color: status.includes("used") ? "#C74B44" : "#7FA85C", marginLeft: 6 }}>[{status}]</span>}
                          <div style={{ fontSize: 11, color: "#9C92B8" }}>{f.desc}</div>
                        </div>
                      );
                    }))}
                    {cls.caster && (
                      <div style={{ marginTop: 8 }}>Spell slots: {c.slotsMax.map((m: number, i: number) => `Lv${i + 1} ${c.slots[i]}/${m}`).join(" · ")}</div>
                    )}
                  </div>
                  <div className="sec-label">สภาวะ (Conditions)</div>
                  <div style={{ fontSize: 12 }}>
                    {c.conditions.length === 0 ? <span style={{ color: "#7FA85C" }}>No active conditions</span>
                      : c.conditions.map((cd: string) => <span key={cd} className="chip">{CONDITIONS_TH[cd]?.split(" (")[0] || cd}</span>)}
                  </div>
                  <div className="sec-label">ความคืบหน้า</div>
                  <div style={{ fontSize: 13 }}>
                    XP {c.xp}{c.level < 20 ? ` / ${XP_THRESHOLDS[c.level]} (${XP_THRESHOLDS[c.level] - c.xp} to Lv.${c.level + 1})` : " (max level)"}
                  </div>
                </div>
              )}
              {sheetTab === "skills" && (
                <div>
                  <div style={{ fontSize: 12, color: "#8A7F9E", marginBottom: 8 }}>◆ = proficient (+{profByLevel(c.level)}) · ◆◆ = Expertise (×{profByLevel(c.level) * 2})</div>
                  {(c.pendingExpertise || 0) > 0 && (
                    <div style={{ padding: 8, background: "#2A2030", border: "1px solid #E0A83E", borderRadius: 6, marginBottom: 10 }}>
                      <div style={{ color: "#E0A83E", fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                        🎯 Expertise unlock! เลือก {c.pendingExpertise} สกิล (ต้อง proficient ก่อน) — PB ×2
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                        {Object.entries(SKILLS).filter(([k]) => {
                          const prof = CLASSES[c.cls].skills.includes(k) || (c.extraSkills || []).includes(k);
                          const alreadyExp = (c.expertise || []).includes(k);
                          return prof && !alreadyExp;
                        }).map(([k, s]) => (
                          <button key={k} className="btn" style={{ padding: "4px 8px", fontSize: 10 }}
                            onClick={() => {
                              const nc = { ...c, expertise: [...(c.expertise || []), k], pendingExpertise: c.pendingExpertise - 1 };
                              setC(nc); setLog([...log, entrySystem(`🎯 เลือก Expertise: ${s.th} (PB ×2)`)]);
                              persist(nc, scene, [...log, entrySystem(`🎯 Expertise: ${s.th}`)], combat, history);
                            }}>
                            {s.th.split(" (")[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {Object.entries(SKILLS).map(([k, s]) => {
                    const prof = CLASSES[c.cls].skills.includes(k) || (c.extraSkills || []).includes(k);
                    const fromBg = !CLASSES[c.cls].skills.includes(k) && (c.extraSkills || []).includes(k);
                    const expertise = (c.expertise || []).includes(k);
                    const m = skillMod(c, k);
                    return (
                      <div key={k} className="skill-row">
                        <span className={prof ? "prof" : ""}>{expertise ? "◆◆" : prof ? "◆" : "◇"} {s.th} <span style={{ color: "#6B6284", fontSize: 11 }}>({ABIL_TH[s.abil]}{fromBg ? " · bg" : ""})</span></span>
                        <b>{m >= 0 ? "+" : ""}{m}</b>
                      </div>
                    );
                  })}
                </div>
              )}
              {sheetTab === "items" && (
                <div>
                  <div className="sec-label">สวมใส่ / ถืออยู่</div>
                  <div className="item-row">⚔️ <b>{meleeW.th}</b> — {meleeW.dmg} ({ABIL_TH[meleeW.abil]}){meleeW.plus ? ` · +${meleeW.plus}` : ""}{meleeW.venom ? ` · 🐍 venom ${c.venomUsed ? "used" : "ready"}` : ""}</div>
                  {rangedW && <div className="item-row">🏹 <b>{rangedW.th}</b> — {rangedW.dmg} ({ABIL_TH[rangedW.abil]}){rangedW.plus ? ` · +${rangedW.plus}` : ""}</div>}
                  <div className="item-row">🛡 {(c.worn || []).find((n: string) => MAGIC_ITEMS[n] && MAGIC_ITEMS[n].slot === "armor") || "Class armor"} — AC {c.ac}</div>
                  {(c.worn || []).filter((n: string) => !(MAGIC_ITEMS[n] && MAGIC_ITEMS[n].slot === "armor")).map((n: string) => (
                    <div key={n} className="item-row">✨ <b>{n}</b> <span style={{ fontSize: 11, color: "#8A7F9E" }}>— {MAGIC_ITEMS[n] ? MAGIC_ITEMS[n].desc : ""}</span></div>
                  ))}
                  <div className="sec-label">เป้สัมภาระ ({c.inventory.length})</div>
                  {c.inventory.length === 0 ? <div style={{ fontSize: 13, color: "#8A7F9E" }}>Empty</div>
                    : c.inventory.map((it: string, i: number) => {
                      const wEntry = weaponByName(it);
                      const consum = CONSUMABLES[it];
                      const magic = MAGIC_ITEMS[it];
                      const armor = ARMOR[it];
                      const isEquipped = wEntry && (wEntry[0] === c.weapon || wEntry[0] === c.ranged);
                      const isWorn = (c.worn || []).includes(it);
                      return (
                        <div key={i} className="item-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12 }}>
                            {wEntry ? (wEntry[1].ranged ? "🏹" : "⚔️") : magic ? "✨" : armor ? "🛡" : consum ? "🧪" : "🎒"} {it}{isEquipped ? " (equipped)" : ""}{isWorn ? " (worn)" : ""}
                            {(magic||armor) && <span style={{ display: "block", fontSize: 10, color: "#8A7F9E" }}>{magic?.desc || (armor ? `AC ${armor.acBase}${armor.dexBonus ? "+DEX" : ""}${armor.maxDex ? ` (max ${armor.maxDex})` : ""}` : "")}</span>}
                          </span>
                          <div style={{ display: "flex", gap: 4 }}>
                            {wEntry && !isEquipped && (
                              <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => {
                                const [wk, w] = wEntry;
                                const cc = w.ranged ? { ...c, ranged: wk } : { ...c, weapon: wk };
                                const finalLog = [...log, entrySystem(`Switched weapon: ${w.th}`)];
                                setC(cc); setLog(finalLog); persist(cc, scene, finalLog, combat, history);
                              }}>Equip</button>
                            )}
                            {(magic || armor) && (
                              <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => {
                                let worn = [...(c.worn || [])];
                                const entries: any[] = [];
                                const slot = magic?.slot || armor?.slot || "armor";
                                if (isWorn) {
                                  worn = worn.filter((n) => n !== it);
                                  entries.push(entrySystem(`Unequipped ${it}`));
                                } else {
                                  worn = worn.filter((n) => !((MAGIC_ITEMS[n]||ARMOR[n]) && (MAGIC_ITEMS[n]?.slot || ARMOR[n]?.slot) === slot));
                                  worn.push(it);
                                  entries.push(entrySystem(`✨ Equipped ${it}`));
                                }
                                const cc = { ...c, worn };
                                const oldAc = cc.ac;
                                cc.ac = computeAC(cc);
                                if (cc.ac !== oldAc) entries.push(entrySystem(`🛡 AC ${oldAc} → ${cc.ac}`));
                                const finalLog = [...log, ...entries];
                                setC(cc); setLog(finalLog); persist(cc, scene, finalLog, combat, history);
                              }}>{isWorn ? "Unequip" : "Wear"}</button>
                            )}
                            {consum && !combat && !thinking && (
                              <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => {
                                const cc = { ...c, inventory: [...c.inventory] };
                                cc.inventory.splice(i, 1);
                                const entries: any[] = [];
                                if (consum.heal) {
                                  const h = rollFormula(consum.heal);
                                  cc.hp = Math.min(cc.maxHp, cc.hp + h.total);
                                  entries.push(entrySystem(`🧪 Used ${it}: healed ${h.total} HP → ${cc.hp}/${cc.maxHp}`));
                                }
                                if (consum.cure) {
                                  const ci = cc.conditions.indexOf(consum.cure);
                                  cc.conditions = [...cc.conditions];
                                  if (ci >= 0) { cc.conditions.splice(ci, 1); entries.push(entrySystem(`🧪 Cured ${consum.cure}`)); }
                                  else entries.push(entrySystem(`🧪 No ${consum.cure} to cure (wasted)`));
                                }
                                const finalLog = [...log, ...entries];
                                setC(cc); setLog(finalLog); persist(cc, scene, finalLog, combat, history);
                              }}>Use</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  <div className="sec-label">ทรัพย์สิน</div>
                  <div className="item-row">💰 {c.gold} gold pieces</div>
                </div>
              )}
              {sheetTab === "spells" && cls.caster && (
                <div>
                  <div className="sec-label">เวทมนตร์ที่รู้ ({knownSpellsList.length})</div>
                  {knownSpellsList.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#8A7F9E" }}>ยังไม่ได้เรียนเวท. หา spell scroll หรือหาอาจารย์สอนเวท</div>
                  ) : (
                    knownSpellsList.map((idx: string) => (
                      <div key={idx} className="spell-row known" onClick={() => viewSpellDetail(idx)}>
                        <b style={{ color: "#E0A83E" }}>{idx.split("-").map((w:string)=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ")}</b>
                        <button className="btn" style={{ padding: "2px 8px", fontSize: 10, marginLeft: 8 }} onClick={(e) => { e.stopPropagation(); viewSpellDetail(idx); }}>Details</button>
                      </div>
                    ))
                  )}
                  <div style={{ marginTop: 14 }}>
                    <button className="btn btn-gold" style={{ width: "100%" }} disabled={!SRD_OK || spellBrowserLoading} onClick={openSpellBrowser}>
                      {spellBrowserLoading ? "กำลังโหลดเวท SRD..." : "📖 ค้นหาเวท SRD ทั้งหมด (เรียนรู้)"}
                    </button>
                  </div>
                  {spellBrowserOpen && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, color: "#8A7F9E", marginBottom: 6 }}>
                        มีเวท {availableSpells.length} อันให้ {cls.th} (Lv.0–{maxSpellLv}) กดเพื่อเรียน
                      </div>
                      <div style={{ maxHeight: 300, overflowY: "auto" }}>
                        {availableSpells.map((sp) => {
                          const known = knownSpellsList.includes(sp.index);
                          return (
                            <div key={sp.index} className={"spell-row" + (known ? " known" : "")} onClick={() => viewSpellDetail(sp.index)}>
                              <span style={{ fontSize: 12 }}>
                                <b style={{ color: known ? "#6FB3AB" : "#E0A83E" }}>{sp.level === 0 ? "Cantrip" : `Lv.${sp.level}`}</b> {sp.name}
                              </span>
                              {!known && <button className="btn" style={{ padding: "2px 8px", fontSize: 10, float: "right" }} onClick={(e) => { e.stopPropagation(); learnSpell(sp.index); }}>Learn</button>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {spellDetailLoading && <div style={{ fontSize: 12, color: "#8A7F9E", marginTop: 10 }}>Loading spell details...</div>}
                  {spellDetail && (
                    <div className="panel" style={{ padding: 12, marginTop: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: "#E0A83E", fontSize: 14 }}>{spellDetail.name}</div>
                      <div style={{ color: "#9C92B8", marginTop: 4 }}>
                        Lv.{spellDetail.level} {spellDetail.school} · {spellDetail.casting_time} · {spellDetail.range} · {spellDetail.duration}{spellDetail.concentration ? " (concentration)" : ""}{spellDetail.ritual ? " (ritual)" : ""}
                      </div>
                      <div style={{ marginTop: 6, color: "#C9BFE0" }}>{spellDetail.desc}</div>
                      {spellDetail.higher_level && <div style={{ marginTop: 4, color: "#8A7F9E", fontSize: 11 }}>Upcast: {spellDetail.higher_level}</div>}
                      <div style={{ marginTop: 6, fontSize: 11, color: "#B9A96A" }}>
                        Components: {spellDetail.components.join(", ")} · Classes: {spellDetail.classes.join(", ")}
                      </div>
                      {spellDetail.damage && <div style={{ marginTop: 4, color: "#E0766D", fontSize: 11 }}>Damage: {spellDetail.damage} {spellDetail.damageType} ({spellDetail.damageScaling})</div>}
                      {spellDetail.heal && <div style={{ marginTop: 4, color: "#7FA85C", fontSize: 11 }}>Heal: {spellDetail.heal}</div>}
                      {spellDetail.saveAbility && <div style={{ marginTop: 4, color: "#E0A83E", fontSize: 11 }}>Save: {spellDetail.saveAbility.toUpperCase()} ({spellDetail.saveSuccess})</div>}
                    </div>
                  )}
                </div>
              )}
              {sheetTab === "spells" && !cls.caster && (
                <div style={{ fontSize: 13, color: "#8A7F9E", textAlign: "center", padding: 30 }}>{cls.th} is not a spellcaster</div>
              )}
            </div>
          </div>
        </div>
  );
}
