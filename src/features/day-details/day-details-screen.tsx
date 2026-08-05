import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { SHIFT_TYPE_LABELS, type CalendarEntry } from "@/domain/types";
import { formatDateTitle, today } from "@/engine/calendar";
import { compareCalendarEntries } from "@/engine/calendar-entry-order";
import { getPublicHolidays } from "@/engine/holidays";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { calculateDailySummary } from "@/features/calendar/calendar-metrics";
import { dayEditorRoute, quickAddRoute } from "@/navigation/routes";
import { parseLocalDateRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import {
  CardSeparator,
  ColorBadge,
  EmptyState,
  MetricCard,
  RowButton,
  SectionHeader,
  SurfaceCard,
} from "@/ui/design-system";
import { PrimaryButton } from "@/ui/form-controls";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";

function timeLabel(entry: CalendarEntry): string {
  if (entry.kind === "APPOINTMENT") {
    return entry.allDay ? "Ganztägig" : `${entry.startTime}–${entry.endTime}`;
  }
  if (entry.startTime === null) return SHIFT_TYPE_LABELS[entry.type];
  return `${entry.startTime}–${entry.endTime} · ${entry.breakMinutes} Min. Pause`;
}

export function DayDetailsScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: RouteParam }>();
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const { error, ready, reload } = usePflegeShiftStatus();
  const parsedDate = parseLocalDateRouteParam(params.date);
  const date = parsedDate.status === "valid" ? parsedDate.value : today();
  const dayEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.deletedAt === null && entry.date === date)
        .sort(compareCalendarEntries),
    [date, entries],
  );
  const summary = useMemo(
    () => (profile ? calculateDailySummary(date, dayEntries, profile) : null),
    [date, dayEntries, profile],
  );
  const holiday = useMemo(
    () =>
      profile
        ? getPublicHolidays(Number(date.slice(0, 4)), profile.federalState).find(
            (item) => item.date === date,
          )
        : null,
    [date, profile],
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{
        gap: 16,
        padding: 16,
        paddingBottom: Math.max(insets.bottom, 20) + 28,
      }}
    >
      <Stack.Screen options={{ title: formatDateTitle(date) }} />
      {holiday ? (
        <SurfaceCard style={{ padding: 14, backgroundColor: palette.primarySoft }}>
          <Text style={{ color: palette.primary, fontSize: 13, fontWeight: "800" }}>
            {holiday.name}
          </Text>
        </SurfaceCard>
      ) : null}
      {summary ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
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
      <View style={{ gap: 10 }}>
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
      <PrimaryButton onPress={() => router.push(quickAddRoute(date))}>
        Eintrag hinzufügen
      </PrimaryButton>
    </ScrollView>
  );
}
