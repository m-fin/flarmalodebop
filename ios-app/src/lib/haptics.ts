import * as Haptics from 'expo-haptics';

function run(work: () => Promise<void>): void {
  work().catch(() => {});
}

export function hapticSelect(): void {
  run(() => Haptics.selectionAsync());
}

export function hapticTap(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticSend(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function hapticReceive(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}
