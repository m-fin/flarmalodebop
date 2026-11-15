import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { cycleAppearance, resolveAppearance, type Appearance } from '@/lib/thread';

export const palette = {
  plum: '#2a1240',
  plumDeep: '#1c0c2e',
  ink: '#2b1a33',
  coral: '#ff7a59',
  pink: '#ff5e8a',
  sun: '#ffc861',
  cream: '#fff6ea',
  mint: '#2fbf71',
  me: ['#ff9a5a', '#ff5e8a', '#d6439a'] as const,
};

export type Theme = {
  dark: boolean;
  bg: string;
  bg2: string;
  text: string;
  muted: string;
  card: string;
  input: string;
  border: string;
  themBubble: string;
  themText: string;
  sheet: string;
  header: string;
  staff: string;
  danger: string;
};

const darkTheme: Theme = {
  dark: true,
  bg: palette.plum,
  bg2: palette.plumDeep,
  text: palette.cream,
  muted: 'rgba(255,246,234,0.72)',
  card: 'rgba(255,255,255,0.08)',
  input: 'rgba(0,0,0,0.25)',
  border: 'rgba(255,255,255,0.12)',
  themBubble: palette.cream,
  themText: palette.ink,
  sheet: '#3a1b52',
  header: 'rgba(30,12,46,0.72)',
  staff: 'rgba(255,255,255,0.05)',
  danger: '#ffb4c4',
};

const lightTheme: Theme = {
  dark: false,
  bg: '#fff1e4',
  bg2: '#ffe0cc',
  text: palette.ink,
  muted: 'rgba(43,26,51,0.62)',
  card: 'rgba(255,255,255,0.72)',
  input: 'rgba(255,255,255,0.92)',
  border: 'rgba(42,18,64,0.12)',
  themBubble: '#ffffff',
  themText: palette.ink,
  sheet: '#fff6ea',
  header: 'rgba(255,241,228,0.86)',
  staff: 'rgba(42,18,64,0.05)',
  danger: '#b4234a',
};

const ThemeContext = createContext<Theme>(darkTheme);
const AppearanceContext = createContext<{ appearance: Appearance; setAppearance: (next: Appearance) => void }>({
  appearance: 'system',
  setAppearance: () => {},
});

const STORAGE_KEY = 'flarm-appearance';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const forced = process.env.EXPO_PUBLIC_COLOR_SCHEME;
  const [appearance, setAppearanceState] = useState<Appearance>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'dusk' || stored === 'dawn' || stored === 'system') setAppearanceState(stored);
      })
      .catch(() => {});
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    setAppearanceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const theme = useMemo(() => {
    if (forced === 'light') return lightTheme;
    if (forced === 'dark') return darkTheme;
    const mode = resolveAppearance(appearance, system !== 'light');
    return mode === 'light' ? lightTheme : darkTheme;
  }, [appearance, forced, system]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.bg).catch(() => {});
  }, [theme.bg]);

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </AppearanceContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useAppearance(): { appearance: Appearance; setAppearance: (next: Appearance) => void; cycle: () => void } {
  const ctx = useContext(AppearanceContext);
  return { ...ctx, cycle: () => ctx.setAppearance(cycleAppearance(ctx.appearance)) };
}
