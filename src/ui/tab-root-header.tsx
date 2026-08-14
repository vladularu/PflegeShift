import { useContext } from "react";
import { Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";

export function TabRootHeader({ title }: { readonly title: string }) {
  const palette = usePalette();
  const topInset = useContext(SafeAreaInsetsContext)?.top ?? 0;

  return (
    <View
      style={{
        minHeight: (process.env.EXPO_OS === "web" ? 12 : topInset) + 84,
        justifyContent: "flex-end",
        backgroundColor: palette.background,
        paddingTop: (process.env.EXPO_OS === "web" ? 12 : topInset) + SPACING.sm,
        paddingHorizontal: 24,
        paddingBottom: 16,
      }}
    >
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: palette.text, ...TYPOGRAPHY.hero }}
      >
        {title}
      </Text>
    </View>
  );
}
