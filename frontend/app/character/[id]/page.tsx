"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useI18n, LanguageSwitcher } from "@/lib/i18n-context";

// Mock character data
const mockCharacter = {
  name: "Arnazall",
  race: "Half-Orc",
  class: "Paladin",
  subclass: "Oath of Vengeance",
  level: 15,
  background: "Soldier",
  alignment: "Lawful Good",
  xp: 165000,
  image: "/classes/paladin.png",
  
  // Combat
  hp: { current: 142, max: 158, temp: 0 },
  ac: 18,
  speed: 30,
  proficiencyBonus: 5,
  initiative: 2,
  hitDice: { current: 12, max: 15, die: "d10" },
  deathSaves: { successes: 0, failures: 0 },
  inspiration: false,
  
  // Abilities
  abilities: {
    str: { score: 18, modifier: 4, save: 9, saveProficient: true },
    dex: { score: 14, modifier: 2, save: 2, saveProficient: false },
    con: { score: 16, modifier: 3, save: 3, saveProficient: false },
    int: { score: 10, modifier: 0, save: 0, saveProficient: false },
    wis: { score: 14, modifier: 2, save: 7, saveProficient: true },
    cha: { score: 16, modifier: 3, save: 8, saveProficient: true },
  },
  
  // Skills
  skills: [
    { name: "Acrobatics", ability: "dex", proficient: false, expertise: false },
    { name: "Animal Handling", ability: "wis", proficient: false, expertise: false },
    { name: "Arcana", ability: "int", proficient: false, expertise: false },
    { name: "Athletics", ability: "str", proficient: true, expertise: false },
    { name: "Deception", ability: "cha", proficient: false, expertise: false },
    { name: "History", ability: "int", proficient: false, expertise: false },
    { name: "Insight", ability: "wis", proficient: true, expertise: false },
    { name: "Intimidation", ability: "cha", proficient: true, expertise: false },
    { name: "Investigation", ability: "int", proficient: false, expertise: false },
    { name: "Medicine", ability: "wis", proficient: false, expertise: false },
    { name: "Nature", ability: "int", proficient: false, expertise: false },
    { name: "Perception", ability: "wis", proficient: true, expertise: false },
    { name: "Performance", ability: "cha", proficient: false, expertise: false },
    { name: "Persuasion", ability: "cha", proficient: true, expertise: false },
    { name: "Religion", ability: "int", proficient: true, expertise: false },
    { name: "Sleight of Hand", ability: "dex", proficient: false, expertise: false },
    { name: "Stealth", ability: "dex", proficient: false, expertise: false },
    { name: "Survival", ability: "wis", proficient: false, expertise: false },
  ],
  
  // Attacks
  attacks: [
    { name: "Longsword +1", attackBonus: 10, damage: "1d8+5", damageType: "slashing", properties: "Versatile (1d10)" },
    { name: "Javelin", attackBonus: 9, damage: "1d6+4", damageType: "piercing", properties: "Thrown (30/120)" },
    { name: "Unarmed Strike", attackBonus: 9, damage: "5", damageType: "bludgeoning", properties: "" },
  ],
  
  // Equipment
  equipment: [
    { name: "Longsword +1", quantity: 1, weight: 3 },
    { name: "Shield", quantity: 1, weight: 6 },
    { name: "Plate Armor", quantity: 1, weight: 65 },
    { name: "Javelin", quantity: 4, weight: 8 },
    { name: "Holy Symbol", quantity: 1, weight: 1 },
    { name: "Explorer's Pack", quantity: 1, weight: 59 },
  ],
  currency: { cp: 0, sp: 15, ep: 0, gp: 230, pp: 5 },
  
  // Personality
  personality: {
    traits: "ข้าจะปกป้องผู้ที่ไม่สามารถปกป้องตัวเองได้ ไม่ว่าจะต้องแลกด้วยอะไรก็ตาม",
    ideals: "ความยุติธรรม. กฎหมายต้องเท่าเทียมกันสำหรับทุกคน",
    bonds: "ข้าต่อสู้เพื่อผู้ที่ไม่สามารถต่อสู้เพื่อตัวเองได้",
    flaws: "ข้าตัดสินผู้คนอย่างรุนแรงเกินไป และตัวเองอย่างรุนแรงยิ่งกว่า",
  },
  
  // Features
  features: [
    { name: "Divine Sense", source: "Paladin", description: "รับรู้ celestial, fiend, undead ได้" },
    { name: "Lay on Hands", source: "Paladin", description: "รักษา HP pool = level × 5" },
    { name: "Divine Smite", source: "Paladin", description: "ใช้ spell slot เพิ่มความเสียหาย" },
    { name: "Aura of Protection", source: "Paladin", description: "+CHA mod ให้ saving throws ในระยะ 10 ft" },
    { name: "Relentless Avenger", source: "Oath of Vengeance", description: "เคลื่อนที่ตาม opportunity attack ได้" },
  ],
  
  // Proficiencies
  proficiencies: {
    armor: ["All armor", "Shields"],
    weapons: ["Simple weapons", "Martial weapons"],
    tools: ["Gaming set (dice)"],
    languages: ["Common", "Orc", "Celestial"],
  },
  
  // Spellcasting
  spellcasting: {
    ability: "CHA",
    saveDC: 16,
    attackBonus: 8,
    slots: { 1: { max: 4, used: 1 }, 2: { max: 3, used: 0 }, 3: { max: 3, used: 2 }, 4: { max: 2, used: 0 } },
    prepared: [
      { name: "Bless", level: 1 },
      { name: "Cure Wounds", level: 1 },
      { name: "Divine Favor", level: 1 },
      { name: "Shield of Faith", level: 1 },
      { name: "Branding Smite", level: 2 },
      { name: "Magic Weapon", level: 2 },
      { name: "Dispel Magic", level: 3 },
      { name: "Revivify", level: 3 },
    ],
  },
};

