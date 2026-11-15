import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { replySnippet } from '@/lib/thread';
import { useTheme } from '@/lib/theme';
import type { Message } from '@/lib/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSearch: (query: string) => Promise<Message[]>;
  onPick: (message: Message) => void;
  nameFor: (senderId: string) => string;
};

export function SearchSheet(props: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!props.visible) {
      setQuery('');
      setHits([]);
      setNote('');
    }
  }, [props.visible]);

  const { visible, onSearch } = props;
  useEffect(() => {
    if (!visible) return;
    const handle = setTimeout(() => {
      const q = query.trim();
      if (!q) {
        setHits([]);
        setNote('');
        return;
      }
      setBusy(true);
      onSearch(q)
        .then((rows) => {
          setHits(rows);
          setNote(rows.length ? '' : 'No bops match that.');
        })
        .catch(() => setNote('Search didn’t go through.'))
        .finally(() => setBusy(false));
    }, 180);
    return () => clearTimeout(handle);
  }, [onSearch, query, visible]);

  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.sheet, paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
          <Text style={styles.title}>Search</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your bops"
            placeholderTextColor={theme.muted}
            autoFocus
            style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]}
          />
          {busy ? <ActivityIndicator color={theme.text} style={styles.noteSpace} /> : null}
          {note ? <Text style={[styles.note, { color: theme.muted }]}>{note}</Text> : null}
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {hits.map((message) => (
              <Pressable key={message.id} style={[styles.hit, { backgroundColor: theme.card }]} onPress={() => props.onPick(message)}>
                <Text style={styles.who}>{props.nameFor(message.sender)}</Text>
                <Text style={[styles.body, { color: theme.text }]} numberOfLines={2}>
                  {replySnippet(message)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
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
  card: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 18, maxHeight: '78%' },
  title: { fontFamily: 'Pacifico_400Regular', fontSize: 28, color: '#ffc861', marginBottom: 10 },
  input: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Fredoka_500Medium', fontSize: 17 },
  noteSpace: { marginTop: 12 },
  note: { fontFamily: 'Fredoka_500Medium', marginTop: 12 },
  list: { marginTop: 12 },
  hit: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  who: { fontFamily: 'Fredoka_700Bold', color: '#ffc861', fontSize: 12 },
  body: { fontFamily: 'Fredoka_500Medium', fontSize: 16, marginTop: 2 },
  close: { alignItems: 'center', paddingVertical: 12 },
  closeText: { fontFamily: 'Fredoka_500Medium', fontSize: 16 },
});
