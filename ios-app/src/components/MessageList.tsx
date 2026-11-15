import { useEffect, useRef, useState, type RefObject } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { formatClock, formatDay, formatDur, isEmojiOnly, messageTime } from '@/lib/format';
import { receiptFor } from '@/lib/goose';
import { firstUnreadId, groupReactions, replySnippet, resolveReply } from '@/lib/thread';
import { palette, useTheme } from '@/lib/theme';
import type { Message, Profile, Reaction } from '@/lib/types';

type VoiceState = {
  activeId: number | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  onToggle: (message: Message) => void;
};

type Props = {
  me: Profile;
  other: Profile;
  messages: Message[];
  reactions: Reaction[];
  otherRead: number;
  hasMore: boolean;
  loading: boolean;
  focused: boolean;
  highlightId: number | null;
  readAtOpen: number | null;
  onLoadOlder: () => void;
  onShowLatest: () => void;
  onOpenPhoto: (uri: string) => void;
  onLongPress: (message: Message) => void;
  onReact: (messageId: number, emoji: string) => void;
  onJump: (id: number) => void;
  resolvePhoto: (path: string) => Promise<string>;
  voice: VoiceState;
  listRef: RefObject<FlatList<Message> | null>;
  onStick: (stick: boolean) => void;
};

export function MessageList(props: Props) {
  const theme = useTheme();
  const receipt = receiptFor(props.messages, props.me.id, props.otherRead);
  const unreadId = firstUnreadId(props.messages, props.readAtOpen);
  return (
    <FlatList
      ref={props.listRef}
      data={props.messages}
      extraData={{ reactions: props.reactions, highlightId: props.highlightId, otherRead: props.otherRead }}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      onScroll={(event) => {
        const { contentSize, layoutMeasurement, contentOffset } = event.nativeEvent;
        props.onStick(contentSize.height - layoutMeasurement.height - contentOffset.y < 160);
      }}
      scrollEventThrottle={16}
      onScrollToIndexFailed={(info) => {
        props.listRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: false });
        setTimeout(() => props.listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.45 }), 60);
      }}
      ListHeaderComponent={
        props.focused ? (
          <Pressable onPress={props.onShowLatest} style={[styles.older, { backgroundColor: theme.card }]}>
            <Text style={[styles.olderText, { color: theme.text }]}>back to latest</Text>
          </Pressable>
        ) : props.hasMore ? (
          <Pressable onPress={props.onLoadOlder} style={[styles.older, { backgroundColor: theme.card }]}>
            <Text style={[styles.olderText, { color: theme.text }]}>earlier bops</Text>
          </Pressable>
        ) : undefined
      }
      ListEmptyComponent={
        props.loading ? undefined : (
          <View style={styles.empty}>
            <Text style={styles.emptyMark}>♫</Text>
            <Text style={[styles.emptyText, { color: theme.text }]}>This is the very first note.{'\n'}Say something nice.</Text>
          </View>
        )
      }
      renderItem={({ item, index }) => {
        const prev = index > 0 ? props.messages[index - 1] : null;
        const showDay = !prev || new Date(item.created_at).toDateString() !== new Date(prev.created_at).toDateString();
        const gap = !prev || prev.sender !== item.sender || messageTime(item.created_at) - messageTime(prev.created_at) > 5 * 60 * 1000;
        return (
          <View>
            {showDay ? <Text style={[styles.day, { color: theme.muted }]}>{formatDay(item.created_at)}</Text> : null}
            {item.id === unreadId ? (
              <View style={styles.unread}>
                <View style={[styles.unreadLine, { backgroundColor: palette.sun }]} />
                <Text style={styles.unreadText}>new notes</Text>
                <View style={[styles.unreadLine, { backgroundColor: palette.sun }]} />
              </View>
            ) : null}
            <Bubble
              message={item}
              mine={item.sender === props.me.id}
              gap={gap}
              receipt={receipt?.messageId === item.id ? receipt.label : null}
              reactions={props.reactions.filter((row) => row.message_id === item.id)}
              reply={resolveReply(item, props.messages)}
              replyName={(() => {
                const snap = resolveReply(item, props.messages);
                if (!snap) return item.reply_to ? 'Earlier' : '';
                if (snap.sender === props.me.id) return props.me.display;
                if (snap.sender === props.other.id) return props.other.display;
                return 'Them';
              })()}
              meId={props.me.id}
              highlight={props.highlightId === item.id}
              onOpenPhoto={props.onOpenPhoto}
              onLongPress={() => props.onLongPress(item)}
              onReact={(emoji) => props.onReact(item.id, emoji)}
              onJump={props.onJump}
              resolvePhoto={props.resolvePhoto}
              voice={props.voice}
            />
          </View>
        );
      }}
    />
  );
}

