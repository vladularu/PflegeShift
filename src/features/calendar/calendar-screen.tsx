import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useIsFocused,
  useNavigation,
  type ParamListBase,
} from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, { FadeInDown, FadeInUp, FadeOut, ReduceMotion, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useMediShiftEntries,
  useMediShiftProfile,
  useMediShiftStatus,
  useMediShiftTemplates,
  useMediShiftTestData,
} from "@/application/medishift-provider";
import {
  type CalendarEntry,
  type ShiftEntry,
} from "@/domain/types";
import { addMonths, currentMonth, formatDateTitle, today } from "@/engine/calendar";
import { holidayMapForMonth } from "@/engine/holidays";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { CalendarHeader } from "@/features/calendar/calendar-header";
import { calendarDayPressAction } from "@/features/calendar/calendar-display";
import {
  calculateCalendarBottomReserve,
  calendarTodayTarget,
  type CalendarAnchorRect,
} from "@/features/calendar/calendar-layout";
import { clampDateToMonth } from "@/features/calendar/calendar-metrics";
import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { MonthCard } from "@/features/calendar/month-card";
import {
  createMonthWindow,
  monthAtPagerOffset,
  shouldRecenterMonthWindow,
} from "@/features/calendar/month-window";
import {
  buildQuickEntryActions,
  isQuickEntryStampAction,
  quickEntryEditorTarget,
  saveQuickEntryAction,
  type QuickEntryAction,
  type QuickEntryStampAction,
} from "@/features/calendar/quick-entry-actions";
import { QuickPlannerDock } from "@/features/calendar/quick-planner-dock";
import { QuickEntryPopup } from "@/features/calendar/quick-entry-popup";
import { YearOverview } from "@/features/calendar/year-overview";
import { dayDetailsRoute, dayEditorRoute } from "@/navigation/routes";
import {
  calendarTabShouldOpenToday,
  useActiveMonthCoordinator,
} from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { LoadingView } from "@/ui/loading-view";

const MONTHS_BEFORE = 24;
const MONTHS_AFTER = 36;

interface QuickPopupState {
  readonly date: string;
  readonly anchor: CalendarAnchorRect;
}

interface UndoNotice {
  readonly entry: ShiftEntry;
  readonly message: string;
}

