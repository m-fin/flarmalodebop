const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const path = require('node:path');
const logic = require('../public/logic.js');
const calendar = require('../public/calendar.js');

test('reactions are one per person and toggle off', () => {
  const rows = [
    { message_id: 1, user_id: 'frog', emoji: '❤️' },
    { message_id: 1, user_id: 'hailey', emoji: '🐸' },
  ];
  assert.deepEqual(logic.groupReactions(rows, 'frog'), [
    { emoji: '❤️', count: 1, mine: true },
    { emoji: '🐸', count: 1, mine: false },
  ]);
  const replaced = logic.nextReactions(rows, 'frog', '🪿');
  assert.equal(replaced.find((row) => row.user_id === 'frog').emoji, '🪿');
  assert.equal(logic.nextReactions(replaced, 'frog', '🪿').some((row) => row.user_id === 'frog'), false);
});

test('reply snippets, search, and edit rights', () => {
  assert.equal(logic.replySnippet(null), 'Earlier message');
  assert.equal(logic.replySnippet({ kind: 'photo', body: 'lily' }), '📷 lily');
  assert.equal(logic.replySnippet({ kind: 'voice', body: '' }), '🎙️ Voice note');
  assert.equal(logic.likePattern('100%_done'), '%100\\%\\_done%');
  assert.equal(logic.likePattern('  '), null);
  assert.equal(logic.canEdit({ kind: 'text', sender: 'frog' }, 'frog'), true);
  assert.equal(logic.canEdit({ kind: 'voice', sender: 'frog' }, 'frog'), false);
  assert.equal(logic.canUnsend({ sender: 'hailey' }, 'frog'), false);
  const byId = new Map([[1, { id: 1, sender: 'hailey', kind: 'text', body: 'live' }]]);
  assert.equal(logic.resolveReply({ reply_to: 1, reply: { body: 'stale' } }, byId).body, 'live');
  assert.deepEqual(logic.localSearch([{ id: 1, body: 'pond' }, { id: 2, body: 'Lily pad' }], 'lily').map((row) => row.id), [2]);
});

test('appearance cycles dusk, dawn, then the device', () => {
  assert.equal(logic.resolveAppearance('dusk', false), 'dark');
  assert.equal(logic.resolveAppearance('dawn', true), 'light');
  assert.equal(logic.resolveAppearance('system', false), 'light');
  assert.equal(logic.cycleAppearance('dusk'), 'dawn');
  assert.equal(logic.cycleAppearance('dawn'), 'system');
  assert.equal(logic.cycleAppearance('system'), 'dusk');
  assert.equal(logic.appearanceLabel('system'), 'Match device');
});

