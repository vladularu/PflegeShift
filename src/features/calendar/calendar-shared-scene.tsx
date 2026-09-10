import { createContext, use, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
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
import { useCalendarController, type CalendarController } from "./use-calendar-controller";

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
type SharedCalendarSceneProps = {
  month: string;
  viewMode: CalendarViewMode;
  active: boolean;
  bottomReserve: number;
  onSelectMonth: (month: string) => void;
  onTransitionStart?: (mode: CalendarViewMode) => void;
  onTransitionComplete?: () => void;
  children: ReactNode;
  controller?: CalendarController;
  referenceMonth?: string;
  entriesByDate?: ReadonlyMap<string, readonly CalendarEntry[]>;
};

export function SharedCalendarScene(props: SharedCalendarSceneProps) {
  return props.controller ? (
    <CalendarSceneContent {...props} controller={props.controller} />
  ) : (
    <StandaloneCalendarScene {...props} />
  );
}

function StandaloneCalendarScene(props: SharedCalendarSceneProps) {
  const controller = useCalendarController({
    month: props.month,
    mode: props.viewMode,
    active: props.active,
    onTransitionStart: props.onTransitionStart,
    onTransitionComplete: props.onTransitionComplete,
  });
  return <CalendarSceneContent {...props} controller={controller} />;
}

function CalendarSceneContent({
  bottomReserve,
  onSelectMonth,
  children,
  controller,
  referenceMonth,
  entriesByDate,
}: SharedCalendarSceneProps & { controller: CalendarController }) {
  const { month, mode: viewMode, progress, busy, yearVisible } = controller;
  const [size, setSize] = useState({ width: 0, height: 0 });
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
          style={[StyleSheet.absoluteFill, { opacity: yearVisible ? 1 : 0 }]}
          pointerEvents={viewMode === "YEAR" && !busy ? "auto" : "none"}
          accessibilityElementsHidden={viewMode !== "YEAR"}
          importantForAccessibility={viewMode === "YEAR" ? "auto" : "no-hide-descendants"}
        >
          <PrototypeYear
            layouts={layouts}
            selectedMonth={month}
            onSelect={onSelectMonth}
            progress={progress}
            referenceMonth={referenceMonth}
            entriesByDate={entriesByDate}
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
  separator,
  stampMode,
  stampToolLabel,
}: Omit<Parameters<typeof SharedCalendarMonth>[0], "ruleResolver" | "showHolidays"> & {
  scene: SceneValue;
  still: SharedValue<number>;
  holidays: ReadonlyMap<string, { name: string }>;
  separator: string;
}) {
  const layout = useMemo(
    () => calendarPrototypeLayout(month, scene.width, scene.height),
    [month, scene.width, scene.height],
  );
  const selected = month === scene.month;
  const currentDate = today(profile.timeZone);
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
      <PrototypeDates
        layout={layout}
        progress={progress}
        currentDate={currentDate}
        selectedDate={visible ? selectedDate : null}
      />
      <View
        pointerEvents={visible ? "box-none" : "none"}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
        style={[StyleSheet.absoluteFill, { opacity: visible ? 1 : 0 }]}
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
                stampMode &&
                !entriesByDate.get(day.date)?.length &&
                selectedDate !== day.date &&
                day.date !== currentDate
                  ? 1
                  : 0,
              borderColor: separator,
            }}
          />
        ))}
      </View>
      {testData ? <Text style={{ position: "absolute", bottom: 0 }}>Testdaten</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, overflow: "hidden" } });