export function CalendarScreen() {
  const palette = usePalette();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const preferences = useCalendarPreferences();
  const activeMonthCoordinator = useActiveMonthCoordinator();
  const params = useLocalSearchParams<{ month?: string }>();
  const { ready, error } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const { templates } = useMediShiftTemplates();
  const { entries, removeEntry, upsertShift } = useMediShiftEntries();
  const { testMonths } = useMediShiftTestData();
  const profileReady = profile !== null;
  const timeZone = profile?.timeZone ?? "Europe/Berlin";
  const routeMonth = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : null;
  const initialMonth = useRef<string | null>(null);
  initialMonth.current ??= routeMonth ?? activeMonthCoordinator.getMonth();
  const targetMonth = routeMonth ?? initialMonth.current;
  const [monthAnchor, setMonthAnchor] = useState(targetMonth);
  const months = useMemo(
    () => [...createMonthWindow(monthAnchor, MONTHS_BEFORE, MONTHS_AFTER)],
    [monthAnchor],
  );
  const initialDate = targetMonth === currentMonth(timeZone) ? today(timeZone) : `${targetMonth}-01`;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectionVisible, setSelectionVisible] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(targetMonth);
  const [pageHeight, setPageHeight] = useState(0);
  const [plannerMode, setPlannerMode] = useState(false);
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [stampTool, setStampTool] = useState<QuickEntryStampAction | null>(null);
  const [quickPopup, setQuickPopup] = useState<QuickPopupState | null>(null);
  const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null);
  const savingDates = useRef(new Set<string>());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelectedDate = useRef<string | null>(null);
  const settledMonth = useRef(targetMonth);
  const listRef = useRef<FlatList<string>>(null);

  useFocusEffect(useCallback(() => {
    const pending = pendingSelectedDate.current;
    if (pending !== null) {
      pendingSelectedDate.current = null;
      setSelectedDate(pending);
      setSelectionVisible(true);
    }
  }, []));

  useEffect(() => {
    if (ready && profile === null) router.replace("/onboarding");
  }, [profile, ready]);

  useEffect(() => {
    const next = targetMonth === currentMonth(timeZone) ? today(timeZone) : `${targetMonth}-01`;
    activeMonthCoordinator.setMonth(targetMonth);
    pendingSelectedDate.current = null;
    setSelectedDate(next);
    setSelectionVisible(false);
    setVisibleMonth(targetMonth);
    settledMonth.current = targetMonth;
    setMonthAnchor(targetMonth);
  }, [activeMonthCoordinator, profileReady, targetMonth, timeZone]);

  useEffect(() => {
    if (preferences.viewMode !== "MONTH") {
      setPlannerMode(false);
      setStampTool(null);
    }
  }, [preferences.viewMode]);

  useEffect(() => {
    if (isFocused) return;
    setPlannerMode(false);
    setStampTool(null);
    setQuickPopup(null);
    setPlannerError(null);
  }, [isFocused]);

  useEffect(() => () => {
    if (undoTimer.current !== null) clearTimeout(undoTimer.current);
  }, []);

  const showUndoNotice = useCallback((entry: ShiftEntry, label: string) => {
    if (undoTimer.current !== null) clearTimeout(undoTimer.current);
    setUndoNotice({
      entry,
      message: `${label} am ${formatDateTitle(entry.date)} eingetragen`,
    });
    undoTimer.current = setTimeout(() => {
      setUndoNotice(null);
      undoTimer.current = null;
    }, 5000);
  }, []);

  const visibleEntries = useMemo(
    () => entries
      .filter((entry) => entry.deletedAt === null)
      .filter((entry) => entry.kind === "SHIFT" ? preferences.showShifts : preferences.showAppointments),
    [entries, preferences.showAppointments, preferences.showShifts],
  );
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of visibleEntries) {
      const values = map.get(entry.date) ?? [];
      values.push(entry);
      map.set(entry.date, values);
    }
    return map;
  }, [visibleEntries]);
  const quickActions = useMemo(
    () => buildQuickEntryActions(templates),
    [templates],
  );
  const quickPopupHolidayName = useMemo(() => {
    if (profile === null || quickPopup === null) return undefined;
    return holidayMapForMonth(
      quickPopup.date.slice(0, 7),
      profile.federalState,
    ).get(quickPopup.date)?.name;
  }, [profile, quickPopup]);
  const summary = useMemo(() => {
    if (!profile) return null;
    const monthShifts = entries.filter(
      (entry): entry is ShiftEntry =>
        entry.kind === "SHIFT" &&
        entry.deletedAt === null &&
        entry.date.startsWith(`${visibleMonth}-`),
    );
    return calculateMonthlySummary(
      visibleMonth,
      monthShifts,
      profile,
    );
  }, [entries, profile, visibleMonth]);

  const saveStampAction = useCallback(async (
    action: QuickEntryStampAction,
    date: string,
  ) => {
    if (savingDates.current.has(date)) return;
    savingDates.current.add(date);
    setPlannerBusy(true);
    setPlannerError(null);
    try {
      const saved = await saveQuickEntryAction(action, date, upsertShift);
      showUndoNotice(saved, action.label);
      if (process.env.EXPO_OS === "ios") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (saveError) {
      setPlannerError(saveError instanceof Error ? saveError.message : "Eintrag konnte nicht gespeichert werden.");
    } finally {
      savingDates.current.delete(date);
      setPlannerBusy(savingDates.current.size > 0);
    }
  }, [showUndoNotice, upsertShift]);

  const undoLastStamp = useCallback(async () => {
    if (undoNotice === null) return;
    const entry = undoNotice.entry;
    if (undoTimer.current !== null) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndoNotice(null);
    try {
      await removeEntry(entry);
      if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
    } catch (removeError) {
      setPlannerError(removeError instanceof Error ? removeError.message : "Eintrag konnte nicht entfernt werden.");
    }
  }, [removeEntry, undoNotice]);

  const stampDate = useCallback(async (date: string) => {
    if (stampTool === null) return;
    await saveStampAction(stampTool, date);
  }, [saveStampAction, stampTool]);

  const selectDate = useCallback((date: string, anchor: CalendarAnchorRect) => {
    const action = calendarDayPressAction(plannerMode, stampTool !== null);
    if (action === "STAMP") {
      setSelectedDate(date);
      setSelectionVisible(true);
      void stampDate(date);
      return;
    }
    if (action === "AWAIT_TOOL") {
      setSelectedDate(date);
      setSelectionVisible(true);
      if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
      return;
    }
    setSelectedDate(date);
    setSelectionVisible(true);
    setQuickPopup({ date, anchor });
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
  }, [plannerMode, stampDate, stampTool]);

  const scrollToMonth = useCallback((month: string, animated = true): boolean => {
    const index = months.indexOf(month);
    if (index < 0) return false;
    listRef.current?.scrollToIndex({ index, animated });
    return true;
  }, [months]);

  useFocusEffect(useCallback(() => {
    const activeMonth = activeMonthCoordinator.getMonth();
    if (activeMonth === visibleMonth) return;

    setQuickPopup(null);
    setVisibleMonth(activeMonth);
    settledMonth.current = activeMonth;
    setSelectedDate((date) => clampDateToMonth(date, activeMonth));
    setSelectionVisible(false);
    const recenter = shouldRecenterMonthWindow(months, activeMonth);
    if (recenter) {
      setMonthAnchor(activeMonth);
    } else if (preferences.viewMode === "MONTH") {
      requestAnimationFrame(() => scrollToMonth(activeMonth, false));
    }
  }, [activeMonthCoordinator, months, preferences.viewMode, scrollToMonth, visibleMonth]));

  const goToToday = useCallback(() => {
    const currentDate = today(timeZone);
    const target = calendarTodayTarget(currentDate);
    setQuickPopup(null);
    setSelectedDate(target.selectedDate);
    setSelectionVisible(true);
    setVisibleMonth(target.visibleMonth);
    activeMonthCoordinator.setMonth(target.visibleMonth);
    settledMonth.current = target.visibleMonth;
    const recenter = shouldRecenterMonthWindow(months, target.visibleMonth);
    if (recenter) setMonthAnchor(target.visibleMonth);
    preferences.setViewMode(target.viewMode);
    if (!recenter) scrollToMonth(target.visibleMonth);
  }, [activeMonthCoordinator, months, preferences, scrollToMonth, timeZone]);

  useEffect(() => {
    let currentNavigation = navigation.getParent();
    let tabNavigation: BottomTabNavigationProp<ParamListBase> | undefined;

    while (currentNavigation) {
      if (currentNavigation.getState()?.type === "tab") {
        tabNavigation = currentNavigation as unknown as BottomTabNavigationProp<ParamListBase>;
        break;
      }
      currentNavigation = currentNavigation.getParent();
    }

    if (!tabNavigation) return;

    return tabNavigation.addListener("tabPress", () => {
      if (calendarTabShouldOpenToday(isFocused)) {
        requestAnimationFrame(goToToday);
      }
    });
  }, [goToToday, isFocused, navigation]);

  const openMonth = useCallback((month: string) => {
    setQuickPopup(null);
    setSelectedDate((date) => clampDateToMonth(date, month));
    setSelectionVisible(false);
    setVisibleMonth(month);
    activeMonthCoordinator.setMonth(month);
    settledMonth.current = month;
    const recenter = shouldRecenterMonthWindow(months, month);
    if (recenter) setMonthAnchor(month);
    preferences.setViewMode("MONTH");
    if (!recenter) requestAnimationFrame(() => scrollToMonth(month, false));
  }, [activeMonthCoordinator, months, preferences, scrollToMonth]);

  const openYear = useCallback(() => {
    setQuickPopup(null);
    setPlannerMode(false);
    setStampTool(null);
    preferences.setViewMode("YEAR");
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
  }, [preferences]);

  const measurePager = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== pageHeight) setPageHeight(nextHeight);
  }, [pageHeight]);

  const trackPaging = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const month = monthAtPagerOffset(
      months,
      pageHeight,
      event.nativeEvent.contentOffset.y,
    );
    if (!month || month === visibleMonth) return;
    setQuickPopup(null);
    setVisibleMonth(month);
    activeMonthCoordinator.setMonth(month);
    setSelectedDate((date) => clampDateToMonth(date, month));
    setSelectionVisible(false);
  }, [activeMonthCoordinator, months, pageHeight, visibleMonth]);

  const finishPaging = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const month = monthAtPagerOffset(
      months,
      pageHeight,
      event.nativeEvent.contentOffset.y,
    );
    if (!month) return;
    const didChangeMonth = settledMonth.current !== month;
    settledMonth.current = month;
    setQuickPopup(null);
    setVisibleMonth(month);
    activeMonthCoordinator.setMonth(month);
    setSelectedDate((date) => clampDateToMonth(date, month));
    setSelectionVisible(false);
    if (shouldRecenterMonthWindow(months, month)) setMonthAnchor(month);
    if (didChangeMonth && process.env.EXPO_OS === "ios") {
      void Haptics.selectionAsync();
    }
  }, [activeMonthCoordinator, months, pageHeight]);

  const beginPlanning = useCallback(() => {
    setQuickPopup(null);
    setPlannerError(null);
    setPlannerMode(true);
    setStampTool(null);
    if (process.env.EXPO_OS === "ios") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const closePlanning = useCallback(() => {
    setPlannerMode(false);
    setStampTool(null);
    setPlannerError(null);
  }, []);

  const closeQuickPopup = useCallback(() => {
    setQuickPopup(null);
  }, []);

  const openQuickEditor = useCallback((action: QuickEntryAction, date: string) => {
    const target = quickEntryEditorTarget(action, date);
    if (target === null) return;
    pendingSelectedDate.current = target.date;
    setQuickPopup(null);
    setPlannerMode(false);
    setStampTool(null);
    router.push(dayEditorRoute(target.date, target.mode));
  }, []);

  const openEntry = useCallback((entry: CalendarEntry) => {
    pendingSelectedDate.current = entry.date;
    setQuickPopup(null);
    router.push(dayEditorRoute(
      entry.date,
      entry.kind === "APPOINTMENT" ? "APPOINTMENT" : "SHIFT",
      entry.id,
    ));
  }, []);

  const openDayDetails = useCallback((date: string) => {
    pendingSelectedDate.current = date;
    setQuickPopup(null);
    router.push(dayDetailsRoute(date));
  }, []);

  const selectPlannerAction = useCallback((action: QuickEntryAction) => {
    if (isQuickEntryStampAction(action)) {
      setStampTool(action);
      if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
      return;
    }
    openQuickEditor(action, selectedDate);
  }, [openQuickEditor, selectedDate]);

  const selectPopupAction = useCallback((action: QuickEntryAction, date: string) => {
    if (isQuickEntryStampAction(action)) {
      setQuickPopup(null);
      void saveStampAction(action, date);
      return;
    }
    openQuickEditor(action, date);
  }, [openQuickEditor, saveStampAction]);

  const activeKey = stampTool?.key ?? null;
  const floatingActionBottom = process.env.EXPO_OS === "web"
    ? 18
    : Math.max(insets.bottom + 58, 78);
  const calendarBottomReserve = calculateCalendarBottomReserve(
    floatingActionBottom,
  );
  const visibleMonthIndex = months.indexOf(visibleMonth);
  const openAnalysis = useCallback(
    () => router.push({ pathname: "/analysis", params: { month: visibleMonth } }),
    [visibleMonth],
  );
  const moveYear = useCallback((amount: number) => {
    const nextMonth = addMonths(visibleMonth, amount * 12);
    setVisibleMonth(nextMonth);
    activeMonthCoordinator.setMonth(nextMonth);
    settledMonth.current = nextMonth;
    setSelectedDate((date) => clampDateToMonth(date, nextMonth));
    setSelectionVisible(false);
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
  }, [activeMonthCoordinator, visibleMonth]);
  const renderMonth = useCallback(({ item }: ListRenderItemInfo<string>) => (
    profile ? (
      <MonthCard
        bottomReserve={calendarBottomReserve}
        entriesByDate={entriesByDate}
        month={item}
        onSelectDate={selectDate}
        pageHeight={pageHeight}
        profile={profile}
        selectedDate={selectionVisible ? selectedDate : null}
        showHolidays={preferences.showHolidays}
        stampMode={plannerMode}
        testData={testMonths.includes(item)}
      />
    ) : null
  ), [
    calendarBottomReserve,
    entriesByDate,
    pageHeight,
    plannerMode,
    preferences.showHolidays,
    profile,
    selectDate,
    selectedDate,
    selectionVisible,
    testMonths,
  ]);

  if (!ready || profile === null || summary === null) return <LoadingView />;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <CalendarHeader
        actualMinutes={summary.actualMinutes}
        month={visibleMonth}
        onOpenAnalysis={openAnalysis}
        onOpenYear={openYear}
        targetMinutes={summary.targetMinutes}
        viewMode={preferences.viewMode}
      />
      {error || plannerError ? (
        <View style={{ backgroundColor: palette.danger, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text accessibilityRole="alert" style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>
            {plannerError ?? error}
          </Text>
        </View>
      ) : null}
      {preferences.viewMode === "MONTH" ? (
        <Animated.View entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)} onLayout={measurePager} style={{ flex: 1 }}>
          {pageHeight > 0 ? (
            <FlatList
              ref={listRef}
              contentInsetAdjustmentBehavior="never"
              data={months}
              decelerationRate="fast"
              disableIntervalMomentum
              getItemLayout={(_, index) => ({ index, length: pageHeight, offset: pageHeight * index })}
              initialScrollIndex={visibleMonthIndex >= 0 ? visibleMonthIndex : MONTHS_BEFORE}
              initialNumToRender={1}
              key={`month-pager-${pageHeight}-${monthAnchor}`}
              keyExtractor={(month) => month}
              maxToRenderPerBatch={2}
              onMomentumScrollEnd={finishPaging}
              onScroll={trackPaging}
              onScrollToIndexFailed={({ index }) => {
                setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 60);
              }}
              pagingEnabled
              removeClippedSubviews={process.env.EXPO_OS !== "web"}
              renderItem={renderMonth}
              showsVerticalScrollIndicator={false}
              snapToAlignment="start"
              snapToInterval={pageHeight}
              scrollEventThrottle={16}
              updateCellsBatchingPeriod={24}
              windowSize={3}
            />
          ) : null}
          {!isFocused ? null : !plannerMode ? (
            <>
              <Pressable
                accessibilityLabel="Schnelleintrag öffnen"
                accessibilityRole="button"
                onPress={beginPlanning}
                style={({ pressed }) => ({
                  position: "absolute",
                  right: 18,
                  bottom: floatingActionBottom,
                  width: 54,
                  height: 54,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 27,
                  backgroundColor: palette.primary,
                  boxShadow: `0 6px 18px ${palette.shadow}`,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <Ionicons color={palette.onPrimary} name="pencil" size={22} />
              </Pressable>
            </>
          ) : (
            <QuickPlannerDock
              actions={quickActions}
              activeKey={activeKey}
              busy={plannerBusy}
              onClose={closePlanning}
              onSelectAction={selectPlannerAction}
            />
          )}
        </Animated.View>
      ) : (
        <Animated.View entering={ZoomIn.duration(240).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)} style={{ flex: 1 }}>
          <YearOverview
            entries={visibleEntries}
            onMoveYear={moveYear}
            onSelectMonth={openMonth}
            profile={profile}
            selectedMonth={visibleMonth}
            year={Number(visibleMonth.slice(0, 4))}
          />
        </Animated.View>
      )}
      {isFocused && undoNotice ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          entering={FadeInUp.duration(180).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
          style={{
            position: "absolute",
            right: 16,
            bottom: plannerMode ? Math.max(insets.bottom + 86, 106) : floatingActionBottom + 64,
            left: 16,
            minHeight: 52,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 17,
            borderCurve: "continuous",
            backgroundColor: palette.surfaceRaised,
            boxShadow: `0 8px 24px ${palette.shadow}`,
            paddingLeft: 15,
            paddingRight: 6,
            zIndex: 220,
            elevation: 26,
          }}
        >
          <Text numberOfLines={2} style={{ flex: 1, color: palette.text, fontSize: 12, fontWeight: "700", lineHeight: 17 }}>
            {undoNotice.message}
          </Text>
          <Pressable
            accessibilityLabel="Letzten Schnelleintrag rückgängig machen"
            accessibilityRole="button"
            onPress={() => void undoLastStamp()}
            style={({ pressed }) => ({
              minWidth: 92,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 13,
              backgroundColor: pressed ? palette.primarySoft : "transparent",
              opacity: pressed ? 0.72 : 1,
              paddingHorizontal: 10,
            })}
          >
            <Text style={{ color: palette.primary, fontSize: 12, fontWeight: "900" }}>
              Rückgängig
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
      {isFocused && quickPopup ? (
        <QuickEntryPopup
          actions={quickActions}
          anchor={quickPopup.anchor}
          busy={plannerBusy}
          date={quickPopup.date}
          entries={entriesByDate.get(quickPopup.date) ?? []}
          holidayName={quickPopupHolidayName}
          onClose={closeQuickPopup}
          onOpenEntry={openEntry}
          onOpenDetails={openDayDetails}
          onSelectAction={selectPopupAction}
        />
      ) : null}
    </View>
  );
}
