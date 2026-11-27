import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  applyCalendarChange,
  bannerCopy,
  calendarFromRows,
  emptyCalendar,
  normalizeSpot,
  PRESET_SPOTS,
  shiftConflict,
  todayIso,
  todaysConfirmed,
  validShift,
  type CalendarState,
  type Meetup,
  type ShiftInput,
} from '@/lib/calendar';
import { syncMeetupWidget } from '@/lib/meetupWidget';
import type { Profile } from '@/lib/types';

type ProposeInput = { day: string; start: number; end: number; spot: string; ride: string };

type CalendarApi = {
  calendar: CalendarState;
  ready: boolean;
  todayMeetup: Meetup | null;
  propose: (input: ProposeInput) => Promise<void>;
  proposeDays: (plans: ProposeInput[]) => Promise<void>;
  confirm: (id: string) => Promise<void>;
  counter: (id: string, spot: string, delta: number | null) => Promise<void>;
  addShift: (shift: ShiftInput) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;
  setDayOff: (day: string, off: boolean) => Promise<void>;
  addSpot: (name: string) => Promise<void>;
  removeSpot: (id: string) => Promise<void>;
};

const EMPTY: CalendarApi = {
  calendar: emptyCalendar(),
  ready: false,
  todayMeetup: null,
  propose: async () => {},
  proposeDays: async () => {},
  confirm: async () => {},
  counter: async () => {},
  addShift: async () => {},
  deleteShift: async () => {},
  setDayOff: async () => {},
  addSpot: async () => {},
  removeSpot: async () => {},
};

const CalendarContext = createContext<CalendarApi>(EMPTY);

function boom(error: { message?: string } | null): Error {
  return new Error(error?.message || 'Couldn’t save that');
}

function remember(setState: (fn: (prev: CalendarState) => CalendarState) => void, row: unknown) {
  const rows = Array.isArray(row) ? row : row ? [row] : [];
  if (!rows.length) return;
  setState((prev) =>
    rows.reduce(
      (state, item) =>
        applyCalendarChange(state, { table: 'restaurant_meetups', event: 'INSERT', new: item as Record<string, unknown> }),
      prev,
    ),
  );
}

