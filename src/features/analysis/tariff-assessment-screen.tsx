import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
} from "@/application/pflegeshift-provider";
import {
  ALLOWANCE_STATUSES,
  type AllowanceStatus,
  type TvoedAssignment,
  type TvoedWorkPatternSettings,
  type TvoedWorkplaceCoverage,
  type UserProfile,
} from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { currentMonth, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";
import { TariffQuestion } from "@/features/analysis/tariff-question";
import { resolveEditorSession } from "@/features/editor-session";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { CardSeparator, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { successFeedback } from "@/ui/haptics";

const ALLOWANCE_LABELS: Readonly<Record<AllowanceStatus, string>> = {
  NONE: "Keine Zulage",
  SHIFT_MONTHLY: "Ständige Schichtarbeit",
  SHIFT_HOURLY: "Nichtständige Schichtarbeit",
  ALTERNATING_MONTHLY: "Ständige Wechselschicht",
  ALTERNATING_HOURLY: "Nichtständige Wechselschicht",
};

export function TariffAssessmentScreen() {
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { workPatternSettings } = usePflegeShiftTariff();
  const parsedMonth = parseMonthRouteParam(params.month);
  const month =
    parsedMonth.status === "valid" ? parsedMonth.value : currentMonth(profile?.timeZone);
  if (parsedMonth.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zur Tarifprüfung enthält keinen gültigen Monat."
        onRetry={() => router.back()}
        title="Tarifprüfung kann nicht geöffnet werden"
      />
    );
  }
  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
  }
  const session = resolveEditorSession(ready && profile !== null, month, () => workPatternSettings);
  if (session === null || profile === null) return <LoadingView />;
  return (
    <TariffAssessmentForm
      key={session.key}
      initialSettings={session.initialValue}
      month={month}
      profile={profile}
    />
  );
}

