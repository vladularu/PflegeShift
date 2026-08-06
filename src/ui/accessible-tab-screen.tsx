import { useIsFocused } from "expo-router";
import type { PropsWithChildren } from "react";
import { View } from "react-native";

export function AccessibleTabScreen({ children }: PropsWithChildren) {
  const isFocused = useIsFocused();

  return (
    <View
      accessibilityElementsHidden={!isFocused}
      aria-hidden={!isFocused}
      collapsable={false}
      importantForAccessibility={isFocused ? "auto" : "no-hide-descendants"}
      style={{ flex: 1 }}
    >
      {children}
    </View>
  );
}