function Bubble({
  message,
  mine,
  gap,
  receipt,
  reactions,
  reply,
  replyName,
  meId,
  highlight,
  onOpenPhoto,
  onLongPress,
  onReact,
  onJump,
  resolvePhoto,
  voice,
}: {
  message: Message;
  mine: boolean;
  gap: boolean;
  receipt: string | null;
  reactions: Reaction[];
  reply: ReturnType<typeof resolveReply>;
  replyName: string;
  meId: string;
  highlight: boolean;
  onOpenPhoto: (uri: string) => void;
  onLongPress: () => void;
  onReact: (emoji: string) => void;
  onJump: (id: number) => void;
  resolvePhoto: (path: string) => Promise<string>;
  voice: VoiceState;
}) {
  const theme = useTheme();
  const lastTap = useRef(0);
  const emoji = message.kind === 'text' && isEmojiOnly(message.body) && !reply;
  const chips = groupReactions(reactions, meId);
  const body = (
    <View style={emoji ? styles.emojiWrap : undefined}>
      {reply || message.reply_to ? (
        <Pressable
          onPress={() => message.reply_to && onJump(message.reply_to)}
          style={[styles.quote, { backgroundColor: mine ? 'rgba(0,0,0,0.14)' : 'rgba(42,18,64,0.06)', borderLeftColor: mine ? palette.sun : palette.pink }]}
        >
          <Text style={[styles.quoteName, { color: mine ? palette.sun : palette.pink }]}>{replyName || 'Earlier'}</Text>
          <Text style={[styles.quoteText, { color: mine ? '#fff' : theme.themText }]} numberOfLines={1}>
            {replySnippet(reply)}
          </Text>
        </Pressable>
      ) : null}
      {message.kind === 'text' ? (
        <Text style={[styles.body, emoji && styles.emoji, !emoji && { color: mine ? '#fff' : theme.themText }]}>{message.body}</Text>
      ) : null}
      {message.kind === 'photo' && message.file_path ? (
        <Photo message={message} resolvePhoto={resolvePhoto} onOpen={onOpenPhoto} />
      ) : null}
      {message.kind === 'voice' ? <Voice message={message} mine={mine} voice={voice} /> : null}
    </View>
  );

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={360}
      onPress={() => {
        const now = Date.now();
        if (now - lastTap.current < 280) {
          lastTap.current = 0;
          onReact('❤️');
          return;
        }
        lastTap.current = now;
      }}
      style={[styles.row, mine ? styles.mine : styles.theirs, gap && styles.gap, highlight && styles.highlight]}
    >
      {emoji ? (
        body
      ) : mine ? (
        <LinearGradient colors={[...palette.me]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, styles.mineBubble]}>
          {body}
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, styles.theirBubble, { backgroundColor: theme.themBubble }]}>{body}</View>
      )}
      <View style={styles.meta}>
        <Text style={[styles.time, { color: theme.muted }]}>{formatClock(message.created_at)}</Text>
        {message.edited_at ? <Text style={[styles.edited, { color: theme.muted }]}>edited</Text> : null}
        {receipt ? <Text style={styles.receipt}>{receipt}</Text> : null}
      </View>
      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <Pressable key={chip.emoji} onPress={() => onReact(chip.emoji)} style={[styles.chip, { backgroundColor: theme.card }, chip.mine && styles.chipMine]}>
              <Text style={[styles.chipText, { color: theme.text }]}>{chip.count > 1 ? `${chip.emoji} ${chip.count}` : chip.emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function Photo({
  message,
  resolvePhoto,
  onOpen,
}: {
  message: Message;
  resolvePhoto: (path: string) => Promise<string>;
  onOpen: (uri: string) => void;
}) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    resolvePhoto(message.file_path ?? '')
      .then((next) => {
        if (live) setUri(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [message.file_path, resolvePhoto]);
  const ratio = message.meta?.w && message.meta?.h ? message.meta.w / message.meta.h : 1;
  const width = Math.min(message.meta?.w ?? 240, 260);
  return (
    <Pressable onPress={() => uri && onOpen(uri)} accessibilityLabel="View photo">
      <Image
        source={uri ? { uri } : undefined}
        style={{ width, height: width / ratio, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.12)', minHeight: 90 }}
        contentFit="cover"
        accessibilityLabel="photo"
      />
      {message.body ? <Text style={styles.caption}>{message.body}</Text> : null}
    </Pressable>
  );
}

function Voice({ message, mine, voice }: { message: Message; mine: boolean; voice: VoiceState }) {
  const theme = useTheme();
  const peaks = message.meta?.peaks?.length ? message.meta.peaks : Array.from({ length: 28 }, (_, i) => 0.25 + 0.4 * Math.abs(Math.sin(i * 1.3)));
  const active = voice.activeId === message.id;
  const total = (active && voice.duration) || message.meta?.dur || 0;
  const progress = active && total ? voice.currentTime / total : 0;
  const shown = active && voice.playing ? voice.currentTime : total;
  return (
    <View style={styles.voice}>
      <Pressable
        onPress={() => voice.onToggle(message)}
        style={[styles.play, { backgroundColor: mine ? '#fff' : palette.pink }]}
        accessibilityLabel={active && voice.playing ? 'Pause voice note' : 'Play voice note'}
      >
        <Text style={{ color: mine ? palette.pink : '#fff', fontWeight: '700' }}>{active && voice.playing ? '❚❚' : '▶'}</Text>
      </Pressable>
      <View style={styles.bars}>
        {peaks.map((peak, index) => (
          <View
            key={index}
            style={{
              flex: 1,
              height: Math.max(4, peak * 28),
              borderRadius: 2,
              backgroundColor: mine ? '#fff' : theme.themText,
              opacity: index / peaks.length < progress ? 1 : 0.35,
            }}
          />
        ))}
      </View>
      <Text style={[styles.dur, { color: mine ? '#fff' : theme.themText }]}>{formatDur(shown)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, flexGrow: 1 },
  older: { alignSelf: 'center', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 10 },
  olderText: { fontFamily: 'Fredoka_500Medium', fontSize: 13 },
  empty: { alignItems: 'center', marginTop: 72 },
  emptyMark: { fontSize: 64, color: palette.sun },
  emptyText: { textAlign: 'center', fontFamily: 'Fredoka_500Medium', fontSize: 17, lineHeight: 24 },
  day: { textAlign: 'center', fontFamily: 'Fredoka_500Medium', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', marginVertical: 10 },
  unread: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  unreadLine: { flex: 1, height: 1, opacity: 0.8 },
  unreadText: { fontFamily: 'Fredoka_600SemiBold', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', color: palette.sun },
  row: { maxWidth: '100%', marginVertical: 2 },
  mine: { alignItems: 'flex-end' },
  theirs: { alignItems: 'flex-start' },
  gap: { marginTop: 12 },
  bubble: { maxWidth: '82%', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10 },
  mineBubble: { borderBottomRightRadius: 8 },
  theirBubble: { borderBottomLeftRadius: 8 },
  body: { fontFamily: 'Fredoka_500Medium', fontSize: 17, lineHeight: 23 },
  emojiWrap: { paddingHorizontal: 4 },
  emoji: { fontSize: 46, lineHeight: 56, backgroundColor: 'transparent' },
  meta: { flexDirection: 'row', gap: 6, marginTop: 3, marginHorizontal: 8 },
  time: { fontFamily: 'Fredoka_400Regular', fontSize: 11 },
  receipt: { fontFamily: 'Fredoka_600SemiBold', fontSize: 11, color: palette.sun },
  edited: { fontFamily: 'Fredoka_400Regular', fontSize: 11, fontStyle: 'italic' },
  quote: { borderLeftWidth: 3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 6 },
  quoteName: { fontFamily: 'Fredoka_700Bold', fontSize: 12 },
  quoteText: { fontFamily: 'Fredoka_500Medium', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginHorizontal: 8 },
  chip: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  chipMine: { borderWidth: 1.5, borderColor: palette.pink },
  chipText: { fontSize: 14 },
  highlight: { opacity: 1 },
  caption: { fontFamily: 'Fredoka_500Medium', color: '#fff', paddingTop: 6 },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 210 },
  play: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 30 },
  dur: { fontFamily: 'Fredoka_500Medium', fontSize: 13, minWidth: 36, fontVariant: ['tabular-nums'] },
});
