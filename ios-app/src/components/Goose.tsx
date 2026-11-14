import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

/** Original vector goose, the same drawing used for the waddle. */
export function Goose({ size = 92 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <G>
        <Ellipse cx="60" cy="112" rx="30" ry="4" fill="rgba(0,0,0,0.18)" />
        <G>
          <Path d="M50 88h4v18h-4z" fill="#ff9a3c" />
          <Path d="M45 106h14l-3 4h-11z" fill="#ff9a3c" />
        </G>
        <G>
          <Path d="M64 88h4v18h-4z" fill="#ff9a3c" />
          <Path d="M59 106h14l-3 4h-11z" fill="#ff9a3c" />
        </G>
        <Path
          d="M22 70c0-16 16-24 36-24 10 0 18 2 26 6l10 4c4 2 4 6 0 8-6 4-10 18-36 22-20 3-36-2-36-16z"
          fill="#fff6ea"
        />
        <Path d="M36 66c10 6 26 6 38 0" stroke="#e9d9c6" strokeWidth="3" fill="none" strokeLinecap="round" />
        <Path d="M20 62l-8-6 10 1z" fill="#fff6ea" />
        <Path d="M78 54c2-14 0-26 4-34 3-7 14-8 18-2 3 4 1 9-4 10-4 1-5 6-5 12l-1 16z" fill="#fff6ea" />
        <Path d="M98 22l14 3c2 1 2 3 0 4l-13 2z" fill="#ff9a3c" />
        <Circle cx="92" cy="22" r="2.6" fill="#2b1a33" />
        <Circle cx="92.8" cy="21.2" r="0.9" fill="#fff" />
        <Ellipse cx="88" cy="29" rx="3.5" ry="2" fill="#ffb3c1" opacity={0.8} />
      </G>
    </Svg>
  );
}

export function Flyer({ size = 46, color = '#fff6ea' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size * 0.5} viewBox="0 0 60 30">
      <Path d="M30 16c-6-8-16-12-28-10 9 2 17 6 22 13z" fill={color} />
      <Path d="M30 16c6-8 16-12 28-10-9 2-17 6-22 13z" fill={color} />
      <Ellipse cx="30" cy="18" rx="7" ry="3.2" fill={color} />
      <Path d="M36 17l8-2-7 4z" fill="#ff9a3c" />
    </Svg>
  );
}
