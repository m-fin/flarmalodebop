import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCalendar } from '@/chat/CalendarProvider';
import {
  SHIFT_PRESETS,
  WEEKDAYS,
  addDays,
  bannerCopy,
  durationChoices,
  formatDayLabel,
  formatRange,
  mergeSpots,
  overlapWindows,
  parseClock,
  planDailyMeetups,
  slotChoices,
  todayIso,
  todaysConfirmed,
  weekdayOf,
  weekDates,
} from '@/lib/calendar';
import { addMeetupToDeviceCalendar } from '@/lib/deviceCalendar';
import { palette, useTheme } from '@/lib/theme';
import type { Profile } from '@/lib/types';

export function CalendarView({ me, other }: { me: Profile; other: Profile }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const api = useCalendar();
  const today = todayIso();
  const [anchor, setAnchor] = useState(today);
  const [day, setDay] = useState(today);
  const [chip, setChip] = useState(0);
  const [duration, setDuration] = useState(90);
  const [slotIndex, setSlotIndex] = useState(0);
  const [spot, setSpot] = useState('Golden Corral');
  const [ride, setRide] = useState('');
  const [custom, setCustom] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [label, setLabel] = useState('Work');
  const [note, setNote] = useState<string | null>(null);

  const windows = overlapWindows({
    shifts: api.calendar.shifts,
    daysOff: api.calendar.daysOff,
    meId: me.id,
    themId: other.id,
    day,
  });
  const selected = windows[chip] || windows[0];
  const durations = durationChoices(selected || null);
  const chosenDuration = durations.includes(duration) ? duration : durations[durations.length - 1];
  const slots = selected ? slotChoices(selected, chosenDuration) : [];
  const slot = slots[slotIndex] || slots[0];
  const confirmed = todaysConfirmed(api.calendar.meetups, today);
  const copy = bannerCopy(confirmed);
  const off = api.calendar.daysOff.some((row) => row.userId === me.id && row.date === day);

  function fail(error: unknown) {
    setNote(error instanceof Error ? error.message : 'Couldn’t save that');
  }

  async function saveShift(date: string | null, weekday: number | null) {
    const parsedStart = parseClock(start);
    const parsedEnd = parseClock(end);
    if (parsedStart == null || parsedEnd == null) {
      setNote('Use times like 09:00 or 2:30 PM');
      return;
    }
    await api.addShift({ userId: me.id, weekday, date, start: parsedStart, end: parsedEnd, label });
    setNote('Shift saved');
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to chat" onPress={() => router.back()} style={styles.back}>
          <Text style={[styles.backText, { color: theme.text }]}>←</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: theme.text }]}>Our week</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>Shifts side by side, then one tap for a restaurant</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}>
        <View style={[styles.banner, { backgroundColor: theme.card }]}>
          <Text style={styles.kicker}>{copy ? copy.title : 'No restaurant meetup locked in for today'}</Text>
          {copy ? <Text style={[styles.bannerDetail, { color: theme.text }]}>{copy.detail}</Text> : null}
          {copy?.ride ? <Text style={{ color: theme.muted }}>{copy.ride}</Text> : null}
          {confirmed ? (
            <Pressable style={styles.primary} onPress={() => addMeetupToDeviceCalendar(confirmed).then(() => setNote('Added to your calendar')).catch(fail)}>
              <Text style={styles.primaryText}>Add to calendar</Text>
            </Pressable>
          ) : null}
        </View>
        {note ? <Text style={{ color: palette.sun }}>{note}</Text> : null}
        <View style={styles.row}>
          <Pressable accessibilityLabel="Previous week" style={[styles.chip, { backgroundColor: theme.card }]} onPress={() => setAnchor(addDays(anchor, -7))}>
            <Text style={{ color: theme.text }}>←</Text>
          </Pressable>
          {weekDates(anchor).map((item) => {
            const meetup = api.calendar.meetups.find((row) => row.day === item && row.status !== 'cancelled');
            const on = item === day;
            return (
              <Pressable
                key={item}
                onPress={() => {
                  setDay(item);
                  setChip(0);
                  setSlotIndex(0);
                }}
                style={[styles.day, { backgroundColor: theme.card }, on && styles.on, meetup?.status === 'confirmed' && styles.locked]}
              >
                <Text style={{ color: item === today ? palette.sun : theme.text, textAlign: 'center' }}>
                  {WEEKDAYS[weekdayOf(item)]}
                  {'\n'}
                  {Number(item.slice(-2))}
                </Text>
              </Pressable>
            );
          })}
          <Pressable accessibilityLabel="Next week" style={[styles.chip, { backgroundColor: theme.card }]} onPress={() => setAnchor(addDays(anchor, 7))}>
            <Text style={{ color: theme.text }}>→</Text>
          </Pressable>
        </View>
        <Text style={[styles.heading, { color: theme.text }]}>{formatDayLabel(day, today)}</Text>
        <View style={styles.row}>
          <ShiftColumn title={me.display} userId={me.id} day={day} />
          <ShiftColumn title={other.display} userId={other.id} day={day} />
        </View>
        <Text style={styles.kicker}>Openings for a restaurant meetup</Text>
        {!windows.length ? <Text style={{ color: theme.muted }}>No shared opening that day.</Text> : null}
        {windows.map((window, index) => (
          <Pressable key={`${window.start}-${window.meal}`} onPress={() => { setChip(index); setSlotIndex(0); }} style={[styles.choice, { backgroundColor: theme.card }, index === chip && styles.on]}>
            <Text style={{ color: theme.text, fontFamily: 'Fredoka_600SemiBold' }}>
              {window.label} · {formatRange(window.start, window.end)}
            </Text>
            <Text style={{ color: theme.muted }}>{window.hint}</Text>
          </Pressable>
        ))}
        <View style={styles.row}>
          {durations.map((minutes) => (
            <Pressable key={minutes} onPress={() => { setDuration(minutes); setSlotIndex(0); }} style={[styles.chip, { backgroundColor: theme.card }, minutes === chosenDuration && styles.on]}>
              <Text style={{ color: theme.text }}>{minutes} min</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          {slots.slice(0, 8).map((item, index) => (
            <Pressable key={item.start} onPress={() => setSlotIndex(index)} style={[styles.chip, { backgroundColor: theme.card }, item.start === slot?.start && styles.on]}>
              <Text style={{ color: theme.text }}>{formatRange(item.start, item.end)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.kicker}>Where</Text>
        <View style={styles.row}>
          {mergeSpots(api.calendar.spots).map((item) => (
            <Pressable key={item.name} onPress={() => setSpot(item.name)} style={[styles.chip, { backgroundColor: theme.card }, spot === item.name && styles.on]}>
              <Text style={{ color: theme.text }}>{item.name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          {mergeSpots(api.calendar.spots)
            .filter((item) => !item.preset && item.id)
            .map((item) => (
              <Pressable key={item.id} onPress={() => api.removeSpot(item.id!).catch(fail)}>
                <Text style={{ color: theme.danger }}>Remove {item.name}</Text>
              </Pressable>
            ))}
        </View>
        <View style={styles.row}>
          <TextInput value={custom} onChangeText={setCustom} placeholder="Add a favorite spot" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} />
          <Pressable
            style={[styles.chip, { backgroundColor: theme.card }]}
            onPress={() => {
              const name = custom.trim();
              if (!name) return;
              setSpot(name);
              api.addSpot(name).then(() => setCustom('')).catch(fail);
            }}
          >
            <Text style={{ color: theme.text }}>Save spot</Text>
          </Pressable>
        </View>
        <TextInput value={ride} onChangeText={setRide} placeholder="Ride note (optional) — I’ll drive, or meet there" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} />
        <Pressable
          style={[styles.primary, !slot && styles.disabled]}
          disabled={!slot}
          onPress={() => {
            if (!slot) return;
            api.propose({ day, start: slot.start, end: slot.end, spot, ride }).then(() => setNote('Proposed — waiting on a yes')).catch(fail);
          }}
        >
          <Text style={styles.primaryText}>Propose Daily Restaurant Meetup</Text>
        </Pressable>
        <Pressable
          style={[styles.secondary, { backgroundColor: theme.card }]}
          onPress={() => {
            const plans = planDailyMeetups({
              shifts: api.calendar.shifts,
              daysOff: api.calendar.daysOff,
              meId: me.id,
              themId: other.id,
              startDay: day,
              days: 7,
              spot,
              ride,
              duration: chosenDuration,
            }).filter((plan) => !plan.skip && plan.start != null && plan.end != null);
            if (!plans.length) {
              setNote('No shared openings in those 7 days.');
              return;
            }
            api
              .proposeDays(plans.map((plan) => ({ day: plan.day, start: plan.start!, end: plan.end!, spot, ride })))
              .then(() => setNote('Proposed the open days'))
              .catch(fail);
          }}
        >
          <Text style={{ color: theme.text, fontFamily: 'Fredoka_600SemiBold' }}>Propose this spot for the next 7 days</Text>
        </Pressable>
        <Text style={styles.kicker}>My shifts</Text>
        <View style={styles.row}>
          {SHIFT_PRESETS.map((preset) => (
            <Pressable
              key={preset.label}
              style={[styles.chip, { backgroundColor: theme.card }]}
              onPress={() => api.addShift({ userId: me.id, weekday: weekdayOf(day), date: null, start: preset.start, end: preset.end, label: preset.label }).then(() => setNote('Shift saved')).catch(fail)}
            >
              <Text style={{ color: theme.text }}>{preset.label} {formatRange(preset.start, preset.end)}</Text>
            </Pressable>
          ))}
        </View>
        {api.calendar.shifts
          .filter((shift) => shift.userId === me.id && (shift.date === day || (!shift.date && shift.weekday === weekdayOf(day))))
          .map((shift) => (
            <View key={shift.id} style={[styles.shiftLine, { backgroundColor: theme.card }]}>
              <Text style={{ color: theme.text, flex: 1 }}>
                {shift.date ? 'This date · ' : `Every ${WEEKDAYS[shift.weekday ?? 0]} · `}
                {shift.label} · {formatRange(shift.start, shift.end)}
              </Text>
              <Pressable onPress={() => api.deleteShift(shift.id).catch(fail)}>
                <Text style={{ color: theme.danger }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        <View style={styles.row}>
          <TextInput value={start} onChangeText={setStart} accessibilityLabel="Shift start" style={[styles.time, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} />
          <TextInput value={end} onChangeText={setEnd} accessibilityLabel="Shift end" style={[styles.time, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} />
          <TextInput value={label} onChangeText={setLabel} accessibilityLabel="Shift label" style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} />
        </View>
        <View style={styles.row}>
          <Pressable style={[styles.chip, { backgroundColor: theme.card }]} onPress={() => saveShift(null, weekdayOf(day)).catch(fail)}>
            <Text style={{ color: theme.text }}>Weekly</Text>
          </Pressable>
          <Pressable style={[styles.chip, { backgroundColor: theme.card }]} onPress={() => saveShift(day, null).catch(fail)}>
            <Text style={{ color: theme.text }}>This date</Text>
          </Pressable>
        </View>
        <Pressable style={[styles.secondary, { backgroundColor: theme.card }]} onPress={() => api.setDayOff(day, !off).then(() => setNote(off ? 'Usual shift is back' : 'Marked off')).catch(fail)}>
          <Text style={{ color: theme.text }}>{off ? 'I’m working my usual shift this date' : 'I’m off this date'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function ShiftColumn({ title, userId, day }: { title: string; userId: string; day: string }) {
  const theme = useTheme();
  const api = useCalendar();
  const weekday = weekdayOf(day);
  const off = api.calendar.daysOff.some((row) => row.userId === userId && row.date === day);
  const rows = api.calendar.shifts.filter((shift) => shift.userId === userId && (shift.date === day || (!shift.date && shift.weekday === weekday && !off)));
  return (
    <View style={[styles.column, { backgroundColor: theme.card }]}>
      <Text style={[styles.who, { color: theme.text }]}>{title}</Text>
      {off ? <Text style={{ color: theme.muted }}>Off this date</Text> : null}
      {!rows.length && !off ? <Text style={{ color: theme.muted }}>No shift</Text> : null}
      {rows.map((shift) => (
        <Text key={shift.id} style={{ color: theme.text }}>
          {shift.date ? 'Just this date · ' : ''}
          {shift.label} · {formatRange(shift.start, shift.end)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 24 },
  headerCopy: { flex: 1 },
  title: { fontFamily: 'Fredoka_700Bold', fontSize: 22 },
  sub: { fontFamily: 'Fredoka_400Regular', fontSize: 13 },
  scroll: { paddingHorizontal: 14, gap: 10 },
  banner: { borderRadius: 18, padding: 12, gap: 4 },
  kicker: { color: palette.sun, fontFamily: 'Fredoka_700Bold', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  bannerDetail: { fontFamily: 'Fredoka_700Bold', fontSize: 16 },
  heading: { fontFamily: 'Fredoka_700Bold', fontSize: 22 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  column: { flex: 1, minWidth: 140, borderRadius: 16, padding: 10, gap: 4 },
  who: { fontFamily: 'Fredoka_700Bold' },
  day: { borderRadius: 16, paddingHorizontal: 8, paddingVertical: 6, minWidth: 48 },
  chip: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8 },
  choice: { borderRadius: 16, padding: 10 },
  on: { borderWidth: 2, borderColor: palette.sun },
  locked: { borderWidth: 2, borderColor: palette.mint },
  primary: { backgroundColor: palette.pink, borderRadius: 18, padding: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontFamily: 'Fredoka_700Bold', fontSize: 16 },
  disabled: { opacity: 0.45 },
  secondary: { borderRadius: 16, padding: 12 },
  input: { flex: 1, minWidth: 140, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Fredoka_400Regular' },
  time: { width: 84, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 10, fontFamily: 'Fredoka_400Regular' },
  shiftLine: { borderRadius: 14, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' },
});
