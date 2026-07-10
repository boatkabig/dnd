/**
 * Domain 24: Time (Turn, Round, Duration, Calendar)
 *
 * จัดการเวลาในเกมทั้งหมด
 *
 * Sub-systems:
 *  24.1 Time Scale   — Turn / Round / Minute / Hour / Day / Month / Year
 *  24.2 Combat Time  — Initiative Turn / Round / Action Timing
 *  24.3 Duration     — Instant / Round / Minute / Hour / Day / Permanent
 *  24.4 Timer        — countdown (spell / trap / event)
 *  24.5 Calendar     — Date / Season / Holiday / Timeline
 *  24.6 Time Events  — sunrise / weather change / quest deadline / NPC schedule
 *
 * SINGLE GLOBAL CLOCK. Combat/Spell/World all read from the same TimeEngine.
 */

/* ======================================================================
 * 24.1 TIME SCALE
 * ====================================================================== */

export type TimeScaleUnit =
  | "round" // 6 sec — combat
  | "minute"
  | "hour"
  | "day"
  | "month"
  | "year";

export const UNIT_TO_SECONDS: Record<TimeScaleUnit, number> = {
  round: 6,
  minute: 60,
  hour: 3600,
  day: 86400,
  month: 2592000, // 30 days
  year: 31536000, // 365 days
};

export interface GameTime {
  totalSeconds: number;
}

export function createTime(initialSeconds = 0): GameTime {
  return { totalSeconds: initialSeconds };
}

export function advanceTime(time: GameTime, seconds: number): GameTime {
  return { totalSeconds: time.totalSeconds + seconds };
}

export function advanceByUnit(time: GameTime, amount: number, unit: TimeScaleUnit): GameTime {
  return advanceTime(time, amount * UNIT_TO_SECONDS[unit]);
}

export function formatGameTime(time: GameTime): string {
  const total = time.totalSeconds;
  const years = Math.floor(total / UNIT_TO_SECONDS.year);
  let rem = total % UNIT_TO_SECONDS.year;
  const months = Math.floor(rem / UNIT_TO_SECONDS.month);
  rem = rem % UNIT_TO_SECONDS.month;
  const days = Math.floor(rem / UNIT_TO_SECONDS.day);
  rem = rem % UNIT_TO_SECONDS.day;
  const hours = Math.floor(rem / UNIT_TO_SECONDS.hour);
  rem = rem % UNIT_TO_SECONDS.hour;
  const minutes = Math.floor(rem / UNIT_TO_SECONDS.minute);
  const seconds = rem % UNIT_TO_SECONDS.minute;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}ปี`);
  if (months > 0) parts.push(`${months}ด.`);
  if (days > 0) parts.push(`${days}วัน`);
  if (hours > 0) parts.push(`${hours}ชม.`);
  if (minutes > 0) parts.push(`${minutes}น.`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}วิ`);
  return parts.join(" ");
}

/* ======================================================================
 * 24.2 COMBAT TIME
 * ====================================================================== */

export interface CombatClock {
  round: number; // 1-indexed
  currentTurnIndex: number; // index in initiative order
  initiativeOrder: string[]; // combatant IDs
  timeAtRoundStart: number; // totalSeconds when round began
}

export function createCombatClock(initiativeOrder: string[], worldTime: GameTime): CombatClock {
  return {
    round: 1,
    currentTurnIndex: 0,
    initiativeOrder,
    timeAtRoundStart: worldTime.totalSeconds,
  };
}

export function nextTurn(clock: CombatClock, worldTime: GameTime): {
  clock: CombatClock;
  worldTime: GameTime;
  newRound: boolean;
} {
  const nextIdx = clock.currentTurnIndex + 1;
  if (nextIdx >= clock.initiativeOrder.length) {
    // New round: advance world time by 6 seconds
    const newWorld = advanceByUnit(worldTime, 1, "round");
    return {
      clock: {
        ...clock,
        round: clock.round + 1,
        currentTurnIndex: 0,
        timeAtRoundStart: newWorld.totalSeconds,
      },
      worldTime: newWorld,
      newRound: true,
    };
  }
  return {
    clock: { ...clock, currentTurnIndex: nextIdx },
    worldTime,
    newRound: false,
  };
}

export function currentCombatantId(clock: CombatClock): string | undefined {
  return clock.initiativeOrder[clock.currentTurnIndex];
}

/* ======================================================================
 * 24.3 DURATION
 * ====================================================================== */

export type DurationUnit =
  | "instant"
  | "round"
  | "minute"
  | "hour"
  | "day"
  | "permanent";

export interface Duration {
  unit: DurationUnit;
  amount: number; // ignored for instant/permanent
}

