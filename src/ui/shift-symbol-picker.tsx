import { useMemo, useState, type Ref } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { isShiftSymbolId, SHIFT_SYMBOLS } from "@/theme/shift-symbols";
import { chipTextColor } from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";
import { selectionFeedback } from "@/ui/haptics";
import { ShiftSymbol } from "@/ui/shift-symbol";

export function ShiftSymbolPicker({
  color,
  error,
  inputRef,
  onHeaderPress,
  value,
  onChange,
}: {
  readonly color: string;
  readonly error?: string | null;
  readonly inputRef?: Ref<TextInput>;
  readonly onHeaderPress?: () => void;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const palette = usePalette();
  const customSelected = !isShiftSymbolId(value);
  const [customValue, setCustomValue] = useState(customSelected ? value : "D");
  const entries = useMemo(() => [...SHIFT_SYMBOLS, { id: "custom", label: "ABC", icon: null }], []);

  function selectSymbol(id: string) {
    selectionFeedback();
    onChange(id === "custom" ? customValue || "D" : id);
  }

  return (
    <View style={styles.container}>
      {onHeaderPress ? (
        <Pressable
          accessibilityHint="Klappt die Auswahl ein"
          accessibilityLabel="Symbol und Farbe schließen"
          accessibilityRole="button"
          onPress={onHeaderPress}
          style={({ pressed }) => [styles.headingRow, { opacity: pressed ? 0.58 : 1 }]}
        >
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
          >
            Symbol
          </Text>
          <View style={[styles.preview, { backgroundColor: color }]}>
            <ShiftSymbol color={chipTextColor} size={22} value={value} />
          </View>
        </Pressable>
      ) : (
        <View style={styles.headingRow}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
          >
            Symbol
          </Text>
          <View style={[styles.preview, { backgroundColor: color }]}>
            <ShiftSymbol color={chipTextColor} size={22} value={value} />
          </View>
        </View>
      )}
      <View
        accessibilityLabel="Symbol auswählen"
        accessibilityRole="radiogroup"
        style={[styles.grid, { backgroundColor: palette.surfaceMuted }]}
      >
        {entries.map((entry) => {
          const selected = entry.id === "custom" ? customSelected : entry.id === value;
          return (
            <Pressable
              key={entry.id}
              accessibilityLabel={entry.label}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => selectSymbol(entry.id)}
              style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.58 : 1 }]}
            >
              <View
                style={[
                  styles.selectionRing,
                  {
                    borderColor: selected ? palette.textMuted : "transparent",
                  },
                ]}
              >
                <View
                  style={[
                    styles.symbolCircle,
                    { backgroundColor: selected ? color : palette.separator },
                  ]}
                >
                  {entry.id === "custom" ? (
                    <Text
                      style={{
                        color: selected ? chipTextColor : palette.textSecondary,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      ABC
                    </Text>
                  ) : (
                    <ShiftSymbol
                      color={selected ? chipTextColor : palette.textSecondary}
                      size={21}
                      value={entry.id}
                    />
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      {customSelected ? (
        <TextInput
          ref={inputRef}
          accessibilityLabel="Eigenes Symbol oder Kürzel"
          autoCapitalize="characters"
          maxLength={4}
          onChangeText={(next) => {
            setCustomValue(next);
            onChange(next);
          }}
          placeholder="ABC"
          placeholderTextColor={palette.textMuted}
          style={[
            styles.customInput,
            {
              borderColor: error ? palette.danger : palette.border,
              backgroundColor: palette.surfaceRaised,
              color: palette.text,
            },
          ]}
          value={value}
        />
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: palette.danger, ...TYPOGRAPHY.caption }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  headingRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  preview: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    overflow: "hidden",
    borderRadius: RADII.large,
    borderCurve: "continuous",
    paddingVertical: SPACING.sm,
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
  symbolCircle: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  customInput: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: RADII.control,
    paddingHorizontal: SPACING.md,
    ...TYPOGRAPHY.body,
  },
});
