import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ROOM } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { asMessage, type Message, type MessageMeta, type Profile } from '@/lib/types';

type Handlers = {
  onMessage?: (message: Message) => void;
  onError?: (text: string) => void;
};

export function useChat(me: Profile, other: Profile) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherRead, setOtherRead] = useState(other.last_read);
  const [online, setOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const ids = useRef(new Set<number>());
  const handlers = useRef<Handlers>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingSent = useRef(false);
  const oldestRef = useRef<number | null>(null);
  const newestRef = useRef(0);
  const loadingOlder = useRef(false);
  const booted = useRef(false);

  const setHandlers = useCallback((next: Handlers) => {
    handlers.current = next;
  }, []);

  const takeNovel = useCallback((rows: Message[], announce: boolean) => {
    const novel = rows.filter((row) => Number.isFinite(row.id) && !ids.current.has(row.id));
    if (!novel.length) return;
    for (const row of novel) ids.current.add(row.id);
    const min = Math.min(...novel.map((row) => row.id));
    const max = Math.max(...novel.map((row) => row.id));
    oldestRef.current = oldestRef.current == null ? min : Math.min(oldestRef.current, min);
    newestRef.current = Math.max(newestRef.current, max);
    setMessages((prev) => [...prev, ...novel].sort((a, b) => a.id - b.id));
    if (announce && booted.current) {
      for (const row of novel) handlers.current.onMessage?.(row);
    }
  }, []);

  const markRead = useCallback(() => {
    const id = newestRef.current;
    if (!id || AppState.currentState !== 'active') return;
    supabase.rpc('mark_read', { p_id: id }).then(() => {}, () => {});
  }, []);

  const heartbeat = useCallback(() => {
    if (AppState.currentState !== 'active') return;
    supabase.rpc('heartbeat').then(() => {}, () => {});
  }, []);

  const fetchPage = useCallback(async (before?: number) => {
    let query = supabase.from('messages').select('*').order('id', { ascending: false }).limit(60);
    if (before) query = query.lt('id', before);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => asMessage(row as Record<string, unknown>)).reverse();
  }, []);

  const catchUp = useCallback(async () => {
    try {
      const rows = await fetchPage();
      takeNovel(rows, true);
      const { data } = await supabase.from('profiles').select('last_read').eq('id', other.id).maybeSingle();
      if (data) setOtherRead(Number(data.last_read));
      markRead();
    } catch {
      // The next poll retries. A dropped realtime channel shouldn't wipe the thread.
    }
  }, [fetchPage, markRead, other.id, takeNovel]);

  useEffect(() => {
    let live = true;
    fetchPage()
      .then((rows) => {
        if (!live) return;
        takeNovel(rows, false);
        setHasMore(rows.length >= 60);
      })
      .catch(() => {
        if (live) handlers.current.onError?.('Couldn’t load the thread');
      })
      .finally(() => {
        booted.current = true;
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [fetchPage, takeNovel]);

  useEffect(() => {
    let stopped = false;
    let channel: RealtimeChannel | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let readTimer: ReturnType<typeof setTimeout> | null = null;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRead = () => {
      if (readTimer) clearTimeout(readTimer);
      readTimer = setTimeout(markRead, 300);
    };

    const connect = async () => {
      if (stopped) return;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
      const next = supabase.channel(ROOM, {
        config: {
          private: true,
          presence: { key: me.id },
          broadcast: { self: false },
        },
      });
      channel = next;
      channelRef.current = next;
      next
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const message = asMessage(payload.new as Record<string, unknown>);
          takeNovel([message], true);
          scheduleRead();
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
          const id = Number((payload.old as { id?: number }).id);
          if (!id) return;
          ids.current.delete(id);
          setMessages((prev) => prev.filter((message) => message.id !== id));
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
          const row = payload.new as { id?: string; last_read?: number };
          if (row.id === other.id && row.last_read != null) setOtherRead(Number(row.last_read));
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const body = payload as { user?: string; on?: boolean };
          if (!body.user || body.user === me.id) return;
          setTyping(Boolean(body.on));
          if (typingTimer) clearTimeout(typingTimer);
          if (body.on) typingTimer = setTimeout(() => setTyping(false), 6000);
        })
        .on('presence', { event: 'sync' }, () => {
          const present = Object.keys(next.presenceState());
          setOnline(present.includes(other.id));
        })
        .subscribe((status) => {
          if (stopped) return;
          if (status === 'SUBSCRIBED') {
            next.track({ at: Date.now() }).catch(() => {});
            catchUp().catch(() => {});
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            retry = setTimeout(() => {
              connect().catch(() => {});
            }, 3000);
          }
        });
    };

    connect().catch(() => {});
    heartbeat();
    const poll = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      heartbeat();
      catchUp().catch(() => {});
    }, 10000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        heartbeat();
        catchUp().catch(() => {});
        channel?.track({ at: Date.now() }).catch(() => {});
        scheduleRead();
      } else {
        channel?.untrack().catch(() => {});
        if (typingSent.current) {
          channel?.send({ type: 'broadcast', event: 'typing', payload: { user: me.id, on: false } });
          typingSent.current = false;
        }
      }
    });

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (readTimer) clearTimeout(readTimer);
      if (typingTimer) clearTimeout(typingTimer);
      clearInterval(poll);
      appState.remove();
      if (channel) supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [catchUp, heartbeat, markRead, me.id, other.id, takeNovel]);

  const sendTyping = useCallback(
    (on: boolean) => {
      if (typingSent.current === on) return;
      typingSent.current = on;
      channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user: me.id, on } });
    },
    [me.id],
  );

  const sendText = useCallback(
    async (body: string) => {
      const { data, error } = await supabase.from('messages').insert({ kind: 'text', body }).select().single();
      if (error) throw error;
      takeNovel([asMessage(data as Record<string, unknown>)], true);
    },
    [takeNovel],
  );

  const sendFile = useCallback(
    async (row: { kind: 'photo' | 'voice'; file_path: string; mime: string; meta: MessageMeta; body?: string }) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          kind: row.kind,
          body: row.body ?? '',
          file_path: row.file_path,
          mime: row.mime,
          meta: row.meta,
        })
        .select()
        .single();
      if (error) throw error;
      takeNovel([asMessage(data as Record<string, unknown>)], true);
    },
    [takeNovel],
  );

  const loadOlder = useCallback(async () => {
    if (loadingOlder.current || oldestRef.current == null) return;
    loadingOlder.current = true;
    try {
      const rows = await fetchPage(oldestRef.current);
      setHasMore(rows.length >= 60);
      takeNovel(rows, false);
    } finally {
      loadingOlder.current = false;
    }
  }, [fetchPage, takeNovel]);

  return {
    messages,
    otherRead,
    online,
    typing,
    hasMore,
    loading,
    setHandlers,
    sendTyping,
    sendText,
    sendFile,
    loadOlder,
  };
}
