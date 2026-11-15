import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Redirect, router } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { Background } from '@/components/Background';
import { MEMBERS, type Username } from '@/lib/config';
import { hapticSelect, hapticTap } from '@/lib/haptics';
import { palette, useTheme } from '@/lib/theme';

export default function LoginScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session, ready, signIn } = useAuth();
  const [who, setWho] = useState<Username>('frog');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (ready && session) return <Redirect href="/chat" />;

  async function submit() {
    if (!password) {
      setError('The password is part of the song.');
      return;
    }
    setBusy(true);
    setError('');
    hapticTap();
    const message = await signIn(who, password);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setPassword('');
    router.replace('/chat');
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.bg }]}>
    <Background />
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.card, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Image source={require('../../assets/icon.png')} style={styles.icon} accessibilityIgnoresInvertColors />
        <Text style={styles.logo}>Flarmalodebop</Text>
        <Text style={[styles.tag, { color: theme.muted }]}>a tiny private place for two ♪</Text>
        <View style={styles.who}>
          {(Object.keys(MEMBERS) as Username[]).map((name) => {
            const selected = who === name;
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  hapticSelect();
                  setWho(name);
                }}
                style={[styles.whoBtn, { backgroundColor: theme.card, borderColor: selected ? palette.sun : 'transparent' }]}
              >
                <Text style={[styles.whoText, { color: theme.text }]}>
                  {MEMBERS[name].emoji} {MEMBERS[name].display}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="password"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="secret password"
          placeholderTextColor={theme.muted}
          onSubmitEditing={() => void submit()}
          style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]}
        />
        <Pressable accessibilityRole="button" onPress={() => void submit()} disabled={busy} style={styles.button}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Let's bop</Text>}
        </Pressable>
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
        <Text accessibilityRole="link" onPress={() => router.push('/privacy')} style={styles.legal}>
          Privacy policy
        </Text>
      </View>
    </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  icon: { width: 96, height: 96, borderRadius: 24, alignSelf: 'center' },
  logo: { fontFamily: 'Pacifico_400Regular', fontSize: 40, textAlign: 'center', color: palette.sun, marginTop: 16 },
  tag: { textAlign: 'center', fontFamily: 'Fredoka_500Medium', fontSize: 16, marginBottom: 26 },
  who: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  whoBtn: { flex: 1, borderRadius: 18, borderWidth: 2, paddingVertical: 14, alignItems: 'center' },
  whoText: { fontFamily: 'Fredoka_600SemiBold', fontSize: 16 },
  input: { borderWidth: 2, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16, fontSize: 17, fontFamily: 'Fredoka_500Medium' },
  button: { marginTop: 12, borderRadius: 18, backgroundColor: palette.pink, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontFamily: 'Fredoka_700Bold', fontSize: 18 },
  error: { color: '#ffb4c4', textAlign: 'center', minHeight: 24, marginTop: 10, fontFamily: 'Fredoka_500Medium' },
  legal: { color: palette.sun, textAlign: 'center', marginTop: 12, fontFamily: 'Fredoka_600SemiBold', fontSize: 15 },
});
