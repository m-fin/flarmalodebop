import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Fredoka_400Regular, Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Pacifico_400Regular } from '@expo-google-fonts/pacifico';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { ThemeProvider, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider>
            <AuthProvider>
              <Root />
            </AuthProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const theme = useTheme();
  const { ready } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Pacifico_400Regular,
  });
  const fontsReady = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (fontsReady && ready) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady, ready]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.textContent = '#root, #root * { scrollbar-width: none; } #root *::-webkit-scrollbar { width: 0; height: 0; }';
    document.head.appendChild(style);
  }, []);

  if (!fontsReady || !ready) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg }, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="preview" />
      </Stack>
    </View>
  );
}
