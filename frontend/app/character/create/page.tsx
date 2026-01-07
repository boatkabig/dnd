"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useI18n, LanguageSwitcher } from "@/lib/i18n-context";
import { ChevronRight, ChevronLeft, Book, Sword, Shield, Music, Sparkles, Trees, Zap, Anchor, Crosshair, Skull, Flame, Eye } from "lucide-react";

// Classes with extended data
const CLASSES = [
  { key: "barbarian", image: "/classes/barbarian.png", hit_die: "d12", primary: "STR", lore: "ความโกรธดิบๆ ทำให้คุณแข็งแกร่งกว่าเหล็ก", icon: Sword, color: "red", stats: { hp: 140, mp: 10, str: 20, dex: 14, int: 8, wis: 10, cha: 8 } },
  { key: "bard", image: "/classes/bard.png", hit_die: "d8", primary: "CHA", lore: "เสียงเพลงคือเวทมนตร์ของคุณ", icon: Music, color: "pink", stats: { hp: 80, mp: 90, str: 8, dex: 14, int: 12, wis: 10, cha: 18 } },
  { key: "cleric", image: "/classes/cleric.png", hit_die: "d8", primary: "WIS", lore: "พลังศักดิ์สิทธิ์ไหลผ่านคุณ", icon: Sparkles, color: "amber", stats: { hp: 100, mp: 100, str: 14, dex: 10, int: 10, wis: 18, cha: 12 } },
  { key: "druid", image: "/classes/druid.png", hit_die: "d8", primary: "WIS", lore: "ธรรมชาติเป็นอาวุธของคุณ", icon: Trees, color: "emerald", stats: { hp: 90, mp: 110, str: 10, dex: 12, int: 10, wis: 19, cha: 10 } },
  { key: "fighter", image: "/classes/fighter.png", hit_die: "d10", primary: "STR/DEX", lore: "ศาสตร์แห่งการต่อสู้สมบูรณ์แบบ", icon: Shield, color: "blue", stats: { hp: 120, mp: 20, str: 18, dex: 16, int: 10, wis: 10, cha: 10 } },
  { key: "monk", image: "/classes/monk.png", hit_die: "d8", primary: "DEX & WIS", lore: "Ki ไหลผ่านร่างกายคุณ", icon: Zap, color: "orange", stats: { hp: 95, mp: 60, str: 12, dex: 18, int: 10, wis: 16, cha: 10 } },
  { key: "paladin", image: "/classes/paladin.png", hit_die: "d10", primary: "STR & CHA", lore: "โล่ของผู้บริสุทธิ์", icon: Anchor, color: "yellow", stats: { hp: 130, mp: 50, str: 16, dex: 10, int: 8, wis: 12, cha: 16 } },
  { key: "ranger", image: "/classes/ranger.png", hit_die: "d10", primary: "DEX & WIS", lore: "นักล่าแห่งป่า", icon: Crosshair, color: "lime", stats: { hp: 100, mp: 40, str: 12, dex: 19, int: 10, wis: 14, cha: 10 } },
  { key: "rogue", image: "/classes/rogue.png", hit_die: "d8", primary: "DEX", lore: "เงาคือมิตรสหายของคุณ", icon: Skull, color: "slate", stats: { hp: 85, mp: 30, str: 10, dex: 20, int: 14, wis: 10, cha: 12 } },
  { key: "sorcerer", image: "/classes/sorcerer.png", hit_die: "d6", primary: "CHA", lore: "เวทมนตร์ในสายเลือด", icon: Flame, color: "cyan", stats: { hp: 70, mp: 120, str: 8, dex: 12, int: 12, wis: 10, cha: 19 } },
  { key: "warlock", image: "/classes/warlock.png", hit_die: "d8", primary: "CHA", lore: "สัญญากับสิ่งเหนือธรรมชาติ", icon: Eye, color: "purple", stats: { hp: 90, mp: 100, str: 10, dex: 12, int: 14, wis: 10, cha: 18 } },
  { key: "wizard", image: "/classes/wizard.png", hit_die: "d6", primary: "INT", lore: "ความรู้คืออำนาจ", icon: Book, color: "indigo", stats: { hp: 65, mp: 130, str: 8, dex: 12, int: 20, wis: 14, cha: 10 } },
];

// Races - D&D 5e (2024) has no fixed ability bonuses
const RACES = [
  { key: "human" },
  { key: "elf" },
  { key: "dwarf" },
  { key: "halfling" },
  { key: "dragonborn" },
  { key: "gnome" },
  { key: "goliath" },
  { key: "orc" },
  { key: "tiefling" },
  { key: "aasimar" },
];

