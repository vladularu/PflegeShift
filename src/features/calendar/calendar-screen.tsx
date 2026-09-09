import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, View, type LayoutChangeEvent } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";

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
import { addMonths, currentMonth, today } from "@/engine/calendar";
import { calendarPerformance } from "@/application/calendar-performance";
import { useCalendarPerformance, useMeasuredCalendarEntries } from "./use-calendar-performance";
import { CalendarHeader } from "@/features/calendar/calendar-header";
import { SharedCalendarScene, SharedCalendarMonth } from "./calendar-shared-scene";
import { CalendarStablePager } from "./calendar-stable-pager";
import { useCalendarController } from "./use-calendar-controller";
import { calendarDayPressAction } from "@/features/calendar/calendar-display";
import * as CalendarHolidays from "@/features/calendar/calendar-holidays";
import type { CalendarAnchorRect } from "@/features/calendar/calendar-layout";
import { clampDateToMonth } from "@/features/calendar/calendar-metrics";
import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
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
import { useCalendarTodayScroll } from "@/features/calendar/use-calendar-today-scroll";
import { useCalendarPaging } from "@/features/calendar/use-calendar-paging";
import { useOpenShiftSelection } from "@/features/calendar/use-open-shift-selection";
import { useQuickStampAction } from "@/features/calendar/use-quick-stamp-action";
import { dayDetailsRoute, dayEditorRoute, quickAddRoute } from "@/navigation/routes";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { useActiveMonthCoordinator } from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
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
  const visibleYear = visibleMonth.slice(0, 4);
  const dataMonths = useMemo(() => {
    const january = `${visibleYear}-01`;
    return Array.from({ length: 14 }, (_, index) => addMonths(january, index - 1));
  }, [visibleYear]);
  useCalendarPerformance(isFocused, visibleMonth, preferences.viewMode);
  const [pageHeight, setPageHeight] = useState(0);
  const [pagerResetRevision, setPagerResetRevision] = useState(0);
  const controller = useCalendarController({
    month: visibleMonth,
    mode: preferences.viewMode,
    active: isFocused,
    ready: pageHeight > 0,
    revision: pagerResetRevision,
  });
  const isTransitionInFlight = controller.isTransitionInFlight;
  const tryBeginTransition = controller.tryBeginTransition;
  const monthSelectionPending = useRef(false);
  const calendarReady =
    (calendarRange === null && ready) ||
    (preferences.viewMode === "MONTH"
      ? calendarRangeCoversMonth(calendarRange ?? null, visibleMonth)
      : calendarRangeCoversYear(calendarRange ?? null, Number(visibleMonth.slice(0, 4))));
  const [headerDirection, setHeaderDirection] = useState<"NEXT" | "PREVIOUS">("NEXT");
  const [headerTransition, setHeaderTransition] = useState<"SPATIAL" | "CROSSFADE">("SPATIAL");
  const [plannerMode, setPlannerMode] = useState(false);
  const plannerTransition = useSharedValue(0);
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [stampTool, setStampTool] = useState<QuickEntryStampAction | null>(null);
  const [quickPopup, setQuickPopup] = useState<QuickPopupState | null>(null);
  const pendingSelectedDate = useRef<string | null>(null);
  const settledMonth = useRef(targetMonth);

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

  const entryIndex = useMeasuredCalendarEntries(
    entries,
    dataMonths,
    preferences.showAppointments,
    preferences.showShifts,
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
      if (!calendarReady || error) return;
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
    [calendarReady, error, plannerMode, stampDate, stampTool],
  );

  const scrollToMonth = useCallback((month: string): boolean => {
    setVisibleMonth(month);
    return true;
  }, []);

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
        scrollToMonth(activeMonth);
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
    calendarPerformance.begin("request-today");
    monthSelectionPending.current = true;
    setQuickPopup(null);
    setPlannerMode(false);
    setStampTool(null);
    setPlannerError(null);
  }, []);

  const { finishTodayScrollAtMonth, todayScrollActive } = useCalendarTodayScroll({
    activeMonthCoordinator,
    pagerReady: profile !== null && pageHeight > 0,
    isFocused,
    months,
    pageHeight,
    // Match the accepted prototype: Today goes straight to its destination,
    // without mounting/scrolling intermediate months during the year zoom.
    reduceMotion: true,
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
      calendarPerformance.begin("request-month", month);
      if (!tryBeginTransition()) return;
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
      // Invalidate an older gesture; the three native page slots are retained.
      if (month !== visibleMonth) setPagerResetRevision((revision) => revision + 1);
      preferences.setViewMode("MONTH");
    },
    [activeMonthCoordinator, months, preferences, tryBeginTransition, visibleMonth],
  );

  const openYear = useCallback(() => {
    calendarPerformance.begin("request-year", visibleMonth);
    if (!tryBeginTransition()) return;
    if (controller.displayMonth !== visibleMonth) {
      setVisibleMonth(controller.displayMonth);
      activeMonthCoordinator.setMonth(controller.displayMonth);
      settledMonth.current = controller.displayMonth;
      setPagerResetRevision((revision) => revision + 1);
    }
    setQuickPopup(null);
    setSelectionVisible(false);
    setPlannerMode(false);
    setStampTool(null);
    setHeaderTransition("CROSSFADE");
    preferences.setViewMode("YEAR");
    selectionFeedback();
  }, [
    activeMonthCoordinator,
    controller.displayMonth,
    preferences,
    tryBeginTransition,
    visibleMonth,
  ]);

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
      calendarPerformance.record("pager-layout", { height: nextHeight });
      if (nextHeight > 0 && nextHeight !== pageHeight) setPageHeight(nextHeight);
    },
    [pageHeight],
  );

  const clearPopup = useCallback(() => setQuickPopup(null), []);
  const { finishPaging } = useCalendarPaging({
    months,
    pageHeight,
    visibleMonth,
    viewMode: preferences.viewMode,
    isTransitionInFlight,
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
  const moveYear = useCallback(
    (amount: number) => {
      calendarPerformance.begin("request-year-step", addMonths(visibleMonth, amount * 12));
      if (isTransitionInFlight()) return;
      const nextMonth = addMonths(visibleMonth, amount * 12);
      setQuickPopup(null);
      setHeaderDirection(amount >= 0 ? "NEXT" : "PREVIOUS");
      setHeaderTransition("SPATIAL");
      setVisibleMonth(nextMonth);
      setMonthAnchor(nextMonth);
      activeMonthCoordinator.setMonth(nextMonth);
      settledMonth.current = nextMonth;
      setSelectedDate((date) => clampDateToMonth(date, nextMonth));
      setSelectionVisible(false);
      selectionFeedback();
    },
    [activeMonthCoordinator, isTransitionInFlight, visibleMonth],
  );
  const renderMonth = useCallback(
    (item: string) =>
      profile ? (
        <SharedCalendarMonth
          accessibilityVisible={isFocused && item === visibleMonth}
          entriesByDate={entriesByDate}
          display={preferences}
          month={item}
          onSelectDate={selectDate}
          pageHeight={pageHeight}
          profile={profile}
          ruleResolver={ruleResolver}
          selectedDate={selectionVisible ? selectedDate : null}
          showHolidays={preferences.showHolidays}
          testData={testMonths.includes(item)}
          stampMode={plannerMode}
          stampToolLabel={stampTool?.label ?? null}
        />
      ) : null,
    [
      entriesByDate,
      isFocused,
      pageHeight,
      preferences,
      plannerMode,
      stampTool,
      profile,
      ruleResolver,
      selectDate,
      selectedDate,
      selectionVisible,
      testMonths,
      visibleMonth,
    ],
  );

  if (ready && error) return <LoadFailureView message={error} onRetry={() => void reload()} />;
  if (profile === null) return <LoadingView />;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <CalendarHeader
        synchronized
        notice={
          !calendarReady
            ? "Kalenderdaten werden geladen …"
            : visibleHolidayResolution.status !== "AVAILABLE"
              ? "Feiertagsregeln für diesen Zeitraum noch nicht verfügbar."
              : undefined
        }
        direction={headerDirection}
        month={controller.displayMonth}
        onMoveYear={moveYear}
        onOpenDisplay={openCalendarDisplay}
        onOpenYear={openYear}
        plannerActive={plannerMode}
        plannerTransition={plannerTransition}
        referenceMonth={currentMonth(timeZone)}
        transition={headerTransition}
        viewMode={controller.mode}
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
      <SharedCalendarScene
        controller={controller}
        month={visibleMonth}
        viewMode={preferences.viewMode}
        active={isFocused}
        bottomReserve={calendarBottomReserve}
        onSelectMonth={openMonth}
      >
        <View style={{ flex: 1 }} testID="calendar-month-scene">
          <Animated.View
            onLayout={measurePager}
            testID="calendar-month-pager-shell"
            style={{ flex: 1 }}
          >
            {pageHeight > 0 ? (
              <CalendarStablePager
                onVisibleMonth={controller.previewMonth}
                month={visibleMonth}
                months={months}
                height={pageHeight}
                revision={pagerResetRevision}
                enabled={preferences.viewMode === "MONTH" && !todayScrollActive}
                onSettled={finishPaging}
                onBeginDrag={() => {
                  calendarPerformance.begin("scroll-begin", visibleMonth);
                  if (!isTransitionInFlight()) monthSelectionPending.current = false;
                }}
                renderMonth={renderMonth}
              />
            ) : null}
          </Animated.View>
          {!isFocused || quickPopup !== null || preferences.viewMode !== "MONTH" ? null : (
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
        </View>
      </SharedCalendarScene>
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
