import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  FlatList,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTemplates,
  usePflegeShiftTestData,
} from "@/application/pflegeshift-provider";
import {
  calendarRangeCoversMonth,
  calendarRangeCoversYear,
} from "@/application/calendar-entry-loading";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import type { CalendarEntry } from "@/domain/types";
import { addMonths, createMonthGrid, currentMonth, today } from "@/engine/calendar";
import { expandCalendarEntries } from "@/engine/recurrence";
import { CalendarHeader } from "@/features/calendar/calendar-header";
import {
  CalendarTransitionHost,
  CalendarViewTransition,
} from "@/features/calendar/calendar-view-transition";
import { calendarDayPressAction } from "@/features/calendar/calendar-display";
import { buildCalendarEntryIndex } from "@/features/calendar/calendar-entry-index";
import * as CalendarHolidays from "@/features/calendar/calendar-holidays";
import type { CalendarAnchorRect } from "@/features/calendar/calendar-layout";
import { clampDateToMonth } from "@/features/calendar/calendar-metrics";
import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { MonthCard } from "@/features/calendar/month-card";
import { createMonthWindow, shouldRecenterMonthWindow } from "@/features/calendar/month-window";
import {
  buildQuickEntryActions,
  isQuickEntryStampAction,
  quickEntryEditorTarget,
  quickEntryServiceActions,
  type QuickEntryAction,
  type QuickEntryStampAction,
} from "@/features/calendar/quick-entry-actions";
import { consumeShiftSelectionPopupRestore } from "@/features/calendar/quick-entry-navigation";
import { QuickEntryPopup } from "@/features/calendar/quick-entry-popup";
import { QuickPlannerDock } from "@/features/calendar/quick-planner-dock";
import { stampToolSelectedAnnouncement } from "@/features/calendar/stamp-accessibility";
import { YearOverview } from "@/features/calendar/year-overview";
import { useCalendarTodayScroll } from "@/features/calendar/use-calendar-today-scroll";
import { useCalendarPaging } from "@/features/calendar/use-calendar-paging";
import { useOpenShiftSelection } from "@/features/calendar/use-open-shift-selection";
import { useQuickStampAction } from "@/features/calendar/use-quick-stamp-action";
import { dayDetailsRoute, dayEditorRoute, quickAddRoute } from "@/navigation/routes";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { useActiveMonthCoordinator } from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { SCREEN_LAYOUT, SPACING } from "@/theme/tokens";
import { InlineNotice } from "@/ui/design-system";
import { PrimaryButton } from "@/ui/form-controls";
import { planningModeFeedback, selectionFeedback } from "@/ui/haptics";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { useThemeStatusBar } from "@/ui/use-theme-status-bar";

const [MONTHS_BEFORE, MONTHS_AFTER] = [24, 36] as const;

interface QuickPopupState {
  readonly date: string;
  readonly anchor: CalendarAnchorRect;
}

