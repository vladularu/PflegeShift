import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";
import type { DatedAllowanceAssessment } from "@/domain/remuneration-assessment";
import type { AllowanceStatus, CalendarEntry } from "@/domain/types";
import { remunerationPeriod } from "@/features/salary/remuneration-presentation";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";
import { SurfaceCard, CardSeparator } from "@/ui/design-system";
import { NightSequenceExplanationCard } from "./night-sequence-explanation-card";

const CRITERION_ICON_SIZE = 28;

const LABELS: Readonly<Record<AllowanceStatus, string>> = {
  NONE: "Keine Zulage",
  SHIFT_MONTHLY: "Ständige Schichtarbeit",
  SHIFT_HOURLY: "Nichtständige Schichtarbeit",
  ALTERNATING_MONTHLY: "Ständige Wechselschicht",
  ALTERNATING_HOURLY: "Nichtständige Wechselschicht",
};
export function datedAllowanceTitle(period: DatedAllowanceAssessment): string {
  if (period.entitlement) return LABELS[period.entitlement.status];
  if (
    period.issue?.code === "WORKPLACE_SETTINGS_UNCONFIRMED" ||
    period.issue?.code === "ALLOWANCE_RECONFIRMATION_REQUIRED"
  )
    return "Bestätigung erforderlich";
  return "Nicht berechenbar";
}
export function DatedAllowanceCard({
  period,
  month,
  entries,
  timeZone,
  multiple,
}: {
  readonly period: DatedAllowanceAssessment;
  readonly month: string;
  readonly entries: readonly CalendarEntry[];
  readonly timeZone: string;
  readonly multiple: boolean;
}) {
  const p = usePalette();
  const range = remunerationPeriod(period.from, period.through);
  const confirmed = period.entitlement?.origin === "confirmed";
  return (
    <>
      <SurfaceCard>
        <View style={{ padding: SPACING.lg, gap: SPACING.sm }}>
          <Text accessibilityRole="header" style={{ color: p.text, ...TYPOGRAPHY.sectionTitle }}>
            {range}
          </Text>
          <Text style={{ color: p.text, ...TYPOGRAPHY.bodyStrong }}>
            {datedAllowanceTitle(period)}
          </Text>
          <Text style={{ color: p.textMuted, ...TYPOGRAPHY.body }}>
            {confirmed
              ? "Tarifgebunden bestätigt"
              : period.entitlement
                ? "Automatisch geschätzt · kein bestätigter Anspruch"
                : "Berechnung unvollständig"}
          </Text>
          {period.tariff ? (
            <Text selectable style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}>
              {`${period.tariff.packageId} · ${period.tariff.variant} · ${period.tariff.region}`}
            </Text>
          ) : null}
          {period.issue ? (
            <Text selectable style={{ color: p.textMuted, ...TYPOGRAPHY.body }}>
              {period.issue.message}
            </Text>
          ) : null}
          {period.assessment?.estimateNote ? (
            <Text selectable style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}>
              {period.assessment.estimateNote}
            </Text>
          ) : null}
          {confirmed ? (
            <Text style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}>
              Die Bestätigung gilt für diesen Zeitraum. Die folgenden Kriterien beschreiben
              unabhängig davon das automatisch erkannte Dienstmuster.
            </Text>
          ) : null}
        </View>
        {period.assessment?.criteria.map((criterion, index) => (
          <View key={criterion.key}>
            {index > 0 ? (
              <CardSeparator inset={SPACING.lg + CRITERION_ICON_SIZE + SPACING.md} />
            ) : null}
            <View
              style={{
                minHeight: 64,
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.md,
                paddingHorizontal: SPACING.lg,
                paddingVertical: SPACING.sm,
              }}
            >
              <View
                style={{
                  width: CRITERION_ICON_SIZE,
                  height: CRITERION_ICON_SIZE,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: RADII.pill,
                  backgroundColor:
                    criterion.state === "MET"
                      ? p.primarySoft
                      : criterion.state === "NOT_MET"
                        ? `${p.danger}1A`
                        : p.surfaceMuted,
                }}
              >
                <Ionicons
                  accessibilityElementsHidden
                  color={
                    criterion.state === "MET"
                      ? p.primary
                      : criterion.state === "NOT_MET"
                        ? p.danger
                        : p.textMuted
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
              <View style={{ flex: 1, gap: SPACING.xxs }}>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{ color: p.text, ...TYPOGRAPHY.bodyStrong }}
                >
                  {criterion.label}
                </Text>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}
                >
                  {criterion.detail}
                </Text>
              </View>
            </View>
          </View>
        ))}
        <View style={{ padding: SPACING.lg, gap: SPACING.xxs }}>
          {period.observedFrom && period.observedThrough ? (
            <Text selectable style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}>
              {"Beobachteter Zeitraum: " +
                remunerationPeriod(period.observedFrom, period.observedThrough)}
            </Text>
          ) : null}
          <Text selectable style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}>
            {period.source.profileEffectiveFrom
              ? `Vergütungsprofil ab ${period.source.profileEffectiveFrom} · Revision ${period.source.profileRevision}`
              : "Gültigkeitsbeginn des Vergütungsprofils nicht bestätigt"}
          </Text>
          {period.source.packageId ? (
            <Text selectable style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}>
              {`Regelpaket: ${period.source.packageId} · ${period.source.versionId}`}
            </Text>
          ) : null}
        </View>
      </SurfaceCard>
      {period.nightSequence ? (
        <NightSequenceExplanationCard
          key={`${month}:${period.from}:${period.through}:${period.source.versionId}`}
          entries={entries}
          month={month}
          timeZone={timeZone}
          explanation={period.nightSequence}
          accessibilityLabel={multiple ? "Einschätzung erklären, " + range : undefined}
          estimateNote={
            confirmed
              ? "Deine tarifgebundene Bestätigung gilt nur für diesen Zeitraum."
              : period.assessment?.estimateNote
          }
        />
      ) : null}
    </>
  );
}