test('env files are gitignored and the privacy page names no private contact', () => {
  const { execFileSync } = require('node:child_process');
  const root = path.join(__dirname, '..', '..');
  for (const name of ['.env', '.env.local', '.env.production', 'ios-app/.env', 'secrets.env']) {
    const out = execFileSync('git', ['check-ignore', name], { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(out, name);
  }
  let exampleIgnored = true;
  try {
    execFileSync('git', ['check-ignore', '.env.example'], { cwd: root, stdio: 'pipe' });
  } catch {
    exampleIgnored = false;
  }
  assert.equal(exampleIgnored, false);
  const privacy = fs.readFileSync(path.join(__dirname, '..', 'public', 'privacy.html'), 'utf8');
  assert.match(privacy, /Matthew Finley/);
  assert.match(privacy, /not end-to-end encrypted/i);
  assert.doesNotMatch(privacy, /@gmail\.com/i);
  assert.doesNotMatch(privacy, /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
});

test('unread marker, photo roll, and drafts', () => {
  const messages = [
    { id: 1, kind: 'text', body: 'hi', file_path: null },
    { id: 2, kind: 'photo', body: '', file_path: 'frog/a.jpg' },
    { id: 3, kind: 'voice', body: '', file_path: 'frog/a.m4a' },
    { id: 4, kind: 'photo', body: 'lily', file_path: 'hailey/b.jpg' },
  ];
  assert.equal(logic.firstUnreadId(messages, null), null);
  assert.equal(logic.firstUnreadId(messages, 4), null);
  assert.equal(logic.firstUnreadId(messages, 1), 2);
  assert.equal(logic.firstUnreadId(messages, 0), 1);
  assert.deepEqual(logic.photoRoll(messages).map((row) => row.id), [4, 2]);
  const store = new Map();
  const memory = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  logic.saveDraft(memory, 'frog', '  pond  ');
  assert.equal(logic.loadDraft(memory, 'frog'), '  pond  ');
  logic.saveDraft(memory, 'frog', '');
  assert.equal(logic.loadDraft(memory, 'frog'), '');
  logic.saveDraft(memory, 'frog', 'x'.repeat(9000));
  assert.equal(logic.loadDraft(memory, 'frog').length, 8000);
});

test('the migration is additive and keeps reactions behind RLS', () => {
  const root = path.join(__dirname, '..', 'supabase');
  const migration = fs.readFileSync(path.join(root, 'migrations', '20261115_reactions_replies_edits.sql'), 'utf8');
  const setup = fs.readFileSync(path.join(root, 'setup.sql'), 'utf8');
  for (const sql of [migration, setup]) {
    assert.match(sql, /message_reactions/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /members read reactions/);
    assert.match(sql, /function public\.edit_message/);
    assert.match(sql, /function public\.set_reaction/);
    assert.match(sql, /kind = 'text'/);
    assert.match(sql, /reply_to bigint/);
    assert.match(sql, /edited_at timestamptz/);
    assert.match(sql, /revoke all on public\.message_reactions from anon, authenticated/);
    assert.match(sql, /grant select on public\.message_reactions to authenticated/);
    assert.doesNotMatch(sql, /drop table/i);
  }
  assert.doesNotMatch(migration, /delete from public\.messages/i);
  assert.doesNotMatch(migration, /delete from public\.profiles/i);
  assert.match(migration, /add column if not exists reply_to/);
  assert.match(migration, /add column if not exists edited_at/);
  assert.equal(logic.canEdit({ kind: 'text', sender: 'frog', meta: { flarm: 'meetup', meetup_id: 'm1' } }, 'frog'), false);
  const lock = fs.readFileSync(path.join(root, 'migrations', '20261115060000_private_helpers_and_force_rls.sql'), 'utf8');
  for (const sql of [setup, lock]) {
    assert.match(sql, /function private\.is_member/);
    assert.match(sql, /edited_at is null/);
    assert.match(sql, /force row level security/);
    assert.match(sql, /revoke all on schema private from public, anon/);
    assert.match(sql, /drop function if exists public\.is_member/);
    assert.doesNotMatch(sql, /create or replace function public\.is_member/);
    assert.doesNotMatch(sql, /drop table/i);
  }
});

test('daily restaurant meetup finds the overlap between shifts', () => {
  assert.equal(calendar.weekdayOf('2026-11-30'), 1);
  assert.equal(calendar.weekDates('2026-11-30')[1], '2026-11-30');
  const shifts = [
    { id: 'frog-mon', userId: 'frog', weekday: 1, date: null, start: 6 * 60, end: 14 * 60, label: 'Morning' },
    { id: 'hailey-mon', userId: 'hailey', weekday: 1, date: null, start: 16 * 60, end: 22 * 60, label: 'Late' },
  ];
  const between = calendar.overlapWindows({ shifts, daysOff: [], meId: 'frog', themId: 'hailey', day: '2026-11-30' });
  assert.equal(between.length, 1);
  assert.equal(between[0].meal, 'open');
  assert.equal(between[0].hint, 'Between shifts');
  assert.equal(calendar.formatRange(between[0].start, between[0].end), '2:00–4:00 PM');
  const slot = calendar.suggestSlot(between[0], 90);
  assert.deepEqual(slot, { start: 14 * 60, end: 15 * 60 + 30 });

  const open = calendar.overlapWindows({ shifts: [], daysOff: [], meId: 'frog', themId: 'hailey', day: '2026-11-30' });
  assert.deepEqual(open.map((chip) => chip.meal), ['lunch', 'dinner', 'breakfast']);
  assert.equal(open[0].label, 'Lunch opening');
  assert.equal(calendar.formatRange(open[0].start, open[0].end), '11:00 AM–2:00 PM');

  const covered = calendar.overlapWindows({
    shifts: [
      { userId: 'frog', weekday: 1, date: null, start: 8 * 60, end: 22 * 60, label: 'Double' },
      { userId: 'hailey', weekday: 1, date: null, start: 8 * 60, end: 22 * 60, label: 'Double' },
    ],
    daysOff: [],
    meId: 'frog',
    themId: 'hailey',
    day: '2026-11-30',
  });
  assert.deepEqual(covered, []);
});

test('a day off clears the weekly shift and a one-time busy window blocks lunch', () => {
  const shifts = [
    { userId: 'frog', weekday: 1, date: null, start: 11 * 60, end: 15 * 60, label: 'Day' },
    { userId: 'frog', weekday: null, date: '2026-12-01', start: 11 * 60, end: 13 * 60, label: 'Errand' },
    { userId: 'hailey', weekday: 2, date: null, start: 9 * 60, end: 17 * 60, label: 'Day' },
  ];
  const off = calendar.overlapWindows({
    shifts,
    daysOff: [{ userId: 'frog', date: '2026-11-30' }],
    meId: 'frog',
    themId: 'hailey',
    day: '2026-11-30',
  });
  assert.equal(off.some((chip) => chip.meal === 'lunch'), true);
  const tuesday = calendar.overlapWindows({ shifts, daysOff: [], meId: 'frog', themId: 'hailey', day: '2026-12-01' });
  assert.equal(tuesday.some((chip) => chip.meal === 'lunch' && chip.start < 13 * 60 && chip.end > 11 * 60), false);
});

test('meetup time nudges, slot choices, and the seven-day plan', () => {
  assert.deepEqual(calendar.shiftRange(14 * 60, 15 * 60 + 30, 30), { ok: true, start: 14 * 60 + 30, end: 16 * 60 });
  assert.equal(calendar.shiftRange(23 * 60, 24 * 60, 30).ok, false);
  assert.equal(calendar.shiftRange(12 * 60, 13 * 60, 10).ok, false);
  const choices = calendar.slotChoices({ start: 14 * 60 + 10, end: 16 * 60 }, 60);
  assert.deepEqual(choices[0], { start: 14 * 60 + 15, end: 15 * 60 + 15 });
  assert.equal(choices.at(-1).end, 16 * 60);
  const plans = calendar.planDailyMeetups({
    shifts: [
      { userId: 'frog', weekday: 1, date: null, start: 8 * 60, end: 22 * 60, label: 'All day' },
      { userId: 'hailey', weekday: 1, date: null, start: 8 * 60, end: 22 * 60, label: 'All day' },
    ],
    daysOff: [],
    meId: 'frog',
    themId: 'hailey',
    startDay: '2026-11-30',
    days: 2,
    spot: '  Golden   Corral  ',
    ride: ' I will drive ',
    duration: 90,
  });
  assert.equal(plans[0].skip, true);
  assert.equal(plans[1].skip, false);
  assert.equal(plans[1].spot, 'Golden Corral');
  assert.equal(plans[1].ride, 'I will drive');
  assert.equal(plans[1].meal, 'lunch');
  assert.equal(calendar.normalizeSpot('   '), '');
  assert.equal(
    calendar.mergeSpots([{ id: '1', name: 'golden corral' }, { id: '2', name: 'Noodle spot' }]).map((spot) => spot.name).join('|'),
    'Golden Corral|Home kitchen|The Pond|Noodle spot',
  );
  assert.equal(calendar.otherSpots([], 'Golden Corral').some((spot) => spot.name === 'Golden Corral'), false);
  assert.equal(calendar.validShift({ start: 9 * 60, end: 9 * 60 + 15, label: 'Short' }), 'A shift needs at least 30 minutes');
  assert.equal(calendar.validShift({ start: 9 * 60, end: 17 * 60, label: 'Day' }), null);
  assert.equal(calendar.shiftConflict(
    [{ id: 'a', userId: 'frog', weekday: 1, date: null, start: 9 * 60, end: 17 * 60 }],
    { id: 'b', userId: 'frog', weekday: 1, date: null, start: 16 * 60, end: 20 * 60 },
  ), true);
});

test('meetup cards, confirm rights, ics export, and realtime sync', () => {
  const meetup = {
    id: 'meet-1',
    day: '2026-11-30',
    start: 14 * 60,
    end: 15 * 60 + 30,
    spot: 'Golden Corral',
    ride: 'I will drive',
    status: 'proposed',
    proposedBy: 'frog',
  };
  assert.equal(calendar.meetupSummary(meetup), [
    '🍽️ Daily Restaurant Meetup',
    'Golden Corral',
    'Mon, Nov 30 · 2:00–3:30 PM',
    'Ride: I will drive',
    'Waiting on a yes',
  ].join('\n'));
  assert.equal(calendar.canConfirm(meetup, 'hailey'), true);
  assert.equal(calendar.canConfirm(meetup, 'frog'), false);
  assert.equal(calendar.canCounter(meetup), true);
  const ics = calendar.meetupToIcs({ ...meetup, status: 'confirmed' }, '20261127T120000Z');
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART:20261130T140000/);
  assert.match(ics, /DTEND:20261130T153000/);
  assert.match(ics, /SUMMARY:Daily Restaurant Meetup — Golden Corral/);
  assert.match(ics, /LOCATION:Golden Corral/);
  assert.match(ics, /Ride: I will drive/);
  assert.equal(calendar.bannerCopy({ ...meetup, status: 'confirmed' }).detail, '2:00–3:30 PM at Golden Corral');
  assert.equal(calendar.todaysConfirmed([{ ...meetup, status: 'confirmed' }], '2026-11-30').id, 'meet-1');
  assert.equal(calendar.isMeetupMessage({ meta: { flarm: 'meetup', meetup_id: 'meet-1' } }), true);
  assert.equal(calendar.isMeetupMessage({ meta: null }), false);

  let state = calendar.emptyCalendar();
  state = calendar.applyCalendarChange(state, {
    table: 'work_shifts',
    event: 'INSERT',
    new: { id: 's1', user_id: 'frog', weekday: 1, on_date: null, start_minute: 360, end_minute: 840, label: 'Morning' },
  });
  state = calendar.applyCalendarChange(state, {
    table: 'work_shifts',
    event: 'INSERT',
    new: { id: 's1', user_id: 'frog', weekday: 1, on_date: null, start_minute: 360, end_minute: 900, label: 'Morning' },
  });
  assert.equal(state.shifts.length, 1);
  assert.equal(state.shifts[0].end, 900);
  state = calendar.applyCalendarChange(state, { table: 'shift_days_off', event: 'INSERT', new: { user_id: 'hailey', on_date: '2026-11-30' } });
  state = calendar.applyCalendarChange(state, { table: 'favorite_spots', event: 'INSERT', new: { id: 'spot-1', name: '  Noodle spot ', note: '', created_by: 'frog' } });
  state = calendar.applyCalendarChange(state, {
    table: 'restaurant_meetups',
    event: 'INSERT',
    new: {
      id: 'meet-1',
      day: '2026-11-30',
      start_minute: 840,
      end_minute: 930,
      spot_name: 'Golden Corral',
      ride_note: 'I will drive',
      status: 'proposed',
      proposed_by: 'frog',
      confirmed_by: null,
      message_id: 12,
    },
  });
  state = calendar.applyCalendarChange(state, {
    table: 'restaurant_meetups',
    event: 'UPDATE',
    new: {
      id: 'meet-1',
      day: '2026-11-30',
      start_minute: 840,
      end_minute: 930,
      spot_name: 'Golden Corral',
      ride_note: 'I will drive',
      status: 'confirmed',
      proposed_by: 'frog',
      confirmed_by: 'hailey',
      message_id: 12,
    },
  });
  assert.equal(state.meetups.length, 1);
  assert.equal(state.meetups[0].status, 'confirmed');
  assert.equal(state.spots[0].name, 'Noodle spot');
  assert.equal(state.daysOff[0].date, '2026-11-30');
  state = calendar.applyCalendarChange(state, { table: 'work_shifts', event: 'DELETE', old: { id: 's1' } });
  state = calendar.applyCalendarChange(state, { table: 'favorite_spots', event: 'DELETE', old: { id: 'spot-1' } });
  state = calendar.applyCalendarChange(state, { table: 'shift_days_off', event: 'DELETE', old: { user_id: 'hailey', on_date: '2026-11-30' } });
  assert.equal(state.shifts.length, 0);
  assert.equal(state.spots.length, 0);
  assert.equal(state.daysOff.length, 0);
});

test('the app icon is an opaque 1024 square for TestFlight', () => {
  const icon = fs.readFileSync(path.join(__dirname, '..', '..', 'ios-app', 'assets', 'icon.png'));
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16), 1024);
  assert.equal(icon.readUInt32BE(20), 1024);
  assert.equal(icon[25], 2);
  let offset = 8;
  const chunks = [];
  while (offset + 8 <= icon.length) {
    const length = icon.readUInt32BE(offset);
    const type = icon.subarray(offset + 4, offset + 8).toString('ascii');
    chunks.push(type);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  assert.equal(chunks.includes('tRNS'), false);
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ios-app', 'app.json'), 'utf8'));
  assert.equal(app.expo.ios.bundleIdentifier, 'app.flarmalodebop.ios');
  assert.equal(app.expo.version, '1.0.0');
  assert.match(app.expo.ios.infoPlist.NSCalendarsUsageDescription, /restaurant meetup/i);
  assert.match(app.expo.ios.infoPlist.NSCalendarsWriteOnlyAccessUsageDescription, /restaurant meetup/i);
  assert.ok(app.expo.ios.entitlements['com.apple.security.application-groups'].includes('group.app.flarmalodebop.ios'));
  assert.ok(app.expo.plugins.some((plugin) => plugin === '@bacons/apple-targets' || (Array.isArray(plugin) && plugin[0] === 'expo-calendar')));
  const widget = fs.readFileSync(path.join(__dirname, '..', '..', 'ios-app', 'targets', 'meetup', 'MeetupWidget.swift'), 'utf8');
  assert.match(widget, /TodaysMeetup/);
  assert.match(widget, /group\.app\.flarmalodebop\.ios/);
  assert.match(widget, /Today's Restaurant Meetup/);
});

test('shared calendar migration is additive and keeps accounts and messages', () => {
  const root = path.join(__dirname, '..', 'supabase');
  const migration = fs.readFileSync(path.join(root, 'migrations', '20261127120000_shared_calendar_restaurant_meetups.sql'), 'utf8');
  const setup = fs.readFileSync(path.join(root, 'setup.sql'), 'utf8');
  for (const sql of [migration, setup]) {
    assert.match(sql, /create table if not exists public\.work_shifts/);
    assert.match(sql, /create table if not exists public\.shift_days_off/);
    assert.match(sql, /create table if not exists public\.favorite_spots/);
    assert.match(sql, /create table if not exists public\.restaurant_meetups/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /force row level security/);
    assert.match(sql, /function public\.propose_meetup/);
    assert.match(sql, /function public\.propose_meetup_days/);
    assert.match(sql, /function public\.confirm_meetup/);
    assert.match(sql, /function public\.counter_meetup/);
    assert.match(sql, /function public\.cancel_meetup/);
    assert.match(sql, /private\.is_member/);
    assert.match(sql, /flarm:calendar/);
    assert.match(sql, /flarm:room/);
    assert.match(sql, /meta->>'flarm'/);
    assert.match(sql, /the other person confirms/);
    assert.match(sql, /supabase_realtime add table public\.restaurant_meetups/);
    assert.match(sql, /revoke all on public\.restaurant_meetups from anon, authenticated/);
    assert.match(sql, /grant select on public\.restaurant_meetups to authenticated/);
    assert.match(sql, /grant execute on function private\.touch_updated_at\(\) to authenticated/);
    assert.doesNotMatch(sql, /drop table/i);
    assert.doesNotMatch(sql, /delete from public\.messages/i);
    assert.doesNotMatch(sql, /delete from public\.profiles/i);
  }
  assert.doesNotMatch(migration, /delete from auth\.users/i);
});