function TariffAssessmentForm({
  initialSettings,
  month,
  profile,
}: {
  readonly initialSettings: TvoedWorkPatternSettings;
  readonly month: string;
  readonly profile: UserProfile;
}) {
  const palette = usePalette();
  const { entries } = usePflegeShiftEntries();
  const { tariffDecisions, workPatternSettings, updateWorkPatternSettings, upsertTariffDecision } =
    usePflegeShiftTariff();
  const [coverage, setCoverage] = useState<TvoedWorkplaceCoverage>(
    initialSettings.workplaceCoverage,
  );
  const [assignment, setAssignment] = useState<TvoedAssignment>(initialSettings.assignment);
  const [showOverride, setShowOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const window = useMemo(() => selectAnalysisEntryWindow(entries, month), [entries, month]);
  const decision = tariffDecisions.find((item) => item.month === month) ?? null;
  const pay = useMemo(
    () =>
      calculateMonthlyPayEstimate(
        month,
        window.monthShifts,
        profile,
        decision,
        window.allowanceShifts,
        { workplaceCoverage: coverage, assignment, updatedAt: workPatternSettings.updatedAt },
      ),
    [assignment, coverage, decision, month, profile, window, workPatternSettings.updatedAt],
  );

  const assessment = pay.assessment;
  const resultTitle = decision
    ? ALLOWANCE_LABELS[decision.allowanceStatus]
    : assessment.suggestedAllowance !== "NONE"
      ? ALLOWANCE_LABELS[assessment.suggestedAllowance]
      : assessment.requiresConfirmation
        ? "Bestätigung erforderlich"
        : assessment.alternatingShiftWork === "REVIEW"
          ? "Wechselschicht noch nicht eindeutig"
          : assessment.shiftWork === "DETECTED"
            ? "Schichtarbeit erkannt"
            : "Kein eindeutiges Schichtmuster";

  async function saveSettings() {
    try {
      setSaving(true);
      setError(null);
      await updateWorkPatternSettings({ workplaceCoverage: coverage, assignment });
      successFeedback();
      router.back();
    } catch (saveError) {
      setError(userFacingErrorMessage(saveError, "Angaben konnten nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmOverride(status: AllowanceStatus) {
    try {
      setSaving(true);
      setError(null);
      await upsertTariffDecision({
        month,
        allowanceStatus: status,
        expectedRevision: decision?.revision,
      });
      successFeedback();
      router.back();
    } catch (saveError) {
      setError(userFacingErrorMessage(saveError, "Monatswert konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{ gap: SPACING.lg, padding: SPACING.lg, paddingBottom: 36 }}
    >
      <View style={{ gap: SPACING.xs }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
        >
          {formatMonthTitle(month)}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.text, ...TYPOGRAPHY.screenTitle }}
        >
          {resultTitle}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          Dienstmuster werden aus den letzten drei Monaten erkannt. Angaben zum Arbeitsplatz
          bestätigst du einmal selbst.
        </Text>
      </View>

      <SurfaceCard>
        {assessment.criteria.map((criterion, index) => (
          <View key={criterion.key}>
            {index > 0 ? <CardSeparator inset={48} /> : null}
            <View
              style={{
                minHeight: 60,
                flexDirection: "row",
                alignItems: "center",
                gap: 11,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  backgroundColor:
                    criterion.state === "MET"
                      ? palette.primarySoft
                      : criterion.state === "NOT_MET"
                        ? `${palette.danger}1A`
                        : palette.surfaceMuted,
                }}
              >
                <Ionicons
                  accessibilityElementsHidden
                  color={
                    criterion.state === "MET"
                      ? palette.primary
                      : criterion.state === "NOT_MET"
                        ? palette.danger
                        : palette.textMuted
                  }
                  name={
                    criterion.state === "MET"
                      ? "checkmark"
                      : criterion.state === "NOT_MET"
                        ? "remove"
                        : "help"
                  }
                  size={16}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: "600" }}>
                  {criterion.label}
                </Text>
                <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17 }}>
                  {criterion.detail}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </SurfaceCard>

      <TariffQuestion
        title="Wird dein Arbeitsbereich rund um die Uhr betrieben?"
        caption="Zum Beispiel Station, Intensivbereich oder Notaufnahme mit 24/7-Besetzung."
        options={[
          { value: "AROUND_THE_CLOCK", label: "Ja" },
          { value: "NOT_AROUND_THE_CLOCK", label: "Nein" },
          { value: "UNKNOWN", label: "Unsicher" },
        ]}
        value={coverage}
        onChange={(value) => setCoverage(value as TvoedWorkplaceCoverage)}
      />

      <TariffQuestion
        title="Gehört das Schichtmodell dauerhaft zu deiner Stelle?"
        caption="Nicht nur einzelne Vertretungen oder gelegentliche Zusatzdienste."
        options={[
          { value: "PERMANENT", label: "Dauerhaft" },
          { value: "TEMPORARY", label: "Gelegentlich" },
          { value: "UNKNOWN", label: "Unsicher" },
        ]}
        value={assignment}
        onChange={(value) => setAssignment(value as TvoedAssignment)}
      />

      {error ? (
        <Text selectable style={{ color: palette.danger, fontSize: 12, lineHeight: 17 }}>
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityLabel="Angaben speichern"
        accessibilityRole="button"
        accessibilityState={{ busy: saving, disabled: saving }}
        disabled={saving}
        onPress={() => void saveSettings()}
        style={({ pressed }) => ({
          minHeight: CONTROL_HEIGHT.regular,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: RADII.control,
          borderCurve: "continuous",
          backgroundColor: palette.primary,
          opacity: saving ? 0.5 : pressed ? 0.75 : 1,
        })}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.onPrimary, ...TYPOGRAPHY.button }}
        >
          Angaben speichern
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel="Monatswert manuell festlegen"
        accessibilityRole="button"
        accessibilityState={{ expanded: showOverride }}
        onPress={() => setShowOverride((current) => !current)}
        style={({ pressed }) => ({
          minHeight: 46,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: pressed ? 0.7 : 1,
          paddingHorizontal: 4,
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: 13, fontWeight: "600" }}>
            Monatswert manuell festlegen
          </Text>
          <Text style={{ color: palette.textMuted, fontSize: 12 }}>
            Nur verwenden, wenn die automatische Einordnung abweicht.
          </Text>
        </View>
        <Text style={{ color: palette.textMuted, fontSize: 19 }}>{showOverride ? "−" : "+"}</Text>
      </Pressable>

      {showOverride ? (
        <SurfaceCard>
          <View accessibilityLabel="Monatswert manuell festlegen" accessibilityRole="radiogroup">
            {ALLOWANCE_STATUSES.map((status, index) => (
              <View key={status}>
                {index > 0 ? <CardSeparator inset={16} /> : null}
                <Pressable
                  accessibilityLabel={`Monatswert manuell festlegen: ${ALLOWANCE_LABELS[status]}`}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: decision?.allowanceStatus === status,
                    disabled: saving,
                  }}
                  disabled={saving}
                  onPress={() => void confirmOverride(status)}
                  style={({ pressed }) => ({
                    minHeight: 50,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                    paddingHorizontal: 16,
                  })}
                >
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: "700" }}>
                    {ALLOWANCE_LABELS[status]}
                  </Text>
                  <Text
                    accessibilityElementsHidden
                    style={{
                      color:
                        decision?.allowanceStatus === status ? palette.primary : palette.textMuted,
                      fontSize: 17,
                    }}
                  >
                    {decision?.allowanceStatus === status ? "●" : "○"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </SurfaceCard>
      ) : null}

      <Text
        selectable
        style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17, textAlign: "center" }}
      >
        Automatische Plausibilitätsprüfung · keine Rechts- oder Lohnberatung
      </Text>
    </ScrollView>
  );
}
