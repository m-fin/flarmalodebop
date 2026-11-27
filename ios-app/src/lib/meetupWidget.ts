import { Platform } from 'react-native';

export const MEETUP_APP_GROUP = 'group.app.flarmalodebop.ios';
export const MEETUP_WIDGET_KIND = 'TodaysMeetup';

export async function syncMeetupWidget(payload: { spot: string; when: string; ride: string; confirmed: boolean } | null): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const { ExtensionStorage } = await import('@bacons/apple-targets');
    const storage = new ExtensionStorage(MEETUP_APP_GROUP);
    if (!payload) storage.remove('todayMeetup');
    else storage.set('todayMeetup', JSON.stringify(payload));
    ExtensionStorage.reloadWidget(MEETUP_WIDGET_KIND);
  } catch {
    // The widget extension is linked by EAS/Xcode. Expo Go and web skip it.
  }
}