export function CalendarScreen() {
  const palette = usePalette();
  useThemeStatusBar();
  const isFocused = useIsFocused();
  const preferences = useCalendarPreferences();
  const { setViewMode } = preferences;
  const activeMonthCoordinator = useActiveMonthCoordinator();
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { ready, calendarRange, error, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { templates } = usePflegeShiftTemplates();
  const { entries, removeEntry, upsertShift } = usePflegeShiftEntries();
  const { testMonths } = usePflegeShiftTestData();
  const { resolver: ruleResolver } = useRuleCatalogRuntime();
  const timeZone = profile?.timeZone ?? "Europe/Berlin";
  const parsedMonth = parseMonthRouteParam(params.month);
  const routeMonth = parsedMonth.status === "valid" ? parsedMonth.value : null;
  const [initialMonth] = useState(() => routeMonth ?? activeMonthCoordinator.getMonth());
  const targetMonth = routeMonth ?? initialMonth;
  const [monthAnchor, setMonthAnchor] = useState(targetMonth);
  const months = useMemo(
    () => [...createMonthWindow(monthAnchor, MONTHS_BEFORE, MONTHS_AFTER)],
    [monthAnchor],
  );
  const initialDate =
    targetMonth === currentMonth(timeZone) ? today(timeZone) : `${targetMonth}-01`;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectionVisible, setSelectionVisible] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(targetMonth);
  const [headerMode, setHeaderMode] = useState(preferences.viewMode);
  const transitionInFlight = useRef(false);
  const monthSelectionPending = useRef(false);
  const transitionStarted = useCallback((mode: "MONTH" | "YEAR") => setHeaderMode(mode), []);
  const transitionCompleted = useCallback(() => {
    transitionInFlight.current = false;
  }, []);
  const calendarReady =
    ready ||
    (preferences.viewMode === "MONTH"
      ? calendarRangeCoversMonth(calendarRange ?? null, visibleMonth)
      : calendarRangeCoversYear(calendarRange ?? null, Number(visibleMonth.slice(0, 4))));
  const [pagerResetRevision, setPagerResetRevision] = useState(0);
  const [headerDirection, setHeaderDirection] = useState<"NEXT" | "PREVIOUS">("NEXT");
  const [headerTransition, setHeaderTransition] = useState<"SPATIAL" | "CROSSFADE">("SPATIAL");
  const [pageHeight, setPageHeight] = useState(0);
  const [plannerMode, setPlannerMode] = useState(false);
  const plannerTransition = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [stampTool, setStampTool] = useState<QuickEntryStampAction | null>(null);
  const [quickPopup, setQuickPopup] = useState<QuickPopupState | null>(null);
  const pendingSelectedDate = useRef<string | null>(null);
  const settledMonth = useRef(targetMonth);
  const listRef = useRef<FlatList<string>>(null);
  const calendarHopStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: reduceMotion ? 0 : -MOTION.distance.small * plannerTransition.value,
        },
      ],
    }),
    [reduceMotion],
  );

  useEffect(() => {
    if (ready && error === null && profile === null) router.replace("/onboarding");
  }, [error, profile, ready]);
  useEffect(() => {
    const next = targetMonth === currentMonth(timeZone) ? today(timeZone) : `${targetMonth}-01`;
    activeMonthCoordinator.setMonth(targetMonth);
    pendingSelectedDate.current = null;
    setSelectedDate(next);
    setSelectionVisible(false);
    setVisibleMonth(targetMonth);
    setQuickPopup(null);
    settledMonth.current = targetMonth;
    setMonthAnchor(targetMonth);
  }, [activeMonthCoordinator, targetMonth, timeZone]);
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
    setPlannerError(null);
  }, [isFocused]);

  const calendarEntries = useMemo(() => {
    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];
    const firstDate = createMonthGrid(firstMonth)[0].date;
    const lastGrid = createMonthGrid(lastMonth);
    const lastDate = lastGrid[lastGrid.length - 1].date;
    return expandCalendarEntries(entries, firstDate, lastDate);
  }, [entries, months]);

  const entryIndex = useMemo(
    () =>
      buildCalendarEntryIndex(calendarEntries, {
        showAppointments: preferences.showAppointments,
        showShifts: preferences.showShifts,
      }),
    [calendarEntries, preferences.showAppointments, preferences.showShifts],
  );
  const { entriesByDate } = entryIndex;
  const quickActions = useMemo(() => buildQuickEntryActions(templates), [templates]);
  const quickPlannerActions = useMemo(() => quickEntryServiceActions(quickActions), [quickActions]);
  const visibleHolidayResolution = CalendarHolidays.useCalendarHolidayResolution(
    visibleMonth,
    profile,
    ruleResolver,
    preferences.showHolidays,
  );
  const quickPopupHolidayName = useMemo(() => {
    if (profile === null || quickPopup === null) return undefined;
    return CalendarHolidays.holidayNameForDate(quickPopup.date, profile, ruleResolver);
  }, [profile, quickPopup, ruleResolver]);

  const saveStampAction = useQuickStampAction({
    entries,
    removeEntry,
    upsertShift,
    onBusyChange: setPlannerBusy,
    onError: (message) => setPlannerError(message || null),
  });

  const stampDate = useCallback(
    async (date: string) => {
      if (stampTool === null) return;
      await saveStampAction(stampTool, date);
    },
    [saveStampAction, stampTool],
  );

  const selectDate = useCallback(
    (date: string, anchor: CalendarAnchorRect) => {
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
        AccessibilityInfo.announceForAccessibility(
          "Wähle unten zuerst eine Vorlage für den Schnelleintrag aus.",
        );
        selectionFeedback();
        return;
      }
      setSelectedDate(date);
      setSelectionVisible(true);
      setQuickPopup({ date, anchor });
      selectionFeedback();
    },
    [plannerMode, stampDate, stampTool],
  );

  const scrollToMonth = useCallback(
    (month: string, animated = true): boolean => {
      const index = months.indexOf(month);
      const list = listRef.current;
      if (index < 0 || list === null) return false;
      list.scrollToIndex({ index, animated });
      return true;
    },
    [months],
  );

  useFocusEffect(
    useCallback(() => {
      const activeMonth = activeMonthCoordinator.getMonth();
      if (activeMonth === settledMonth.current) return;

      setVisibleMonth(activeMonth);
      setHeaderTransition("SPATIAL");
      setQuickPopup(null);
      settledMonth.current = activeMonth;
      setSelectedDate((date) => clampDateToMonth(date, activeMonth));
      setSelectionVisible(false);
      const recenter = shouldRecenterMonthWindow(months, activeMonth);
      if (recenter) {
        setMonthAnchor(activeMonth);
      } else if (preferences.viewMode === "MONTH") {
        requestAnimationFrame(() => scrollToMonth(activeMonth, false));
      }
    }, [activeMonthCoordinator, months, preferences.viewMode, scrollToMonth]),
  );

  useFocusEffect(
    useCallback(() => {
      const pending = pendingSelectedDate.current;
      if (pending !== null) {
        pendingSelectedDate.current = null;
        setSelectedDate(pending);
        setSelectionVisible(true);
      }
      if (!consumeShiftSelectionPopupRestore()) setQuickPopup(null);
    }, []),
  );

  const resetTodayUi = useCallback(() => {
    monthSelectionPending.current = false;
    setQuickPopup(null);
    setPlannerMode(false);
    setStampTool(null);
    setPlannerError(null);
  }, []);

  const { finishTodayScrollAtMonth, todayScrollActive } = useCalendarTodayScroll({
    activeMonthCoordinator,
    pagerReady: calendarReady && error === null,
    isFocused,
    months,
    pageHeight,
    reduceMotion,
    resetTransientUi: resetTodayUi,
    scrollToMonth,
    setHeaderDirection,
    setHeaderTransition,
    setMonthAnchor,
    setPagerResetRevision,
    setSelectedDate,
    setSelectionVisible,
    setViewMode,
    setVisibleMonth,
    settledMonthRef: settledMonth,
    timeZone,
    viewMode: preferences.viewMode,
    visibleMonth,
  });

  const openMonth = useCallback(
    (month: string) => {
      if (transitionInFlight.current) return;
      transitionInFlight.current = true;
      monthSelectionPending.current = true;
      setQuickPopup(null);
      setSelectedDate((date) => clampDateToMonth(date, month));
      setSelectionVisible(false);
      setHeaderDirection(month >= visibleMonth ? "NEXT" : "PREVIOUS");
      setHeaderTransition("CROSSFADE");
      setVisibleMonth(month);
      activeMonthCoordinator.setMonth(month);
      settledMonth.current = month;
      const recenter = shouldRecenterMonthWindow(months, month);
      if (recenter) setMonthAnchor(month);
      // Mount the hidden pager at its destination, avoiding virtualized scroll catch-up.
      setPagerResetRevision((revision) => revision + 1);
      preferences.setViewMode("MONTH");
    },
    [activeMonthCoordinator, months, preferences, visibleMonth],
  );

  const openYear = useCallback(() => {
    if (transitionInFlight.current) return;
    transitionInFlight.current = true;
    setQuickPopup(null);
    setPlannerMode(false);
    setStampTool(null);
    setHeaderTransition("CROSSFADE");
    preferences.setViewMode("YEAR");
    selectionFeedback();
  }, [preferences]);

  const openCalendarDisplay = useCallback(() => {
    setQuickPopup(null);
    setPlannerMode(false);
    setStampTool(null);
    router.push("/calendar-view");
    selectionFeedback();
  }, []);

  const measurePager = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.round(event.nativeEvent.layout.height);
      if (nextHeight > 0 && nextHeight !== pageHeight) setPageHeight(nextHeight);
    },
    [pageHeight],
  );

  const clearPopup = useCallback(() => setQuickPopup(null), []);
  const { trackPaging, finishPaging } = useCalendarPaging({
    months,
    pageHeight,
    visibleMonth,
    viewMode: preferences.viewMode,
    transitionInFlight,
    monthSelectionPending,
    settledMonthRef: settledMonth,
    activeMonthCoordinator,
    finishTodayScrollAtMonth,
    clearPopup,
    setHeaderDirection,
    setHeaderTransition,
    setVisibleMonth,
    setSelectedDate,
    setSelectionVisible,
    setMonthAnchor,
  });

  const beginPlanning = useCallback(() => {
    setQuickPopup(null);
    setPlannerError(null);
    setPlannerMode(true);
    setStampTool(null);
    AccessibilityInfo.announceForAccessibility(
      "Planungsmodus geöffnet. Wähle unten eine Vorlage aus.",
    );
    planningModeFeedback();
  }, []);

  const closePlanning = useCallback(() => {
    setPlannerMode(false);
    setStampTool(null);
    setPlannerError(null);
    AccessibilityInfo.announceForAccessibility("Planungsmodus beendet.");
  }, []);

  const openQuickEditor = useCallback((action: QuickEntryAction, date: string) => {
    pendingSelectedDate.current = date;
    setQuickPopup(null);
    setPlannerMode(false);
    setStampTool(null);
    if (action.kind === "CUSTOM_SHIFT") {
      router.push(quickAddRoute(date));
      return;
    }
    const target = quickEntryEditorTarget(action, date);
    if (target === null) return;
    router.push(dayEditorRoute(target.date, target.mode));
  }, []);

  const selectPlannerAction = useCallback(
    (action: QuickEntryAction) => {
      if (isQuickEntryStampAction(action)) {
        setStampTool(action);
        AccessibilityInfo.announceForAccessibility(stampToolSelectedAnnouncement(action.label));
        selectionFeedback();
        return;
      }
      openQuickEditor(action, selectedDate);
    },
    [openQuickEditor, selectedDate],
  );

  const closeQuickPopup = useCallback(() => setQuickPopup(null), []);
  const openShiftPicker = useOpenShiftSelection({ setPlannerMode, setStampTool });
  const openEntry = useCallback((entry: CalendarEntry) => {
    pendingSelectedDate.current = entry.date;
    setQuickPopup(null);
    router.push(dayEditorRoute(entry.date, entry.kind, entry.id));
  }, []);
  const openDayDetails = useCallback((date: string) => {
    pendingSelectedDate.current = date;
    setQuickPopup(null);
    router.push(dayDetailsRoute(date));
  }, []);
  const selectPopupAction = useCallback(
    (action: QuickEntryAction, date: string) => {
      if (isQuickEntryStampAction(action)) {
        void saveStampAction(action, date);
        return;
      }
      openQuickEditor(action, date);
    },
    [openQuickEditor, saveStampAction],
  );

  const calendarBottomReserve = process.env.EXPO_OS === "ios" ? 55 : 0;
  const visibleMonthIndex = months.indexOf(visibleMonth);
  const moveYear = useCallback(
    (amount: number) => {
      if (transitionInFlight.current) return;
      const nextMonth = addMonths(visibleMonth, amount * 12);
      setQuickPopup(null);
      setHeaderDirection(amount >= 0 ? "NEXT" : "PREVIOUS");
      setHeaderTransition("SPATIAL");
      setVisibleMonth(nextMonth);
      activeMonthCoordinator.setMonth(nextMonth);
      settledMonth.current = nextMonth;
      setSelectedDate((date) => clampDateToMonth(date, nextMonth));
      setSelectionVisible(false);
      selectionFeedback();
    },
    [activeMonthCoordinator, visibleMonth],
  );
  const renderMonth = useCallback(
    ({ item }: ListRenderItemInfo<string>) =>
      profile ? (
        <MonthCard
          accessibilityVisible={isFocused && item === visibleMonth}
          bottomReserve={calendarBottomReserve}
          entriesByDate={entriesByDate}
          labelMode={preferences.labelMode}
          month={item}
          onSelectDate={selectDate}
          pageHeight={pageHeight}
          profile={profile}
          ruleResolver={ruleResolver}
          selectedDate={selectionVisible ? selectedDate : null}
          showShiftDuration={preferences.showShiftDuration}
          showHolidays={preferences.showHolidays}
          showShiftTimes={preferences.showShiftTimes}
          stampMode={plannerMode}
          stampTransitionProgress={plannerTransition}
          stampToolLabel={stampTool?.label ?? null}
          testData={testMonths.includes(item)}
        />
      ) : null,
    [
      calendarBottomReserve,
      entriesByDate,
      isFocused,
      pageHeight,
      plannerMode,
      preferences.labelMode,
      preferences.showHolidays,
      preferences.showShiftDuration,
      preferences.showShiftTimes,
      profile,
      ruleResolver,
      plannerTransition,
      selectDate,
      selectedDate,
      selectionVisible,
      stampTool,
      testMonths,
      visibleMonth,
    ],
  );

  if (ready && error) return <LoadFailureView message={error} onRetry={() => void reload()} />;
  if (!calendarReady || profile === null) return <LoadingView />;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <CalendarHeader
        direction={headerDirection}
        month={visibleMonth}
        onMoveYear={moveYear}
        onOpenDisplay={openCalendarDisplay}
        onOpenYear={openYear}
        plannerActive={plannerMode}
        plannerTransition={plannerTransition}
        referenceMonth={currentMonth(timeZone)}
        transition={headerTransition}
        viewMode={headerMode}
      />
      {plannerError ? (
        <View
          style={{
            paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
            paddingBottom: SPACING.sm,
          }}
        >
          <InlineNotice message={plannerError} tone="error" />
        </View>
      ) : null}
      {preferences.error ? (
        <View
          style={{
            gap: SPACING.sm,
            paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
            paddingBottom: SPACING.sm,
          }}
        >
          <InlineNotice message={preferences.error} tone="error" />
          <PrimaryButton disabled={preferences.saving} onPress={preferences.retry}>
            Speichern erneut versuchen
          </PrimaryButton>
        </View>
      ) : null}
      <CalendarTransitionHost
        onTransitionStart={transitionStarted}
        onTransitionComplete={transitionCompleted}
        month={visibleMonth}
        viewMode={preferences.viewMode}
        active={isFocused}
        monthView={
          <CalendarViewTransition testID="calendar-month-scene">
            <CalendarHolidays.CalendarHolidayCoverageNotice resolution={visibleHolidayResolution} />
            <Animated.View
              onLayout={measurePager}
              testID="calendar-month-pager-shell"
              style={[{ flex: 1 }, calendarHopStyle]}
            >
              {pageHeight > 0 ? (
                <FlatList
                  ref={listRef}
                  contentInsetAdjustmentBehavior="never"
                  data={months}
                  decelerationRate="fast"
                  disableIntervalMomentum
                  getItemLayout={(_, index) => ({
                    index,
                    length: pageHeight,
                    offset: pageHeight * index,
                  })}
                  initialScrollIndex={visibleMonthIndex >= 0 ? visibleMonthIndex : MONTHS_BEFORE}
                  initialNumToRender={1}
                  key={`month-pager-${pageHeight}-${monthAnchor}-${pagerResetRevision}`}
                  keyExtractor={(month) => month}
                  maxToRenderPerBatch={2}
                  onMomentumScrollEnd={finishPaging}
                  onScrollBeginDrag={() => {
                    if (!transitionInFlight.current) monthSelectionPending.current = false;
                  }}
                  onScroll={trackPaging}
                  onScrollEndDrag={(event) => {
                    const { contentOffset, velocity } = event.nativeEvent;
                    const page = Math.round(contentOffset.y / pageHeight) * pageHeight;
                    if (velocity?.y === 0 && Math.abs(contentOffset.y - page) < 1)
                      finishPaging(event);
                  }}
                  pagingEnabled
                  removeClippedSubviews={process.env.EXPO_OS !== "web"}
                  renderItem={renderMonth}
                  scrollEnabled={!todayScrollActive}
                  showsVerticalScrollIndicator={false}
                  snapToAlignment="start"
                  snapToInterval={pageHeight}
                  scrollEventThrottle={16}
                  testID="calendar-month-pager"
                  updateCellsBatchingPeriod={24}
                  windowSize={3}
                />
              ) : null}
            </Animated.View>
            {!isFocused || quickPopup !== null ? null : (
              <QuickPlannerDock
                actions={quickPlannerActions}
                activeKey={stampTool?.key ?? null}
                busy={plannerBusy}
                onOpen={beginPlanning}
                onClose={closePlanning}
                onSelectAction={selectPlannerAction}
                open={plannerMode}
                transitionProgress={plannerTransition}
              />
            )}
          </CalendarViewTransition>
        }
        yearView={
          <CalendarViewTransition testID="calendar-year-overview-shell">
            <YearOverview
              active={preferences.viewMode === "YEAR"}
              onSelectMonth={openMonth}
              profile={profile}
              selectedMonth={visibleMonth}
              year={Number(visibleMonth.slice(0, 4))}
            />
          </CalendarViewTransition>
        }
      />
      {quickPopup ? (
        <QuickEntryPopup
          actions={quickActions}
          anchor={quickPopup.anchor}
          busy={plannerBusy}
          date={quickPopup.date}
          entries={entriesByDate.get(quickPopup.date) ?? []}
          holidayName={quickPopupHolidayName}
          onClose={closeQuickPopup}
          onOpenDetails={openDayDetails}
          onOpenEntry={openEntry}
          onOpenShiftPicker={openShiftPicker}
          onSelectAction={selectPopupAction}
        />
      ) : null}
    </View>
  );
}
