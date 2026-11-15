import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioSource,
} from 'expo-audio';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { avatarFor } from '@/lib/config';
import { downsamplePeaks, formatDur, meterLevel } from '@/lib/format';
import { hapticSelect, hapticTap } from '@/lib/haptics';
import { sessionMode } from '@/lib/sounds';
import { draftKey, draftToStore, firstUnreadId, normalizeDraft, replySnippet } from '@/lib/thread';
import { palette, useTheme } from '@/lib/theme';
import type { Message, Profile, Reaction } from '@/lib/types';
import { Background } from '@/components/Background';
import { GooseFx } from '@/components/GooseFx';
import { MessageActions } from '@/components/MessageActions';
import { MessageList } from '@/components/MessageList';
import { PhotoRoll } from '@/components/PhotoRoll';
import { PhotoViewer } from '@/components/PhotoViewer';
import { SearchSheet } from '@/components/SearchSheet';
import { SettingsSheet } from '@/components/SettingsSheet';
import type { GooseKind } from '@/lib/goose';

const VOICE_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  bitRate: 64000,
  numberOfChannels: 1,
  isMeteringEnabled: true,
  extension: '.m4a',
};

export type VoiceDraft = { uri: string; dur: number; peaks: number[]; mime: string };

type Props = {
  me: Profile;
  other: Profile;
  messages: Message[];
  reactions: Reaction[];
  otherRead: number;
  online: boolean;
  typing: boolean;
  hasMore: boolean;
  loading: boolean;
  focused: boolean;
  soundOn: boolean;
  appearanceLabel: string;
  pushLabel: string;
  pushNote: string;
  pushBusy: boolean;
  fx: { nonce: number; kind: GooseKind } | null;
  onSendText: (body: string, replyTo?: number | null) => Promise<void>;
  onEdit: (id: number, body: string) => Promise<void>;
  onUnsend: (message: Message) => Promise<void>;
  onReact: (messageId: number, emoji: string) => Promise<void>;
  onSearch: (query: string) => Promise<Message[]>;
  onFocusMessage: (id: number) => Promise<void>;
  onShowLatest: () => void;
  onPhoto: (source: 'camera' | 'library') => Promise<void>;
  onSendVoice: (draft: VoiceDraft) => Promise<void>;
  onTyping: (on: boolean) => void;
  onLoadOlder: () => void;
  onToggleSound: () => void;
  onCycleAppearance: () => void;
  onEnablePush: () => void;
  onSignOut: () => void;
  resolvePhoto: (path: string) => Promise<string>;
  resolveAudio: (path: string) => Promise<AudioSource>;
};

