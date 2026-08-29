import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { type CalendarEntry } from "@/domain/types";
import { formatDateTitle, today } from "@/engine/calendar";
import { compareCalendarEntries } from "@/engine/calendar-entry-order";
import { expandCalendarEntries } from "@/engine/recurrence";
import { getPublicHolidays } from "@/engine/holidays";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { calculateDailySummary } from "@/features/calendar/calendar-metrics";
import { dayEditorRoute, quickAddRoute } from "@/navigation/routes";
import { parseLocalDateRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SCREEN_LAYOUT, SPACING } from "@/theme/tokens";
import {
  CardSeparator,
  ColorBadge,
  EmptyState,
  MetricCard,
  RowButton,
  SectionHeader,
  SurfaceCard,
} from "@/ui/design-system";
import { PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ScreenScrollView } from "@/ui/screen-layout";

function timeLabel(entry: CalendarEntry): string {
  if (entry.kind === "APPOINTMENT") {
    return entry.allDay ? "Ganztägig" : `${entry.startTime}–${entry.endTime}`;
  }
  if (entry.allDay || entry.startTime === null) return "Ganztägig";
  return `${entry.startTime}–${entry.endTime} · ${entry.breakMinutes} Min. Pause`;
}

export function DayDetailsScreen() {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const params = useLocalSearchParams<{ date?: RouteParam }>();
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { resolver: ruleResolver } = useRuleCatalogRuntime();
  const parsedDate = parseLocalDateRouteParam(params.date);
  const date = parsedDate.status === "valid" ? parsedDate.value : today();
  const dayEntries = useMemo(
    () => [...expandCalendarEntries(entries, date, date)].sort(compareCalendarEntries),
    [date, entries],
  );
  const summary = useMemo(
    () => (profile ? calculateDailySummary(date, dayEntries, profile, ruleResolver) : null),
    [date, dayEntries, profile, ruleResolver],
  );
  const holiday = useMemo(
    () =>
      profile
        ? getPublicHolidays(
            Number(date.slice(0, 4)),
            profile.federalState,
            ruleResolver,
            profile.holidayRegion,
          ).find((item) => item.date === date)
        : null,
    [date, profile, ruleResolver],
  );

  if (parsedDate.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zu den Tagesdetails enthält kein gültiges Datum."
        onRetry={() => router.back()}
        title="Tagesdetails können nicht geöffnet werden"
      />
    );
  }
  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
  }
  if (!ready || profile === null) return <LoadingView />;

  return (
    <ScreenScrollView testID="day-details-screen">
      <Stack.Screen options={{ title: formatDateTitle(date) }} />
      {holiday ? (
        <SurfaceCard style={{ padding: SPACING.lg, backgroundColor: palette.primarySoft }}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.primary, ...TYPOGRAPHY.label }}
          >
            {holiday.name}
          </Text>
        </SurfaceCard>
      ) : null}
      {summary ? (
        <View
          style={{
            flexDirection:
              fontScale >= SCREEN_LAYOUT.headerAccessoryStackFontScale ? "column" : "row",
            gap: SPACING.sm,
          }}
        >
          <MetricCard compact label="Soll" value={formatMinutes(summary.targetMinutes)} />
          <MetricCard compact label="Ist" value={formatMinutes(summary.actualMinutes)} />
          <MetricCard
            compact
            label="Saldo"
            value={formatSignedMinutes(summary.balanceMinutes)}
            accent={summary.balanceMinutes < 0 ? palette.danger : palette.success}
          />
        </View>
      ) : null}
      <View style={{ gap: SPACING.md }}>
        <SectionHeader title="Einträge" caption={`${dayEntries.length} an diesem Tag`} />
        <SurfaceCard>
          {dayEntries.length === 0 ? (
            <EmptyState
              title="Noch nichts geplant"
              message="Füge einen Dienst, Termin oder eine Abwesenheit hinzu."
            />
          ) : (
            dayEntries.map((entry, index) => (
              <View key={`${entry.kind}-${entry.id}`}>
                {index > 0 ? <CardSeparator inset={70} /> : null}
                <RowButton
                  leading={
                    <ColorBadge
                      color={entry.color}
                      label={entry.kind === "SHIFT" ? entry.symbol : "T"}
                    />
                  }
                  onPress={() => router.push(dayEditorRoute(date, entry.kind, entry.id))}
                  subtitle={timeLabel(entry)}
                  title={entry.title}
                />
              </View>
            ))
          )}
        </SurfaceCard>
      </View>
      <View style={{ gap: SPACING.md }}>
        <PrimaryButton onPress={() => router.push(quickAddRoute(date))}>
          Schicht hinzufügen
        </PrimaryButton>
        <SecondaryButton onPress={() => router.push(dayEditorRoute(date, "APPOINTMENT"))}>
          Termin hinzufügen
        </SecondaryButton>
      </View>
    </ScreenScrollView>
  );
}