// Backgrounds - translations in i18n
const BACKGROUNDS = [
  { key: "acolyte" },
  { key: "criminal" },
  { key: "sage" },
  { key: "soldier" },
];

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
type AbilityScores = Record<Ability, number>;
type AbilityMethod = "standard" | "roll" | "random";

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const ABILITY_LIST: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

export default function CharacterCreate() {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [classIndex, setClassIndex] = useState(0);
  const [raceKey, setRaceKey] = useState("human");
  const [bgKey, setBgKey] = useState("soldier");
  const [abilities, setAbilities] = useState<AbilityScores>({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
  const [showAbilities, setShowAbilities] = useState(false);
  const [abilityMethod, setAbilityMethod] = useState<AbilityMethod>("standard");
  const [randomAtSession, setRandomAtSession] = useState(false);
  const [selectedArrayValue, setSelectedArrayValue] = useState<number | null>(null);
  const [assignedValues, setAssignedValues] = useState<Record<Ability, number | null>>({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });

  const selectedClass = CLASSES[classIndex];
  const selectedRace = RACES.find(r => r.key === raceKey)!;
  const selectedBg = BACKGROUNDS.find(b => b.key === bgKey)!;
  const IconComponent = selectedClass.icon;

  const getModifier = (score: number) => {
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  const rollAbilities = () => {
    const roll4d6kh3 = () => {
      const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
      rolls.sort((a, b) => b - a);
      return rolls[0] + rolls[1] + rolls[2];
    };
    const newAbilities = { str: roll4d6kh3(), dex: roll4d6kh3(), con: roll4d6kh3(), int: roll4d6kh3(), wis: roll4d6kh3(), cha: roll4d6kh3() };
    setAbilities(newAbilities);
    setAssignedValues(newAbilities);
  };

  const assignStandardValue = (ability: Ability) => {
    if (selectedArrayValue === null) return;
    const newAssigned = { ...assignedValues };
    // Remove value from any other ability
    ABILITY_LIST.forEach(a => {
      if (newAssigned[a] === selectedArrayValue) newAssigned[a] = null;
    });
    newAssigned[ability] = selectedArrayValue;
    setAssignedValues(newAssigned);
    setAbilities(prev => ({ ...prev, [ability]: selectedArrayValue }));
    setSelectedArrayValue(null);
  };

  const getUsedValues = () => {
    return Object.values(assignedValues).filter(v => v !== null) as number[];
  };

  const resetStandardArray = () => {
    setAssignedValues({ str: null, dex: null, con: null, int: null, wis: null, cha: null });
    setSelectedArrayValue(null);
  };

  // Radar chart helpers (7 sides for 7 stats)
  const STAT_COUNT = 7;
  const ANGLE_STEP = 360 / STAT_COUNT; // ~51.43 degrees
  
  const getPolygonPoints = (cx: number, cy: number, radius: number) => {
    return Array.from({ length: STAT_COUNT }, (_, i) => {
      const angle = (i * ANGLE_STEP - 90) * (Math.PI / 180);
      return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
    }).join(' ');
  };

  const getStatsPoints = (stats: typeof selectedClass.stats, cx: number, cy: number, radius: number) => {
    const keys = Object.keys(stats) as (keyof typeof stats)[];
    return keys.map((key, i) => {
      const maxVal = key === 'hp' ? 150 : key === 'mp' ? 130 : 20;
      const ratio = Math.min(stats[key] / maxVal, 1);
      const angle = (i * ANGLE_STEP - 90) * (Math.PI / 180);
      return `${cx + radius * ratio * Math.cos(angle)},${cy + radius * ratio * Math.sin(angle)}`;
    }).join(' ');
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-black text-white font-serif relative flex flex-col">
      {/* Dynamic Cinematic Backdrop */}
      <div className="absolute inset-0 pointer-events-none">
        <Image
          key={`bg-${selectedClass.key}`}
          src={selectedClass.image}
          alt="background"
          fill
          className="object-cover object-top opacity-10 blur-xl scale-125 transition-all duration-1000"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-black" />
      </div>

      {/* Main Layout */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <header className="px-8 md:px-12 pt-6 md:pt-8 flex justify-between items-center">
          <div>
            <Link href="/" className="block group">
              <h1 className="text-2xl md:text-4xl font-black tracking-tighter italic text-white/90 hover:text-white transition-colors">
                DARK ODYSSEY
              </h1>
              <p className="text-[10px] uppercase tracking-[0.5em] text-white/30 mt-1 flex items-center gap-1">
                ← กลับหน้าหลัก
              </p>
            </Link>
          </div>
          
          {/* Character Name Input */}
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อตัวละคร..."
              className="bg-transparent border-b-2 border-white/20 text-lg md:text-xl font-display text-center text-white placeholder:text-white/30 focus:border-white/60 focus:outline-none w-40 md:w-56 transition-colors"
            />
            <LanguageSwitcher />
          </div>
        </header>

        {/* Content Section - 3 Column Layout */}
        <div className="flex-grow flex items-stretch px-4 md:px-8 gap-4 md:gap-4 overflow-hidden py-2">
          
          {/* LEFT: Class Grid Selection */}
          <div className="w-full md:w-[30%] flex flex-col gap-2">
            <span className="text-xs md:text-sm font-bold text-white/40 uppercase tracking-widest">Select Class</span>

            <div className="grid grid-cols-4 lg:grid-cols-6 gap-1">
              {CLASSES.map((c, index) => (
                <button
                  key={c.key}
                  onClick={() => setClassIndex(index)}
                  className={`relative aspect-square border overflow-hidden transition-all duration-300
                    ${classIndex === index 
                      ? 'border-white ring-1 ring-white/20 scale-105' 
                      : 'border-white/10 grayscale opacity-40 hover:opacity-100 hover:grayscale-0 hover:border-white/40'}
                  `}
                >
                  <Image src={c.image} alt={c.key} fill className="object-cover object-top" />
                  <div className={`absolute inset-0 bg-gradient-to-t from-black/80 to-transparent transition-opacity
                    ${classIndex === index ? 'opacity-0' : 'opacity-100'}`} />
                </button>
              ))}
            </div>

            <div className="p-3 bg-white/[0.02] border border-white/5 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm md:text-base text-white font-bold">{t.classes[selectedClass.key as keyof typeof t.classes]}</span>
                <IconComponent size={16} className="text-white/40" />
              </div>
              <p className="text-xs italic text-slate-500 leading-relaxed">&quot;{selectedClass.lore}&quot;</p>
              <div className="flex gap-3 text-[10px] text-white/50">
                <span>{selectedClass.hit_die}</span>
                <span>•</span>
                <span>{selectedClass.primary}</span>
              </div>
            </div>

            {/* Race Selection - Compact */}
            <div className="hidden lg:grid grid-cols-3 gap-1">
              {RACES.slice(0, 6).map((race) => (
                <button
                  key={race.key}
                  onClick={() => setRaceKey(race.key)}
                  className={`py-1.5 px-2 text-center transition-all text-[10px] border truncate
                    ${raceKey === race.key 
                      ? 'bg-white/10 border-white/30 text-white' 
                      : 'bg-white/[0.02] border-white/5 text-white/50 hover:text-white/70'}`}
                >
                  {(t.races[race.key as keyof typeof t.races] as { name: string })?.name || race.key}
                </button>
              ))}
            </div>
          </div>

          {/* CENTER: Character Preview */}
          <div className="flex-1 flex justify-center items-center relative h-full">
            {/* Glow Effect */}
            <div className="absolute w-[80%] h-[80%] bg-white/5 rounded-full blur-[100px] animate-pulse" />
            
            {/* Navigation Arrows */}
            <button 
              onClick={() => setClassIndex((classIndex - 1 + CLASSES.length) % CLASSES.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all hover:scale-110"
            >
              <ChevronLeft size={20} />
            </button>
            
            {/* Character Image */}
            <div className="relative w-full h-full max-w-[500px] max-h-[70vh]">
              <Image
                key={selectedClass.key}
                src={selectedClass.image}
                alt={selectedClass.key}
                fill
                className="object-contain object-top drop-shadow-[0_0_100px_rgba(0,0,0,1)]"
                style={{ animation: 'fadeInZoom 0.8s ease-out' }}
                priority
              />
            </div>
            
            <button 
              onClick={() => setClassIndex((classIndex + 1) % CLASSES.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all hover:scale-110"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* RIGHT: Stats & Options */}
          <div className="hidden lg:flex w-1/4 flex-col gap-4 justify-center">
            {/* Radar Chart */}
            <div className="space-y-2">
              <span className="text-xs md:text-sm font-bold text-white/40 uppercase tracking-widest">Power Chart</span>
              <div className="relative w-full aspect-square max-w-[200px] mx-auto">
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  {/* Background polygon layers (7 sides) */}
                  {[1, 0.75, 0.5, 0.25].map((scale, i) => (
                    <polygon
                      key={i}
                      points={getPolygonPoints(100, 100, 80 * scale)}
                      fill="none"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="1"
                    />
                  ))}
                  
                  {/* Axis lines */}
                  {Object.keys(selectedClass.stats).map((_, i) => {
                    const angle = (i * ANGLE_STEP - 90) * (Math.PI / 180);
                    const x2 = 100 + 80 * Math.cos(angle);
                    const y2 = 100 + 80 * Math.sin(angle);
                    return (
                      <line key={i} x1="100" y1="100" x2={x2} y2={y2} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    );
                  })}
                  
                  {/* Data polygon */}
                  <polygon
                    points={getStatsPoints(selectedClass.stats, 100, 100, 80)}
                    fill="rgba(255,255,255,0.15)"
                    stroke="white"
                    strokeWidth="2"
                    className="transition-all duration-700"
                  />
                  
                  {/* Data points */}
                  {Object.entries(selectedClass.stats).map(([key, val], i) => {
                    const maxVal = key === 'hp' ? 150 : key === 'mp' ? 130 : 20;
                    const ratio = Math.min(val / maxVal, 1);
                    const angle = (i * ANGLE_STEP - 90) * (Math.PI / 180);
                    const x = 100 + 80 * ratio * Math.cos(angle);
                    const y = 100 + 80 * ratio * Math.sin(angle);
                    return (
                      <circle key={key} cx={x} cy={y} r="4" fill="white" className="transition-all duration-700" />
                    );
                  })}
                  
                  {/* Labels */}
                  {Object.entries(selectedClass.stats).map(([key, val], i) => {
                    const angle = (i * ANGLE_STEP - 90) * (Math.PI / 180);
                    const x = 100 + 95 * Math.cos(angle);
                    const y = 100 + 95 * Math.sin(angle);
                    return (
                      <text key={key} x={x} y={y} fill="rgba(255,255,255,0.6)" fontSize="10" textAnchor="middle" dominantBaseline="middle" className="uppercase font-bold">
                        {key}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Background Selection with Tooltip */}
            <div className="space-y-2">
              <span className="text-xs md:text-sm font-bold text-white/40 uppercase tracking-widest">Background</span>
              <div className="space-y-1">
                {BACKGROUNDS.map((bg) => {
                  const bgInfo = t.backgrounds[bg.key as keyof typeof t.backgrounds];
                  return (
                    <div key={bg.key} className="relative group">
                      <button
                        onClick={() => setBgKey(bg.key)}
                        className={`w-full p-2 text-left transition-all text-xs border
                          ${bgKey === bg.key 
                            ? 'bg-white/10 border-white/30 text-white' 
                            : 'bg-white/[0.02] border-white/5 text-white/40 hover:text-white/70'}`}
                      >
                        <div className="flex justify-between items-center">
                          <span>{bgInfo.name}</span>
                          <span className="text-[9px] text-white/30">{bgInfo.skills}</span>
                        </div>
                      </button>
                      {/* Tooltip on hover - positioned to left to prevent overflow */}
                      <div className="absolute right-full top-0 mr-2 w-72 p-3 bg-black/95 border border-white/20 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl pointer-events-none">
                        <div className="text-xs font-bold text-white mb-2">{bgInfo.name}</div>
                        <div className="space-y-1.5 text-[10px]">
                          <p><span className="text-white/40">{t.bgLabels.abilities}:</span> <span className="text-white/80">{bgInfo.abilities}</span></p>
                          <p><span className="text-white/40">{t.bgLabels.feat}:</span> <span className="text-amber-400/80">{bgInfo.feat}</span></p>
                          <p><span className="text-white/40">{t.bgLabels.skills}:</span> <span className="text-white/80">{bgInfo.skills}</span></p>
                          <p><span className="text-white/40">{t.bgLabels.tools}:</span> <span className="text-white/60">{bgInfo.tools}</span></p>
                          <p><span className="text-white/40">{t.bgLabels.equipment}:</span> <span className="text-white/50 text-[9px]">{bgInfo.equipment}</span></p>
                          <p className="text-white/50 italic pt-2 border-t border-white/10 mt-2 leading-relaxed">{bgInfo.desc}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ability Scores Toggle */}
            <button 
              onClick={() => setShowAbilities(!showAbilities)}
              className="flex items-center justify-between text-xs text-white/40 uppercase hover:text-white/60 transition-colors border border-white/10 p-2"
            >
              <span>Ability Scores</span>
              <span className="text-amber-500/60">{showAbilities ? '−' : '+'}</span>
            </button>

            {showAbilities && (
              <div className="space-y-3 animate-in slide-in-from-top-2">
                {/* Method Selection */}
                <div className="flex gap-1">
                  <button
                    onClick={() => setAbilityMethod('standard')}
                    className={`flex-1 py-1.5 text-[10px] uppercase tracking-wider border transition-colors
                      ${abilityMethod === 'standard' ? 'bg-white text-black' : 'bg-white/5 text-white/50 border-white/10'}`}
                  >
                    Standard Array
                  </button>
                  <button
                    onClick={() => setAbilityMethod('roll')}
                    className={`flex-1 py-1.5 text-[10px] uppercase tracking-wider border transition-colors
                      ${abilityMethod === 'roll' ? 'bg-white text-black' : 'bg-white/5 text-white/50 border-white/10'}`}
                  >
                    🎲 Roll
                  </button>
                </div>

                {/* Standard Array Selection */}
                {abilityMethod === 'standard' && (
                  <div className="space-y-2">
                    <div className="text-[9px] text-white/40 uppercase">เลือกค่าแล้วคลิกที่ Ability</div>
                    <div className="flex gap-1">
                      {STANDARD_ARRAY.map((val) => {
                        const isUsed = getUsedValues().includes(val);
                        const isSelected = selectedArrayValue === val;
                        return (
                          <button
                            key={val}
                            onClick={() => !isUsed && setSelectedArrayValue(isSelected ? null : val)}
                            disabled={isUsed}
                            className={`flex-1 py-2 text-center font-bold transition-all border
                              ${isSelected ? 'bg-amber-500 text-black border-amber-400' : 
                                isUsed ? 'bg-white/5 text-white/20 border-white/5 cursor-not-allowed' :
                                'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}
                          >
                            {val}
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={resetStandardArray} className="text-[9px] text-white/30 hover:text-white/60 underline">
                      รีเซ็ต
                    </button>
                  </div>
                )}

                {/* Roll Info - Will roll at session start */}
                {abilityMethod === 'roll' && (
                  <div className="p-3 bg-amber-500/5 border border-amber-500/20 space-y-2">
                    <div className="text-xs font-bold text-amber-500/80">🎲 Roll 4d6 Drop Lowest</div>
                    <div className="text-[10px] text-white/50 leading-relaxed">
                      ทอยลูกเต๋า d6 จำนวน 4 ลูก เลือกเฉพาะ 3 ลูกที่มากที่สุดมารวมกัน 
                      <span className="text-white/40 ml-1">(เช่น 6,4,3,1 = 6+4+3 = 13)</span>
                    </div>
                    <div className="text-[10px] text-amber-500/60 font-medium">
                      ⏳ ค่าจะถูกสุ่มเมื่อเริ่ม Session เท่านั้น
                    </div>
                  </div>
                )}

                {/* Ability Grid */}
                <div className="grid grid-cols-3 gap-2">
                  {ABILITY_LIST.map((ability) => {
                    const value = abilityMethod === 'standard' ? assignedValues[ability] : null;
                    const canAssign = abilityMethod === 'standard' && selectedArrayValue !== null;
                    const isRollMethod = abilityMethod === 'roll';
                    return (
                      <button
                        key={ability}
                        onClick={() => abilityMethod === 'standard' && assignStandardValue(ability)}
                        disabled={isRollMethod}
                        className={`bg-white/[0.03] border p-2 text-center transition-all
                          ${canAssign ? 'border-amber-500/50 hover:bg-amber-500/10 cursor-pointer' : 'border-white/5'}
                          ${isRollMethod ? 'opacity-60' : ''}
                          ${value === null && !isRollMethod ? 'opacity-50' : ''}`}
                      >
                        <div className="text-[9px] text-white/40 uppercase">{ability}</div>
                        <div className="text-lg font-bold text-white">
                          {isRollMethod ? '?' : (value ?? '—')}
                        </div>
                        <div className="text-[9px] text-amber-500/60">
                          {isRollMethod ? '—' : (value ? getModifier(value) : '')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Create Button */}
            <button
              disabled={!name}
              className="w-full py-6 bg-white text-black font-black uppercase tracking-[0.4em] text-sm 
                hover:bg-slate-200 hover:tracking-[0.5em] transition-all flex items-center justify-center gap-3 
                active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_50px_rgba(255,255,255,0.1)]"
            >
              CREATE CHARACTER
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Mobile Bottom Panel */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-xl border-t border-white/10 p-4">
          <button
            disabled={!name}
            className="w-full py-4 bg-white text-black font-black uppercase tracking-[0.3em] text-sm 
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            CREATE CHARACTER
          </button>
        </div>

        {/* Footer */}
        <footer className="hidden lg:flex h-12 border-t border-white/5 items-center px-12 justify-center text-[9px] text-white/20 uppercase tracking-[0.5em]">
          DND Virtual Table • Character Creation • 2025
        </footer>
      </div>
    </div>
  );
}
