import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  router,
  Stack,
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import type { BottomTabNavigationProp } from "expo-router/js-tabs";
import type { ParamListBase } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  FlatList,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, { FadeInDown, FadeOut, ReduceMotion, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTemplates,
  usePflegeShiftTestData,
} from "@/application/pflegeshift-provider";
import { type CalendarEntry } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { addMonths, currentMonth, today } from "@/engine/calendar";
import { holidayMapForMonth } from "@/engine/holidays";
import { CalendarHeader } from "@/features/calendar/calendar-header";
import { calendarDayPressAction } from "@/features/calendar/calendar-display";
import { buildCalendarEntryIndex } from "@/features/calendar/calendar-entry-index";
import {
  calculateCalendarBottomLayout,
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
  matchingQuickEntries,
  quickEntryEditorTarget,
  saveQuickEntryAction,
  type QuickEntryAction,
  type QuickEntryStampAction,
} from "@/features/calendar/quick-entry-actions";
import { QuickPlannerDock } from "@/features/calendar/quick-planner-dock";
import { QuickEntryPopup } from "@/features/calendar/quick-entry-popup";
import {
  announceStampResult,
  stampToolSelectedAnnouncement,
} from "@/features/calendar/stamp-accessibility";
import { YearOverview } from "@/features/calendar/year-overview";
import { dayDetailsRoute, dayEditorRoute } from "@/navigation/routes";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { calendarTabShouldOpenToday, useActiveMonthCoordinator } from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { InlineNotice } from "@/ui/design-system";
import { PrimaryButton } from "@/ui/form-controls";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";

const MONTHS_BEFORE = 24;
const MONTHS_AFTER = 36;

interface QuickPopupState {
  readonly date: string;
  readonly anchor: CalendarAnchorRect;
  readonly accessibilityTarget?: number | null;
}

