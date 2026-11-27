import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { canEdit, REACTIONS } from '@/lib/thread';
import { palette, useTheme } from '@/lib/theme';
import type { Message } from '@/lib/types';

type Props = {
  message: Message | null;
  mine: boolean;
  currentEmoji: string | null;
  confirming: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onUnsend: () => void;
  onConfirmUnsend: () => void;
};

export function MessageActions(props: Props) {
  const theme = useTheme();
  const message = props.message;
  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.sheet }]} onPress={() => {}}>
          <View style={styles.reacts}>
            {REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityLabel={`React ${emoji}`}
                onPress={() => props.onReact(emoji)}
                style={[styles.emoji, props.currentEmoji === emoji && styles.emojiOn]}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          {props.confirming ? (
            <View style={styles.actions}>
              <Pressable style={[styles.action, { backgroundColor: theme.card }]} onPress={props.onConfirmUnsend}>
                <Text style={[styles.actionText, { color: theme.danger }]}>Unsend this bop?</Text>
              </Pressable>
              <Pressable style={[styles.action, { backgroundColor: theme.card }]} onPress={props.onClose}>
                <Text style={[styles.actionText, { color: theme.text }]}>Keep</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable style={[styles.action, { backgroundColor: theme.card }]} onPress={props.onReply}>
                <Text style={[styles.actionText, { color: theme.text }]}>Reply</Text>
              </Pressable>
              {message?.kind === 'text' ? (
                <Pressable style={[styles.action, { backgroundColor: theme.card }]} onPress={props.onCopy}>
                  <Text style={[styles.actionText, { color: theme.text }]}>Copy</Text>
                </Pressable>
              ) : null}
              {message && canEdit(message, message.sender) && props.mine ? (
                <Pressable style={[styles.action, { backgroundColor: theme.card }]} onPress={props.onEdit}>
                  <Text style={[styles.actionText, { color: theme.text }]}>Edit</Text>
                </Pressable>
              ) : null}
              {props.mine ? (
                <Pressable style={[styles.action, { backgroundColor: theme.card }]} onPress={props.onUnsend}>
                  <Text style={[styles.actionText, { color: theme.danger }]}>Unsend</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,4,18,0.45)', justifyContent: 'flex-end', padding: 16 },
  card: { borderRadius: 22, padding: 14 },
  reacts: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  emoji: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emojiOn: { backgroundColor: 'rgba(255,94,138,0.22)' },
  emojiText: { fontSize: 26 },
  actions: { gap: 8 },
  action: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  actionText: { fontFamily: 'Fredoka_600SemiBold', fontSize: 16, color: palette.ink },
});
