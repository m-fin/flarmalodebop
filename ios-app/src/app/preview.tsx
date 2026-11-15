import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { Redirect } from 'expo-router';
import { ChatView } from '@/components/ChatView';
import { gooseEffect, type GooseKind } from '@/lib/goose';
import { honk } from '@/lib/sounds';
import { localSearch, nextReactions } from '@/lib/thread';
import type { Message, Profile, Reaction } from '@/lib/types';

const me: Profile = { id: 'frog', username: 'frog', display: 'Frog', last_read: 4, created_at: '' };
const other: Profile = { id: 'hailey', username: 'hailey', display: 'Hailey', last_read: 5, created_at: '' };

const now = new Date().toISOString();
const seed: Message[] = [
  {
    id: 1,
    sender: 'hailey',
    kind: 'text',
    body: 'the pond is loud today',
    file_path: null,
    mime: null,
    meta: null,
    created_at: now,
    reply_to: null,
    edited_at: null,
    reply: null,
  },
  {
    id: 2,
    sender: 'frog',
    kind: 'text',
    body: 'saving you a lily pad',
    file_path: null,
    mime: null,
    meta: null,
    created_at: now,
    reply_to: 1,
    edited_at: now,
    reply: { id: 1, sender: 'hailey', kind: 'text', body: 'the pond is loud today' },
  },
  {
    id: 3,
    sender: 'hailey',
    kind: 'photo',
    body: '',
    file_path: 'preview-photo',
    mime: 'image/png',
    meta: { w: 1024, h: 1024 },
    created_at: now,
    reply_to: null,
    edited_at: null,
    reply: null,
  },
  {
    id: 4,
    sender: 'frog',
    kind: 'voice',
    body: '',
    file_path: 'preview-voice',
    mime: 'audio/wav',
    meta: { dur: 1.2, peaks: [0.2, 0.5, 0.8, 0.4, 0.9, 0.3, 0.6, 0.7, 0.2, 0.5, 0.85, 0.4] },
    created_at: now,
    reply_to: null,
    edited_at: null,
    reply: null,
  },
  {
    id: 5,
    sender: 'frog',
    kind: 'text',
    body: 'see you at the pond',
    file_path: null,
    mime: null,
    meta: null,
    created_at: now,
    reply_to: null,
    edited_at: null,
    reply: null,
  },
];

const seedReactions: Reaction[] = [
  { message_id: 1, user_id: 'frog', emoji: '❤️' },
  { message_id: 1, user_id: 'hailey', emoji: '🐸' },
  { message_id: 5, user_id: 'hailey', emoji: '🪿' },
];

const photo = require('../../assets/icon.png');
const voice = require('../../assets/sounds/honk.wav');

function localPhotoUri(): string {
  const resolve = Image.resolveAssetSource as ((source: number) => { uri?: string } | undefined) | undefined;
  const resolved = resolve?.(photo);
  if (resolved?.uri) return resolved.uri;
  if (typeof photo === 'string') return photo;
  if (photo && typeof photo === 'object' && 'uri' in photo && typeof (photo as { uri?: unknown }).uri === 'string') {
    return (photo as { uri: string }).uri;
  }
  return '';
}

/** Local fixture for screenshots. Release builds bounce back to the real gate. */
export default function PreviewScreen() {
  const [messages, setMessages] = useState(seed);
  const [reactions, setReactions] = useState(seedReactions);
  const [typing, setTyping] = useState(true);
  const [fx, setFx] = useState<{ nonce: number; kind: GooseKind } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFx({ nonce: Date.now(), kind: 'waddle' });
      setTimeout(honk, 250);
    }, 600);
    return () => clearTimeout(timer);
  }, []);
  if (!__DEV__) return <Redirect href="/" />;

  function trigger(kind: GooseKind) {
    setFx({ nonce: Date.now(), kind });
    if (kind === 'flock') {
      honk();
      setTimeout(honk, 350);
      setTimeout(honk, 700);
    } else setTimeout(honk, 250);
  }

  return (
    <ChatView
      me={me}
      other={other}
      messages={messages}
      reactions={reactions}
      otherRead={5}
      online
      typing={typing}
      hasMore={false}
      loading={false}
      focused={false}
      soundOn
      appearanceLabel="Dusk"
      pushLabel="Turn on notifications"
      pushNote="Notifications turn on in a signed-in build."
      pushBusy={false}
      fx={fx}
      onSendText={async (body, replyTo) => {
        const parent = messages.find((message) => message.id === replyTo);
        const message: Message = {
          id: Date.now(),
          sender: me.id,
          kind: 'text',
          body,
          file_path: null,
          mime: null,
          meta: null,
          created_at: new Date().toISOString(),
          reply_to: replyTo ?? null,
          edited_at: null,
          reply: parent ? { id: parent.id, sender: parent.sender, kind: parent.kind, body: parent.body } : null,
        };
        setMessages((prev) => [...prev, message]);
        setTyping(false);
        const effect = gooseEffect(body);
        if (effect) trigger(effect);
      }}
      onEdit={async (id, body) => {
        setMessages((prev) => prev.map((message) => (message.id === id ? { ...message, body, edited_at: new Date().toISOString() } : message)));
      }}
      onUnsend={async (message) => {
        setMessages((prev) => prev.filter((row) => row.id !== message.id).map((row) => (row.reply_to === message.id ? { ...row, reply_to: null, reply: null } : row)));
        setReactions((prev) => prev.filter((row) => row.message_id !== message.id));
      }}
      onReact={async (messageId, emoji) => {
        setReactions((prev) => {
          const mine = prev.filter((row) => row.message_id === messageId);
          const next = nextReactions(mine, me.id, emoji).map((row) => ({ ...row, message_id: messageId }));
          return [...prev.filter((row) => row.message_id !== messageId), ...next];
        });
      }}
      onSearch={async (query) => localSearch(messages, query)}
      onFocusMessage={async () => {}}
      onShowLatest={() => {}}
      onTyping={setTyping}
      onLoadOlder={() => {}}
      onCycleAppearance={() => {}}
      onToggleSound={() => {}}
      onEnablePush={() => {}}
      onSignOut={() => {}}
      resolvePhoto={async () => localPhotoUri()}
      resolveAudio={async (path) => (path === 'preview-voice' ? voice : photo)}
      onPhoto={async () => {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            sender: me.id,
            kind: 'photo',
            body: '',
            file_path: 'preview-photo',
            mime: 'image/png',
            meta: { w: 1024, h: 1024 },
            created_at: new Date().toISOString(),
            reply_to: null,
            edited_at: null,
            reply: null,
          },
        ]);
      }}
      onSendVoice={async () => {}}
    />
  );
}
