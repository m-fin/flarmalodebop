import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/auth/AuthProvider';
import { ChatView } from '@/components/ChatView';
import { useChat } from '@/chat/useChat';
import { gooseEffect, type GooseKind } from '@/lib/goose';
import { hapticReceive, hapticSend } from '@/lib/haptics';
import { preparePhoto, uploadFile } from '@/lib/media';
import { clearBadge, notificationStatus, syncPushToken, unregisterPush } from '@/lib/push';
import { signedUrl } from '@/lib/signedUrl';
import { bop, honk, loadSoundPref, setSoundEnabled, soundEnabled } from '@/lib/sounds';
import type { Profile } from '@/lib/types';

export function LiveChat({ me, other }: { me: Profile; other: Profile }) {
  const { signOut } = useAuth();
  const chat = useChat(me, other);
  const [soundOn, setSoundOn] = useState(true);
  const [pushLabel, setPushLabel] = useState('Turn on notifications');
  const [pushNote, setPushNote] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [fx, setFx] = useState<{ nonce: number; kind: GooseKind } | null>(null);

  function trigger(kind: GooseKind) {
    setFx({ nonce: Date.now(), kind });
    if (kind === 'flock') {
      honk();
      setTimeout(honk, 350);
      setTimeout(honk, 700);
    } else {
      setTimeout(honk, 250);
    }
  }

  chat.setHandlers({
    onMessage: (message) => {
      const mine = message.sender === me.id;
      if (mine) {
        bop('out');
        hapticSend();
      } else {
        bop('in');
        hapticReceive();
      }
      if (message.kind === 'text') {
        const effect = gooseEffect(message.body);
        if (effect) trigger(effect);
      }
    },
  });

  useEffect(() => {
    loadSoundPref().then(setSoundOn).catch(() => {});
    clearBadge().catch(() => {});
    notificationStatus().then(async (status) => {
      if (status === 'granted') {
        const result = await syncPushToken(me.id, false);
        setPushLabel(result.ok ? 'Notifications on (tap to refresh)' : 'Turn on notifications');
        setPushNote(result.message);
      } else if (status === 'denied') {
        setPushLabel('Notifications blocked');
        setPushNote('Turn them back on in iPhone Settings → Notifications → Flarmalodebop.');
      }
    });
  }, [me.id]);

  return (
    <ChatView
      me={me}
      other={other}
      messages={chat.messages}
      otherRead={chat.otherRead}
      online={chat.online}
      typing={chat.typing}
      hasMore={chat.hasMore}
      loading={chat.loading}
      soundOn={soundOn}
      pushLabel={pushLabel}
      pushNote={pushNote}
      pushBusy={pushBusy}
      fx={fx}
      onSendText={chat.sendText}
      onTyping={chat.sendTyping}
      onLoadOlder={() => {
        chat.loadOlder().catch(() => {});
      }}
      onToggleSound={() => {
        const next = !soundEnabled();
        setSoundEnabled(next).then(() => {
          setSoundOn(next);
          if (next) bop('in');
        });
      }}
      onEnablePush={() => {
        setPushBusy(true);
        syncPushToken(me.id, true)
          .then((result) => {
            setPushLabel(result.ok ? 'Notifications on (tap to refresh)' : 'Turn on notifications');
            setPushNote(result.message);
          })
          .finally(() => setPushBusy(false));
      }}
      onSignOut={() => {
        unregisterPush(me.id)
          .catch(() => {})
          .finally(() => {
            signOut().finally(() => router.replace('/login'));
          });
      }}
      resolvePhoto={signedUrl}
      resolveAudio={async (path) => signedUrl(path)}
      onPhoto={async (source) => {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error('Photo permission is off — allow it in Settings');
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
            : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        if (result.canceled || !result.assets[0]) return;
        const prepared = await preparePhoto(result.assets[0]);
        const path = await uploadFile(me.id, prepared.uri, prepared.mime);
        await chat.sendFile({ kind: 'photo', file_path: path, mime: prepared.mime, meta: { w: prepared.w, h: prepared.h } });
      }}
      onSendVoice={async (draft) => {
        const path = await uploadFile(me.id, draft.uri, draft.mime);
        await chat.sendFile({
          kind: 'voice',
          file_path: path,
          mime: draft.mime,
          meta: { dur: draft.dur, peaks: draft.peaks },
        });
      }}
    />
  );
}
