import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { usePalette } from "@/theme/palette";
import { selectionFeedback } from "@/ui/haptics";
import { TEXT_MAX_SCALE } from "@/theme/typography";

export function TariffQuestion({
  title,
  caption,
  options,
  value,
  onChange,
}: {
  readonly title: string;
  readonly caption: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.6;

  return (
    <View style={{ gap: 9 }}>
      <View style={{ gap: 3, paddingHorizontal: 2 }}>
        <Text selectable style={{ color: palette.text, fontSize: 14, fontWeight: "600" }}>
          {title}
        </Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17 }}>
          {caption}
        </Text>
      </View>
      <View
        accessibilityLabel={title}
        accessibilityRole="radiogroup"
        style={{ flexDirection: stacked ? "column" : "row", gap: 7 }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`${title}: ${option.label}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                onChange(option.value);
                selectionFeedback();
              }}
              style={({ pressed }) => ({
                minHeight: 44,
                flex: stacked ? undefined : 1,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: selected ? palette.primary : palette.border,
                borderRadius: 14,
                borderCurve: "continuous",
                backgroundColor: selected ? palette.primarySoft : palette.surface,
                opacity: pressed ? 0.72 : 1,
                paddingHorizontal: 8,
              })}
            >
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={{
                  color: selected ? palette.primary : palette.textSecondary,
                  fontSize: 12,
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
