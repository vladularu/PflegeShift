import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  useMediShiftEntries,
  useMediShiftProfile,
  useMediShiftStatus,
  useMediShiftTariff,
} from "@/application/medishift-provider";
import {
  ALLOWANCE_STATUSES,
  type AllowanceStatus,
  type TvoedAssignment,
  type TvoedWorkplaceCoverage,
} from "@/domain/types";
import { currentMonth, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";
import { usePalette } from "@/theme/palette";
import { CardSeparator, SurfaceCard } from "@/ui/design-system";
import { LoadingView } from "@/ui/loading-view";

const ALLOWANCE_LABELS: Readonly<Record<AllowanceStatus, string>> = {
  NONE: "Keine Zulage",
  SHIFT_MONTHLY: "Ständige Schichtarbeit",
  SHIFT_HOURLY: "Nichtständige Schichtarbeit",
  ALTERNATING_MONTHLY: "Ständige Wechselschicht",
  ALTERNATING_HOURLY: "Nichtständige Wechselschicht",
};

export function TariffAssessmentScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ month?: string }>();
  const { ready } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const { entries } = useMediShiftEntries();
  const {
    tariffDecisions,
    workPatternSettings,
    updateWorkPatternSettings,
    upsertTariffDecision,
  } = useMediShiftTariff();
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : currentMonth(profile?.timeZone);
  const [coverage, setCoverage] = useState<TvoedWorkplaceCoverage>(
    workPatternSettings.workplaceCoverage,
  );
  const [assignment, setAssignment] = useState<TvoedAssignment>(workPatternSettings.assignment);
  const [showOverride, setShowOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const window = useMemo(() => selectAnalysisEntryWindow(entries, month), [entries, month]);
  const decision = tariffDecisions.find((item) => item.month === month) ?? null;
  const pay = useMemo(
    () => profile
      ? calculateMonthlyPayEstimate(
        month,
        window.monthShifts,
        profile,
        decision,
        window.allowanceShifts,
        { workplaceCoverage: coverage, assignment, updatedAt: workPatternSettings.updatedAt },
      )
      : null,
    [assignment, coverage, decision, month, profile, window, workPatternSettings.updatedAt],
  );

  if (!ready || profile === null || pay === null) return <LoadingView />;

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
      if (process.env.EXPO_OS === "ios") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Angaben konnten nicht gespeichert werden.");
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
      if (process.env.EXPO_OS === "ios") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Monatswert konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 14, padding: 16, paddingBottom: 36 }}
    >
      <View style={{ gap: 5 }}>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "700" }}>
          {formatMonthTitle(month)}
        </Text>
        <Text selectable style={{ color: palette.text, fontSize: 25, fontWeight: "900" }}>
          {resultTitle}
        </Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 18 }}>
          Dienstmuster werden aus den letzten drei Monaten erkannt. Angaben zum Arbeitsplatz
          bestätigst du einmal selbst.
        </Text>
      </View>

      <SurfaceCard>
        {assessment.criteria.map((criterion, index) => (
          <View key={criterion.key}>
            {index > 0 ? <CardSeparator inset={48} /> : null}
            <View style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, paddingVertical: 10 }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  backgroundColor: criterion.state === "MET"
                    ? palette.primarySoft
                    : criterion.state === "NOT_MET"
                      ? `${palette.danger}1A`
                      : palette.surfaceMuted,
                }}
              >
                <Text style={{ color: criterion.state === "MET" ? palette.primary : criterion.state === "NOT_MET" ? palette.danger : palette.textMuted, fontWeight: "900" }}>
                  {criterion.state === "MET" ? "✓" : criterion.state === "NOT_MET" ? "–" : "?"}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: "800" }}>
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

      <Question
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

      <Question
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
        accessibilityRole="button"
        disabled={saving}
        onPress={() => void saveSettings()}
        style={({ pressed }) => ({
          minHeight: 50,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
          borderCurve: "continuous",
          backgroundColor: palette.primary,
          opacity: saving ? 0.5 : pressed ? 0.75 : 1,
        })}
      >
        <Text style={{ color: palette.onPrimary, fontSize: 15, fontWeight: "900" }}>
          Angaben speichern
        </Text>
      </Pressable>

      <Pressable
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
          <Text style={{ color: palette.text, fontSize: 13, fontWeight: "800" }}>
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
          {ALLOWANCE_STATUSES.map((status, index) => (
            <View key={status}>
              {index > 0 ? <CardSeparator inset={16} /> : null}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: decision?.allowanceStatus === status }}
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
                <Text style={{ color: decision?.allowanceStatus === status ? palette.primary : palette.textMuted, fontSize: 17 }}>
                  {decision?.allowanceStatus === status ? "●" : "○"}
                </Text>
              </Pressable>
            </View>
          ))}
        </SurfaceCard>
      ) : null}

      <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17, textAlign: "center" }}>
        Automatische Plausibilitätsprüfung · keine Rechts- oder Lohnberatung
      </Text>
    </ScrollView>
  );
}

function Question({
  title,
  caption,
  options,
  value,
  onChange,
}: {
  readonly title: string;
  readonly caption: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const palette = usePalette();
  return (
    <View style={{ gap: 9 }}>
      <View style={{ gap: 3, paddingHorizontal: 2 }}>
        <Text selectable style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>
          {title}
        </Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17 }}>
          {caption}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 7 }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                onChange(option.value);
                if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
              }}
              style={({ pressed }) => ({
                minHeight: 44,
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: selected ? palette.primary : palette.border,
                borderRadius: 14,
                borderCurve: "continuous",
                backgroundColor: selected ? palette.primarySoft : palette.surface,
                opacity: pressed ? 0.72 : 1,
                paddingHorizontal: 8,
              })}
            >
              <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: selected ? palette.primary : palette.textSecondary, fontSize: 12, fontWeight: "800" }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