export function CalendarProvider({ me, children }: { me: Profile | null; children: ReactNode }) {
  const [calendar, setCalendar] = useState<CalendarState>(emptyCalendar());
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    const [shifts, daysOff, spots, meetups] = await Promise.all([
      supabase.from('work_shifts').select('*'),
      supabase.from('shift_days_off').select('*'),
      supabase.from('favorite_spots').select('*'),
      supabase.from('restaurant_meetups').select('*'),
    ]);
    if (shifts.error || daysOff.error || spots.error || meetups.error) return;
    setCalendar(
      calendarFromRows({
        shifts: (shifts.data ?? []) as Record<string, unknown>[],
        daysOff: (daysOff.data ?? []) as Record<string, unknown>[],
        spots: (spots.data ?? []) as Record<string, unknown>[],
        meetups: (meetups.data ?? []) as Record<string, unknown>[],
      }),
    );
    setReady(true);
  }, [me]);

  useEffect(() => {
    if (!me) {
      setCalendar(emptyCalendar());
      setReady(false);
      return;
    }
    let stopped = false;
    let channel: RealtimeChannel | null = null;
    const boot = async () => {
      await load();
      if (stopped) return;
      await supabase.realtime.setAuth();
      channel = supabase.channel('flarm:calendar', { config: { private: true } });
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'work_shifts' }, (payload) => {
          setCalendar((prev) => applyCalendarChange(prev, { ...payload, table: 'work_shifts' }));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_days_off' }, (payload) => {
          setCalendar((prev) => applyCalendarChange(prev, { ...payload, table: 'shift_days_off' }));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'favorite_spots' }, (payload) => {
          setCalendar((prev) => applyCalendarChange(prev, { ...payload, table: 'favorite_spots' }));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_meetups' }, (payload) => {
          setCalendar((prev) => applyCalendarChange(prev, { ...payload, table: 'restaurant_meetups' }));
        })
        .subscribe();
    };
    boot().catch(() => {});
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') load().catch(() => {});
    }, 15000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') load().catch(() => {});
    });
    return () => {
      stopped = true;
      clearInterval(poll);
      appState.remove();
      if (channel) supabase.removeChannel(channel);
    };
  }, [load, me]);

  useEffect(() => {
    const meetup = todaysConfirmed(calendar.meetups, todayIso());
    const copy = bannerCopy(meetup);
    syncMeetupWidget(copy && meetup ? { spot: meetup.spot, when: copy.detail, ride: meetup.ride, confirmed: true } : null).catch(() => {});
  }, [calendar.meetups]);

  const api = useMemo<CalendarApi>(() => {
    if (!me) return EMPTY;
    return {
      calendar,
      ready,
      todayMeetup: todaysConfirmed(calendar.meetups, todayIso()),
      async propose(input) {
        const { data, error } = await supabase.rpc('propose_meetup', {
          p_day: input.day,
          p_start: input.start,
          p_end: input.end,
          p_spot: input.spot,
          p_ride: input.ride || '',
        });
        if (error) throw boom(error);
        remember(setCalendar, data);
      },
      async proposeDays(plans) {
        const { data, error } = await supabase.rpc('propose_meetup_days', {
          p_days: plans.map((plan) => ({ day: plan.day, start: plan.start, end: plan.end, spot: plan.spot, ride: plan.ride || '' })),
        });
        if (error) throw boom(error);
        remember(setCalendar, data);
      },
      async confirm(id) {
        const { data, error } = await supabase.rpc('confirm_meetup', { p_id: id });
        if (error) throw boom(error);
        remember(setCalendar, data);
      },
      async counter(id, spot, delta) {
        const { data, error } = await supabase.rpc('counter_meetup', { p_id: id, p_spot: spot || null, p_delta: delta });
        if (error) throw boom(error);
        remember(setCalendar, data);
      },
      async addShift(shift) {
        const problem = validShift(shift);
        if (problem) throw new Error(problem);
        if (shiftConflict(calendar.shifts, shift)) throw new Error('That overlaps a shift you already saved');
        const { data, error } = await supabase
          .from('work_shifts')
          .insert({
            weekday: shift.date ? null : shift.weekday,
            on_date: shift.date,
            start_minute: shift.start,
            end_minute: shift.end,
            label: shift.label.trim(),
          })
          .select('*')
          .single();
        if (error) throw boom(error);
        setCalendar((prev) => applyCalendarChange(prev, { table: 'work_shifts', event: 'INSERT', new: data as Record<string, unknown> }));
      },
      async deleteShift(id) {
        const { error } = await supabase.from('work_shifts').delete().eq('id', id);
        if (error) throw boom(error);
        setCalendar((prev) => applyCalendarChange(prev, { table: 'work_shifts', event: 'DELETE', old: { id } }));
      },
      async setDayOff(day, off) {
        const result = off
          ? await supabase.from('shift_days_off').upsert({ user_id: me.id, on_date: day }, { onConflict: 'user_id,on_date' })
          : await supabase.from('shift_days_off').delete().eq('user_id', me.id).eq('on_date', day);
        if (result.error) throw boom(result.error);
        setCalendar((prev) =>
          applyCalendarChange(prev, {
            table: 'shift_days_off',
            event: off ? 'INSERT' : 'DELETE',
            new: { user_id: me.id, on_date: day },
            old: { user_id: me.id, on_date: day },
          }),
        );
      },
      async addSpot(name) {
        const spot = normalizeSpot(name);
        if (!spot) return;
        if (PRESET_SPOTS.some((preset) => preset.toLowerCase() === spot.toLowerCase())) {
          throw new Error(`${spot} is already a quick pick`);
        }
        const { data, error } = await supabase.from('favorite_spots').insert({ name: spot }).select('*').single();
        if (error) throw boom(error);
        setCalendar((prev) => applyCalendarChange(prev, { table: 'favorite_spots', event: 'INSERT', new: data as Record<string, unknown> }));
      },
      async removeSpot(id) {
        const { error } = await supabase.from('favorite_spots').delete().eq('id', id);
        if (error) throw boom(error);
        setCalendar((prev) => applyCalendarChange(prev, { table: 'favorite_spots', event: 'DELETE', old: { id } }));
      },
    };
  }, [calendar, me, ready]);

  return <CalendarContext.Provider value={api}>{children}</CalendarContext.Provider>;
}

export function useCalendar(): CalendarApi {
  return useContext(CalendarContext);
}
