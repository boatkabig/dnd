/**
 * Environment System — สภาพแวดล้อม (16.1–16.9)
 * Weather, Lighting, Temperature, Hazards, Natural Effects, Magical Environment
 */

/* ======================================================================
 * 16.1 ENVIRONMENT STATE
 * ====================================================================== */

export interface EnvironmentState {
  location: string;
  region: string;
  areaType: "dungeon" | "forest" | "town" | "wilderness" | "underground" | "building" | "water" | "desert" | "mountain" | "plane";
  weather: WeatherState;
  lighting: LightingState;
  temperature: TemperatureState;
  hazards: EnvironmentalHazard[];
  magicalEffects: MagicalEnvironment[];
  activeEffects: string[];
}

/* ======================================================================
 * 16.2 WEATHER
 * ====================================================================== */

export type WeatherType = "clear" | "rain" | "storm" | "snow" | "fog" | "extreme_heat" | "extreme_cold" | "windy";

export interface WeatherState {
  type: WeatherType;
  intensity: "light" | "moderate" | "heavy" | "extreme";
  visibilityPenalty: number;   // ft reduction to vision
  stealthBonus?: number;       // bonus to Stealth from rain/fog noise
  descriptionTh: string;
}

export const WEATHER_PRESETS: Record<WeatherType, WeatherState> = {
  clear:         { type: "clear",         intensity: "light",    visibilityPenalty: 0,  descriptionTh: "ท้องฟ้าแจ่มใส" },
  rain:          { type: "rain",          intensity: "moderate", visibilityPenalty: 0,  stealthBonus: 0, descriptionTh: "ฝนตก" },
  storm:         { type: "storm",         intensity: "heavy",    visibilityPenalty: 20, stealthBonus: 2, descriptionTh: "พายุฝนฟ้าคะนอง" },
  snow:          { type: "snow",          intensity: "moderate", visibilityPenalty: 10, descriptionTh: "หิมะตก" },
  fog:           { type: "fog",           intensity: "heavy",    visibilityPenalty: 50, stealthBonus: 1, descriptionTh: "หมอกหนา" },
  extreme_heat:  { type: "extreme_heat",  intensity: "extreme",  visibilityPenalty: 0,  descriptionTh: "ร้อนจัด" },
  extreme_cold:  { type: "extreme_cold",  intensity: "extreme",  visibilityPenalty: 0,  descriptionTh: "หนาวจัด" },
  windy:         { type: "windy",         intensity: "moderate", visibilityPenalty: 0,  descriptionTh: "ลมแรง" },
};

/* ======================================================================
 * 16.3 LIGHTING
 * ====================================================================== */

export type LightLevel = "bright" | "dim" | "darkness" | "magical_light" | "magical_darkness";

export interface LightingState {
  level: LightLevel;
  sources: LightSource[];
  descriptionTh: string;
}

export interface LightSource {
  name: string;
  type: "sun" | "torch" | "lantern" | "spell" | "fire" | "magical";
  radius: number;        // ft of bright light
  dimRadius?: number;    // ft of dim light beyond bright
  duration?: number;     // rounds remaining
}

export function getLightLevelAt(pos: { x: number; y: number }, sources: LightSource[], timeOfDay: number): LightLevel {
  // Daytime (6-18) = bright unless indoors
  if (timeOfDay >= 6 && timeOfDay < 18) {
    // Check if any source creates darkness (magical)
    if (sources.some((s) => s.type === "magical" && s.radius === 0)) return "magical_darkness";
    return "bright";
  }
  // Night/dawn/dusk = darkness unless light source nearby
  let hasDim = false;
  for (const s of sources) {
    const dist = Math.abs(pos.x) + Math.abs(pos.y); // simplified
    if (dist <= s.radius) return "bright";
    if (s.dimRadius && dist <= s.dimRadius) hasDim = true;
  }
  if (sources.some((s) => s.type === "magical" && s.radius === 0)) return "magical_darkness";
  return hasDim ? "dim" : "darkness";
}

/* ======================================================================
 * 16.4 TEMPERATURE
 * ====================================================================== */

export type TemperatureLevel = "comfortable" | "hot" | "cold" | "extreme_heat" | "extreme_cold";

export interface TemperatureState {
  level: TemperatureLevel;
  exhaustionDC?: number;      // CON save DC to avoid exhaustion
  damagePerHour?: string;     // e.g. "1d6 fire" for extreme heat
  damageType?: string;
  descriptionTh: string;
}

