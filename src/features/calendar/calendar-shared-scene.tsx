import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import type { CalendarEntry, CalendarViewMode, UserProfile } from "@/domain/types";
import type { RuleResolver } from "@/rules/rule-resolver";
import { today } from "@/engine/calendar";
import { usePalette } from "@/theme/palette";
import { RADII } from "@/theme/tokens";
import type { CalendarAnchorRect } from "./calendar-layout";
import { calendarPrototypeLayout } from "./calendar-prototype-layout";
import { PrototypeDates, PrototypeMonthContent, PrototypeYear } from "./calendar-prototype-canvas";
import type { PrototypeDisplay } from "./prototype-entry-content";
import { useCalendarHolidayResolution } from "./calendar-holidays";
import { stampDayAccessibilityHint } from "./stamp-accessibility";

interface SceneValue {
  progress: SharedValue<number>;
  month: string;
  mode: CalendarViewMode;
  width: number;
  height: number;
  busy: boolean;
}
const Scene = createContext<SceneValue | null>(null);

/** Same persistent glyphs at both endpoints; no native measurements or overlay handoff. */
export function SharedCalendarScene({
  month,
  viewMode,
  active,
  bottomReserve,
  onSelectMonth,
  onTransitionStart,
  onTransitionComplete,
  children,
}: {
  month: string;
  viewMode: CalendarViewMode;
  active: boolean;
  bottomReserve: number;
  onSelectMonth: (month: string) => void;
  onTransitionStart: (mode: CalendarViewMode) => void;
  onTransitionComplete: () => void;
  children: ReactNode;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [busy, setBusy] = useState(false);
  const progress = useSharedValue(viewMode === "MONTH" ? 1 : 0);
  const reduced = useReducedMotion();
  const previous = useRef(viewMode);
  const epoch = useRef(0);
  const complete = useCallback(
    (id: number) => {
      if (id !== epoch.current) return;
      setBusy(false);
      onTransitionComplete();
    },
    [onTransitionComplete],
  );
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  useLayoutEffect(() => {
    const id = ++epoch.current;
    const changed = previous.current !== viewMode;
    previous.current = viewMode;
    const end = viewMode === "MONTH" ? 1 : 0;
    cancelAnimation(progress);
    onTransitionStart(viewMode);
    if (!changed || !active || !foreground || reduced || !size.width) {
      progress.value = end;
      complete(id);
      return;
    }
    setBusy(true);
    progress.value = withTiming(
      end,
      { duration: 420, easing: Easing.bezier(0.22, 0.68, 0, 1) },
      (finished) => {
        if (finished) runOnJS(complete)(id);
      },
    );
    return () => cancelAnimation(progress);
  }, [active, complete, foreground, onTransitionStart, progress, reduced, size, viewMode]);
  const height = Math.max(1, size.height - bottomReserve);
  const year = month.slice(0, 4);
  const layouts = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) =>
        calendarPrototypeLayout(
          `${year}-${String(index + 1).padStart(2, "0")}`,
          size.width,
          height,
        ),
      ),
    [height, size.width, year],
  );
  return (
    <Scene value={{ progress, month, mode: viewMode, width: size.width, height, busy }}>
      <View
        testID="calendar-shared-scene"
        style={styles.fill}
        onLayout={(event) => {
          const { width, height: nextHeight } = event.nativeEvent.layout;
          setSize((old) =>
            old.width === width && old.height === nextHeight ? old : { width, height: nextHeight },
          );
        }}
      >
        <View
          testID="calendar-year-overview-shell"
          style={StyleSheet.absoluteFill}
          pointerEvents={viewMode === "YEAR" && !busy ? "auto" : "none"}
          accessibilityElementsHidden={viewMode !== "YEAR"}
          importantForAccessibility={viewMode === "YEAR" ? "auto" : "no-hide-descendants"}
        >
          <PrototypeYear
            layouts={layouts}
            selectedMonth={month}
            onSelect={onSelectMonth}
            progress={progress}
          />
        </View>
        <View
          style={styles.fill}
          pointerEvents={viewMode === "MONTH" && !busy ? "auto" : "none"}
          accessibilityElementsHidden={viewMode !== "MONTH"}
          importantForAccessibility={viewMode === "MONTH" ? "auto" : "no-hide-descendants"}
        >
          {children}
        </View>
      </View>
    </Scene>
  );
}

