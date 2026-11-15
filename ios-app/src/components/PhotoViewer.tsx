import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Image source={uri ? { uri } : undefined} style={{ width, height }} contentFit="contain" accessibilityLabel="photo" />
        <Pressable accessibilityLabel="Close photo" onPress={onClose} style={[styles.close, { top: insets.top + 12 }]}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', right: 16, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  closeText: { color: '#fff', fontFamily: 'Fredoka_600SemiBold' },
});
