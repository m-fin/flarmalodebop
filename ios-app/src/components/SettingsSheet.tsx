import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import type { Profile } from '@/lib/types';

type Props = {
  visible: boolean;
  me: Profile;
  soundOn: boolean;
  appearanceLabel: string;
  pushLabel: string;
  pushNote: string;
  pushBusy: boolean;
  onClose: () => void;
  onToggleSound: () => void;
  onCycleAppearance: () => void;
  onEnablePush: () => void;
  onPrivacy: () => void;
  onSignOut: () => void;
};

export function SettingsSheet(props: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.sheet, paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          <Text style={styles.title}>Settings</Text>
          <Text style={[styles.muted, { color: theme.muted }]}>Signed in as {props.me.display}</Text>
          <Pressable style={[styles.row, { backgroundColor: theme.card }]} onPress={props.onEnablePush} disabled={props.pushBusy}>
            <Text style={[styles.rowText, { color: theme.text }]}>{props.pushBusy ? 'Checking…' : `🔔 ${props.pushLabel}`}</Text>
          </Pressable>
          {props.pushNote ? <Text style={[styles.note, { color: theme.muted }]}>{props.pushNote}</Text> : null}
          <Pressable style={[styles.row, { backgroundColor: theme.card }]} onPress={props.onToggleSound}>
            <Text style={[styles.rowText, { color: theme.text }]}>🎵 Bop & honk sounds: {props.soundOn ? 'on' : 'off'}</Text>
          </Pressable>
          <Pressable style={[styles.row, { backgroundColor: theme.card }]} onPress={props.onCycleAppearance}>
            <Text style={[styles.rowText, { color: theme.text }]}>🌗 Appearance: {props.appearanceLabel}</Text>
          </Pressable>
          <Pressable style={[styles.row, { backgroundColor: theme.card }]} onPress={props.onPrivacy}>
            <Text style={[styles.rowText, { color: theme.text }]}>Privacy policy</Text>
          </Pressable>
          <Pressable style={[styles.row, { backgroundColor: theme.card }]} onPress={props.onSignOut}>
            <Text style={[styles.rowText, { color: theme.danger }]}>Sign out</Text>
          </Pressable>
          <Pressable onPress={props.onClose} style={styles.close}>
            <Text style={[styles.rowText, { color: theme.muted }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,4,18,0.55)', justifyContent: 'flex-end' },
  card: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 22 },
  title: { fontFamily: 'Pacifico_400Regular', fontSize: 28, color: '#ffc861' },
  muted: { fontFamily: 'Fredoka_500Medium', marginTop: 4, marginBottom: 14 },
  note: { fontFamily: 'Fredoka_400Regular', fontSize: 13, marginTop: -4, marginBottom: 8 },
  row: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15, marginBottom: 8 },
  rowText: { fontFamily: 'Fredoka_500Medium', fontSize: 16 },
  close: { alignItems: 'center', paddingVertical: 12 },
});