type Tab = "actions" | "spells" | "inventory" | "features" | "notes";

export default function CharacterSheet() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("actions");
  const char = mockCharacter;

  const getSkillMod = (skill: typeof char.skills[0]) => {
    const ability = char.abilities[skill.ability as keyof typeof char.abilities];
    let mod = ability.modifier;
    if (skill.proficient) mod += char.proficiencyBonus;
    if (skill.expertise) mod += char.proficiencyBonus;
    return mod;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] border-b border-amber-400/20 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 text-amber-400 hover:text-amber-300">
            <span>🐉</span>
            <span className="font-display">DND Virtual Table</span>
          </Link>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-blue-900/50 border border-blue-500/30 rounded text-sm hover:bg-blue-800/50">⟳ Short Rest</button>
            <button className="px-3 py-1.5 bg-purple-900/50 border border-purple-500/30 rounded text-sm hover:bg-purple-800/50">☽ Long Rest</button>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 grid grid-cols-12 gap-4">
        {/* === LEFT COLUMN: Character Info + Abilities === */}
        <div className="col-span-3 space-y-3">
          {/* Character Header */}
          <div className="bg-[#12121a] rounded-lg p-4 border border-gray-800">
            <div className="flex gap-3">
              <div className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-amber-400/50">
                <Image src={char.image} alt={char.name} fill className="object-cover" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-display text-amber-400">{char.name}</h1>
                <p className="text-sm text-gray-400">{char.race} {char.class} {char.level}</p>
                <p className="text-xs text-gray-500">{char.background} • {char.alignment}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button className={`w-6 h-6 rounded border-2 ${char.inspiration ? 'bg-amber-400 border-amber-400' : 'border-gray-600'}`}>
                {char.inspiration && "★"}
              </button>
              <span className="text-xs text-gray-400">Inspiration</span>
              <span className="ml-auto text-xs text-gray-500">XP: {char.xp.toLocaleString()}</span>
            </div>
          </div>

          {/* Ability Scores */}
          <div className="bg-[#12121a] rounded-lg p-3 border border-gray-800">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(char.abilities).map(([key, val]) => (
                <div key={key} className="bg-[#0a0a0f] rounded-lg p-2 text-center border border-gray-800 hover:border-amber-400/30 transition-colors cursor-pointer">
                  <div className="text-xs text-gray-500 uppercase">{key}</div>
                  <div className="text-2xl font-bold text-amber-400">{val.modifier >= 0 ? `+${val.modifier}` : val.modifier}</div>
                  <div className="text-xs text-gray-400">{val.score}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Saving Throws */}
          <div className="bg-[#12121a] rounded-lg p-3 border border-gray-800">
            <h3 className="text-xs text-gray-500 uppercase mb-2">Saving Throws</h3>
            <div className="space-y-1">
              {Object.entries(char.abilities).map(([key, val]) => (
                <div key={key} className="flex items-center text-sm hover:bg-white/5 rounded px-1 cursor-pointer">
                  <span className={`w-3 h-3 rounded-full mr-2 ${val.saveProficient ? 'bg-amber-400' : 'border border-gray-600'}`} />
                  <span className="uppercase text-gray-400 w-10">{key}</span>
                  <span className={`ml-auto ${val.save >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {val.save >= 0 ? '+' : ''}{val.save}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Skills */}
          <div className="bg-[#12121a] rounded-lg p-3 border border-gray-800 max-h-[300px] overflow-y-auto">
            <h3 className="text-xs text-gray-500 uppercase mb-2">Skills</h3>
            <div className="space-y-1">
              {char.skills.map((skill) => {
                const mod = getSkillMod(skill);
                return (
                  <div key={skill.name} className="flex items-center text-xs hover:bg-white/5 rounded px-1 cursor-pointer">
                    <span className={`w-2.5 h-2.5 rounded-full mr-2 ${skill.expertise ? 'bg-purple-400' : skill.proficient ? 'bg-amber-400' : 'border border-gray-600'}`} />
                    <span className="text-gray-500 w-8 uppercase">{skill.ability}</span>
                    <span className="text-gray-300 flex-1">{skill.name}</span>
                    <span className={mod >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {mod >= 0 ? '+' : ''}{mod}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* === MIDDLE COLUMN: Combat Stats + Main Content === */}
        <div className="col-span-6 space-y-3">
          {/* Combat Stats Row */}
          <div className="grid grid-cols-5 gap-2">
            <StatBox label="AC" value={char.ac} icon="🛡️" />
            <StatBox label="Initiative" value={char.initiative >= 0 ? `+${char.initiative}` : char.initiative} icon="⚡" />
            <StatBox label="Speed" value={`${char.speed} ft`} icon="👟" />
            <StatBox label="Prof. Bonus" value={`+${char.proficiencyBonus}`} icon="⭐" />
            <div className="bg-[#12121a] rounded-lg p-3 border border-gray-800 text-center">
              <div className="text-xs text-gray-500">Hit Dice</div>
              <div className="text-lg font-bold text-amber-400">{char.hitDice.current}/{char.hitDice.max}</div>
              <div className="text-xs text-gray-400">{char.hitDice.die}</div>
            </div>
          </div>

          {/* HP Section */}
          <div className="bg-[#12121a] rounded-lg p-4 border border-gray-800">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Hit Points</span>
                  <span>{char.hp.current} / {char.hp.max}</span>
                </div>
                <div className="h-6 bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all"
                    style={{ width: `${(char.hp.current / char.hp.max) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500">Temp</div>
                <div className="text-lg font-bold text-blue-400">{char.hp.temp}</div>
              </div>
              <div className="border-l border-gray-700 pl-4">
                <div className="text-xs text-gray-500 mb-1">Death Saves</div>
                <div className="flex gap-1">
                  <span className="text-green-400">●●●</span>
                  <span className="text-red-400">○○○</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-[#12121a] rounded-lg border border-gray-800 overflow-hidden">
            <div className="flex border-b border-gray-800">
              {(["actions", "spells", "inventory", "features", "notes"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm capitalize transition-colors ${
                    activeTab === tab
                      ? 'text-amber-400 bg-amber-400/10 border-b-2 border-amber-400'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-4 min-h-[300px]">
              {activeTab === "actions" && (
                <div className="space-y-4">
                  <h4 className="text-sm text-amber-400 uppercase">Attacks</h4>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="text-left pb-2">Name</th>
                        <th className="text-center pb-2">ATK</th>
                        <th className="text-center pb-2">Damage</th>
                        <th className="text-left pb-2">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {char.attacks.map((atk, i) => (
                        <tr key={i} className="border-t border-gray-800 hover:bg-white/5 cursor-pointer">
                          <td className="py-2 text-gray-200">⚔️ {atk.name}</td>
                          <td className="py-2 text-center text-green-400">+{atk.attackBonus}</td>
                          <td className="py-2 text-center text-red-400">{atk.damage}</td>
                          <td className="py-2 text-gray-400">{atk.damageType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "spells" && (
                <div className="space-y-4">
                  <div className="flex gap-4 text-sm">
                    <div><span className="text-gray-500">Spell Save DC:</span> <span className="text-amber-400">{char.spellcasting.saveDC}</span></div>
                    <div><span className="text-gray-500">Spell Attack:</span> <span className="text-green-400">+{char.spellcasting.attackBonus}</span></div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(char.spellcasting.slots).map(([level, slot]) => (
                      <div key={level} className="bg-[#0a0a0f] rounded p-2 text-center border border-gray-800">
                        <div className="text-xs text-gray-500">Level {level}</div>
                        <div className="text-lg font-bold text-purple-400">{slot.max - slot.used}/{slot.max}</div>
                      </div>
                    ))}
                  </div>
                  <h4 className="text-sm text-amber-400 uppercase mt-4">Prepared Spells</h4>
                  <div className="grid grid-cols-2 gap-1">
                    {char.spellcasting.prepared.map((spell, i) => (
                      <div key={i} className="text-sm py-1 px-2 bg-[#0a0a0f] rounded hover:bg-white/5 cursor-pointer">
                        <span className="text-purple-400 text-xs mr-2">{spell.level}</span>
                        {spell.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "inventory" && (
                <div className="space-y-4">
                  <div className="flex gap-2 text-sm">
                    {Object.entries(char.currency).map(([cur, val]) => (
                      <div key={cur} className="px-3 py-1 bg-[#0a0a0f] rounded border border-gray-800">
                        <span className="text-gray-500 uppercase">{cur}</span>
                        <span className="ml-2 text-amber-400">{val}</span>
                      </div>
                    ))}
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="text-left pb-2">Item</th>
                        <th className="text-center pb-2">Qty</th>
                        <th className="text-right pb-2">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {char.equipment.map((item, i) => (
                        <tr key={i} className="border-t border-gray-800 hover:bg-white/5">
                          <td className="py-2">{item.name}</td>
                          <td className="py-2 text-center text-gray-400">{item.quantity}</td>
                          <td className="py-2 text-right text-gray-400">{item.weight} lb</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "features" && (
                <div className="space-y-3">
                  {char.features.map((feat, i) => (
                    <div key={i} className="bg-[#0a0a0f] rounded p-3 border border-gray-800 hover:border-amber-400/30">
                      <div className="flex justify-between">
                        <span className="text-amber-400">{feat.name}</span>
                        <span className="text-xs text-gray-500">{feat.source}</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{feat.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "notes" && (
                <textarea 
                  className="w-full h-64 bg-[#0a0a0f] border border-gray-800 rounded p-3 text-sm resize-none focus:border-amber-400/50 focus:outline-none"
                  placeholder="บันทึกเรื่องราวการผจญภัย..."
                />
              )}
            </div>
          </div>
        </div>

        {/* === RIGHT COLUMN: Personality + Proficiencies === */}
        <div className="col-span-3 space-y-3">
          {/* Personality */}
          <div className="bg-[#12121a] rounded-lg p-4 border border-gray-800">
            <h3 className="text-xs text-gray-500 uppercase mb-3">Personality</h3>
            <div className="space-y-3">
              <PersonalityBox label="Traits" value={char.personality.traits} />
              <PersonalityBox label="Ideals" value={char.personality.ideals} />
              <PersonalityBox label="Bonds" value={char.personality.bonds} />
              <PersonalityBox label="Flaws" value={char.personality.flaws} />
            </div>
          </div>

          {/* Proficiencies */}
          <div className="bg-[#12121a] rounded-lg p-4 border border-gray-800">
            <h3 className="text-xs text-gray-500 uppercase mb-3">Proficiencies</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">Armor:</span> <span className="text-gray-300">{char.proficiencies.armor.join(", ")}</span></div>
              <div><span className="text-gray-500">Weapons:</span> <span className="text-gray-300">{char.proficiencies.weapons.join(", ")}</span></div>
              <div><span className="text-gray-500">Tools:</span> <span className="text-gray-300">{char.proficiencies.tools.join(", ")}</span></div>
              <div><span className="text-gray-500">Languages:</span> <span className="text-gray-300">{char.proficiencies.languages.join(", ")}</span></div>
            </div>
          </div>

          {/* Conditions */}
          <div className="bg-[#12121a] rounded-lg p-4 border border-gray-800">
            <h3 className="text-xs text-gray-500 uppercase mb-3">Conditions</h3>
            <div className="text-gray-500 text-sm italic">No active conditions</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-[#12121a] rounded-lg p-3 border border-gray-800 text-center hover:border-amber-400/30 transition-colors cursor-pointer">
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-lg font-bold text-amber-400">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function PersonalityBox({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-amber-400/70 uppercase mb-1">{label}</div>
      <p className="text-sm text-gray-300 italic">"{value}"</p>
    </div>
  );
}
