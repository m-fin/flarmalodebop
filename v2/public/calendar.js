// Shared calendar + daily restaurant meetup rules. No DOM, no network.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlarmCalendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PRESET_SPOTS = ['Golden Corral', 'Home kitchen', 'The Pond'];
  const SHIFT_PRESETS = [
    { label: 'Morning', start: 6 * 60, end: 14 * 60 },
    { label: 'Day', start: 9 * 60, end: 17 * 60 },
    { label: 'Swing', start: 15 * 60, end: 23 * 60 },
    { label: 'Late', start: 16 * 60, end: 24 * 60 },
  ];
  const DAY_OPEN = 8 * 60;
  const DAY_CLOSE = 22 * 60;
  const MIN_MEET = 45;
  const TIME_DELTAS = [-30, -15, 15, 30];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MEALS = [
    { id: 'lunch', label: 'Lunch opening', start: 11 * 60, end: 14 * 60, rank: 0 },
    { id: 'dinner', label: 'Dinner opening', start: 16 * 60 + 30, end: 20 * 60 + 30, rank: 1 },
    { id: 'breakfast', label: 'Breakfast opening', start: 8 * 60, end: 10 * 60 + 30, rank: 2 },
  ];
  const OPEN_MEAL = { id: 'open', label: 'Open window', rank: 3 };

  function isoFromParts(year, month, day) {
    return String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const [year, month, day] = String(value).split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function todayIso(now) {
    const date = now instanceof Date ? now : new Date();
    return isoFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function addDays(iso, count) {
    if (!isIsoDate(iso)) return null;
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(year, month - 1, day + Number(count || 0));
    return isoFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function weekdayOf(iso) {
    if (!isIsoDate(iso)) return null;
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day).getDay();
  }

  function weekDates(anchor) {
    if (!isIsoDate(anchor)) return [];
    const start = addDays(anchor, -weekdayOf(anchor));
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }

  function formatDayLabel(iso, today) {
    if (!isIsoDate(iso)) return '';
    if (today && iso === today) return 'Today';
    if (today && iso === addDays(today, 1)) return 'Tomorrow';
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return WEEKDAYS[date.getDay()] + ', ' + MONTHS[date.getMonth()] + ' ' + date.getDate();
  }

  function formatMinutes(mins) {
    const value = ((Number(mins) % 1440) + 1440) % 1440;
    const hour = Math.floor(value / 60);
    const minute = value % 60;
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return hour12 + ':' + String(minute).padStart(2, '0') + (hour >= 12 ? ' PM' : ' AM');
  }

  function formatRange(start, end) {
    const left = formatMinutes(start);
    const right = formatMinutes(end);
    const leftSuffix = left.slice(-2);
    const rightSuffix = right.slice(-2);
    if (leftSuffix === rightSuffix) return left.slice(0, -3) + '–' + right;
    return left + '–' + right;
  }

  function parseClock(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = match[2] == null ? 0 : Number(match[2]);
    const suffix = match[3] ? match[3].toLowerCase() : '';
    if (minute > 59 || hour > 24) return null;
    if (suffix) {
      if (hour < 1 || hour > 12) return null;
      if (suffix === 'pm' && hour !== 12) hour += 12;
      if (suffix === 'am' && hour === 12) hour = 0;
    } else if (hour === 24) {
      if (minute !== 0) return null;
      return 1440;
    }
    if (hour > 23) return null;
    return hour * 60 + minute;
  }

  function clockInput(mins) {
    const value = Math.max(0, Math.min(1439, Number(mins) || 0));
    return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
  }

  function mergeIntervals(intervals) {
    const sorted = (intervals || [])
      .map((interval) => ({ start: Number(interval.start), end: Number(interval.end) }))
      .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const interval of sorted) {
      const last = merged[merged.length - 1];
      if (!last || interval.start > last.end) merged.push({ start: interval.start, end: interval.end });
      else last.end = Math.max(last.end, interval.end);
    }
    return merged;
  }

  function complementIntervals(busy, windowStart, windowEnd) {
    const merged = mergeIntervals(busy).filter((interval) => interval.end > windowStart && interval.start < windowEnd);
    const free = [];
    let cursor = windowStart;
    for (const interval of merged) {
      const start = Math.max(interval.start, windowStart);
      const end = Math.min(interval.end, windowEnd);
      if (start > cursor) free.push({ start: cursor, end: start });
      cursor = Math.max(cursor, end);
    }
    if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd });
    return free.filter((interval) => interval.end - interval.start >= MIN_MEET);
  }

  function intersectIntervals(left, right) {
    const found = [];
    for (const a of left || []) {
      for (const b of right || []) {
        const start = Math.max(a.start, b.start);
        const end = Math.min(a.end, b.end);
        if (end - start >= MIN_MEET) found.push({ start, end });
      }
    }
    return mergeIntervals(found);
  }

  function applicableBusy(shifts, daysOff, userId, day) {
    if (!isIsoDate(day)) return [];
    const off = (daysOff || []).some((row) => row.userId === userId && row.date === day);
    const weekday = weekdayOf(day);
    return (shifts || [])
      .filter((shift) => {
        if (!shift || shift.userId !== userId) return false;
        if (shift.date) return shift.date === day;
        if (off) return false;
        return shift.weekday === weekday;
      })
      .map((shift) => ({ start: Number(shift.start), end: Number(shift.end), label: shift.label || 'Shift' }));
  }

  function windowHint(interval, busy) {
    const after = (busy || []).some((block) => Math.abs(block.end - interval.start) <= 30);
    const before = (busy || []).some((block) => Math.abs(block.start - interval.end) <= 30);
    if (after && before) return 'Between shifts';
    if (after) return 'Right after a shift';
    if (before) return 'Before a shift';
    return 'Both free';
  }

  function annotateChip(interval, meal, busy) {
    return {
      start: interval.start,
      end: interval.end,
      minutes: interval.end - interval.start,
      meal: meal.id,
      label: meal.label,
      hint: windowHint(interval, busy),
      rank: meal.rank,
    };
  }

  function overlapWindows(input) {
    const shifts = (input && input.shifts) || [];
    const daysOff = (input && input.daysOff) || [];
    const day = input && input.day;
    const mine = applicableBusy(shifts, daysOff, input && input.meId, day);
    const theirs = applicableBusy(shifts, daysOff, input && input.themId, day);
    const both = intersectIntervals(
      complementIntervals(mine, DAY_OPEN, DAY_CLOSE),
      complementIntervals(theirs, DAY_OPEN, DAY_CLOSE),
    );
    const busy = mine.concat(theirs);
    const chips = [];
    for (const interval of both) {
      let mealHits = 0;
      for (const meal of MEALS) {
        const start = Math.max(interval.start, meal.start);
        const end = Math.min(interval.end, meal.end);
        if (end - start >= MIN_MEET) {
          chips.push(annotateChip({ start, end }, meal, busy));
          mealHits += 1;
        }
      }
      if (!mealHits) chips.push(annotateChip(interval, OPEN_MEAL, busy));
    }
    chips.sort((a, b) => a.rank - b.rank || a.start - b.start);
    return chips;
  }

  function snapUp15(mins) {
    return Math.ceil(Number(mins) / 15) * 15;
  }

  function durationChoices(window) {
    if (!window) return [];
    const length = window.end - window.start;
    const options = [];
    if (length >= 45) options.push(45);
    if (length >= 60) options.push(60);
    if (length >= 90) options.push(90);
    return options.length ? options : [length];
  }

  function slotChoices(window, duration) {
    if (!window) return [];
    const dur = Math.min(Math.max(Number(duration) || 0, MIN_MEET), window.end - window.start);
    if (dur < MIN_MEET) return [];
    const choices = [];
    let start = snapUp15(window.start);
    if (start < window.start) start += 15;
    for (; start + dur <= window.end; start += 15) choices.push({ start, end: start + dur });
    if (!choices.length) {
      const fitted = window.end - dur;
      if (fitted >= window.start) choices.push({ start: fitted, end: fitted + dur });
    }
    return choices;
  }

  function suggestSlot(window, duration) {
    const preferred = durationChoices(window).includes(90) ? 90 : durationChoices(window).slice(-1)[0];
    const dur = duration || preferred;
    const choices = slotChoices(window, dur);
    return choices[0] || null;
  }

  function shiftRange(start, end, delta) {
    if (!TIME_DELTAS.includes(delta)) return { ok: false, reason: 'Pick 15 or 30 minutes' };
    const duration = end - start;
    const next = start + delta;
    if (next < 0 || next + duration > 1440) return { ok: false, reason: 'That moves the meetup off the day' };
    return { ok: true, start: next, end: next + duration };
  }

  function rangeInside(windows, start, end) {
    return (windows || []).some((window) => start >= window.start && end <= window.end);
  }

  function normalizeSpot(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function mergeSpots(saved) {
    const seen = new Set();
    const spots = [];
    PRESET_SPOTS.forEach((name) => {
      seen.add(name.toLowerCase());
      spots.push({ id: null, name, note: '', preset: true });
    });
    (saved || []).forEach((spot) => {
      const name = normalizeSpot(spot && spot.name);
      if (!name || seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());
      spots.push({ id: spot.id || null, name, note: spot.note || '', preset: false, createdBy: spot.createdBy || spot.created_by || null });
    });
    return spots;
  }

  function otherSpots(saved, current) {
    const name = normalizeSpot(current).toLowerCase();
    return mergeSpots(saved).filter((spot) => spot.name.toLowerCase() !== name);
  }

  function validShift(input) {
    const start = Number(input && input.start);
    const end = Number(input && input.end);
    const label = String((input && input.label) || '').replace(/\s+/g, ' ').trim();
    if (!Number.isInteger(start) || !Number.isInteger(end)) return 'Pick a start and end';
    if (start < 0 || start > 1439 || end < 1 || end > 1440) return 'Keep the shift inside the day';
    if (end <= start) return 'End must be after the start';
    if (end - start < 30) return 'A shift needs at least 30 minutes';
    if (!label) return 'Name the shift';
    if (label.length > 40) return 'Keep the label short';
    return null;
  }

  function sameSlot(a, b) {
    if (a.date || b.date) return a.date && a.date === b.date;
    return a.weekday === b.weekday && !a.date && !b.date;
  }

  function shiftConflict(shifts, candidate) {
    return (shifts || []).some((shift) => {
      if (!shift || shift.userId !== candidate.userId || shift.id === candidate.id) return false;
      if (!sameSlot(shift, candidate)) return false;
      return candidate.start < shift.end && candidate.end > shift.start;
    });
  }

  function meetupSummary(meetup) {
    const spot = normalizeSpot(meetup && meetup.spot) || 'Restaurant';
    const lines = [
      '🍽️ Daily Restaurant Meetup',
      spot,
      formatDayLabel(meetup.day) + ' · ' + formatRange(meetup.start, meetup.end),
    ];
    const ride = String((meetup && meetup.ride) || '').trim();
    if (ride) lines.push('Ride: ' + ride);
    lines.push(meetup && meetup.status === 'confirmed' ? 'Locked in' : meetup && meetup.status === 'cancelled' ? 'Cancelled' : 'Waiting on a yes');
    return lines.join('\n');
  }

  function icsEscape(text) {
    return String(text || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }

  function icsClock(day, minutes) {
    const [year, month, date] = String(day).split('-');
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    return year + month + date + 'T' + hour + minute + '00';
  }

  function meetupToIcs(meetup, dtstamp) {
    const stamp = dtstamp || '20261127T120000Z';
    const ride = String((meetup && meetup.ride) || '').trim();
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Flarmalodebop//Daily Restaurant Meetup//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:meetup-' + meetup.id + '@flarmalodebop.app',
      'DTSTAMP:' + stamp,
      'DTSTART:' + icsClock(meetup.day, meetup.start),
      'DTEND:' + icsClock(meetup.day, meetup.end),
      'SUMMARY:' + icsEscape('Daily Restaurant Meetup — ' + normalizeSpot(meetup.spot)),
      'LOCATION:' + icsEscape(normalizeSpot(meetup.spot)),
      'DESCRIPTION:' + icsEscape(ride ? 'Ride: ' + ride : 'Confirmed in Flarmalodebop'),
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    return lines.join('\r\n') + '\r\n';
  }

  function planDailyMeetups(input) {
    const days = Math.max(1, Math.min(14, Number(input && input.days) || 1));
    const plans = [];
    for (let index = 0; index < days; index += 1) {
      const day = addDays(input.startDay, index);
      const windows = overlapWindows({
        shifts: input.shifts,
        daysOff: input.daysOff,
        meId: input.meId,
        themId: input.themId,
        day,
      });
      const best = windows[0];
      if (!best) {
        plans.push({ day, skip: true, reason: 'No shared opening' });
        continue;
      }
      const slot = suggestSlot(best, input.duration || 90);
      plans.push({
        day,
        skip: false,
        start: slot.start,
        end: slot.end,
        spot: normalizeSpot(input.spot),
        ride: String(input.ride || '').trim(),
        meal: best.meal,
        label: best.label,
        hint: best.hint,
      });
    }
    return plans;
  }

  function canConfirm(meetup, meId) {
    return !!(meetup && meetup.status === 'proposed' && meetup.proposedBy && meetup.proposedBy !== meId);
  }

  function canCounter(meetup) {
    return !!(meetup && (meetup.status === 'proposed' || meetup.status === 'confirmed'));
  }

  function isMeetupMessage(message) {
    const meta = message && message.meta;
    return !!(meta && meta.flarm === 'meetup' && meta.meetup_id);
  }

  function todaysConfirmed(meetups, today) {
    return (meetups || []).find((meetup) => meetup.day === today && meetup.status === 'confirmed') || null;
  }

  function bannerCopy(meetup) {
    if (!meetup || meetup.status !== 'confirmed') return null;
    return {
      title: "Today's restaurant meetup",
      detail: formatRange(meetup.start, meetup.end) + ' at ' + meetup.spot,
      ride: meetup.ride || '',
    };
  }

  function emptyCalendar() {
    return { shifts: [], daysOff: [], spots: [], meetups: [] };
  }

  function asShift(row) {
    if (!row || !row.id) return null;
    const dated = row.on_date || row.date || null;
    const weekday = dated ? null : Number(row.weekday);
    return {
      id: String(row.id),
      userId: String(row.user_id || row.userId || ''),
      weekday: Number.isInteger(weekday) ? weekday : null,
      date: dated ? String(dated).slice(0, 10) : null,
      start: Number(row.start_minute != null ? row.start_minute : row.start),
      end: Number(row.end_minute != null ? row.end_minute : row.end),
      label: String(row.label || 'Shift'),
    };
  }

  function asDayOff(row) {
    if (!row) return null;
    const date = String(row.on_date || row.date || '').slice(0, 10);
    const userId = String(row.user_id || row.userId || '');
    if (!userId || !isIsoDate(date)) return null;
    return { userId, date };
  }

  function asSpot(row) {
    if (!row || !row.id) return null;
    const name = normalizeSpot(row.name);
    if (!name) return null;
    return {
      id: String(row.id),
      name,
      note: String(row.note || ''),
      createdBy: String(row.created_by || row.createdBy || ''),
    };
  }

  function asMeetup(row) {
    if (!row || !row.id) return null;
    const status = row.status === 'confirmed' || row.status === 'cancelled' ? row.status : 'proposed';
    return {
      id: String(row.id),
      day: String(row.day).slice(0, 10),
      start: Number(row.start_minute != null ? row.start_minute : row.start),
      end: Number(row.end_minute != null ? row.end_minute : row.end),
      spot: normalizeSpot(row.spot_name || row.spot),
      ride: String(row.ride_note != null ? row.ride_note : row.ride || ''),
      status,
      proposedBy: String(row.proposed_by || row.proposedBy || ''),
      confirmedBy: row.confirmed_by || row.confirmedBy ? String(row.confirmed_by || row.confirmedBy) : null,
      messageId: row.message_id == null && row.messageId == null ? null : Number(row.message_id != null ? row.message_id : row.messageId),
    };
  }

  function upsertById(list, row) {
    const next = (list || []).filter((item) => item.id !== row.id);
    next.push(row);
    return next;
  }

  function applyCalendarChange(state, change) {
    const current = state || emptyCalendar();
    const next = {
      shifts: current.shifts.slice(),
      daysOff: current.daysOff.slice(),
      spots: current.spots.slice(),
      meetups: current.meetups.slice(),
    };
    const event = String((change && (change.event || change.eventType)) || '').toUpperCase();
    const table = change && change.table;
    const raw = event === 'DELETE' ? change.old : change.new || change.row;
    if (table === 'work_shifts') {
      const id = raw && (raw.id || (change.old && change.old.id));
      next.shifts = next.shifts.filter((shift) => shift.id !== String(id || ''));
      if (event !== 'DELETE') {
        const shift = asShift(raw);
        if (shift) next.shifts.push(shift);
      }
    } else if (table === 'shift_days_off') {
      const off = asDayOff(event === 'DELETE' ? change.old || raw : raw);
      if (off) next.daysOff = next.daysOff.filter((row) => !(row.userId === off.userId && row.date === off.date));
      if (event !== 'DELETE' && off) next.daysOff.push(off);
    } else if (table === 'favorite_spots') {
      const id = raw && (raw.id || (change.old && change.old.id));
      next.spots = next.spots.filter((spot) => spot.id !== String(id || ''));
      if (event !== 'DELETE') {
        const spot = asSpot(raw);
        if (spot) next.spots.push(spot);
      }
    } else if (table === 'restaurant_meetups') {
      const id = raw && (raw.id || (change.old && change.old.id));
      next.meetups = next.meetups.filter((meetup) => meetup.id !== String(id || ''));
      if (event !== 'DELETE') {
        const meetup = asMeetup(raw);
        if (meetup) next.meetups.push(meetup);
      }
    }
    return next;
  }

  function calendarFromRows(rows) {
    let state = emptyCalendar();
    (rows.shifts || []).forEach((row) => {
      state = applyCalendarChange(state, { table: 'work_shifts', event: 'INSERT', new: row });
    });
    (rows.daysOff || []).forEach((row) => {
      state = applyCalendarChange(state, { table: 'shift_days_off', event: 'INSERT', new: row });
    });
    (rows.spots || []).forEach((row) => {
      state = applyCalendarChange(state, { table: 'favorite_spots', event: 'INSERT', new: row });
    });
    (rows.meetups || []).forEach((row) => {
      state = applyCalendarChange(state, { table: 'restaurant_meetups', event: 'INSERT', new: row });
    });
    return state;
  }

  return {
    PRESET_SPOTS,
    SHIFT_PRESETS,
    DAY_OPEN,
    DAY_CLOSE,
    MIN_MEET,
    TIME_DELTAS,
    WEEKDAYS,
    isIsoDate,
    todayIso,
    addDays,
    weekdayOf,
    weekDates,
    formatDayLabel,
    formatMinutes,
    formatRange,
    parseClock,
    clockInput,
    mergeIntervals,
    applicableBusy,
    overlapWindows,
    durationChoices,
    slotChoices,
    suggestSlot,
    shiftRange,
    rangeInside,
    normalizeSpot,
    mergeSpots,
    otherSpots,
    validShift,
    shiftConflict,
    meetupSummary,
    meetupToIcs,
    planDailyMeetups,
    canConfirm,
    canCounter,
    isMeetupMessage,
    todaysConfirmed,
    bannerCopy,
    emptyCalendar,
    asShift,
    asDayOff,
    asSpot,
    asMeetup,
    upsertById,
    applyCalendarChange,
    calendarFromRows,
  };
});
