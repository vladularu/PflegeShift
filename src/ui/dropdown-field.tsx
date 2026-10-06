import Ionicons from "@expo/vector-icons/Ionicons";
import { Fragment, useRef, useState } from "react";
import { findNodeHandle, Keyboard, Pressable, Text, View } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { scheduleAccessibilityFocus } from "@/ui/accessibility-focus";
import { SelectionSheet } from "@/ui/selection-sheet";

export interface DropdownOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  readonly group?: string;
  readonly subtitle?: string;
  readonly selectionLabel?: string;
}

export function DropdownField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  modalTitle,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly DropdownOption<T>[];
  readonly onChange: (value: T) => void;
  readonly modalTitle?: string;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.selectionLabel ?? selected?.label ?? String(value);
  const hasGroups = options.some((option) => option.group !== undefined);
  const visibleOptions = hasGroups
    ? options.filter((option) => option.group !== undefined)
    : options;
  const dialogTitle = modalTitle ?? label;

  function closeSelection() {
    setOpen(false);
    scheduleAccessibilityFocus(findNodeHandle(triggerRef.current));
  }

  function openSelection() {
    Keyboard.dismiss();
    setOpen(true);
  }

  return (
    <View style={{ gap: SPACING.xs }}>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
      >
        {label}
      </Text>
      <Pressable
        ref={triggerRef}
        accessibilityHint="Öffnet eine Auswahlliste"
        accessibilityLabel={`${label}: ${selectedLabel}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={openSelection}
        style={({ pressed }) => ({
          minHeight: CONTROL_HEIGHT.regular,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: RADII.control,
          borderCurve: "continuous",
          backgroundColor: palette.surfaceRaised,
          opacity: pressed ? 0.72 : 1,
          paddingHorizontal: SPACING.md,
        })}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ flex: 1, color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          {selectedLabel}
        </Text>
        <Ionicons
          accessibilityElementsHidden
          color={palette.textMuted}
          name="chevron-down"
          size={18}
        />
      </Pressable>
      <SelectionSheet onClose={closeSelection} title={dialogTitle} visible={open}>
        {(dismiss) => (
          <>
            {visibleOptions.map((option, index) => {
              const isSelected = option.value === value;
              const startsGroup =
                option.group !== undefined && option.group !== visibleOptions[index - 1]?.group;
              return (
                <Fragment key={String(option.value)}>
                  {startsGroup ? (
                    <Text
                      accessibilityRole="header"
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={{
                        color: palette.textMuted,
                        backgroundColor: palette.surfaceMuted,
                        paddingHorizontal: SPACING.lg,
                        paddingTop: SPACING.md,
                        paddingBottom: SPACING.sm,
                        ...TYPOGRAPHY.label,
                      }}
                    >
                      {option.group}
                    </Text>
                  ) : null}
                  <Pressable
                    accessibilityLabel={
                      option.selectionLabel ??
                      (option.subtitle ? `${option.label} · ${option.subtitle}` : option.label)
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      onChange(option.value);
                      dismiss();
                    }}
                    style={({ pressed }) => ({
                      minHeight: CONTROL_HEIGHT.regular,
                      paddingVertical: SPACING.sm,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderTopWidth: index === 0 || startsGroup ? 0 : 1,
                      borderTopColor: palette.separator,
                      backgroundColor: isSelected
                        ? palette.primarySoft
                        : pressed
                          ? palette.surfaceMuted
                          : "transparent",
                      paddingHorizontal: SPACING.lg,
                    })}
                  >
                    <View
                      style={{
                        flex: 1,
                        gap: SPACING.xs,
                        paddingRight: SPACING.md,
                      }}
                    >
                      <Text
                        maxFontSizeMultiplier={TEXT_MAX_SCALE}
                        style={{
                          color: isSelected ? palette.primary : palette.text,
                          ...(isSelected ? TYPOGRAPHY.bodyStrong : TYPOGRAPHY.body),
                        }}
                      >
                        {option.label}
                      </Text>
                      {option.subtitle ? (
                        <Text
                          maxFontSizeMultiplier={TEXT_MAX_SCALE}
                          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                        >
                          {option.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Ionicons
                        accessibilityElementsHidden
                        color={palette.primary}
                        name="checkmark"
                        size={20}
                      />
                    ) : null}
                  </Pressable>
                </Fragment>
              );
            })}
          </>
        )}
      </SelectionSheet>
    </View>
  );
}
