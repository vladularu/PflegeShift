import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { StatusBar } from "react-native";

import { usePalette } from "@/theme/palette";

export function useThemeStatusBar(): void {
  const palette = usePalette();

  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(palette.dark ? "light-content" : "dark-content", true);
    }, [palette.dark]),
  );
}
