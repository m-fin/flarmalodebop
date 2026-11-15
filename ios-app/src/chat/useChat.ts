import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { BUCKET, ROOM } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { likePattern, nextReactions } from '@/lib/thread';
import { asMessage, asReaction, oneRow, type Message, type MessageMeta, type Profile, type Reaction } from '@/lib/types';

type Handlers = {
  onMessage?: (message: Message) => void;
  onError?: (text: string) => void;
};

type MessageResult = { data: unknown[] | null; error: { message: string } | null };

const FANCY_SELECT = '*, reply:reply_to(id, sender, kind, body)';

export function useChat(me: Profile, other: Profile) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [otherRead, setOtherRead] = useState(other.last_read);
  const [online, setOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState(false);
  const ids = useRef(new Set<number>());
  const handlers = useRef<Handlers>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingSent = useRef(false);
  const oldestRef = useRef<number | null>(null);
  const newestRef = useRef(0);
  const loadingOlder = useRef(false);
  const booted = useRef(false);
  const focusedRef = useRef(false);
  const selectRef = useRef(FANCY_SELECT);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const setHandlers = useCallback((next: Handlers) => {
    handlers.current = next;
  }, []);

  const replaceAll = useCallback((rows: Message[]) => {
    ids.current = new Set(rows.map((row) => row.id));
    oldestRef.current = rows[0]?.id ?? null;
    newestRef.current = rows.reduce((max, row) => Math.max(max, row.id), 0);
    setMessages(rows);
  }, []);

  const takeNovel = useCallback((rows: Message[], announce: boolean) => {
    const novel = rows.filter((row) => Number.isFinite(row.id) && !ids.current.has(row.id));
    const known = rows.filter((row) => ids.current.has(row.id));
    if (known.length) {
      setMessages((prev) =>
        prev.map((message) => {
          const update = known.find((row) => row.id === message.id);
          if (!update) return message;
          return { ...message, ...update, reply: update.reply ?? message.reply };
        }),
      );
    }
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

  const readMessages = useCallback(async (build: (columns: string) => PromiseLike<MessageResult>) => {
    let result = await build(selectRef.current);
    if (result.error && /reply_to|relationship|schema cache|Could not find/i.test(result.error.message)) {
      selectRef.current = '*';
      result = await build('*');
    }
    if (result.error) throw result.error;
    return (result.data ?? []).map((row) => asMessage(row as Record<string, unknown>));
  }, []);

  const loadReactions = useCallback(async (messageIds: number[]) => {
    if (!messageIds.length) return;
    const { data, error } = await supabase.from('message_reactions').select('message_id,user_id,emoji').in('message_id', messageIds);
    if (error) return;
    const fresh = (data ?? []).map((row) => asReaction(row as Record<string, unknown>));
    const drop = new Set(messageIds);
    setReactions((prev) => [...prev.filter((row) => !drop.has(row.message_id)), ...fresh]);
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

  const fetchPage = useCallback(
    async (before?: number) =>
      readMessages((columns) => {
        let query = supabase.from('messages').select(columns).order('id', { ascending: false }).limit(60);
        if (before) query = query.lt('id', before);
        return query;
      }).then((rows) => rows.reverse()),
    [readMessages],
  );

  const catchUp = useCallback(async () => {
    try {
      const rows = await fetchPage();
      if (focusedRef.current) {
        takeNovel(rows.filter((row) => ids.current.has(row.id)), false);
      } else {
        takeNovel(rows, true);
        loadReactions(rows.map((row) => row.id)).catch(() => {});
      }
      const { data } = await supabase.from('profiles').select('last_read').eq('id', other.id).maybeSingle();
      if (data) setOtherRead(Number(data.last_read));
      markRead();
    } catch {
      // The next poll retries. A dropped realtime channel shouldn't wipe the thread.
    }
  }, [fetchPage, loadReactions, markRead, other.id, takeNovel]);

  useEffect(() => {
    let live = true;
    fetchPage()
      .then((rows) => {
        if (!live) return;
        takeNovel(rows, false);
        setHasMore(rows.length >= 60);
        loadReactions(rows.map((row) => row.id)).catch(() => {});
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
  }, [fetchPage, loadReactions, takeNovel]);

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
          if (focusedRef.current) return;
          const message = asMessage(payload.new as Record<string, unknown>);
          takeNovel([message], true);
          scheduleRead();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
          const message = asMessage(payload.new as Record<string, unknown>);
          if (!ids.current.has(message.id)) return;
          takeNovel([message], false);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
          const id = Number((payload.old as { id?: number }).id);
          if (!id) return;
          ids.current.delete(id);
          setMessages((prev) =>
            prev
              .filter((message) => message.id !== id)
              .map((message) => (message.reply_to === id ? { ...message, reply_to: null, reply: null } : message)),
          );
          setReactions((prev) => prev.filter((row) => row.message_id !== id));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
          const kind = payload.eventType;
          if (kind === 'DELETE') {
            const old = payload.old as { message_id?: number; user_id?: string };
            if (old.message_id == null || !old.user_id) return;
            setReactions((prev) => prev.filter((row) => !(row.message_id === Number(old.message_id) && row.user_id === old.user_id)));
            return;
          }
          const row = asReaction(payload.new as Record<string, unknown>);
          setReactions((prev) => [...prev.filter((item) => !(item.message_id === row.message_id && item.user_id === row.user_id)), row]);
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

  const withReply = useCallback((message: Message) => {
    if (message.reply_to == null || message.reply) return message;
    const parent = messagesRef.current.find((row) => row.id === message.reply_to);
    if (!parent) return message;
    return { ...message, reply: { id: parent.id, sender: parent.sender, kind: parent.kind, body: parent.body } };
  }, []);

  const sendText = useCallback(
    async (body: string, replyTo?: number | null) => {
      const row: { kind: 'text'; body: string; reply_to?: number } = { kind: 'text', body };
      if (replyTo) row.reply_to = replyTo;
      const { data, error } = await supabase.from('messages').insert(row).select('*').single();
      if (error) throw error;
      takeNovel([withReply(asMessage(data as Record<string, unknown>))], true);
    },
    [takeNovel, withReply],
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
        .select('*')
        .single();
      if (error) throw error;
      takeNovel([asMessage(data as Record<string, unknown>)], true);
    },
    [takeNovel],
  );

  const editMessage = useCallback(async (id: number, body: string) => {
    const { data, error } = await supabase.rpc('edit_message', { p_id: id, p_body: body });
    if (error) throw error;
    const row = oneRow(data);
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== id) return message;
        if (!row) return { ...message, body, edited_at: new Date().toISOString() };
        const next = asMessage(row);
        return { ...message, ...next, reply: next.reply ?? message.reply };
      }),
    );
  }, []);

  const unsend = useCallback(async (message: Message) => {
    if (message.file_path) await supabase.storage.from(BUCKET).remove([message.file_path]);
    const { error } = await supabase.from('messages').delete().eq('id', message.id);
    if (error) throw error;
    ids.current.delete(message.id);
    setMessages((prev) =>
      prev
        .filter((row) => row.id !== message.id)
        .map((row) => (row.reply_to === message.id ? { ...row, reply_to: null, reply: null } : row)),
    );
    setReactions((prev) => prev.filter((row) => row.message_id !== message.id));
  }, []);

  const toggleReaction = useCallback(
    async (messageId: number, emoji: string) => {
      const current = reactions.filter((row) => row.message_id === messageId);
      const next = nextReactions(current, me.id, emoji).map((row) => ({ ...row, message_id: messageId }));
      const desired = next.find((row) => row.user_id === me.id)?.emoji ?? '';
      setReactions((prev) => [...prev.filter((row) => row.message_id !== messageId), ...next]);
      const { error } = await supabase.rpc('set_reaction', { p_message: messageId, p_emoji: desired });
      if (error) {
        setReactions((prev) => [...prev.filter((row) => row.message_id !== messageId), ...current]);
        throw error;
      }
    },
    [me.id, reactions],
  );

  const searchMessages = useCallback(
    async (query: string) => {
      const pattern = likePattern(query);
      if (!pattern) return [];
      return readMessages((columns) =>
        supabase.from('messages').select(columns).ilike('body', pattern).order('id', { ascending: false }).limit(40),
      );
    },
    [readMessages],
  );

  const focusMessage = useCallback(
    async (id: number) => {
      if (ids.current.has(id)) return;
      const rows = await readMessages((columns) =>
        supabase.from('messages').select(columns).gte('id', Math.max(1, id - 20)).order('id', { ascending: true }).limit(50),
      );
      replaceAll(rows);
      focusedRef.current = true;
      setFocused(true);
      setHasMore(false);
      await loadReactions(rows.map((row) => row.id));
    },
    [loadReactions, readMessages, replaceAll],
  );

  const showLatest = useCallback(async () => {
    focusedRef.current = false;
    setFocused(false);
    const rows = await fetchPage();
    replaceAll(rows);
    setHasMore(rows.length >= 60);
    await loadReactions(rows.map((row) => row.id));
  }, [fetchPage, loadReactions, replaceAll]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder.current || oldestRef.current == null || focusedRef.current) return;
    loadingOlder.current = true;
    try {
      const rows = await fetchPage(oldestRef.current);
      setHasMore(rows.length >= 60);
      takeNovel(rows, false);
      await loadReactions(rows.map((row) => row.id));
    } finally {
      loadingOlder.current = false;
    }
  }, [fetchPage, loadReactions, takeNovel]);

  return {
    messages,
    reactions,
    otherRead,
    online,
    typing,
    hasMore,
    loading,
    focused,
    setHandlers,
    sendTyping,
    sendText,
    sendFile,
    editMessage,
    unsend,
    toggleReaction,
    searchMessages,
    focusMessage,
    showLatest,
    loadOlder,
  };
}
