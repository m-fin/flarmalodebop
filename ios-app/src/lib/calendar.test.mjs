import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCalendarChange,
  bannerCopy,
  canConfirm,
  emptyCalendar,
  formatRange,
  meetupSummary,
  meetupToIcs,
  mergeSpots,
  overlapWindows,
  planDailyMeetups,
  shiftRange,
  slotChoices,
  suggestSlot,
  todaysConfirmed,
  weekdayOf,
} from './calendar.ts';

test('daily restaurant meetup finds the overlap between shifts', () => {
  assert.equal(weekdayOf('2026-11-30'), 1);
  const shifts = [
    { id: 'frog-mon', userId: 'frog', weekday: 1, date: null, start: 6 * 60, end: 14 * 60, label: 'Morning' },
    { id: 'hailey-mon', userId: 'hailey', weekday: 1, date: null, start: 16 * 60, end: 22 * 60, label: 'Late' },
  ];
  const between = overlapWindows({ shifts, daysOff: [], meId: 'frog', themId: 'hailey', day: '2026-11-30' });
  assert.equal(between.length, 1);
  assert.equal(between[0].hint, 'Between shifts');
  assert.equal(formatRange(between[0].start, between[0].end), '2:00–4:00 PM');
  assert.deepEqual(suggestSlot(between[0], 90), { start: 14 * 60, end: 15 * 60 + 30 });
  const open = overlapWindows({ shifts: [], daysOff: [], meId: 'frog', themId: 'hailey', day: '2026-11-30' });
  assert.deepEqual(open.map((chip) => chip.meal), ['lunch', 'dinner', 'breakfast']);
});

test('meetup counters, plans, cards, and realtime sync', () => {
  assert.equal(shiftRange(23 * 60, 24 * 60, 30).ok, false);
  assert.equal(slotChoices({ start: 14 * 60 + 10, end: 16 * 60 }, 60)[0].start, 14 * 60 + 15);
  const plans = planDailyMeetups({
    shifts: [
      { id: 'a', userId: 'frog', weekday: 1, date: null, start: 8 * 60, end: 22 * 60, label: 'All day' },
      { id: 'b', userId: 'hailey', weekday: 1, date: null, start: 8 * 60, end: 22 * 60, label: 'All day' },
    ],
    daysOff: [],
    meId: 'frog',
    themId: 'hailey',
    startDay: '2026-11-30',
    days: 2,
    spot: 'Golden Corral',
    duration: 90,
  });
  assert.equal(plans[0].skip, true);
  assert.equal(plans[1].meal, 'lunch');
  const meetup = {
    id: 'meet-1',
    day: '2026-11-30',
    start: 14 * 60,
    end: 15 * 60 + 30,
    spot: 'Golden Corral',
    ride: 'I will drive',
    status: 'proposed',
    proposedBy: 'frog',
    confirmedBy: null,
    messageId: 12,
  };
  assert.match(meetupSummary(meetup), /Waiting on a yes/);
  assert.equal(canConfirm(meetup, 'hailey'), true);
  assert.equal(canConfirm(meetup, 'frog'), false);
  assert.match(meetupToIcs({ ...meetup, status: 'confirmed' }, '20261127T120000Z'), /DTSTART:20261130T140000/);
  assert.equal(bannerCopy({ ...meetup, status: 'confirmed' })?.detail, '2:00–3:30 PM at Golden Corral');
  assert.equal(todaysConfirmed([{ ...meetup, status: 'confirmed' }], '2026-11-30')?.id, 'meet-1');
  assert.equal(mergeSpots([{ id: '2', name: 'Noodle spot', note: '' }]).some((spot) => spot.name === 'Golden Corral'), true);
  let state = emptyCalendar();
  state = applyCalendarChange(state, {
    table: 'restaurant_meetups',
    event: 'INSERT',
    new: {
      id: 'meet-1',
      day: '2026-11-30',
      start_minute: 840,
      end_minute: 930,
      spot_name: 'Golden Corral',
      ride_note: '',
      status: 'proposed',
      proposed_by: 'frog',
      message_id: 4,
    },
  });
  state = applyCalendarChange(state, {
    table: 'restaurant_meetups',
    event: 'UPDATE',
    new: {
      id: 'meet-1',
      day: '2026-11-30',
      start_minute: 870,
      end_minute: 960,
      spot_name: 'Golden Corral',
      ride_note: '',
      status: 'confirmed',
      proposed_by: 'frog',
      confirmed_by: 'hailey',
      message_id: 4,
    },
  });
  assert.equal(state.meetups.length, 1);
  assert.equal(state.meetups[0].status, 'confirmed');
  assert.equal(state.meetups[0].start, 870);
});
