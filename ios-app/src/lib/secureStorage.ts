import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CHUNK = 1800;

function countKey(key: string): string {
  return `${key}_n`;
}

function partKey(key: string, index: number): string {
  return `${key}_${index}`;
}

async function readNative(key: string): Promise<string | null> {
  const countRaw = await SecureStore.getItemAsync(countKey(key));
  if (!countRaw) return SecureStore.getItemAsync(key);
  const count = Number(countRaw);
  if (!Number.isFinite(count) || count < 1) return null;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(partKey(key, i));
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join('');
}

async function writeNative(key: string, value: string): Promise<void> {
  const count = Math.max(1, Math.ceil(value.length / CHUNK));
  for (let i = 0; i < count; i++) {
    await SecureStore.setItemAsync(partKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
  }
  await SecureStore.setItemAsync(countKey(key), String(count));
  for (let i = count; i < count + 4; i++) {
    await SecureStore.deleteItemAsync(partKey(key, i)).catch(() => {});
  }
}

async function removeNative(key: string): Promise<void> {
  const countRaw = await SecureStore.getItemAsync(countKey(key));
  const count = countRaw ? Number(countRaw) : 0;
  await SecureStore.deleteItemAsync(countKey(key)).catch(() => {});
  await SecureStore.deleteItemAsync(key).catch(() => {});
  for (let i = 0; i < Math.max(count, 8); i++) {
    await SecureStore.deleteItemAsync(partKey(key, i)).catch(() => {});
  }
}

const webStorage = {
  getItem: (key: string) => Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
  setItem: (key: string, value: string) => {
    globalThis.localStorage?.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    globalThis.localStorage?.removeItem(key);
    return Promise.resolve();
  },
};

/** Session storage. Native tokens live in the keychain, split under the 2048-byte limit. */
export const secureStorage = {
  getItem: (key: string) => (Platform.OS === 'web' ? webStorage.getItem(key) : readNative(key)),
  setItem: (key: string, value: string) => (Platform.OS === 'web' ? webStorage.setItem(key, value) : writeNative(key, value)),
  removeItem: (key: string) => (Platform.OS === 'web' ? webStorage.removeItem(key) : removeNative(key)),
};
