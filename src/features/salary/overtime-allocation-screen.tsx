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
import type { ShiftEntry } from "@/domain/types";
import { isCurrentOvertimeAllocation } from "@/domain/overtime-allocation";
import { formatMonthTitle } from "@/engine/calendar";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { SecondaryButton } from "@/ui/form-controls";
import { FormSection } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";
import { RemunerationText } from "./remuneration-positions";
import { overtimeAllocationShifts } from "./overtime-allocation-model";
import { OvertimeAllocationForm, type OvertimeAllocationSession } from "./overtime-allocation-form";

export function OvertimeAllocationScreen() {
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const parsed = parseMonthRouteParam(params.month);
  const history = useRemunerationData();
  const root = usePflegeShiftStatus();
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<OvertimeAllocationSession | null>(null);
  if (parsed.status !== "valid")
    return (
      <LoadFailureView
        title="Überstunden können nicht geöffnet werden"
        message="Der Link enthält keinen gültigen Monat."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  const month = parsed.value;
  if (session !== null && session.month === month)
    return (
      <OvertimeAllocationForm
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
  const shifts = overtimeAllocationShifts(
    month,
    entries.filter((entry): entry is ShiftEntry => entry.kind === "SHIFT"),
    profile.timeZone,
  );
  return (
    <FlatList
      testID="overtime-allocation-list"
      data={shifts}
      keyExtractor={(shift) => shift.id}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{
        padding: SPACING.lg,
        paddingBottom: Math.max(insets.bottom, SPACING.xl),
        gap: SPACING.md,
      }}
      ListHeaderComponent={
        <FormSection title="Überstunden zuordnen" caption={formatMonthTitle(month)}>
          <RemunerationText>
            Nur bereits im Dienst bestätigte Überstunden. Ein positiver Zeitsaldo wird nicht
            automatisch ausgezahlt.
          </RemunerationText>
        </FormSection>
      }
      ListEmptyComponent={
        <RemunerationText>
          Keine bestätigten Überstunden in diesem Monat. Minuten und Auszahlungsbestätigung zuerst
          im jeweiligen Dienst hinterlegen.
        </RemunerationText>
      }
      renderItem={({ item: shift }) => {
        const saved = history.overtimeAllocations.find((item) => item.shiftId === shift.id) ?? null;
        const status =
          saved === null
            ? "Noch nicht aufgeteilt"
            : isCurrentOvertimeAllocation(saved, shift, profile.timeZone)
              ? "Aufteilung bestätigt"
              : "Erneut bestätigen";
        return (
          <SecondaryButton
            onPress={() => setSession({ month, shift, timeZone: profile.timeZone, saved })}
          >
            {formatRemunerationDate(shift.date)} · {shift.title} · {shift.overtimeMinutes} Min. ·{" "}
            {status}
          </SecondaryButton>
        );
      }}
    />
  );
}
