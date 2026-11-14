import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
  });
}

export function projectId(): string | null {
  const id = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export async function clearBadge(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.setBadgeCountAsync(0).catch(() => {});
}

export async function notificationStatus(): Promise<'granted' | 'denied' | 'undetermined' | 'web'> {
  if (Platform.OS === 'web') return 'web';
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted' || current.status === 'denied') return current.status;
  return 'undetermined';
}

/** Saves this device's Expo token in push_subscriptions. Web push rows stay untouched. */
export async function syncPushToken(userId: string, request: boolean): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS === 'web') {
    return { ok: false, message: 'Notifications turn on in the iPhone app.' };
  }
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted' && request) {
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    status = asked.status;
  }
  if (status !== 'granted') {
    return {
      ok: false,
      message:
        status === 'denied'
          ? 'Turn them back on in iPhone Settings → Notifications → Flarmalodebop.'
          : 'Notifications stay off until you allow them.',
    };
  }
  const id = projectId();
  if (!id) {
    return {
      ok: false,
      message: 'Push isn’t linked to an Expo project yet. Run eas init in ios-app, then rebuild.',
    };
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: token, user_id: userId, sub: { type: 'expo', token } },
    { onConflict: 'endpoint' },
  );
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'You’ll get a ping when a new message lands while the app is closed.' };
}

export async function unregisterPush(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const id = projectId();
  if (!id) return;
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    await supabase.from('push_subscriptions').delete().eq('endpoint', token).eq('user_id', userId);
  } catch {
    // Signing out still proceeds if the token can't be read.
  }
}
