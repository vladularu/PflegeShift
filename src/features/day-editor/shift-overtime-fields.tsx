import type { Ref } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { usePalette } from "@/theme/palette";
import { RADII, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";

export function ShiftOvertimeFields({
  confirmed,
  inputRef,
  onConfirmedChange,
  onMinutesChange,
  overtimeMinutes,
}: {
  readonly confirmed: boolean;
  readonly inputRef: Ref<TextInput>;
  readonly onConfirmedChange: (value: boolean) => void;
  readonly onMinutesChange: (value: string) => void;
  readonly overtimeMinutes: string;
}) {
  const palette = usePalette();
  const status = confirmed ? "Als Überstunden bestätigt" : "Nicht bestätigt";
  return (
    <>
      <View style={[styles.row, { borderBottomColor: palette.separator }]}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={[styles.label, { color: palette.text }]}
        >
          Überstunden
        </Text>
        <TextInput
          ref={inputRef}
          accessibilityLabel="Tariflich bestätigte Überstunden in Minuten"
          keyboardType="number-pad"
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          onChangeText={onMinutesChange}
          selectTextOnFocus
          style={[styles.input, { color: palette.text, backgroundColor: palette.surfaceMuted }]}
          value={overtimeMinutes}
        />
      </View>
      {Number(overtimeMinutes) > 0 ? (
        <Pressable
          accessibilityLabel={`Tarifstatus: ${status}`}
          accessibilityRole="button"
          onPress={() => onConfirmedChange(!confirmed)}
          style={({ pressed }) => [
            styles.row,
            {
              borderBottomColor: palette.separator,
              backgroundColor: pressed ? palette.surfaceMuted : "transparent",
            },
          ]}
        >
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={[styles.label, { color: palette.text }]}
          >
            Tarifstatus
          </Text>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={[styles.value, { color: palette.text }]}
          >
            {status}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { flexShrink: 0, ...TYPOGRAPHY.bodyStrong },
  value: {
    flex: 1,
    textAlign: "right",
    ...TYPOGRAPHY.bodyStrong,
  },
  input: {
    minWidth: 92,
    borderRadius: RADII.control,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    ...TYPOGRAPHY.bodyStrong,
  },
});
