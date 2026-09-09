import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addMonths, today } from "@/engine/calendar";
import { calendarPerformance } from "@/application/calendar-performance";
import { usePalette } from "@/theme/palette";
import { RADII, SPACING } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { calendarPrototypeLayout, PROTOTYPE_MONTH_NAMES } from "./calendar-prototype-layout";
import { PrototypeDates, PrototypeMonthContent, PrototypeYear } from "./calendar-prototype-canvas";
import { usePflegeShiftProfile } from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { useCalendarPreferences } from "./calendar-preferences";
import { useCalendarHolidayResolution } from "./calendar-holidays";
import { usePrototypeEntries } from "./use-prototype-entries";
import { buildCalendarEntryIndex } from "./calendar-entry-index";

function PrototypeButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        label === "‹" ? "Zurückblättern" : label === "›" ? "Weiterblättern" : label
      }
      onPress={onPress}
      style={[styles.button, { backgroundColor: palette.surface }]}
    >
      <Text style={{ color: palette.text }}>{label}</Text>
    </Pressable>
  );
}

export function CalendarPrototypeScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const active = useIsFocused();
  const reduced = useReducedMotion();
  const { profile } = usePflegeShiftProfile();
  const { resolver } = useRuleCatalogRuntime();
  const preferences = useCalendarPreferences();
  const timeZone = profile?.timeZone ?? "Europe/Berlin";
  const currentDate = today(timeZone);
  const [target, setTarget] = useState({ month: currentDate.slice(0, 7), mode: "YEAR", serial: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [busy, setBusy] = useState(false);
  const progress = useSharedValue(0);
  const epoch = useRef(0);
  const year = target.month.slice(0, 4);
  const data = usePrototypeEntries(year, active && foreground);
  const entryIndex = useMemo(
    () =>
      buildCalendarEntryIndex(data.entries, {
        showAppointments: preferences.showAppointments,
        showShifts: preferences.showShifts,
      }),
    [data.entries, preferences.showAppointments, preferences.showShifts],
  );
  const holidays = useCalendarHolidayResolution(
    target.month,
    profile,
    resolver,
    preferences.showHolidays,
  );
  const layouts = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        calendarPrototypeLayout(
          `${year}-${String(i + 1).padStart(2, "0")}`,
          size.width,
          size.height,
        ),
      ),
    [year, size],
  );
  const selected = layouts[Number(target.month.slice(5)) - 1];
  const request = useCallback((month: string, mode: string) => {
    calendarPerformance.begin("prototype-request", month);
    epoch.current += 1;
    setTarget((previous) => ({ month, mode, serial: previous.serial + 1 }));
  }, []);
  const complete = useCallback((serial: number) => {
    if (serial !== epoch.current) return;
    setBusy(false);
    calendarPerformance.record("prototype-end", { epoch: serial });
  }, []);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  useLayoutEffect(() => {
    const serial = epoch.current;
    const end = target.mode === "MONTH" ? 1 : 0;
    cancelAnimation(progress);
    if (!active || !foreground || reduced || !size.width || !target.serial) {
      progress.value = end;
      setBusy(false);
      return;
    }
    setBusy(true);
    calendarPerformance.record("prototype-start", { epoch: serial, mode: end });
    progress.value = withTiming(
      end,
      { duration: 420, easing: Easing.bezier(0.22, 0.68, 0, 1) },
      (finished) => {
        if (finished) runOnJS(complete)(serial);
      },
    );
    return () => cancelAnimation(progress);
  }, [active, complete, foreground, progress, reduced, size, target]);
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: palette.background, paddingBottom: Math.max(8, insets.bottom) },
      ]}
    >
      <Text style={{ color: palette.textMuted, paddingHorizontal: SPACING.md }}>
        Prototyp · Echte Daten · nur Ansicht
      </Text>
      <View style={{ height: 44, paddingHorizontal: SPACING.md, justifyContent: "center" }}>
        {data.error ? (
          <Pressable
            accessibilityRole="button"
            onPress={data.retry}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ color: palette.text }}>Laden fehlgeschlagen. Erneut versuchen</Text>
          </Pressable>
        ) : (
          <Text accessibilityLiveRegion="polite" style={{ color: palette.textMuted }}>
            {data.loading
              ? "Jahresdaten werden geladen …"
              : holidays.status !== "AVAILABLE"
                ? "Feiertagsregeln für diesen Zeitraum fehlen."
                : "Anzeigeoptionen wie im Hauptkalender"}
          </Text>
        )}
      </View>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          testID="prototype-heading"
          style={{ color: palette.text, ...TYPOGRAPHY.screenTitle, flex: 1 }}
        >
          {target.mode === "YEAR"
            ? year
            : `${PROTOTYPE_MONTH_NAMES[Number(target.month.slice(5)) - 1]} ${year}`}
        </Text>
        <PrototypeButton
          label="‹"
          onPress={() =>
            request(addMonths(target.month, target.mode === "YEAR" ? -12 : -1), target.mode)
          }
          testID="prototype-previous"
        />
        <PrototypeButton
          label="›"
          onPress={() =>
            request(addMonths(target.month, target.mode === "YEAR" ? 12 : 1), target.mode)
          }
          testID="prototype-next"
        />
      </View>
      <Animated.View
        testID="prototype-canvas"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setSize((previous) =>
            previous.width === width && previous.height === height ? previous : { width, height },
          );
        }}
        style={styles.canvas}
      >
        {size.width > 0 && size.height > 0 ? (
          <>
            <View
              style={StyleSheet.absoluteFill}
              pointerEvents={target.mode === "YEAR" && !busy ? "auto" : "none"}
              accessibilityElementsHidden={target.mode !== "YEAR"}
            >
              <PrototypeYear
                layouts={layouts}
                referenceMonth={currentDate.slice(0, 7)}
                selectedMonth={target.month}
                onSelect={(month) => request(month, "MONTH")}
                progress={progress}
              />
            </View>
            <PrototypeMonthContent
              layout={selected}
              progress={progress}
              entriesByDate={entryIndex.entriesByDate}
              holidays={holidays.holidays}
              display={preferences}
              timeZone={timeZone}
              visible={target.mode === "MONTH" && !busy && !data.loading && !data.error}
            />
            <PrototypeDates layout={selected} progress={progress} currentDate={currentDate} />
          </>
        ) : null}
      </Animated.View>
      <View style={styles.footer}>
        <PrototypeButton
          label="Heute"
          onPress={() => request(currentDate.slice(0, 7), "MONTH")}
          testID="prototype-today"
        />
        <PrototypeButton
          label="Jahresansicht"
          onPress={() => request(target.month, "YEAR")}
          testID="prototype-year"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  button: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  canvas: { flex: 1, overflow: "hidden" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: 8,
  },
});
