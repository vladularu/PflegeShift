import * as Haptics from "expo-haptics";

function run(effect: () => Promise<void>): void {
  if (process.env.EXPO_OS === "web") return;
  void effect().catch(() => undefined);
}

export function selectionFeedback(): void {
  run(() =>
    process.env.EXPO_OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick)
      : Haptics.selectionAsync(),
  );
}

export function successFeedback(): void {
  run(() =>
    process.env.EXPO_OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

export function warningFeedback(): void {
  run(() =>
    process.env.EXPO_OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  );
}

export function planningModeFeedback(): void {
  run(() =>
    process.env.EXPO_OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Gesture_Start)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  );
}
