import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '@/lib/privacy';
import { palette, useTheme } from '@/lib/theme';

export default function PrivacyScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 22 }}
    >
      <Text accessibilityRole="link" onPress={() => router.back()} style={styles.back}>
        ← Back
      </Text>
      <Text style={styles.title}>Privacy policy</Text>
      <Text style={[styles.meta, { color: theme.muted }]}>Effective {PRIVACY_UPDATED}</Text>
      {PRIVACY_SECTIONS.map((section) => (
        <View key={section.title}>
          <Text style={[styles.heading, { color: theme.text }]}>{section.title}</Text>
          <Text style={[styles.body, { color: theme.text }]}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { color: palette.sun, fontFamily: 'Fredoka_600SemiBold', fontSize: 16, marginBottom: 12 },
  title: { fontFamily: 'Pacifico_400Regular', fontSize: 34, color: palette.sun },
  meta: { fontFamily: 'Fredoka_500Medium', marginTop: 6, marginBottom: 8 },
  heading: { fontFamily: 'Fredoka_700Bold', fontSize: 18, marginTop: 18 },
  body: { fontFamily: 'Fredoka_400Regular', fontSize: 16, lineHeight: 23, marginTop: 6 },
});
