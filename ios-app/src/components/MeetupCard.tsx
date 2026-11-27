import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  canConfirm,
  canCounter,
  formatDayLabel,
  formatRange,
  otherSpots,
  TIME_DELTAS,
  todayIso,
} from '@/lib/calendar';
import { palette, useTheme } from '@/lib/theme';
import { useCalendar } from '@/chat/CalendarProvider';
import { addMeetupToDeviceCalendar } from '@/lib/deviceCalendar';

export function MeetupCard({
  meetupId,
  fallback,
  meId,
  onError,
}: {
  meetupId: string;
  fallback: string;
  meId: string;
  onError: (message: string) => void;
}) {
  const theme = useTheme();
  const calendar = useCalendar();
  const meetup = calendar.calendar.meetups.find((row) => row.id === meetupId) ?? null;
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Couldn’t save that');
    } finally {
      setBusy(false);
    }
  }

  if (!meetup) {
    return (
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.fallback, { color: theme.text }]}>{fallback}</Text>
      </View>
    );
  }

  const locked = meetup.status === 'confirmed';
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: locked ? palette.mint : palette.sun }]}>
      <Text style={styles.kicker}>{locked ? 'Locked in' : meetup.status === 'cancelled' ? 'Cancelled' : 'Daily Restaurant Meetup'}</Text>
      <Text style={[styles.spot, { color: theme.text }]}>{meetup.spot}</Text>
      <Text style={[styles.when, { color: theme.text }]}>
        {formatDayLabel(meetup.day, todayIso())} · {formatRange(meetup.start, meetup.end)}
      </Text>
      {meetup.ride ? <Text style={[styles.ride, { color: theme.muted }]}>{meetup.ride}</Text> : null}
      {meetup.status === 'cancelled' ? null : (
        <View style={styles.row}>
          {canConfirm(meetup, meId) ? (
            <Pressable style={styles.yes} onPress={() => run(() => calendar.confirm(meetup.id))}>
              <Text style={styles.yesText}>Confirm</Text>
            </Pressable>
          ) : meetup.status === 'proposed' ? (
            <Text style={[styles.wait, { color: theme.muted }]}>Waiting on a yes</Text>
          ) : null}
          {locked ? (
            <Pressable style={[styles.yes, styles.ghost]} onPress={() => run(() => addMeetupToDeviceCalendar(meetup))}>
              <Text style={[styles.yesText, { color: theme.text }]}>Add to calendar</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      {canCounter(meetup) ? (
        <>
          <View style={styles.row}>
            {TIME_DELTAS.map((delta) => (
              <Pressable key={delta} style={[styles.nudge, { backgroundColor: theme.input }]} onPress={() => run(() => calendar.counter(meetup.id, '', delta))}>
                <Text style={{ color: theme.text }}>{delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`} min</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.wait, { color: theme.muted }]}>Suggest a different spot</Text>
          <View style={styles.row}>
            {otherSpots(calendar.calendar.spots, meetup.spot)
              .slice(0, 6)
              .map((spot) => (
                <Pressable key={spot.name} style={[styles.nudge, { backgroundColor: theme.input }]} onPress={() => run(() => calendar.counter(meetup.id, spot.name, null))}>
                  <Text style={{ color: theme.text }}>{spot.name}</Text>
                </Pressable>
              ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 1, padding: 12, gap: 6, maxWidth: '100%' },
  kicker: { color: palette.sun, fontFamily: 'Fredoka_700Bold', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  spot: { fontFamily: 'Fredoka_700Bold', fontSize: 20 },
  when: { fontFamily: 'Fredoka_500Medium', fontSize: 15 },
  ride: { fontFamily: 'Fredoka_400Regular', fontSize: 13 },
  fallback: { fontFamily: 'Fredoka_400Regular', fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  yes: { backgroundColor: palette.pink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  ghost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: palette.sun },
  yesText: { color: '#fff', fontFamily: 'Fredoka_700Bold' },
  wait: { fontFamily: 'Fredoka_400Regular', fontSize: 12 },
  nudge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});
