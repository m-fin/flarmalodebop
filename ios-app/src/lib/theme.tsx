import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';

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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const forced = process.env.EXPO_PUBLIC_COLOR_SCHEME;
  const theme = useMemo(() => {
    if (forced === 'light') return lightTheme;
    if (forced === 'dark') return darkTheme;
    return system === 'light' ? lightTheme : darkTheme;
  }, [forced, system]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.bg).catch(() => {});
  }, [theme.bg]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