export function ChatView(props: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardState((state) => state.isVisible);
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [actions, setActions] = useState<Message | null>(null);
  const [confirmUnsend, setConfirmUnsend] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const listRef = useRef<FlatList<Message>>(null);
  const readAtOpen = useRef(props.me.last_read);
  const draftReady = useRef(false);
  const suspendDraft = useRef(false);
  const draftRef = useRef('');
  const stick = useRef(true);
  const typingOn = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peaks = useRef<number[]>([]);
  const started = useRef(0);
  const stopping = useRef(false);
  const player = useAudioPlayer(null, { updateInterval: 120 });
  const status = useAudioPlayerStatus(player);
  const [voiceId, setVoiceId] = useState<number | null>(null);
  const recorder = useAudioRecorder(VOICE_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast((current) => (current === text ? null : current)), 2400);
  }

  useEffect(() => {
    if (!recorderState.isRecording) return;
    const level = meterLevel(recorderState.metering);
    peaks.current.push(level);
    setLevels((prev) => [...prev.slice(-46), level]);
    if (recorderState.durationMillis >= 300_000) void finishRecording(true);
    // The recorder status is the tick. finishRecording guards against overlapping stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState]);

  useEffect(() => {
    if (highlightId != null || !stick.current) return;
    listRef.current?.scrollToEnd({ animated: true });
  }, [highlightId, props.messages.length, props.typing]);

  useEffect(() => {
    if (highlightId == null) return;
    const index = props.messages.findIndex((message) => message.id === highlightId);
    if (index >= 0) listRef.current?.scrollToIndex({ index, viewPosition: 0.45, animated: true });
  }, [highlightId, props.messages]);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(draftKey(props.me.id))
      .then((value) => {
        if (!live || draftRef.current) return;
        const text = normalizeDraft(value);
        if (!text) return;
        draftRef.current = text;
        setDraft(text);
      })
      .catch(() => {})
      .finally(() => {
        draftReady.current = true;
      });
    return () => {
      live = false;
    };
  }, [props.me.id]);

  function rememberDraft(value: string) {
    if (!draftReady.current || suspendDraft.current) return;
    const key = draftKey(props.me.id);
    const stored = draftToStore(value);
    if (stored == null) AsyncStorage.removeItem(key).catch(() => {});
    else AsyncStorage.setItem(key, stored).catch(() => {});
  }

  function updateDraft(value: string) {
    draftRef.current = value;
    setDraft(value);
    rememberDraft(value);
    const has = value.trim().length > 0;
    if (has && !typingOn.current) {
      typingOn.current = true;
      props.onTyping(true);
    }
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (typingOn.current) {
        typingOn.current = false;
        props.onTyping(false);
      }
    }, 3000);
    if (!has && typingOn.current) {
      typingOn.current = false;
      props.onTyping(false);
    }
  }

  function nameFor(senderId: string) {
    if (senderId === props.me.id) return props.me.display;
    if (senderId === props.other.id) return props.other.display;
    return 'Them';
  }

  async function sendText() {
    const body = draft;
    if (!body.trim()) return;
    const editingNow = editing;
    const replyId = reply?.id ?? null;
    suspendDraft.current = false;
    setReply(null);
    setEditing(null);
    if (editingNow) setDraft('');
    else updateDraft('');
    hapticTap();
    try {
      if (editingNow) await props.onEdit(editingNow.id, body);
      else await props.onSendText(body, replyId);
    } catch {
      if (editingNow) {
        suspendDraft.current = true;
        setEditing(editingNow);
        setDraft(body);
      } else {
        if (replyId) setReply(props.messages.find((message) => message.id === replyId) ?? null);
        updateDraft(body);
      }
      showToast(editingNow ? 'Couldn’t edit that' : 'Didn’t send — check your connection');
    }
  }

  async function jumpTo(id: number) {
    stick.current = false;
    setSearchOpen(false);
    setActions(null);
    try {
      await props.onFocusMessage(id);
      setHighlightId(id);
      const index = props.messages.findIndex((message) => message.id === id);
      if (index >= 0) listRef.current?.scrollToIndex({ index, viewPosition: 0.45 });
      setTimeout(() => setHighlightId((current) => (current === id ? null : current)), 1400);
    } catch {
      showToast('Couldn’t find that bop');
    }
  }

  function choosePhoto() {
    const go = (source: 'camera' | 'library') => {
      hapticTap();
      props.onPhoto(source).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        showToast(message ? `Photo didn’t send: ${message}` : 'Photo didn’t send');
      });
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Take photo', 'Choose photo', 'Cancel'], cancelButtonIndex: 2, userInterfaceStyle: theme.dark ? 'dark' : 'light' },
        (index) => {
          if (index === 0) go('camera');
          if (index === 1) go('library');
        },
      );
      return;
    }
    Alert.alert('Send a photo', undefined, [
      { text: 'Take photo', onPress: () => go('camera') },
      { text: 'Choose photo', onPress: () => go('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function startRecording() {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      showToast('Microphone permission is off — allow it in Settings');
      return;
    }
    try {
      await setAudioModeAsync(sessionMode(true));
      peaks.current = [];
      setLevels([]);
      started.current = Date.now();
      await recorder.prepareToRecordAsync(VOICE_OPTIONS);
      recorder.record();
      setRecording(true);
      hapticTap();
    } catch {
      showToast('Couldn’t start the recording');
    }
  }

  async function finishRecording(send: boolean) {
    if (stopping.current) return;
    if (!recording && !recorderState.isRecording) return;
    stopping.current = true;
    setRecording(false);
    try {
      try {
        await recorder.stop();
      } catch {
        // already stopped
      }
      await setAudioModeAsync(sessionMode(false)).catch(() => {});
      const dur = (Date.now() - started.current) / 1000;
      const uri = recorder.uri;
      if (!send || dur < 0.6 || !uri) return;
      await props.onSendVoice({
        uri,
        dur: Math.round(dur * 10) / 10,
        peaks: downsamplePeaks(peaks.current, 32),
        mime: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4',
      });
      hapticTap();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      showToast(message ? `Voice note didn’t send: ${message}` : 'Voice note didn’t send');
    } finally {
      stopping.current = false;
    }
  }

  async function toggleVoice(message: Message) {
    if (!message.file_path) return;
    try {
      if (voiceId === message.id && player.playing) {
        player.pause();
        return;
      }
      if (voiceId !== message.id) {
        const source = await props.resolveAudio(message.file_path);
        player.replace(source);
        setVoiceId(message.id);
      }
      player.play();
    } catch {
      showToast('Couldn’t load that voice note');
    }
  }

  const hasText = draft.trim().length > 0;
  const seconds = recording ? (Date.now() - started.current) / 1000 : recorderState.durationMillis / 1000;

  return (
    <View style={[styles.fill, { backgroundColor: theme.bg }]}>
      <Background />
      <BlurView intensity={theme.dark ? 36 : 50} tint={theme.dark ? 'dark' : 'light'} style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: theme.header }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatarFor(props.other.username, props.other.display)}</Text>
        </View>
        <View style={styles.who}>
          <Text style={[styles.name, { color: theme.text }]}>{props.other.display}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: props.online ? palette.mint : '#8a7a99' }]} />
            <Text style={[styles.status, { color: theme.muted }]}>{props.online ? 'here now ♪' : 'away'}</Text>
          </View>
        </View>
        <Pressable accessibilityLabel="Photos" onPress={() => setPhotosOpen(true)} style={styles.iconBtn}>
          <Text style={styles.icon}>🖼️</Text>
        </Pressable>
        <Pressable accessibilityLabel="Search messages" onPress={() => setSearchOpen(true)} style={styles.iconBtn}>
          <Text style={styles.icon}>🔍</Text>
        </Pressable>
        <Pressable accessibilityLabel="Settings" onPress={() => setSettings(true)} style={styles.iconBtn}>
          <Text style={[styles.icon, { color: theme.text }]}>⋯</Text>
        </Pressable>
      </BlurView>

      <KeyboardAvoidingView style={styles.fill} behavior="padding" automaticOffset>
        <MessageList
          me={props.me}
          other={props.other}
          messages={props.messages}
          reactions={props.reactions}
          otherRead={props.otherRead}
          hasMore={props.hasMore}
          loading={props.loading}
          focused={props.focused}
          highlightId={highlightId}
          readAtOpen={readAtOpen.current}
          listRef={listRef}
          onStick={(next) => {
            stick.current = next;
          }}
          onLoadOlder={() => {
            stick.current = false;
            props.onLoadOlder();
          }}
          onShowLatest={() => {
            stick.current = true;
            props.onShowLatest();
          }}
          onOpenPhoto={setPhoto}
          onLongPress={(message) => {
            setConfirmUnsend(false);
            setActions(message);
          }}
          onReact={(messageId, emoji) => {
            props.onReact(messageId, emoji).catch(() => showToast('Couldn’t save that reaction'));
          }}
          onJump={(id) => {
            void jumpTo(id);
          }}
          resolvePhoto={props.resolvePhoto}
          voice={{
            activeId: voiceId,
            playing: status.playing,
            currentTime: status.currentTime,
            duration: status.duration,
            onToggle: (message) => {
              void toggleVoice(message);
            },
          }}
        />
        {props.typing ? (
          <View style={styles.typingRow}>
            <View style={[styles.typingBubble, { backgroundColor: theme.themBubble }]}>
              <Text style={styles.typingNote}>♪</Text>
              <Text style={styles.typingNote}>♫</Text>
              <Text style={styles.typingNote}>♪</Text>
            </View>
          </View>
        ) : null}
        <BlurView
          intensity={theme.dark ? 36 : 50}
          tint={theme.dark ? 'dark' : 'light'}
          style={[styles.composer, { paddingBottom: (keyboardOpen ? 8 : insets.bottom) + 8, backgroundColor: theme.header }]}
        >
          {reply || editing ? (
            <View style={[styles.composeContext, { backgroundColor: theme.card }]}>
              <View style={styles.composeCopy}>
                <Text style={styles.composeKicker}>{editing ? 'Editing' : `Replying to ${nameFor((reply ?? editing)!.sender)}`}</Text>
                <Text style={[styles.composeSnippet, { color: theme.text }]} numberOfLines={1}>
                  {replySnippet(editing ?? reply)}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Cancel"
                onPress={() => {
                  const wasEditing = editing != null;
                  setReply(null);
                  setEditing(null);
                  suspendDraft.current = false;
                  if (!wasEditing) return;
                  AsyncStorage.getItem(draftKey(props.me.id))
                    .then((value) => setDraft(normalizeDraft(value)))
                    .catch(() => setDraft(''));
                }}
                style={styles.iconBtn}
              >
                <Text style={[styles.icon, { color: theme.text }]}>✕</Text>
              </Pressable>
            </View>
          ) : null}
          {recording ? (
            <View style={styles.inputRow}>
              <Pressable accessibilityLabel="Cancel recording" onPress={() => void finishRecording(false)} style={styles.iconBtn}>
                <Text style={[styles.icon, { color: theme.text }]}>✕</Text>
              </Pressable>
              <View style={[styles.recViz, { backgroundColor: theme.input }]}>
                <View style={styles.recDot} />
                <View style={styles.recBars}>
                  {(levels.length ? levels : [0.2]).slice(-28).map((level, index) => (
                    <View key={index} style={[styles.recBar, { height: Math.max(4, level * 28), backgroundColor: index % 2 ? palette.sun : palette.pink }]} />
                  ))}
                </View>
              </View>
              <Text style={[styles.recTime, { color: theme.text }]}>{formatDur(seconds || 0)}</Text>
              <Pressable accessibilityLabel="Send voice note" onPress={() => void finishRecording(true)} style={styles.send}>
                <Text style={styles.sendLabel}>➤</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.inputRow}>
              <Pressable accessibilityLabel="Send photo" onPress={choosePhoto} style={styles.iconBtn}>
                <Text style={styles.icon}>📷</Text>
              </Pressable>
              <TextInput
                value={draft}
                onChangeText={updateDraft}
                placeholder="Write a little melody…"
                placeholderTextColor={theme.muted}
                multiline
                style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]}
              />
              {hasText ? (
                <Pressable accessibilityLabel={editing ? 'Save edit' : 'Send'} onPress={() => void sendText()} style={styles.send}>
                  <Text style={styles.sendLabel}>{editing ? '✓' : '♪'}</Text>
                </Pressable>
              ) : (
                <Pressable accessibilityLabel="Record voice note" onPress={() => void startRecording()} style={styles.iconBtn}>
                  <Text style={styles.icon}>🎙️</Text>
                </Pressable>
              )}
            </View>
          )}
        </BlurView>
      </KeyboardAvoidingView>

      <GooseFx fx={props.fx} />
      {toast ? (
        <View style={[styles.toast, { top: insets.top + 64 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
      <SettingsSheet
        visible={settings}
        me={props.me}
        soundOn={props.soundOn}
        pushLabel={props.pushLabel}
        pushNote={props.pushNote}
        pushBusy={props.pushBusy}
        onClose={() => setSettings(false)}
        onToggleSound={() => {
          hapticSelect();
          props.onToggleSound();
        }}
        appearanceLabel={props.appearanceLabel}
        onCycleAppearance={() => {
          hapticSelect();
          props.onCycleAppearance();
        }}
        onEnablePush={() => {
          hapticTap();
          props.onEnablePush();
        }}
        onPrivacy={() => {
          setSettings(false);
          router.push('/privacy');
        }}
        onSignOut={() => {
          setSettings(false);
          Alert.alert('Sign out?', undefined, [
            { text: 'Stay', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: props.onSignOut },
          ]);
        }}
      />
      <PhotoViewer uri={photo} onClose={() => setPhoto(null)} />
      <MessageActions
        message={actions}
        mine={actions?.sender === props.me.id}
        currentEmoji={props.reactions.find((row) => row.message_id === actions?.id && row.user_id === props.me.id)?.emoji ?? null}
        confirming={confirmUnsend}
        onClose={() => {
          setActions(null);
          setConfirmUnsend(false);
        }}
        onReact={(emoji) => {
          if (!actions) return;
          const id = actions.id;
          setActions(null);
          props.onReact(id, emoji).catch(() => showToast('Couldn’t save that reaction'));
        }}
        onReply={() => {
          if (!actions) return;
          setEditing(null);
          setReply(actions);
          setActions(null);
        }}
        onCopy={() => {
          if (!actions || actions.kind !== 'text') return;
          Clipboard.setStringAsync(actions.body).then(() => {
            hapticSelect();
            showToast('Copied');
            setActions(null);
          });
        }}
        onEdit={() => {
          if (!actions) return;
          suspendDraft.current = true;
          setReply(null);
          setEditing(actions);
          setDraft(actions.body);
          setActions(null);
        }}
        onUnsend={() => setConfirmUnsend(true)}
        onConfirmUnsend={() => {
          if (!actions) return;
          const message = actions;
          setActions(null);
          setConfirmUnsend(false);
          props.onUnsend(message).catch(() => showToast('Couldn’t unsend that'));
        }}
      />
      <PhotoRoll
        visible={photosOpen}
        messages={props.messages}
        onClose={() => setPhotosOpen(false)}
        resolvePhoto={props.resolvePhoto}
        onOpen={(uri) => {
          setPhotosOpen(false);
          setPhoto(uri);
        }}
      />
      <SearchSheet
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSearch={props.onSearch}
        onPick={(message) => {
          void jumpTo(message.id);
        }}
        nameFor={nameFor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 10, overflow: 'hidden' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.pink,
  },
  avatarText: { fontSize: 22 },
  who: { flex: 1 },
  name: { fontFamily: 'Fredoka_700Bold', fontSize: 19 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontFamily: 'Fredoka_500Medium', fontSize: 13 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22 },
  typingRow: { paddingHorizontal: 16, paddingBottom: 4 },
  typingBubble: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  typingNote: { color: palette.pink, fontSize: 18 },
  composer: { paddingHorizontal: 10, paddingTop: 8, overflow: 'hidden' },
  composeContext: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingLeft: 12, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: palette.sun },
  composeCopy: { flex: 1 },
  composeKicker: { fontFamily: 'Fredoka_700Bold', color: palette.sun, fontSize: 12 },
  composeSnippet: { fontFamily: 'Fredoka_500Medium', fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1.5,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: 'Fredoka_500Medium',
    fontSize: 17,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.pink,
  },
  sendLabel: { color: '#fff', fontSize: 20, fontFamily: 'Fredoka_700Bold' },
  recViz: { flex: 1, height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff4d6d' },
  recBars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 30 },
  recBar: { flex: 1, borderRadius: 2 },
  recTime: { fontFamily: 'Fredoka_500Medium', fontVariant: ['tabular-nums'], minWidth: 40, textAlign: 'center' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: palette.cream,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 99,
  },
  toastText: { color: palette.ink, fontFamily: 'Fredoka_600SemiBold', fontSize: 14 },
});
