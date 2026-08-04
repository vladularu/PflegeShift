import { AccessibilityInfo } from "react-native";

export function scheduleAccessibilityFocus(target: number | null | undefined): void {
  if (target === null || target === undefined) return;
  setTimeout(() => AccessibilityInfo.setAccessibilityFocus(target), 0);
}
