import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SHIFT_COLOR_PAIRS, usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { ShiftColorPickerSheet } from "@/ui/shift-color-picker-sheet";

export function ColorPicker({
  value,
  symbol = "time",
  onChange,
}: {
  readonly value: string;
  readonly symbol?: string;
  readonly onChange: (value: string) => void;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const presets = SHIFT_COLOR_PAIRS.slice(0, 14);
  const presetSelected = presets.some(({ main }) => main === value);
  return (
    <View style={styles.container}>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
      >
        Farbe
      </Text>
      <View accessibilityLabel="Farbvorgaben" accessibilityRole="radiogroup" style={styles.grid}>
        {presets.map(({ main, soft }) => {
          const selected = main === value;
          return (
            <Pressable
              key={main}
              accessibilityLabel={`Farbe ${main}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(main)}
              style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.58 : 1 }]}
            >
              <View
                style={[
                  styles.selectionRing,
                  { borderColor: selected ? palette.textMuted : "transparent" },
                ]}
              >
                <View style={styles.pairCircle}>
                  <View style={{ flex: 1, backgroundColor: soft }} />
                  <View style={{ flex: 1, backgroundColor: main }} />
                </View>
              </View>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityHint="Öffnet die vollständige Farbauswahl"
          accessibilityLabel={`Alle Farben, aktuell ${value}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: open, selected: !presetSelected }}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.58 : 1 }]}
        >
          <View
            style={[
              styles.selectionRing,
              { borderColor: !presetSelected ? palette.textMuted : "transparent" },
            ]}
          >
            <View style={styles.multiColorCircle}>
              {SHIFT_COLOR_PAIRS.slice(0, 4).map(({ main }) => (
                <View key={main} style={{ width: "50%", height: "50%", backgroundColor: main }} />
              ))}
            </View>
          </View>
        </Pressable>
      </View>
      <ShiftColorPickerSheet
        onChange={onChange}
        onClose={() => setOpen(false)}
        symbol={symbol}
        value={value}
        visible={open}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "20%",
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionRing: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 25,
  },
  pairCircle: {
    width: 42,
    height: 42,
    overflow: "hidden",
    borderRadius: 21,
    transform: [{ rotate: "-45deg" }],
  },
  multiColorCircle: {
    width: 42,
    height: 42,
    flexDirection: "row",
    flexWrap: "wrap",
    overflow: "hidden",
    borderRadius: 21,
  },
});
