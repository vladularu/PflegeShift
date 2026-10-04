import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import { isCurrentPaidAbsence } from "@/domain/paid-absence";
import { formatMonthTitle } from "@/engine/calendar";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { SecondaryButton } from "@/ui/form-controls";
import { FormSection } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";
import { RemunerationText } from "./remuneration-positions";
import { paidAbsenceEntries, paidTimeText } from "./paid-absence-model";
import { PaidAbsenceForm, type PaidAbsenceSession } from "./paid-absence-form";

export function PaidAbsenceScreen() {
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const parsed = parseMonthRouteParam(params.month);
  const history = useRemunerationData();
  const root = usePflegeShiftStatus();
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<PaidAbsenceSession | null>(null);
  if (parsed.status !== "valid")
    return (
      <LoadFailureView
        title="Abwesenheiten können nicht geöffnet werden"
        message="Der Link enthält keinen gültigen Monat."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  const month = parsed.value;
  if (session && session.month === month)
    return (
      <PaidAbsenceForm
        session={session}
        onClose={() => {
          Keyboard.dismiss();
          setSession(null);
        }}
        onReload={() => {
          Keyboard.dismiss();
          setSession(null);
          void root.reload();
        }}
      />
    );
  if (root.error || history.status === "error")
    return (
      <LoadFailureView
        message={root.error ?? history.error ?? "Vergütungsdaten nicht verfügbar."}
        onRetry={() => {
          if (root.error) void root.reload();
          else void history.reload();
        }}
      />
    );
  if (!root.ready || history.status !== "ready") return <LoadingView />;
  if (profile === null)
    return (
      <LoadFailureView
        message="Bitte zuerst ein Arbeitszeitmodell einrichten."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  return (
    <FlatList
      testID="paid-absence-list"
      data={paidAbsenceEntries(month, entries)}
      keyExtractor={(entry) => entry.id}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{
        padding: SPACING.lg,
        paddingBottom: Math.max(insets.bottom, SPACING.xl),
        gap: SPACING.md,
      }}
      ListHeaderComponent={
        <FormSection title="Bezahlte Abwesenheit" caption={formatMonthTitle(month)}>
          <RemunerationText>
            Bestätige die bezahlte Zeit je Eintrag. Urlaub, Krankheit oder Frei erhalten keinen
            automatischen Stundenwert.
          </RemunerationText>
        </FormSection>
      }
      ListEmptyComponent={<RemunerationText>Keine Abwesenheiten in diesem Monat.</RemunerationText>}
      renderItem={({ item: shift }) => {
        const saved = history.paidAbsences.find((item) => item.shiftId === shift.id) ?? null;
        const status = !saved
          ? "Noch nicht bestätigt"
          : isCurrentPaidAbsence(saved, shift, profile.timeZone)
            ? paidTimeText(saved.paidMinutes!) + " h bestätigt"
            : "Erneut bestätigen";
        return (
          <SecondaryButton
            onPress={() => setSession({ month, shift, timeZone: profile.timeZone, saved })}
          >
            {formatRemunerationDate(shift.date)} · {shift.title} · {status}
          </SecondaryButton>
        );
      }}
    />
  );
}