export const TEMPERATURE_PRESETS: Record<TemperatureLevel, TemperatureState> = {
  comfortable:    { level: "comfortable",    descriptionTh: "อุณหภูมิปกติ" },
  hot:            { level: "hot",            descriptionTh: "ร้อน" },
  cold:           { level: "cold",           descriptionTh: "หนาว" },
  extreme_heat:   { level: "extreme_heat",   exhaustionDC: 15, damagePerHour: "1d6", damageType: "fire", descriptionTh: "ร้อนจัด — CON save DC 15 ทุกชม. ไม่ผ่านได้ Exhaustion" },
  extreme_cold:   { level: "extreme_cold",   exhaustionDC: 15, damagePerHour: "1d6", damageType: "cold", descriptionTh: "หนาวจัด — CON save DC 15 ทุกชม. ไม่ผ่านได้ Exhaustion" },
};

/* ======================================================================
 * 16.5 ENVIRONMENTAL HAZARDS
 * ====================================================================== */

export interface EnvironmentalHazard {
  id: string;
  name: string;
  nameTh: string;
  type: "lava" | "fire" | "acid" | "poison_gas" | "falling_rock" | "quicksand" | "spike" | "ice" | "web" | "grease";
  damage?: string;           // e.g. "2d6"
  damageType?: string;
  trigger: "on_enter" | "on_start_turn" | "on_end_turn" | "continuous";
  saveDC?: number;
  saveAbility?: string;
  saveSuccess?: "half" | "none" | "negate";
  radius?: number;           // ft
  duration?: number;         // rounds
  descriptionTh: string;
}

/* ======================================================================
 * 16.6 NATURAL EFFECTS
 * ====================================================================== */

export type NaturalEffectType = "earthquake" | "flood" | "storm" | "wind" | "avalanche" | "wildfire";

export interface NaturalEffect {
  type: NaturalEffectType;
  intensity: number;         // 1-10
  duration: number;          // rounds
  effects: string[];         // e.g. ["difficult_terrain", "damage_1d6_bludgeoning"]
  descriptionTh: string;
}

/* ======================================================================
 * 16.7 MAGICAL ENVIRONMENT
 * ====================================================================== */

export type MagicalEnvType = "anti_magic" | "wild_magic" | "cursed_land" | "dead_magic" | "enhanced_magic";

export interface MagicalEnvironment {
  type: MagicalEnvType;
  radius: number;            // ft, 0 = entire area
  descriptionTh: string;
  effects: string[];         // e.g. ["no_spellcasting", "advantage_wild_magic"]
}

/* ======================================================================
 * 16.8 ENVIRONMENTAL INTERACTION
 * ====================================================================== */

export type EnvInteraction = "ignite" | "freeze" | "break_structure" | "create_cover" | "change_terrain" | "flood_area" | "extinguish";

export function canInteractWithEnvironment(interaction: EnvInteraction, env: EnvironmentState): { allowed: boolean; reasonTh: string } {
  // Simplified — allow most interactions
  return { allowed: true, reasonTh: "ทำได้" };
}

/* ======================================================================
 * 16.9 ENVIRONMENT EVENTS
 * ====================================================================== */

export type EnvironmentEvent = "weather_change" | "hazard_trigger" | "area_effect_start" | "area_effect_end" | "temperature_change" | "lighting_change";

/* ======================================================================
 * FACTORY
 * ====================================================================== */

export function createEnvironment(areaType: EnvironmentState["areaType"] = "dungeon"): EnvironmentState {
  const isOutdoors = areaType === "forest" || areaType === "wilderness" || areaType === "desert" || areaType === "mountain" || areaType === "water";
  return {
    location: "Unknown",
    region: "Unknown",
    areaType,
    weather: isOutdoors ? WEATHER_PRESETS.clear : { ...WEATHER_PRESETS.clear, descriptionTh: "ภายในอาคาร" },
    lighting: areaType === "dungeon" || areaType === "underground"
      ? { level: "darkness", sources: [], descriptionTh: "มืดสนิท" }
      : { level: "bright", sources: [], descriptionTh: "แสงสว่าง" },
    temperature: TEMPERATURE_PRESETS.comfortable,
    hazards: [],
    magicalEffects: [],
    activeEffects: [],
  };
}
