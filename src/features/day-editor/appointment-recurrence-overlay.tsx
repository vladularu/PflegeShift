import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";

import type { RecurrenceFrequency, RecurrenceRule } from "@/domain/types";
import { recurrenceLabel } from "@/features/day-editor/entry-options";
import { MOTION } from "@/theme/motion";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE } from "@/theme/typography";

const DEFAULT_RECURRENCE: RecurrenceRule = { frequency: "WEEK", interval: 1 };

const PRESETS = [
  { label: "Nie", value: null },
  { label: "Wöchentlich", value: DEFAULT_RECURRENCE },
  { label: "Alle 2 Wochen", value: { frequency: "WEEK", interval: 2 } },
  { label: "Monatlich", value: { frequency: "MONTH", interval: 1 } },
  { label: "Jährlich", value: { frequency: "YEAR", interval: 1 } },
] as const satisfies readonly {
  readonly label: string;
  readonly value: RecurrenceRule | null;
}[];

const INTERVALS = Array.from({ length: 99 }, (_, index) => ({
  label: String(index + 1),
  value: index + 1,
}));

const FREQUENCIES: readonly {
  readonly label: string;
  readonly value: RecurrenceFrequency;
}[] = [
  { label: "Tage", value: "DAY" },
  { label: "Wochen", value: "WEEK" },
  { label: "Monate", value: "MONTH" },
  { label: "Jahre", value: "YEAR" },
];

const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_PADDING = WHEEL_ITEM_HEIGHT * 2;

function recurrencesEqual(first: RecurrenceRule | null, second: RecurrenceRule | null): boolean {
  if (first === null || second === null) return first === second;
  return first.frequency === second.frequency && first.interval === second.interval;
}

function isPreset(value: RecurrenceRule | null): boolean {
  return PRESETS.some((preset) => recurrencesEqual(preset.value, value));
}

function RadioMark({ selected }: { readonly selected: boolean }) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.radioOuter,
        { borderColor: selected ? palette.primary : palette.textSecondary },
      ]}
    >
      {selected ? <View style={[styles.radioInner, { backgroundColor: palette.primary }]} /> : null}
    </View>
  );
}

