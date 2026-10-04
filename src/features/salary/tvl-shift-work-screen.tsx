import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import { isCurrentTvlServiceFacts, isCurrentTvlShiftWork } from "@/domain/saved-tvl-shift-work";
import { formatMonthTitle } from "@/engine/calendar";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { SecondaryButton } from "@/ui/form-controls";
import { FormSection } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";
import { RemunerationText } from "./remuneration-positions";
import { tvlShiftWorkChoices, type TvlShiftWorkSession } from "./tvl-shift-work-model";
import { TvlShiftWorkForm } from "./tvl-shift-work-form";

export function TvlShiftWorkScreen() {
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const parsed = parseMonthRouteParam(params.month);
  const history = useRemunerationData(),
    root = usePflegeShiftStatus();
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const palette = usePalette(),
    insets = useSafeAreaInsets();
  const [session, setSession] = useState<TvlShiftWorkSession | null>(null);
  if (parsed.status !== "valid")
    return (
      <LoadFailureView
        message="Der Link enthält keinen gültigen Monat."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  const month = parsed.value;
  if (session !== null && session.month === month)
    return (
      <TvlShiftWorkForm
        session={session}
        onClose={() => setSession(null)}
        onReload={() => {
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
  if (!profile)
    return (
      <LoadFailureView
        message="Bitte zuerst ein Arbeitszeitmodell einrichten."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  const choices = tvlShiftWorkChoices(month, entries, history.profiles, profile.timeZone);
  return (
    <FlatList
      testID="tvl-shift-work-list"
      data={choices}
      keyExtractor={(choice) => choice.key}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{
        padding: SPACING.lg,
        paddingBottom: Math.max(insets.bottom, SPACING.xl),
        gap: SPACING.md,
      }}
      ListHeaderComponent={
        <FormSection title="TV-L / TVA-L: Dienstangaben" caption={formatMonthTitle(month)}>
          <RemunerationText>
            Bestätige den Schichtarbeitsbezug je Dienst. Für TV-L und TVA-L können zusätzlich
            Schwerbrandpflegezeiten erfasst werden. Bei einem Vergütungswechsel werden die
            betroffenen Zeiträume getrennt angezeigt.
          </RemunerationText>
        </FormSection>
      }
      ListEmptyComponent={
        <RemunerationText>
          Keine zeitgebundenen TV-L-/TVA-L-Dienste mit datiertem Vergütungsprofil in diesem Monat.
        </RemunerationText>
      }
      renderItem={({ item }) => {
        const saved =
          history.tvlShiftWork.find(
            (r) =>
              r.shiftId === item.shift.id && r.profileEffectiveFrom === item.profile.effectiveFrom,
          ) ?? null;
        const current =
          saved && isCurrentTvlShiftWork(saved, item.shift, item.timeZone, item.profile);
        const status = current
          ? saved.shiftWork
            ? "Ja"
            : "Nein"
          : saved?.shiftWork != null
            ? "Erneut bestätigen"
            : "Ungeklärt";
        const careStatus =
          saved?.burnCareIntervals == null
            ? "ungeklärt"
            : !isCurrentTvlServiceFacts(saved, item.shift, item.timeZone, item.profile)
              ? "erneut bestätigen"
              : saved.burnCareIntervals.length
                ? "Zeiten erfasst"
                : "keine Tätigkeit";
        return (
          <SecondaryButton onPress={() => setSession({ ...item, saved })}>
            {formatRemunerationDate(item.shift.date)} · {item.shift.title} · Vergütung ab{" "}
            {formatRemunerationDate(item.profile.effectiveFrom!)} · Schichtarbeit: {status}
            {" · Schwerbrandpflege: " + careStatus}
          </SecondaryButton>
        );
      }}
    />
  );
}