export function CalendarScreen() {
  const palette = usePalette();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const preferences = useCalendarPreferences();
  const activeMonthCoordinator = useActiveMonthCoordinator();
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { ready, error, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { templates } = usePflegeShiftTemplates();
  const { entries, removeEntry, upsertShift } = usePflegeShiftEntries();
  const { testMonths } = usePflegeShiftTestData();
  const profileReady = profile !== null;
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
  const [pageHeight, setPageHeight] = useState(0);
  const [plannerMode, setPlannerMode] = useState(false);
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [stampTool, setStampTool] = useState<QuickEntryStampAction | null>(null);
  const [quickPopup, setQuickPopup] = useState<QuickPopupState | null>(null);
  const savingDates = useRef(new Set<string>());
  const pendingSelectedDate = useRef<string | null>(null);
  const settledMonth = useRef(targetMonth);
  const listRef = useRef<FlatList<string>>(null);

  useFocusEffect(
    useCallback(() => {
      const pending = pendingSelectedDate.current;
      if (pending !== null) {
        pendingSelectedDate.current = null;
        setSelectedDate(pending);
        setSelectionVisible(true);
      }
    }, []),
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

  const entryIndex = useMemo(
    () =>
      buildCalendarEntryIndex(entries, {
        showAppointments: preferences.showAppointments,
        showShifts: preferences.showShifts,
      }),
    [entries, preferences.showAppointments, preferences.showShifts],
  );
  const { entriesByDate, visibleEntries } = entryIndex;
  const quickActions = useMemo(() => buildQuickEntryActions(templates), [templates]);
  const quickPopupHolidayName = useMemo(() => {
    if (profile === null || quickPopup === null) return undefined;
    return holidayMapForMonth(quickPopup.date.slice(0, 7), profile.federalState).get(
      quickPopup.date,
    )?.name;
  }, [profile, quickPopup]);

  const saveStampAction = useCallback(
    async (action: QuickEntryStampAction, date: string) => {
      if (savingDates.current.has(date)) return;
      savingDates.current.add(date);
      setPlannerBusy(true);
      setPlannerError(null);
      try {
        const matches = matchingQuickEntries(action, date, entries);
        if (matches.length > 0) {
          for (const entry of matches) await removeEntry(entry);
          announceStampResult(
            AccessibilityInfo.announceForAccessibility,
            action.label,
            date,
            matches.length,
          );
          if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
        } else {
          await saveQuickEntryAction(action, date, upsertShift);
          announceStampResult(AccessibilityInfo.announceForAccessibility, action.label, date, 0);
          if (process.env.EXPO_OS === "ios")
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (saveError) {
        setPlannerError(userFacingErrorMessage(saveError, "Eintrag konnte nicht geändert werden."));
      } finally {
        savingDates.current.delete(date);
        setPlannerBusy(savingDates.current.size > 0);
      }
    },
    [entries, removeEntry, upsertShift],
  );

  const stampDate = useCallback(
    async (date: string) => {
      if (stampTool === null) return;
      await saveStampAction(stampTool, date);
    },
    [saveStampAction, stampTool],
  );

  const selectDate = useCallback(
    (date: string, anchor: CalendarAnchorRect, accessibilityTarget?: number | null) => {
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
        if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
        return;
      }
      setSelectedDate(date);
      setSelectionVisible(true);
      setQuickPopup({ date, anchor, accessibilityTarget });
      if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
    },
    [plannerMode, stampDate, stampTool],
  );

  const scrollToMonth = useCallback(
    (month: string, animated = true): boolean => {
      const index = months.indexOf(month);
      if (index < 0) return false;
      listRef.current?.scrollToIndex({ index, animated });
      return true;
    },
    [months],
  );

  useFocusEffect(
    useCallback(() => {
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
    }, [activeMonthCoordinator, months, preferences.viewMode, scrollToMonth, visibleMonth]),
  );

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

  const openMonth = useCallback(
    (month: string) => {
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
    },
    [activeMonthCoordinator, months, preferences, scrollToMonth],
  );

  const openYear = useCallback(() => {
    setQuickPopup(null);
    setPlannerMode(false);
    setStampTool(null);
    preferences.setViewMode("YEAR");
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
  }, [preferences]);

  const measurePager = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.round(event.nativeEvent.layout.height);
      if (nextHeight > 0 && nextHeight !== pageHeight) setPageHeight(nextHeight);
    },
    [pageHeight],
  );

  const trackPaging = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const month = monthAtPagerOffset(months, pageHeight, event.nativeEvent.contentOffset.y);
      if (!month || month === visibleMonth) return;
      setQuickPopup(null);
      setVisibleMonth(month);
      activeMonthCoordinator.setMonth(month);
      setSelectedDate((date) => clampDateToMonth(date, month));
      setSelectionVisible(false);
    },
    [activeMonthCoordinator, months, pageHeight, visibleMonth],
  );

  const finishPaging = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const month = monthAtPagerOffset(months, pageHeight, event.nativeEvent.contentOffset.y);
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
    },
    [activeMonthCoordinator, months, pageHeight],
  );

  const beginPlanning = useCallback(() => {
    setQuickPopup(null);
    setPlannerError(null);
    setPlannerMode(true);
    setStampTool(null);
    AccessibilityInfo.announceForAccessibility(
      "Planungsmodus geöffnet. Wähle unten eine Vorlage aus.",
    );
    if (process.env.EXPO_OS === "ios") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const closePlanning = useCallback(() => {
    setPlannerMode(false);
    setStampTool(null);
    setPlannerError(null);
    AccessibilityInfo.announceForAccessibility("Planungsmodus beendet.");
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
    router.push(
      dayEditorRoute(entry.date, entry.kind === "APPOINTMENT" ? "APPOINTMENT" : "SHIFT", entry.id),
    );
  }, []);

  const openDayDetails = useCallback((date: string) => {
    pendingSelectedDate.current = date;
    setQuickPopup(null);
    router.push(dayDetailsRoute(date));
  }, []);

  const selectPlannerAction = useCallback(
    (action: QuickEntryAction) => {
      if (isQuickEntryStampAction(action)) {
        setStampTool(action);
        AccessibilityInfo.announceForAccessibility(stampToolSelectedAnnouncement(action.label));
        if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
        return;
      }
      openQuickEditor(action, selectedDate);
    },
    [openQuickEditor, selectedDate],
  );

  const selectPopupAction = useCallback(
    (action: QuickEntryAction, date: string) => {
      if (isQuickEntryStampAction(action)) {
        setQuickPopup(null);
        void saveStampAction(action, date);
        return;
      }
      openQuickEditor(action, date);
    },
    [openQuickEditor, saveStampAction],
  );

  const activeKey = stampTool?.key ?? null;
  const { floatingActionBottom, bottomReserve: calendarBottomReserve } =
    calculateCalendarBottomLayout(insets.bottom);
  const visibleMonthIndex = months.indexOf(visibleMonth);
  const moveYear = useCallback(
    (amount: number) => {
      const nextMonth = addMonths(visibleMonth, amount * 12);
      setVisibleMonth(nextMonth);
      activeMonthCoordinator.setMonth(nextMonth);
      settledMonth.current = nextMonth;
      setSelectedDate((date) => clampDateToMonth(date, nextMonth));
      setSelectionVisible(false);
      if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
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
          selectedDate={selectionVisible ? selectedDate : null}
          showShiftDuration={preferences.showShiftDuration}
          showHolidays={preferences.showHolidays}
          showShiftTimes={preferences.showShiftTimes}
          stampMode={plannerMode}
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
      selectDate,
      selectedDate,
      selectionVisible,
      stampTool,
      testMonths,
      visibleMonth,
    ],
  );

  if (ready && error) return <LoadFailureView message={error} onRetry={() => void reload()} />;
  if (!ready || profile === null) return <LoadingView />;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <CalendarHeader month={visibleMonth} onOpenYear={openYear} viewMode={preferences.viewMode} />
      {plannerError ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <InlineNotice message={plannerError} tone="error" />
        </View>
      ) : null}
      {preferences.error ? (
        <View style={{ gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
          <InlineNotice message={preferences.error} tone="error" />
          <PrimaryButton disabled={preferences.saving} onPress={preferences.retry}>
            Speichern erneut versuchen
          </PrimaryButton>
        </View>
      ) : null}
      {preferences.viewMode === "MONTH" ? (
        <Animated.View
          entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
          onLayout={measurePager}
          style={{ flex: 1 }}
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
                accessibilityLabel="Dienstplan bearbeiten"
                accessibilityRole="button"
                onPress={beginPlanning}
                style={({ pressed }) => ({
                  position: "absolute",
                  right: 18,
                  bottom: floatingActionBottom,
                  minWidth: 104,
                  height: 54,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  paddingHorizontal: 16,
                  borderRadius: 27,
                  backgroundColor: palette.primary,
                  boxShadow: `0 6px 18px ${palette.shadow}`,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <Ionicons color={palette.onPrimary} name="pencil" size={20} />
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  style={{ color: palette.onPrimary, ...TYPOGRAPHY.button }}
                >
                  Planen
                </Text>
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
        <Animated.View
          entering={ZoomIn.duration(240).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
          style={{ flex: 1 }}
        >
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
          restoreFocusTarget={quickPopup.accessibilityTarget}
        />
      ) : null}
    </View>
  );
}
