import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { palette, useTheme } from '@/lib/theme';

const NOTES = [
  { glyph: '♪', left: '8%', color: palette.sun, delay: 0 },
  { glyph: '♫', left: '28%', color: palette.pink, delay: 2400 },
  { glyph: '♩', left: '52%', color: palette.sun, delay: 4800 },
  { glyph: '♬', left: '74%', color: '#ff9a5a', delay: 1200 },
  { glyph: '♪', left: '90%', color: palette.pink, delay: 6200 },
];

function Floater({ glyph, left, color, delay, travel }: { glyph: string; left: string; color: string; delay: number; travel: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration: 22000, easing: Easing.linear }), -1, false));
  }, [delay, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.08 || progress.value > 0.94 ? 0 : 0.22,
    transform: [
      { translateY: (1 - progress.value) * 40 - progress.value * travel },
      { rotate: `${-10 + progress.value * 18}deg` },
    ],
  }));
  return (
    <Animated.Text style={[styles.note, { left: left as `${number}%`, color }, style]} accessibilityElementsHidden>
      {glyph}
    </Animated.Text>
  );
}

export function Background() {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={theme.dark ? ['#6b2a6e', palette.plum, palette.plumDeep] : ['#ffe7c2', '#fff1e4', '#ffd0dc']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.staff, { borderColor: theme.staff }]} />
      {reduce
        ? NOTES.map((note) => (
            <Text key={note.glyph + note.left} style={[styles.note, styles.still, { left: note.left as `${number}%`, color: note.color }]}>
              {note.glyph}
            </Text>
          ))
        : NOTES.map((note) => <Floater key={note.glyph + note.left} {...note} travel={height * 1.05} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  staff: {
    borderTopWidth: 0,
    opacity: 0.7,
  },
  note: {
    position: 'absolute',
    bottom: 24,
    fontSize: 28,
  },
  still: {
    opacity: 0.16,
    bottom: '18%',
  },
});