export function durationToSeconds(d: Duration, casterLevel = 1): number {
  switch (d.unit) {
    case "instant":
      return 0;
    case "round":
      return d.amount * 6;
    case "minute":
      return d.amount * 60;
    case "hour":
      return d.amount * 3600;
    case "day":
      return d.amount * 86400;
    case "permanent":
      return Number.MAX_SAFE_INTEGER;
  }
}

export function formatDuration(d: Duration): string {
  switch (d.unit) {
    case "instant":
      return "ทันที";
    case "permanent":
      return "ถาวร";
    case "round":
      return `${d.amount} รอบ`;
    case "minute":
      return `${d.amount} นาที`;
    case "hour":
      return `${d.amount} ชม.`;
    case "day":
      return `${d.amount} วัน`;
  }
}

/* ======================================================================
 * 24.4 TIMER
 * ====================================================================== */

export interface Timer {
  id: string;
  label: string;
  startedAt: number; // totalSeconds when started
  durationSeconds: number;
  onExpireEvent?: string; // event type to dispatch
  paused?: boolean;
  remainingWhenPaused?: number;
}

export function startTimer(
  worldTime: GameTime,
  spec: { id: string; label: string; duration: Duration; onExpireEvent?: string },
): Timer {
  return {
    id: spec.id,
    label: spec.label,
    startedAt: worldTime.totalSeconds,
    durationSeconds: durationToSeconds(spec.duration),
    onExpireEvent: spec.onExpireEvent,
  };
}

export function isTimerExpired(timer: Timer, worldTime: GameTime): boolean {
  if (timer.paused) {
    return (timer.remainingWhenPaused ?? 0) <= 0;
  }
  return worldTime.totalSeconds - timer.startedAt >= timer.durationSeconds;
}

export function timerRemainingSeconds(timer: Timer, worldTime: GameTime): number {
  if (timer.paused) return timer.remainingWhenPaused ?? 0;
  const elapsed = worldTime.totalSeconds - timer.startedAt;
  return Math.max(0, timer.durationSeconds - elapsed);
}

export function pauseTimer(timer: Timer, worldTime: GameTime): Timer {
  if (timer.paused) return timer;
  return {
    ...timer,
    paused: true,
    remainingWhenPaused: timerRemainingSeconds(timer, worldTime),
  };
}

export function resumeTimer(timer: Timer, worldTime: GameTime): Timer {
  if (!timer.paused || timer.remainingWhenPaused === undefined) return timer;
  return {
    ...timer,
    paused: false,
    startedAt: worldTime.totalSeconds,
    durationSeconds: timer.remainingWhenPaused,
    remainingWhenPaused: undefined,
  };
}

/* ======================================================================
 * 24.5 CALENDAR
 * ====================================================================== */

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-30
  hour: number; // 0-23
  minute: number; // 0-59
}

export interface CalendarDefinition {
  monthsPerYear: number;
  daysPerMonth: number;
  hoursPerDay: number;
  minutesPerHour: number;
  seasonByMonth: Record<number, Season>;
  holidays: Array<{ month: number; day: number; name: string }>;
  weekdayNames?: string[];
}

export const FORGOTTEN_REALMS_CALENDAR: CalendarDefinition = {
  monthsPerYear: 12,
  daysPerMonth: 30,
  hoursPerDay: 24,
  minutesPerHour: 60,
  seasonByMonth: {
    1: "winter", 2: "winter", 3: "spring",
    4: "spring", 5: "spring", 6: "summer",
    7: "summer", 8: "summer", 9: "autumn",
    10: "autumn", 11: "autumn", 12: "winter",
  },
  holidays: [
    { month: 1, day: 1, name: "วันปีใหม่" },
    { month: 6, day: 21, name: "Midsummer" },
    { month: 12, day: 21, name: "Midwinter" },
  ],
  weekdayNames: ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"],
};

export function gameTimeToDate(time: GameTime, cal: CalendarDefinition = FORGOTTEN_REALMS_CALENDAR): CalendarDate {
  const totalMinutes = Math.floor(time.totalSeconds / 60);
  const minute = totalMinutes % cal.minutesPerHour;
  const totalHours = Math.floor(totalMinutes / cal.minutesPerHour);
  const hour = totalHours % cal.hoursPerDay;
  const totalDays = Math.floor(totalHours / cal.hoursPerDay);
  const day = (totalDays % cal.daysPerMonth) + 1;
  const totalMonths = Math.floor(totalDays / cal.daysPerMonth);
  const month = (totalMonths % cal.monthsPerYear) + 1;
  const year = Math.floor(totalMonths / cal.monthsPerYear) + 1;
  return { year, month, day, hour, minute };
}

