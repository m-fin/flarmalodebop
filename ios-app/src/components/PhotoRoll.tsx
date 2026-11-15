import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { photoRoll } from '@/lib/thread';
import { useTheme } from '@/lib/theme';
import type { Message } from '@/lib/types';

type Props = {
  visible: boolean;
  messages: Message[];
  onClose: () => void;
  onOpen: (uri: string) => void;
  resolvePhoto: (path: string) => Promise<string>;
};

export function PhotoRoll(props: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const photos = photoRoll(props.messages);
  const [urls, setUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!props.visible) return;
    let live = true;
    setUrls({});
    photos.forEach((message) => {
      if (!message.file_path) return;
      props.resolvePhoto(message.file_path).then(
        (uri) => {
          if (live) setUrls((prev) => ({ ...prev, [message.id]: uri }));
        },
        () => {},
      );
    });
    return () => {
      live = false;
    };
    // Resolve when the sheet opens or the set of photo ids changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visible, photos.map((message) => message.id).join(',')]);

  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.sheet, paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          <Text style={styles.title}>Our photos</Text>
          {photos.length === 0 ? (
            <Text style={[styles.empty, { color: theme.muted }]}>No photos in this stretch of the thread yet.</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.grid}>
              {photos.map((message) => {
                const uri = urls[message.id];
                return (
                  <Pressable
                    key={message.id}
                    accessibilityLabel={message.body || 'photo'}
                    onPress={() => uri && props.onOpen(uri)}
                    style={[styles.tile, { backgroundColor: theme.card }]}
                  >
                    {uri ? (
                      <Image source={{ uri }} style={styles.image} contentFit="cover" accessibilityIgnoresInvertColors />
                    ) : (
                      <ActivityIndicator color={theme.muted} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable onPress={props.onClose} style={styles.close}>
            <Text style={[styles.closeText, { color: theme.muted }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,4,18,0.55)', justifyContent: 'flex-end' },
  card: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 22, maxHeight: '88%' },
  title: { fontFamily: 'Pacifico_400Regular', fontSize: 28, color: '#ffc861' },
  empty: { fontFamily: 'Fredoka_500Medium', marginVertical: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 14 },
  tile: { width: '31%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  close: { alignItems: 'center', paddingVertical: 12 },
  closeText: { fontFamily: 'Fredoka_500Medium', fontSize: 16 },
});
