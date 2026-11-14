import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioMode, type AudioPlayer } from 'expo-audio';

const KEY = 'flarm-sound';
let enabled = true;
let ready = false;
let players: { in: AudioPlayer; out: AudioPlayer; honk: AudioPlayer } | null = null;

export function soundEnabled(): boolean {
  return enabled;
}

export async function loadSoundPref(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(KEY);
  enabled = stored !== 'off';
  return enabled;
}

export async function setSoundEnabled(on: boolean): Promise<void> {
  enabled = on;
  await AsyncStorage.setItem(KEY, on ? 'on' : 'off');
}

export function sessionMode(recording: boolean): AudioMode {
  return {
    playsInSilentMode: true,
    interruptionMode: recording ? 'doNotMix' : 'mixWithOthers',
    allowsRecording: recording,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  };
}

async function ensure(): Promise<void> {
  if (!players) {
    players = {
      in: createAudioPlayer(require('../../assets/sounds/bop-in.wav')),
      out: createAudioPlayer(require('../../assets/sounds/bop-out.wav')),
      honk: createAudioPlayer(require('../../assets/sounds/honk.wav')),
    };
  }
  if (!ready) {
    await setAudioModeAsync(sessionMode(false));
    ready = true;
  }
}

async function play(kind: 'in' | 'out' | 'honk'): Promise<void> {
  if (!enabled) return;
  try {
    await ensure();
    const player = players?.[kind];
    if (!player) return;
    await player.seekTo(0);
    player.play();
  } catch {
    // Sound is optional. A missing audio session shouldn't block a message.
  }
}

export function bop(kind: 'in' | 'out'): void {
  void play(kind);
}

export function honk(): void {
  void play('honk');
}
