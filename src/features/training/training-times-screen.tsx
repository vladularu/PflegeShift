import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Temporal } from "@js-temporal/polyfill";
import { useTrainingData } from "@/application/training-provider";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { isCurrentShiftTraining } from "@/domain/training-data";
import { formatMonthTitle } from "@/engine/calendar";
import { useActiveMonth, useActiveMonthCoordinator } from "@/navigation/active-month";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { SecondaryButton } from "@/ui/form-controls";
import { FormSection, FormStatus } from "@/ui/form-layout";
import { LoadingView, LoadFailureView } from "@/ui/loading-view";
import { MonthNavigator } from "@/ui/month-navigator";
import { trainingTimeEntries } from "./training-times-model";
import { TrainingTimesForm, type TrainingTimesSession } from "./training-times-form";

export function TrainingTimesScreen() {
  const history = useTrainingData(),
    root = usePflegeShiftStatus(),
    { entries } = usePflegeShiftEntries(),
    { profile } = usePflegeShiftProfile();
  const month = useActiveMonth(),
    coordinator = useActiveMonthCoordinator(),
    palette = usePalette(),
    insets = useSafeAreaInsets();
  const [session, setSession] = useState<TrainingTimesSession | null>(null);
  if (session)
    return (
      <TrainingTimesForm
        session={session}
        onClose={() => {
          Keyboard.dismiss();
          setSession(null);
        }}
      />
    );
  if (root.error || history.status === "error")
    return (
      <LoadFailureView
        message={root.error ?? history.error ?? "Schul-/Pausendaten nicht verfügbar."}
        onRetry={() => {
          if (root.error) void root.reload();
          else void history.reload();
        }}
      />
    );
  if (!root.ready || history.status !== "ready") return <LoadingView />;
  if (!profile)
    return (
      <LoadFailureView
        message="Bitte zuerst ein Arbeitszeitmodell einrichten."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  function moveMonth(direction: -1 | 1) {
    coordinator.setMonth(Temporal.PlainYearMonth.from(month).add({ months: direction }).toString());
  }
  return (
    <FlatList
      testID="training-times-list"
      data={trainingTimeEntries(entries, month)}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{
        padding: SPACING.lg,
        paddingBottom: Math.max(insets.bottom, SPACING.xl),
        gap: SPACING.md,
      }}
      ListHeaderComponent={
        <FormSection
          title="Schulzeiten & Pausen"
          caption="Wähle einen Eintrag mit Uhrzeiten. Berufsschule zunächst als Fortbildungseintrag im Kalender anlegen und hier ausdrücklich zuordnen."
        >
          <MonthNavigator
            label={formatMonthTitle(month)}
            onPrevious={() => moveMonth(-1)}
            onNext={() => moveMonth(1)}
          />
        </FormSection>
      }
      ListEmptyComponent={
        <FormStatus message="Keine Einträge mit Uhrzeiten in diesem Monat. Im Kalender kannst du einen Dienst oder eine Fortbildung anlegen." />
      }
      renderItem={({ item: shift }) => {
        const saved = history.shifts.find((item) => item.shiftId === shift.id) ?? null;
        const status =
          saved === null
            ? "Noch nicht erfasst"
            : !isCurrentShiftTraining(saved, shift, profile.timeZone)
              ? "Erneut erfassen"
              : saved.data.exam
                ? "Prüfung/Ausbildung zugeordnet · Prüfung offen"
                : saved.data.school
                  ? "Berufsschule zugeordnet"
                  : saved.data.pauses === null
                    ? "Pausenlage offen"
                    : "Pausen erfasst";
        return (
          <SecondaryButton onPress={() => setSession({ shift, saved, timeZone: profile.timeZone })}>
            {formatRemunerationDate(shift.date)} · {shift.title} · {shift.startTime}–{shift.endTime}{" "}
            · {status}
          </SecondaryButton>
        );
      }}
    />
  );
}
