import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { Redirect } from 'expo-router';
import { ChatView } from '@/components/ChatView';
import { gooseEffect, type GooseKind } from '@/lib/goose';
import { honk } from '@/lib/sounds';
import type { Message, Profile } from '@/lib/types';

const me: Profile = { id: 'frog', username: 'frog', display: 'Frog', last_read: 4, created_at: '' };
const other: Profile = { id: 'hailey', username: 'hailey', display: 'Hailey', last_read: 5, created_at: '' };

const seed: Message[] = [
  {
    id: 1,
    sender: 'hailey',
    kind: 'text',
    body: 'the pond is loud today',
    file_path: null,
    mime: null,
    meta: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    sender: 'frog',
    kind: 'text',
    body: 'honk honk',
    file_path: null,
    mime: null,
    meta: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 3,
    sender: 'hailey',
    kind: 'photo',
    body: '',
    file_path: 'preview-photo',
    mime: 'image/png',
    meta: { w: 1024, h: 1024 },
    created_at: new Date().toISOString(),
  },
  {
    id: 4,
    sender: 'frog',
    kind: 'voice',
    body: '',
    file_path: 'preview-voice',
    mime: 'audio/wav',
    meta: { dur: 1.2, peaks: [0.2, 0.5, 0.8, 0.4, 0.9, 0.3, 0.6, 0.7, 0.2, 0.5, 0.85, 0.4] },
    created_at: new Date().toISOString(),
  },
  {
    id: 5,
    sender: 'frog',
    kind: 'text',
    body: 'see you at the pond',
    file_path: null,
    mime: null,
    meta: null,
    created_at: new Date().toISOString(),
  },
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
      otherRead={5}
      online
      typing={typing}
      hasMore={false}
      loading={false}
      soundOn
      pushLabel="Turn on notifications"
      pushNote="Notifications turn on in a signed-in build."
      pushBusy={false}
      fx={fx}
      onTyping={setTyping}
      onLoadOlder={() => {}}
      onToggleSound={() => {}}
      onEnablePush={() => {}}
      onSignOut={() => {}}
      resolvePhoto={async () => localPhotoUri()}
      resolveAudio={async (path) => (path === 'preview-voice' ? voice : photo)}
      onSendText={async (body) => {
        const message: Message = {
          id: Date.now(),
          sender: me.id,
          kind: 'text',
          body,
          file_path: null,
          mime: null,
          meta: null,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, message]);
        setTyping(false);
        const effect = gooseEffect(body);
        if (effect) trigger(effect);
      }}
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
          },
        ]);
      }}
      onSendVoice={async () => {}}
    />
  );
}
