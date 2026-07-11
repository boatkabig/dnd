"use client";

import { useState } from "react";
import {
  ABILS, ABIL_TH, mod, SKILLS, BACKGROUNDS, RACES, CLASSES, WEAPONS,
  ALIGNMENTS, LANGUAGES, ORIGIN_FEATS,
} from "@/lib/gameData";
import { srdListSpells } from "@/lib/srd";
import { d, makeCharacter, SRD_OK } from "@/lib/dndSoloShared";

export default function CharacterCreation({ onComplete, onCancel }: { onComplete: (character: any) => void; onCancel: () => void }) {
  // Character creation state
  const [ccStep, setCcStep] = useState(0); // 0-11 steps
  const [ccName, setCcName] = useState("");
  const [ccRace, setCcRace] = useState("human");
  const [ccClass, setCcClass] = useState("fighter");
  const [ccBg, setCcBg] = useState("soldier");
  const [ccAbilityMethod, setCcAbilityMethod] = useState<"array" | "pointbuy" | "roll">("array");
  const [ccAbilityScores, setCcAbilityScores] = useState<Record<string, number>>({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
  const [ccPickedSkills, setCcPickedSkills] = useState<string[]>([]);
  const [ccExpertise, setCcExpertise] = useState<string[]>([]);
  const [ccPickedEquipment, setCcPickedEquipment] = useState<string[]>([]);
  const [ccPickedSpells, setCcPickedSpells] = useState<string[]>([]);
  const [ccDetails, setCcDetails] = useState({ age: "", height: "", appearance: "", ideal: "", bond: "", flaw: "", backstory: "" });
  // D&D 2024 character creation: alignment + languages + personality
  const [ccAlignment, setCcAlignment] = useState<string>("true_neutral");
  const [ccLanguages, setCcLanguages] = useState<string[]>([]);
  const [ccPersonality, setCcPersonality] = useState<string>("");
  // Background ASI choices (D&D 2024 — player picks +2/+1 or +1/+1/+1)
  const [ccBgAsiPlus2, setCcBgAsiPlus2] = useState<string>("");  // ability that gets +2 (or first of +1/+1/+1)
  const [ccBgAsiPlus1, setCcBgAsiPlus1] = useState<string>("");  // ability that gets +1
  const [ccSpellChoices, setCcSpellChoices] = useState<{ index: string; name: string; level: number }[]>([]);
  const [ccSpellChoicesLoading, setCcSpellChoicesLoading] = useState(false);

  function handleFinish() {
    if (!ccName.trim()) return;
    // Build bgAsi array from ccBgAsiPlus2 + ccBgAsiPlus1
    // If user didn't pick, use background defaults
    let bgAsi: string[] = [];
    if (ccBgAsiPlus2 && ccBgAsiPlus1) {
      // +2/+1 → same ability twice + 1 other
      bgAsi = [ccBgAsiPlus2, ccBgAsiPlus2, ccBgAsiPlus1];
    } else if (ccBgAsiPlus2) {
      bgAsi = [ccBgAsiPlus2, ccBgAsiPlus2];
    } else {
      // Fallback: use background defaults from BACKGROUNDS[bg].asi
      const bgDef = BACKGROUNDS[ccBg];
      if (bgDef?.asi?.primary && bgDef?.asi?.secondary) {
        // primary[0] gets +2, secondary[0] gets +1
        bgAsi = [bgDef.asi.primary[0], bgDef.asi.primary[0], bgDef.asi.secondary[0]];
      }
    }
    const cc = makeCharacter(ccName.trim(), ccRace, ccClass, ccBg, {
      abilities: ccAbilityScores,
      extraSkills: ccPickedSkills.filter(s => !BACKGROUNDS[ccBg].skills.includes(s)),
      expertise: ccExpertise,
      equipment: ccPickedEquipment,
      knownSpells: ccPickedSpells,
      details: ccDetails,
      alignment: ccAlignment,
      languages: ccLanguages,
      bgAsi,
    });
    onComplete(cc);
  }

    const STEPS = [
      "คอนเซ็ปต์", "อาชีพ", "เผ่าพันธุ์", "ภูมิหลัง", "Ability Scores", "สกิล", "อุปกรณ์", "เวทมนตร์", "Alignment", "บุคลิก/ลักษณะ", "ตรวจสอบ"
    ];
    // Step blocks now use these keys instead of raw ccStep numbers — order-agnostic
    const STEP_KEYS = ["concept", "class", "species", "background", "abilities", "skills", "equipment", "spells", "alignment", "details", "review"];
    const stepKey = STEP_KEYS[ccStep] || "concept";
    const cls0 = CLASSES[ccClass];
    const race0 = RACES[ccRace];
    const bg0 = BACKGROUNDS[ccBg];
    const preview = makeCharacter(ccName || "?", ccRace, ccClass, ccBg, {
      abilities: ccAbilityScores,
      extraSkills: ccPickedSkills.filter(s => !bg0.skills.includes(s)),
      expertise: ccExpertise,
      equipment: ccPickedEquipment,
      knownSpells: ccPickedSpells,
    });
    const classSkills = cls0.skills || [];
    const bgSkills = bg0.skills || [];
    const numClassSkillPicks = ccClass === "rogue" ? 4 : 2;
    // D&D 5e/2024: Rogue gets Expertise at Lv.1; Bard at Lv.3; Knowledge Cleric at Lv.1.
    // We're creating a Lv.1 character, so only Rogue (and Knowledge Cleric if subclass chosen) qualifies.
    const canExpertise = ccClass === "rogue";

    // Point Buy helper
    const POINT_BUY_COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
    const pointBuySpent = ABILS.reduce((sum, a) => sum + (POINT_BUY_COSTS[ccAbilityScores[a]] ?? 0), 0);

    // Roll abilities
    function rollAbilities() {
      const rolled: Record<string, number> = {};
      ABILS.forEach((a) => {
        const rolls = [d(6), d(6), d(6), d(6)].sort((x, y) => y - x);
        rolled[a] = rolls[0] + rolls[1] + rolls[2];
      });
      setCcAbilityScores(rolled);
    }

    return (
      <div className="dnd-root">

        <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", padding: 16, flex: 1, minHeight: 0, overflowY: "auto", boxSizing: "border-box" }}>
          {/* Progress bar */}
          <div style={{ display: "flex", gap: 2, marginBottom: 16, overflowX: "auto" }}>
            {STEPS.map((label, i) => (
              <div key={i} style={{
                flex: 1, minWidth: 50, textAlign: "center", padding: "4px 2px", fontSize: 9,
                borderRadius: 4, whiteSpace: "nowrap",
                background: i === ccStep ? "#E0A83E" : i < ccStep ? "#3A2F5C" : "#1E1830",
                color: i === ccStep ? "#1B1530" : i < ccStep ? "#E0A83E" : "#6B6284",
                fontWeight: i === ccStep ? 700 : 400,
              }}>{i + 1}. {label}</div>
            ))}
          </div>

          {/* Step content */}
          <div style={{ minHeight: 280 }}>
            {ccStep === 0 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 1: คอนเซ็ปต์ตัวละคร</h2>
                <div style={{ fontSize: 13, color: "#9C92B8", marginBottom: 14, lineHeight: 1.6 }}>
                  คิดถึงตัวละครของคุณ: เขาเป็นใคร? มาจากไหน? ทำไมถึงออกผจญภัย?<br/>
                  คอนเซ็ปต์จะช่วยเลือกเผ่าพันธุ์ อาชีพ และภูมิหลังในขั้นตอนต่อไป
                </div>
                <input className="input-main" style={{ width: "100%", boxSizing: "border-box", marginBottom: 10 }} placeholder="ชื่อตัวละคร..." value={ccName} onChange={(e) => setCcName(e.target.value)} />
                <div className="panel" style={{ padding: 12, fontSize: 12, color: "#9C92B8", lineHeight: 1.6 }}>
                  <b style={{ color: "#E0A83E" }}>ตัวอย่างคอนเซ็ปต์:</b><br/>
                  • โจรนักฆ่าที่เติบโตในสลัม → Rogue + Criminal<br/>
                  • พาลาดินที่ล่าปีศาจ → Paladin + Soldier<br/>
                  • นักเวทผู้ตามหาความรู้ต้องห้าม → Wizard + Sage<br/>
                  • นักล่าสมบัติในทะเลทราย → Ranger + Outlander
                </div>
              </div>
            )}

            {ccStep === 2 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 3: เลือกเผ่าพันธุ์ (Species)</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>เผ่าพันธุ์กำหนดความเร็ว ขนาด ความสามารถพิเศษ และภาษา</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {Object.entries(RACES).map(([k, r]: any) => (
                    <div key={k} className={"cc-opt" + (ccRace === k ? " sel" : "")} onClick={() => setCcRace(k)} style={{ padding: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{r.th}</div>
                      <div style={{ fontSize: 10, color: "#8A7F9E" }}>{Object.entries(r.bonus).map(([a, v]: any) => `${ABIL_TH[a]}+${v}`).join(" ")}</div>
                      <div style={{ fontSize: 9, color: "#6B6284" }}>ความเร็ว {r.speed} ฟุต</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ccStep === 1 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 2: เลือกอาชีพ (Class)</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>อาชีพกำหนด HP, Hit Dice, Saving Throws, สกิล, อาวุธ, เกราะ, เวท, subclass</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {Object.entries(CLASSES).map(([k, cl]: any) => (
                    <div key={k} className={"cc-opt" + (ccClass === k ? " sel" : "")} onClick={() => { setCcClass(k); setCcPickedSkills([]); setCcExpertise([]); }} style={{ padding: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{cl.th}</div>
                      <div style={{ fontSize: 10, color: "#8A7F9E" }}>d{cl.hitDie} {cl.caster ? "✨" : "⚔️"}</div>
                    </div>
                  ))}
                </div>
                <div className="panel" style={{ padding: 10, marginTop: 12, fontSize: 11, color: "#B9A96A" }}>
                  <b>{cls0.th}</b>: {cls0.feature}
                </div>
              </div>
            )}

            {ccStep === 4 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 5: กำหนด Ability Scores (รวม ASI จาก Background)</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 10 }}>
                  เลือกวิธีกำหนดค่า 6 อย่าง (STR, DEX, CON, INT, WIS, CHA) — รวมโบนัสเผ่าพันธุ์แล้วแสดงในวงเล็บ
                </div>
                {/* Method selector */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {(["array", "pointbuy", "roll"] as const).map((m) => (
                    <button key={m} className={"btn" + (ccAbilityMethod === m ? " btn-gold" : "")} style={{ flex: 1, fontSize: 12, padding: "6px" }}
                      onClick={() => {
                        setCcAbilityMethod(m);
                        if (m === "array") setCcAbilityScores({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
                        if (m === "pointbuy") setCcAbilityScores({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
                      }}>
                      {m === "array" ? "Standard Array" : m === "pointbuy" ? `Point Buy (${27 - pointBuySpent}/27)` : "ทอยเต๋า 4d6"}
                    </button>
                  ))}
                </div>
                {ccAbilityMethod === "roll" && (
                  <button className="btn" style={{ marginBottom: 10, fontSize: 12 }} onClick={rollAbilities}>🎲 ทอย 4d6 ทั้ง 6 ค่า</button>
                )}
                {/* Ability scores */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {ABILS.map((a) => {
                    const score = ccAbilityScores[a];
                    const withRace = score + (race0.bonus[a] || 0);
                    const m0 = mod(withRace);
                    return (
                      <div key={a} className="abil-box" style={{ padding: 8 }}>
                        <div className="name">{ABIL_TH[a]}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
                          {ccAbilityMethod !== "roll" && (
                            <button className="btn" style={{ padding: "2px 8px", fontSize: 12 }} disabled={
                              (ccAbilityMethod === "array" && !ABILS.some((b) => ccAbilityScores[b] < score)) ||
                              (ccAbilityMethod === "pointbuy" && score <= 8)
                            }
                              onClick={() => {
                                if (ccAbilityMethod === "array") {
                                  // Standard Array: swap with the ability that has the next-lower value
                                  const candidates = ABILS.filter((b) => b !== a && ccAbilityScores[b] < score);
                                  if (candidates.length === 0) return;
                                  candidates.sort((b1, b2) => ccAbilityScores[b2] - ccAbilityScores[b1]); // highest of the lower values
                                  const swapAbil = candidates[0];
                                  setCcAbilityScores({
                                    ...ccAbilityScores,
                                    [a]: ccAbilityScores[swapAbil],
                                    [swapAbil]: score,
                                  });
                                } else if (ccAbilityMethod === "pointbuy") {
                                  if (score > 8 && pointBuySpent - (POINT_BUY_COSTS[score] ?? 0) + (POINT_BUY_COSTS[score - 1] ?? 0) <= 27) {
                                    setCcAbilityScores({ ...ccAbilityScores, [a]: score - 1 });
                                  }
                                }
                              }}>−</button>
                          )}
                          <span style={{ fontSize: 18, fontWeight: 800, color: "#EAE0CC" }}>{score}</span>
                          {ccAbilityMethod !== "roll" && (
                            <button className="btn" style={{ padding: "2px 8px", fontSize: 12 }} disabled={
                              (ccAbilityMethod === "array" && !ABILS.some((b) => ccAbilityScores[b] > score)) ||
                              (ccAbilityMethod === "pointbuy" && (score >= 15 || pointBuySpent - (POINT_BUY_COSTS[score] ?? 0) + (POINT_BUY_COSTS[score + 1] ?? 99) > 27))
                            }
                              onClick={() => {
                                if (ccAbilityMethod === "array") {
                                  // Standard Array: swap with the ability that has the next-higher value
                                  const candidates = ABILS.filter((b) => b !== a && ccAbilityScores[b] > score);
                                  if (candidates.length === 0) return;
                                  candidates.sort((b1, b2) => ccAbilityScores[b1] - ccAbilityScores[b2]); // lowest of the higher values
                                  const swapAbil = candidates[0];
                                  setCcAbilityScores({
                                    ...ccAbilityScores,
                                    [a]: ccAbilityScores[swapAbil],
                                    [swapAbil]: score,
                                  });
                                } else if (ccAbilityMethod === "pointbuy") {
                                  if (score < 15 && pointBuySpent - (POINT_BUY_COSTS[score] ?? 0) + (POINT_BUY_COSTS[score + 1] ?? 99) <= 27) {
                                    setCcAbilityScores({ ...ccAbilityScores, [a]: score + 1 });
                                  }
                                }
                              }}>+</button>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "#8A7F9E" }}>รวมเผ่า: {withRace} ({m0 >= 0 ? "+" : ""}{m0})</div>
                      </div>
                    );
                  })}
                </div>
                {/* Standard Array swap UI */}
                {ccAbilityMethod === "array" && (
                  <div style={{ marginTop: 12, fontSize: 11, color: "#9C92B8" }}>
                    <b>Standard Array:</b> 15, 14, 13, 12, 10, 8 — สลับค่าระหว่าง ability ได้โดยกด +/−
                  </div>
                )}
                {ccAbilityMethod === "pointbuy" && (
                  <div style={{ marginTop: 12, fontSize: 11, color: pointBuySpent === 27 ? "#7FA85C" : "#E0A83E" }}>
                    แต้มที่ใช้: {pointBuySpent}/27 {pointBuySpent === 27 ? "✓" : ""}
                  </div>
                )}
              </div>
            )}

            {ccStep === 3 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 4: เลือกภูมิหลัง (Background) + Origin Feat</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>ภูมิหลังให้สกิล, เครื่องมือ, ภาษา, และ Feat (ในกฎ 2024)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {Object.entries(BACKGROUNDS).map(([k, b]: any) => (
                    <div key={k} className={"cc-opt" + (ccBg === k ? " sel" : "")} onClick={() => setCcBg(k)} style={{ padding: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{b.th}</div>
                      <div style={{ fontSize: 9, color: "#8A7F9E" }}>{b.skills.map((s: string) => SKILLS[s].th.split(" (")[0]).join(", ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ccStep === 5 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 6: เลือกสกิล (Skill Proficiency)</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>
                  อาชีพให้เลือก <b style={{ color: "#E0A83E" }}>{numClassSkillPicks}</b> สกิล · ภูมิหลังให้ <b style={{ color: "#E0A83E" }}>{bgSkills.length}</b> สกิลอัตโนมัติ
                  {canExpertise && <span> · <b style={{ color: "#E0A83E" }}>Expertise:</b> เลือก 2 สกิลเพิ่ม proficiency ×2</span>}
                </div>
                {/* Background skills (auto) */}
                <div style={{ fontSize: 11, color: "#7FA85C", marginBottom: 8 }}>✓ จากภูมิหลัง: {bgSkills.map(s => SKILLS[s].th.split(" (")[0]).join(", ")}</div>
                {/* Class skill picks */}
                <div style={{ fontSize: 11, color: "#B9A96A", marginBottom: 6 }}>เลือกจากอาชีพ ({ccPickedSkills.filter(s => classSkills.includes(s)).length}/{numClassSkillPicks}):</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                  {Object.entries(SKILLS).map(([k, s]) => {
                    const isClass = classSkills.includes(k);
                    const isBg = bgSkills.includes(k);
                    const isPicked = ccPickedSkills.includes(k);
                    const classPicksLeft = numClassSkillPicks - ccPickedSkills.filter(x => classSkills.includes(x)).length;
                    const canPick = isClass && !isBg && (isPicked || classPicksLeft > 0);
                    return (
                      <div key={k} style={{
                        padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: canPick ? "pointer" : "default",
                        background: isPicked ? "#1E3A2A" : isBg ? "#1A2A3A" : "#1E1830",
                        border: isPicked ? "1px solid #7FA85C" : "1px solid #3A3054",
                        opacity: canPick || isBg ? 1 : 0.4,
                        color: isPicked ? "#9CC77A" : isBg ? "#A0D0E0" : "#C9BFE0",
                      }} onClick={() => {
                        if (!canPick) return;
                        if (isPicked) setCcPickedSkills(ccPickedSkills.filter(x => x !== k));
                        else setCcPickedSkills([...ccPickedSkills, k]);
                      }}>
                        {isPicked ? "◆" : isBg ? "✓" : "◇"} {s.th.split(" (")[0]}
                        {isClass && !isBg && <span style={{ fontSize: 9, color: "#6B6284" }}> (class)</span>}
                      </div>
                    );
                  })}
                </div>
                {/* Expertise picks */}
                {canExpertise && (
                  <>
                    <div style={{ fontSize: 11, color: "#E0A83E", marginTop: 12, marginBottom: 6 }}>Expertise (เลือก 2 สกิลที่ proficient แล้ว — proficiency ×2):</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                      {Object.entries(SKILLS).map(([k, s]) => {
                        const isProf = classSkills.includes(k) || bgSkills.includes(k) || ccPickedSkills.includes(k);
                        const isExp = ccExpertise.includes(k);
                        return (
                          <div key={k} style={{
                            padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: isProf ? "pointer" : "default",
                            background: isExp ? "#3A2F5C" : "#1E1830",
                            border: isExp ? "1px solid #E0A83E" : "1px solid #3A3054",
                            opacity: isProf ? 1 : 0.3,
                            color: isExp ? "#E0A83E" : "#C9BFE0",
                          }} onClick={() => {
                            if (!isProf) return;
                            if (isExp) setCcExpertise(ccExpertise.filter(x => x !== k));
                            else if (ccExpertise.length < 2) setCcExpertise([...ccExpertise, k]);
                          }}>
                            {isExp ? "◆◆" : "◇"} {s.th.split(" (")[0]}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {ccStep === 6 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 7: เลือกอุปกรณ์เริ่มต้น</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>อาชีพให้อุปกรณ์เริ่มต้นแล้ว — เลือกเพิ่มได้ (ตัวเลือกจาก SRD)</div>
                <div className="panel" style={{ padding: 10, marginBottom: 12, fontSize: 12, color: "#B9A96A" }}>
                  <b>อุปกรณ์เริ่มต้นจาก {cls0.th}:</b> {WEAPONS[cls0.weapon].th}{cls0.ranged ? `, ${WEAPONS[cls0.ranged].th}` : ""}, Rations ×3, Torch, Rope, Potion of Healing
                </div>
                <div style={{ fontSize: 11, color: "#B9A96A", marginBottom: 6 }}>เลือกอาวุธเสริม (กดเพื่อเพิ่ม/ถอน):</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                  {Object.entries(WEAPONS).filter(([, w]: any) => w.type === "simple" || w.type === "martial").map(([k, w]: any) => {
                    const isPicked = ccPickedEquipment.includes(w.th);
                    return (
                      <div key={k} style={{
                        padding: "4px 6px", borderRadius: 6, fontSize: 10, cursor: "pointer",
                        background: isPicked ? "#1E3A2A" : "#1E1830",
                        border: isPicked ? "1px solid #7FA85C" : "1px solid #3A3054",
                        color: isPicked ? "#9CC77A" : "#C9BFE0",
                      }} onClick={() => {
                        if (isPicked) setCcPickedEquipment(ccPickedEquipment.filter(x => x !== w.th));
                        else setCcPickedEquipment([...ccPickedEquipment, w.th]);
                      }}>
                        {isPicked ? "✓ " : ""}{w.th} ({w.dmg})
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ccStep === 7 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 8: เลือกเวทมนตร์</h2>
                {cls0.caster ? (
                  <>
                    <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>
                      อาชีพ {cls0.th} เป็นสายเวท ({cls0.castAbil?.toUpperCase()}) — เลือก cantrip และเวท Lv.1 จาก SRD (สามารถเรียนเพิ่มภายหลังในเกมได้)
                    </div>
                    <button className="btn btn-gold" style={{ width: "100%", marginBottom: 10 }} disabled={ccSpellChoicesLoading || !SRD_OK}
                      onClick={async () => {
                        setCcSpellChoicesLoading(true);
                        try {
                          const all: { index: string; name: string; level: number }[] = [];
                          for (let lv = 0; lv <= 1; lv++) {
                            const list = await srdListSpells(cls0.th.toLowerCase().split(" (")[0], lv);
                            for (const r of list?.results || []) {
                              all.push({ index: r.index, name: r.name, level: lv });
                            }
                          }
                          all.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
                          setCcSpellChoices(all);
                        } catch (e: any) { /* ignore */ }
                        finally { setCcSpellChoicesLoading(false); }
                      }}>
                      {ccSpellChoicesLoading ? "กำลังโหลดเวท SRD..." : ccSpellChoices.length > 0 ? `โหลดแล้ว (${ccSpellChoices.length} เวท) — กดเพื่อโหลดใหม่` : "📖 โหลดรายการเวท SRD"}
                    </button>
                    {ccSpellChoices.length > 0 && (
                      <div style={{ maxHeight: 280, overflowY: "auto" }}>
                        <div style={{ fontSize: 11, color: "#7FA85C", marginBottom: 4 }}>เลือกแล้ว: {ccPickedSpells.length} เวท</div>
                        {ccSpellChoices.map((sp) => {
                          const isPicked = ccPickedSpells.includes(sp.index);
                          return (
                            <div key={sp.index} style={{
                              padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", marginBottom: 2,
                              background: isPicked ? "#1E3A2A" : "#1E1830",
                              border: isPicked ? "1px solid #7FA85C" : "1px solid #3A3054",
                              color: isPicked ? "#9CC77A" : "#C9BFE0",
                            }} onClick={() => {
                              if (isPicked) setCcPickedSpells(ccPickedSpells.filter(x => x !== sp.index));
                              else setCcPickedSpells([...ccPickedSpells, sp.index]);
                            }}>
                              {isPicked ? "✓ " : "◇ "}<b style={{ color: isPicked ? "#7FA85C" : "#E0A83E" }}>{sp.level === 0 ? "Cantrip" : `Lv.${sp.level}`}</b> {sp.name}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 14, color: "#8A7F9E", textAlign: "center", padding: 40 }}>
                    {cls0.th} ไม่ใช่สายเวท — ข้ามขั้นตอนนี้ได้
                  </div>
                )}
              </div>
            )}

            {ccStep === 8 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 9: เลือก Alignment และภาษา</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>
                  เลือกแนวโน้มทางจริยธรรมของตัวละคร (Alignment) และภาษาที่รู้ (D&D 2024 — background + species ให้ภาษามาแล้ว)
                </div>
                <div className="sec-label">⚖️ Alignment (9 แบบตาม D&D 5e)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 14 }}>
                  {ALIGNMENTS.map((a) => (
                    <div key={a.id} style={{
                      padding: "6px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                      background: ccAlignment === a.id ? "#3A2F5C" : "#1E1830",
                      border: ccAlignment === a.id ? "1px solid #E0A83E" : "1px solid #3A3054",
                      color: ccAlignment === a.id ? "#E0A83E" : "#C9BFE0",
                    }} onClick={() => setCcAlignment(a.id)}>
                      {ccAlignment === a.id ? "✓ " : ""}<b>{a.abbr}</b> {a.th.split(" (")[0]}
                    </div>
                  ))}
                </div>
                <div className="sec-label">🗣️ ภาษา (D&D 2024: +1 ภาษาตามเผ่าพันธุ์)</div>
                <div style={{ fontSize: 11, color: "#9C92B8", marginBottom: 6 }}>
                  ภาษาจากเผ่าพันธุ์ {race0.th}: {race0.languages ? race0.languages.join(", ") : "Common"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                  {LANGUAGES.filter(l => !race0.languages?.includes(l.th)).map((l) => {
                    const isPicked = ccLanguages.includes(l.id);
                    return (
                      <div key={l.id} style={{
                        padding: "4px 6px", borderRadius: 6, fontSize: 10, cursor: "pointer",
                        background: isPicked ? "#1E3A2A" : "#1E1830",
                        border: isPicked ? "1px solid #7FA85C" : "1px solid #3A3054",
                        color: isPicked ? "#9CC77A" : "#C9BFE0",
                      }} onClick={() => {
                        if (isPicked) setCcLanguages(ccLanguages.filter(x => x !== l.id));
                        else if (ccLanguages.length < 1) setCcLanguages([...ccLanguages, l.id]);
                      }}>
                        {isPicked ? "✓ " : ""}{l.th}{l.exotic ? " ✦" : ""}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: "#8A7F9E", marginTop: 6 }}>(✦ = exotic language — มนุษย์ได้เพิ่ม 1 ภาษา)</div>
              </div>
            )}

            {ccStep === 9 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 10: บุคลิก/ลักษณะ และรายละเอียด</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>เติมข้อมูลพื้นฐานและบุคลิก (ไม่บังคับ แต่ช่วยให้ DM เล่นเรื่องได้ดีขึ้น)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <input className="input-main" style={{ fontSize: 13 }} placeholder="อายุ" value={ccDetails.age} onChange={(e) => setCcDetails({ ...ccDetails, age: e.target.value })} />
                  <input className="input-main" style={{ fontSize: 13 }} placeholder="ส่วนสูง" value={ccDetails.height} onChange={(e) => setCcDetails({ ...ccDetails, height: e.target.value })} />
                </div>
                <input className="input-main" style={{ width: "100%", fontSize: 13, marginBottom: 8 }} placeholder="รูปลักษณ์ (สีผม สีตา ฯลฯ)" value={ccDetails.appearance} onChange={(e) => setCcDetails({ ...ccDetails, appearance: e.target.value })} />
                <input className="input-main" style={{ width: "100%", fontSize: 13, marginBottom: 8 }} placeholder="อุดมคติ (Ideal) — อะไรที่ตัวละครยึดถือ" value={ccDetails.ideal} onChange={(e) => setCcDetails({ ...ccDetails, ideal: e.target.value })} />
                <input className="input-main" style={{ width: "100%", fontSize: 13, marginBottom: 8 }} placeholder="สิ่งผูกพัน (Bond) — อะไรที่ผูกพันตัวละคร" value={ccDetails.bond} onChange={(e) => setCcDetails({ ...ccDetails, bond: e.target.value })} />
                <input className="input-main" style={{ width: "100%", fontSize: 13, marginBottom: 8 }} placeholder="ข้อบกพร่อง (Flaw) — จุดอ่อนของตัวละคร" value={ccDetails.flaw} onChange={(e) => setCcDetails({ ...ccDetails, flaw: e.target.value })} />
                <textarea className="input-main" style={{ width: "100%", fontSize: 13, minHeight: 80, resize: "vertical" }} placeholder="ประวัติตัวละคร (Backstory)..." value={ccDetails.backstory} onChange={(e) => setCcDetails({ ...ccDetails, backstory: e.target.value })} />
              </div>
            )}

            {ccStep === 10 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 11: ตรวจสอบ Character Sheet</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>ตรวจสอบข้อมูลให้ครบก่อนเริ่มเล่น</div>
                <div className="panel" style={{ padding: 14, fontSize: 13, lineHeight: 1.8 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#E0A83E", marginBottom: 6 }}>{ccName || "ไม่ระบุชื่อ"}</div>
                  <div style={{ color: "#C9BFE0" }}>{race0.th} · {cls0.th} · Level 1 · ภูมิหลัง: {bg0.th}</div>
                  <div style={{ marginTop: 8, color: "#9C92B8" }}>
                    <b style={{ color: "#B9A96A" }}>ค่าสถานะ (รวมเผ่า):</b><br/>
                    {ABILS.map(a => `${ABIL_TH[a]}: ${preview.abilities[a]} (${mod(preview.abilities[a]) >= 0 ? "+" : ""}${mod(preview.abilities[a])})`).join(" · ")}
                  </div>
                  <div style={{ marginTop: 6 }}><b style={{ color: "#B9A96A" }}>HP:</b> {preview.maxHp} · <b style={{ color: "#B9A96A" }}>AC:</b> {preview.ac} · <b style={{ color: "#B9A96A" }}>ความเร็ว:</b> {preview.speed} ฟุต</div>
                  <div><b style={{ color: "#B9A96A" }}>อาวุธ:</b> {WEAPONS[cls0.weapon].th}{cls0.ranged ? `, ${WEAPONS[cls0.ranged].th}` : ""}</div>
                  <div><b style={{ color: "#B9A96A" }}>Saving Throws:</b> {cls0.saves.map((s: string) => ABIL_TH[s]).join(", ")}</div>
                  <div><b style={{ color: "#B9A96A" }}>สกิลที่ proficient:</b> {[...bgSkills, ...ccPickedSkills].map(s => SKILLS[s].th.split(" (")[0]).join(", ") || "—"}</div>
                  {ccExpertise.length > 0 && <div><b style={{ color: "#E0A83E" }}>Expertise:</b> {ccExpertise.map(s => SKILLS[s].th.split(" (")[0]).join(", ")}</div>}
                  <div><b style={{ color: "#B9A96A" }}>Alignment:</b> {ALIGNMENTS.find(a => a.id === ccAlignment)?.th || "—"}</div>
                  <div><b style={{ color: "#B9A96A" }}>ภาษา:</b> {[...(race0.languages || ["Common"]), ...ccLanguages.map(id => LANGUAGES.find(l => l.id === id)?.th).filter(Boolean)].join(", ")}</div>
                  {bg0.originFeat && ORIGIN_FEATS[bg0.originFeat] && <div><b style={{ color: "#7FA85C" }}>🎯 Origin Feat ({bg0.th}):</b> {ORIGIN_FEATS[bg0.originFeat].th} — {ORIGIN_FEATS[bg0.originFeat].descriptionTh}</div>}
                  {bg0.tool && <div><b style={{ color: "#B9A96A" }}>เครื่องมือ:</b> {bg0.tool}</div>}
                  {race0.traits && <div><b style={{ color: "#B9A96A" }}>คุณสมบัติเผ่าพันธุ์:</b> {race0.traits.join(", ")}</div>}
                  {cls0.caster && <div><b style={{ color: "#B9A96A" }}>เวทที่รู้:</b> {ccPickedSpells.length} เวท</div>}
                  {ccPickedEquipment.length > 0 && <div><b style={{ color: "#B9A96A" }}>อุปกรณ์เสริม:</b> {ccPickedEquipment.join(", ")}</div>}
                  {ccDetails.backstory && <div style={{ marginTop: 6 }}><b style={{ color: "#B9A96A" }}>ประวัติ:</b> {ccDetails.backstory.slice(0, 100)}{ccDetails.backstory.length > 100 ? "..." : ""}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Navigation buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 16, position: "sticky", bottom: 0, background: "rgba(20,16,32,0.95)", padding: "10px 0", paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}>
            <button className="btn" onClick={() => ccStep === 0 ? onCancel() : setCcStep(ccStep - 1)}>{ccStep === 0 ? "กลับ" : "← ย้อน"}</button>
            {ccStep < 10 ? (
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => setCcStep(ccStep + 1)}>ถัดไป →</button>
            ) : (
              <button className="btn btn-gold" style={{ flex: 1 }} disabled={!ccName.trim()} onClick={handleFinish}>⚔️ เริ่มการผจญภัย</button>
            )}
          </div>
        </div>
      </div>
    );
}