export function SharedCalendarMonth({
  month,
  pageHeight,
  entriesByDate,
  display,
  profile,
  ruleResolver,
  showHolidays,
  onSelectDate,
  selectedDate,
  accessibilityVisible,
  testData,
  stampMode = false,
  stampToolLabel = null,
}: {
  month: string;
  pageHeight: number;
  entriesByDate: ReadonlyMap<string, readonly CalendarEntry[]>;
  display: PrototypeDisplay;
  profile: UserProfile;
  ruleResolver: RuleResolver;
  showHolidays: boolean;
  onSelectDate: (date: string, anchor: CalendarAnchorRect) => void;
  selectedDate: string | null;
  accessibilityVisible: boolean;
  testData: boolean;
  stampMode?: boolean;
  stampToolLabel?: string | null;
}) {
  const scene = use(Scene);
  const palette = usePalette();
  const still = useSharedValue(1);
  const holidays = useCalendarHolidayResolution(month, profile, ruleResolver, showHolidays);
  if (!scene) throw new Error("SharedCalendarMonth requires SharedCalendarScene");
  return (
    <SharedMonthBody
      month={month}
      pageHeight={pageHeight}
      entriesByDate={entriesByDate}
      display={display}
      profile={profile}
      onSelectDate={onSelectDate}
      selectedDate={selectedDate}
      accessibilityVisible={accessibilityVisible}
      testData={testData}
      stampMode={stampMode}
      stampToolLabel={stampToolLabel}
      scene={scene}
      still={still}
      holidays={holidays.holidays}
      color={palette.primary}
      separator={palette.separator}
    />
  );
}

function SharedMonthBody({
  month,
  pageHeight,
  entriesByDate,
  display,
  profile,
  onSelectDate,
  selectedDate,
  accessibilityVisible,
  testData,
  scene,
  still,
  holidays,
  color,
  separator,
  stampMode,
  stampToolLabel,
}: Omit<Parameters<typeof SharedCalendarMonth>[0], "ruleResolver" | "showHolidays"> & {
  scene: SceneValue;
  still: SharedValue<number>;
  holidays: ReadonlyMap<string, { name: string }>;
  color: string;
  separator: string;
}) {
  const layout = useMemo(
    () => calendarPrototypeLayout(month, scene.width, scene.height),
    [month, scene.width, scene.height],
  );
  const selected = month === scene.month;
  const progress = selected ? scene.progress : still;
  const visible = accessibilityVisible && scene.mode === "MONTH" && !scene.busy;
  const opacity = useAnimatedStyle(() => ({ opacity: selected ? 1 : scene.progress.value }));
  return (
    <Animated.View
      testID={`shared-month-${month}`}
      style={[{ height: pageHeight, width: scene.width }, opacity]}
    >
      <PrototypeMonthContent
        layout={layout}
        progress={progress}
        entriesByDate={entriesByDate}
        holidays={holidays}
        display={display}
        timeZone={profile.timeZone}
        visible={false}
      />
      <PrototypeDates layout={layout} progress={progress} currentDate={today(profile.timeZone)} />
      <View
        pointerEvents={visible ? "box-none" : "none"}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
        style={StyleSheet.absoluteFill}
      >
        {layout.days.map((day) => (
          <Pressable
            key={day.date}
            testID={`calendar-day-${day.date}`}
            accessibilityRole="button"
            accessibilityHint={
              stampMode ? stampDayAccessibilityHint(stampToolLabel ?? null) : "Tagesfenster öffnen"
            }
            accessibilityLabel={`${day.date}, ${holidays.get(day.date)?.name ?? ""} ${(entriesByDate.get(day.date) ?? []).map((entry) => entry.title).join(", ")}`}
            accessibilityState={{ selected: selectedDate === day.date }}
            onPress={(event) => {
              const { pageX, pageY, locationX, locationY } = event.nativeEvent;
              onSelectDate(day.date, {
                x: pageX - locationX,
                y: pageY - locationY,
                width: layout.cellWidth,
                height: layout.weekHeight,
              });
            }}
            style={{
              position: "absolute",
              left: day.toX - layout.cellWidth / 2,
              top: day.toY - 20,
              width: layout.cellWidth,
              height: layout.weekHeight,
              borderRadius: RADII.small,
              borderWidth:
                selectedDate === day.date || (stampMode && !entriesByDate.get(day.date)?.length)
                  ? 1
                  : 0,
              borderColor: selectedDate === day.date ? color : separator,
            }}
          />
        ))}
      </View>
      {testData ? <Text style={{ position: "absolute", bottom: 0 }}>Testdaten</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, overflow: "hidden" } });
