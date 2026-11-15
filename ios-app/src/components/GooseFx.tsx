import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Flyer, Goose } from '@/components/Goose';
import type { GooseKind } from '@/lib/goose';

export function GooseFx({ fx }: { fx: { nonce: number; kind: GooseKind } | null }) {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
  }, []);
  if (!fx || reduce) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      {fx.kind === 'waddle' ? <Waddle key={fx.nonce} /> : <Flock key={fx.nonce} />}
    </View>
  );
}

function Waddle() {
  const { width } = useWindowDimensions();
  const x = useSharedValue(-120);
  const rock = useSharedValue(0);
  useEffect(() => {
    x.value = withTiming(width + 40, { duration: 5200, easing: Easing.linear });
    rock.value = withRepeat(withTiming(1, { duration: 380, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [rock, width, x]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${-8 + rock.value * 16}deg` }, { translateY: rock.value * -4 }],
  }));
  return (
    <Animated.View style={[styles.waddle, style]}>
      <Goose />
    </Animated.View>
  );
}

function Flock() {
  const { width } = useWindowDimensions();
  const x = useSharedValue(-180);
  useEffect(() => {
    x.value = withTiming(width + 220, { duration: 6000, easing: Easing.inOut(Easing.quad) });
  }, [width, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const birds = Array.from({ length: 9 }, (_, index) => index);
  const mid = 4;
  return (
    <Animated.View style={[styles.flock, style]}>
      {birds.map((index) => {
        const distance = Math.abs(index - mid);
        return (
          <View key={index} style={{ position: 'absolute', left: distance * -34, top: (index - mid) * 22 }}>
            <Flyer />
          </View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  waddle: {
    position: 'absolute',
    left: 0,
    bottom: 108,
    width: 92,
    height: 92,
  },
  flock: {
    position: 'absolute',
    left: 0,
    top: '22%',
    width: 1,
    height: 1,
  },
});