export function getSeason(date: CalendarDate, cal: CalendarDefinition = FORGOTTEN_REALMS_CALENDAR): Season {
  return cal.seasonByMonth[date.month] ?? "spring";
}

export function isHoliday(date: CalendarDate, cal: CalendarDefinition = FORGOTTEN_REALMS_CALENDAR): string | undefined {
  return cal.holidays.find((h) => h.month === date.month && h.day === date.day)?.name;
}

export function formatCalendarDate(date: CalendarDate, cal: CalendarDefinition = FORGOTTEN_REALMS_CALENDAR): string {
  const season = getSeason(date, cal);
  const seasonLabel: Record<Season, string> = {
    spring: "ฤดูใบไม้ผลิ",
    summer: "ฤดูร้อน",
    autumn: "ฤดูใบไม้ร่วง",
    winter: "ฤดูหนาว",
  };
  const holiday = isHoliday(date, cal);
  const time = `${String(date.hour).padStart(2, "0")}:${String(date.minute).padStart(2, "0")}`;
  const base = `วันที่ ${date.day}/${date.month}/${date.year} (${seasonLabel[season]}) เวลา ${time}`;
  return holiday ? `${base} — ${holiday}` : base;
}

/* ======================================================================
 * 24.6 TIME EVENTS
 * ====================================================================== */

export type TimeEventTrigger =
  | "sunrise"
  | "sunset"
  | "noon"
  | "midnight"
  | "weather_change"
  | "quest_deadline"
  | "npc_schedule"
  | "timer_expire";

export interface TimeEvent {
  id: string;
  trigger: TimeEventTrigger;
  firesAt: number; // totalSeconds when this fires
  description: string;
  repeatIntervalSeconds?: number; // for recurring events
  payload?: unknown;
}

export function scheduleTimeEvent(
  worldTime: GameTime,
  spec: { id: string; trigger: TimeEventTrigger; delay: Duration; description: string; repeatInterval?: Duration; payload?: unknown },
): TimeEvent {
  return {
    id: spec.id,
    trigger: spec.trigger,
    firesAt: worldTime.totalSeconds + durationToSeconds(spec.delay),
    description: spec.description,
    repeatIntervalSeconds: spec.repeatInterval ? durationToSeconds(spec.repeatInterval) : undefined,
    payload: spec.payload,
  };
}

export function checkTimeEvents(worldTime: GameTime, events: TimeEvent[]): {
  fired: TimeEvent[];
  remaining: TimeEvent[];
} {
  const fired: TimeEvent[] = [];
  const remaining: TimeEvent[] = [];
  for (const e of events) {
    if (e.firesAt <= worldTime.totalSeconds) {
      fired.push(e);
      if (e.repeatIntervalSeconds) {
        remaining.push({
          ...e,
          firesAt: worldTime.totalSeconds + e.repeatIntervalSeconds,
        });
      }
    } else {
      remaining.push(e);
    }
  }
  return { fired, remaining };
}

/* ======================================================================
 * WORLD CLOCK (global singleton helper)
 * ====================================================================== */

export class WorldClock {
  private time: GameTime;
  private timers: Timer[] = [];
  private events: TimeEvent[] = [];

  constructor(initialSeconds = 0) {
    this.time = createTime(initialSeconds);
  }

  getTime(): GameTime {
    return { ...this.time };
  }

  advance(seconds: number): GameTime {
    this.time = advanceTime(this.time, seconds);
    return this.getTime();
  }

  advanceBy(amount: number, unit: TimeScaleUnit): GameTime {
    this.time = advanceByUnit(this.time, amount, unit);
    return this.getTime();
  }

  addTimer(spec: { id: string; label: string; duration: Duration; onExpireEvent?: string }): Timer {
    const t = startTimer(this.time, spec);
    this.timers.push(t);
    return t;
  }

  expireTimers(): Timer[] {
    const expired = this.timers.filter((t) => isTimerExpired(t, this.time));
    this.timers = this.timers.filter((t) => !isTimerExpired(t, this.time));
    return expired;
  }

  scheduleEvent(spec: Parameters<typeof scheduleTimeEvent>[1]): TimeEvent {
    const e = scheduleTimeEvent(this.time, spec);
    this.events.push(e);
    return e;
  }

  checkEvents(): TimeEvent[] {
    const { fired, remaining } = checkTimeEvents(this.time, this.events);
    this.events = remaining;
    return fired;
  }

  format(): string {
    return formatGameTime(this.time);
  }

  formatDate(cal: CalendarDefinition = FORGOTTEN_REALMS_CALENDAR): string {
    return formatCalendarDate(gameTimeToDate(this.time, cal), cal);
  }
}