function PresetRow({
  label,
  onPress,
  selected,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.presetRow,
        {
          borderBottomColor: palette.separator,
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
        },
      ]}
    >
      <RadioMark selected={selected} />
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={[styles.presetLabel, { color: palette.text }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function WheelColumn<T extends string | number>({
  accessibilityLabel,
  onChange,
  options,
  value,
}: {
  readonly accessibilityLabel: string;
  readonly onChange: (value: T) => void;
  readonly options: readonly { readonly label: string; readonly value: T }[];
  readonly value: T;
}) {
  const palette = usePalette();
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const selectIndex = useCallback(
    (index: number) => {
      const nextIndex = Math.max(0, Math.min(options.length - 1, index));
      const option = options[nextIndex];
      if (option) onChange(option.value);
    },
    [onChange, options],
  );

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      selectIndex(Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT));
    },
    [selectIndex],
  );

  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.wheelColumn}>
      <View
        pointerEvents="none"
        style={[styles.wheelSelection, { backgroundColor: palette.surfaceMuted }]}
      />
      <ScrollView
        contentContainerStyle={styles.wheelContent}
        contentOffset={{ x: 0, y: selectedIndex * WHEEL_ITEM_HEIGHT }}
        decelerationRate="fast"
        nestedScrollEnabled
        onMomentumScrollEnd={handleMomentumEnd}
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={WHEEL_ITEM_HEIGHT}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={`${option.value}`}
              accessibilityLabel={`${accessibilityLabel}: ${option.label}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                selectIndex(index);
                scrollRef.current?.scrollTo?.({
                  animated: true,
                  y: index * WHEEL_ITEM_HEIGHT,
                });
              }}
              style={styles.wheelItem}
            >
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={[
                  styles.wheelItemText,
                  {
                    color: selected ? palette.text : palette.textMuted,
                    fontWeight: selected ? "600" : "400",
                    opacity: selected ? 1 : 0.5,
                  },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function CustomRecurrenceView({
  draft,
  onCancel,
  onChange,
  onDone,
}: {
  readonly draft: RecurrenceRule;
  readonly onCancel: () => void;
  readonly onChange: (value: RecurrenceRule) => void;
  readonly onDone: () => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={FadeIn.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
      exiting={FadeOut.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
      style={[
        styles.customScreen,
        {
          backgroundColor: palette.background,
          paddingTop: Math.max(insets.top, 18),
          paddingBottom: Math.max(insets.bottom, 18),
        },
      ]}
      testID="appointment-recurrence-custom"
    >
      <View style={styles.customHeader}>
        <Pressable
          accessibilityLabel="Benutzerdefinierte Wiederholung schließen"
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => [
            styles.customClose,
            {
              borderColor: palette.border,
              backgroundColor: palette.surface,
              opacity: pressed ? 0.68 : 1,
            },
          ]}
        >
          <Ionicons color={palette.text} name="close" size={27} />
        </Pressable>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={[styles.customTitle, { color: palette.text }]}
        >
          Wiederholen
        </Text>
        <View style={styles.headerBalance} />
      </View>

      <View style={[styles.wheelCard, { backgroundColor: palette.surface }]}>
        <WheelColumn
          accessibilityLabel="Intervall"
          onChange={(interval) => onChange({ ...draft, interval })}
          options={INTERVALS}
          value={draft.interval}
        />
        <WheelColumn
          accessibilityLabel="Einheit"
          onChange={(frequency) => onChange({ ...draft, frequency })}
          options={FREQUENCIES}
          value={draft.frequency}
        />
      </View>

      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={[styles.summary, { color: palette.textSecondary }]}
      >
        {recurrenceLabel(draft)}
      </Text>

      <View style={styles.customFooter}>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => [
            styles.footerButton,
            {
              borderColor: palette.border,
              backgroundColor: palette.surface,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.footerLabel, { color: palette.text }]}>Abbrechen</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onDone}
          style={({ pressed }) => [
            styles.footerButton,
            { backgroundColor: palette.primary, opacity: pressed ? 0.76 : 1 },
          ]}
        >
          <Text style={[styles.footerLabel, { color: palette.onPrimary }]}>Fertig</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function AppointmentRecurrenceOverlay({
  onChange,
  onClose,
  value,
}: {
  readonly onChange: (value: RecurrenceRule | null) => void;
  readonly onClose: () => void;
  readonly value: RecurrenceRule | null;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<"PRESETS" | "CUSTOM">("PRESETS");
  const [draft, setDraft] = useState<RecurrenceRule>(value ?? DEFAULT_RECURRENCE);

  if (view === "CUSTOM") {
    return (
      <CustomRecurrenceView
        draft={draft}
        onCancel={() => setView("PRESETS")}
        onChange={setDraft}
        onDone={() => {
          onChange(draft);
          onClose();
        }}
      />
    );
  }

  return (
    <View style={styles.overlay} testID="appointment-recurrence-presets">
      <Animated.View
        entering={FadeIn.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
        exiting={FadeOut.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay }]}
      >
        <Pressable
          accessibilityLabel="Wiederholung schließen"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View
        entering={SlideInDown.duration(MOTION.duration.normal)
          .easing(MOTION.easing.emphasized)
          .reduceMotion(MOTION.reduceMotion)}
        exiting={SlideOutDown.duration(MOTION.duration.fast)
          .easing(MOTION.easing.standard)
          .reduceMotion(MOTION.reduceMotion)}
        style={[
          styles.presetSheet,
          {
            backgroundColor: palette.groupedBackground,
            borderColor: palette.border,
            paddingBottom: Math.max(insets.bottom, 18),
          },
        ]}
        testID="appointment-recurrence-sheet"
      >
        <View
          accessibilityRole="radiogroup"
          style={[styles.presetCard, { backgroundColor: palette.surface }]}
          testID="appointment-recurrence-preset-card"
        >
          {PRESETS.map((preset) => (
            <PresetRow
              key={preset.label}
              label={preset.label}
              onPress={() => {
                onChange(preset.value);
                onClose();
              }}
              selected={recurrencesEqual(value, preset.value)}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: value !== null && !isPreset(value) }}
          onPress={() => {
            setDraft(value ?? DEFAULT_RECURRENCE);
            setView("CUSTOM");
          }}
          style={({ pressed }) => [
            styles.customRow,
            { backgroundColor: pressed ? palette.surfaceMuted : palette.surface },
          ]}
          testID="appointment-recurrence-custom-row"
        >
          <RadioMark selected={value !== null && !isPreset(value)} />
          <Text style={[styles.presetLabel, { color: palette.text }]}>Benutzerdefiniert</Text>
          <Ionicons color={palette.text} name="chevron-forward" size={22} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    justifyContent: "flex-end",
  },
  presetSheet: {
    width: "100%",
    maxWidth: 540,
    maxHeight: "88%",
    alignSelf: "center",
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    borderCurve: "continuous",
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  presetCard: {
    overflow: "hidden",
    borderRadius: 24,
    borderCurve: "continuous",
  },
  presetRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  presetLabel: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: "500" },
  radioOuter: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 12,
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  customRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 24,
    borderCurve: "continuous",
    paddingHorizontal: 16,
  },
  customScreen: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
    gap: 22,
    paddingHorizontal: 20,
  },
  customHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
  },
  customClose: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
  },
  customTitle: { flex: 1, fontSize: 22, lineHeight: 28, fontWeight: "700", textAlign: "center" },
  headerBalance: { width: 48 },
  wheelCard: {
    height: 220,
    flexDirection: "row",
    gap: 16,
    borderRadius: 26,
    borderCurve: "continuous",
    paddingHorizontal: 12,
  },
  wheelColumn: { flex: 1, overflow: "hidden" },
  wheelSelection: {
    position: "absolute",
    top: WHEEL_PADDING,
    right: 0,
    left: 0,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  wheelContent: { paddingVertical: WHEEL_PADDING },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  wheelItemText: {
    fontSize: 19,
    lineHeight: 24,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  summary: { fontSize: 16, lineHeight: 22, textAlign: "center" },
  customFooter: { marginTop: "auto", flexDirection: "row", gap: 18 },
  footerButton: {
    minHeight: 54,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 27,
    borderCurve: "continuous",
  },
  footerLabel: { fontSize: 17, fontWeight: "600" },
});
