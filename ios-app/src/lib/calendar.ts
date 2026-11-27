import core from './calendar-core.js';

export type Meal = 'lunch' | 'dinner' | 'breakfast' | 'open';

export type Shift = {
  id: string;
  userId: string;
  weekday: number | null;
  date: string | null;
  start: number;
  end: number;
  label: string;
};

export type DayOff = { userId: string; date: string };

export type Spot = { id: string; name: string; note: string; preset?: boolean; createdBy?: string | null };

export type MeetupStatus = 'proposed' | 'confirmed' | 'cancelled';

export type Meetup = {
  id: string;
  day: string;
  start: number;
  end: number;
  spot: string;
  ride: string;
  status: MeetupStatus;
  proposedBy: string;
  confirmedBy: string | null;
  messageId: number | null;
};

export type Opening = {
  start: number;
  end: number;
  minutes: number;
  meal: Meal;
  label: string;
  hint: string;
  rank: number;
};

export type CalendarState = {
  shifts: Shift[];
  daysOff: DayOff[];
  spots: Spot[];
  meetups: Meetup[];
};

export type ShiftInput = {
  id?: string;
  userId: string;
  weekday: number | null;
  date: string | null;
  start: number;
  end: number;
  label: string;
};

export type OverlapInput = {
  shifts: Shift[];
  daysOff: DayOff[];
  meId: string;
  themId: string;
  day: string;
};

export type DayPlan = {
  day: string;
  skip: boolean;
  reason?: string;
  start?: number;
  end?: number;
  spot?: string;
  ride?: string;
  meal?: Meal;
  label?: string;
  hint?: string;
};

type CalendarChange = {
  table: string;
  event?: string;
  eventType?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
  row?: Record<string, unknown>;
};

export const PRESET_SPOTS = core.PRESET_SPOTS as string[];
export const SHIFT_PRESETS = core.SHIFT_PRESETS as { label: string; start: number; end: number }[];
export const TIME_DELTAS = core.TIME_DELTAS as number[];
export const WEEKDAYS = core.WEEKDAYS as string[];

export const isIsoDate = core.isIsoDate as (value: string) => boolean;
export const todayIso = core.todayIso as (now?: Date) => string;
export const addDays = core.addDays as (iso: string, count: number) => string;
export const weekdayOf = core.weekdayOf as (iso: string) => number;
export const weekDates = core.weekDates as (anchor: string) => string[];
export const formatDayLabel = core.formatDayLabel as (iso: string, today?: string) => string;
export const formatMinutes = core.formatMinutes as (mins: number) => string;
export const formatRange = core.formatRange as (start: number, end: number) => string;
export const parseClock = core.parseClock as (value: string) => number | null;
export const overlapWindows = core.overlapWindows as (input: OverlapInput) => Opening[];
export const durationChoices = core.durationChoices as (window: { start: number; end: number } | null) => number[];
export const slotChoices = core.slotChoices as (window: { start: number; end: number } | null, duration: number) => { start: number; end: number }[];
export const suggestSlot = core.suggestSlot as (window: { start: number; end: number } | null, duration?: number) => { start: number; end: number } | null;
export const shiftRange = core.shiftRange as (start: number, end: number, delta: number) => { ok: boolean; start?: number; end?: number; reason?: string };
export const normalizeSpot = core.normalizeSpot as (name: string) => string;
export const mergeSpots = core.mergeSpots as (saved: Spot[]) => Spot[];
export const otherSpots = core.otherSpots as (saved: Spot[], current: string) => Spot[];
export const validShift = core.validShift as (input: { start: number; end: number; label: string }) => string | null;
export const shiftConflict = core.shiftConflict as (shifts: Shift[], candidate: ShiftInput) => boolean;
export const meetupSummary = core.meetupSummary as (meetup: Meetup) => string;
export const meetupToIcs = core.meetupToIcs as (meetup: Meetup, dtstamp?: string) => string;
export const planDailyMeetups = core.planDailyMeetups as (input: {
  shifts: Shift[];
  daysOff: DayOff[];
  meId: string;
  themId: string;
  startDay: string;
  days: number;
  spot: string;
  ride?: string;
  duration?: number;
}) => DayPlan[];
export const canConfirm = core.canConfirm as (meetup: Meetup | null, meId: string) => boolean;
export const canCounter = core.canCounter as (meetup: Meetup | null) => boolean;
export const isMeetupMessage = core.isMeetupMessage as (message: { meta?: { flarm?: string; meetup_id?: string } | null }) => boolean;
export const todaysConfirmed = core.todaysConfirmed as (meetups: Meetup[], today: string) => Meetup | null;
export const bannerCopy = core.bannerCopy as (meetup: Meetup | null) => { title: string; detail: string; ride: string } | null;
export const emptyCalendar = core.emptyCalendar as () => CalendarState;
export const applyCalendarChange = core.applyCalendarChange as (state: CalendarState, change: CalendarChange) => CalendarState;
export const calendarFromRows = core.calendarFromRows as (rows: {
  shifts?: Record<string, unknown>[];
  daysOff?: Record<string, unknown>[];
  spots?: Record<string, unknown>[];
  meetups?: Record<string, unknown>[];
}) => CalendarState;

export function dateFromMeetup(day: string, minutes: number): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, Math.floor(minutes / 60), minutes % 60, 0, 0);
}
