import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Temporal } from "@js-temporal/polyfill";
import type { ComplianceIssue, ShiftEntry } from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { MINIMUM_TOUCH_TARGET, RADII, SPACING } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { ColorBadge } from "@/ui/design-system";
import { selectionFeedback } from "@/ui/haptics";
import { SelectionSheet } from "@/ui/selection-sheet";
import { complianceTimeline, restDuration } from "./compliance-timeline";

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
export function checkDate(date: string, includeYear = true): string {
  try {
    const day = Temporal.PlainDate.from(date);
    return String(day.day) + ". " + MONTHS[day.month - 1] + (includeYear ? " " + day.year : "");
  } catch {
    return "Datum nicht verfügbar";
  }
}
export const issueCategory = (issue: ComplianceIssue) =>
  issue.kind === "PLANNING" ? "Planung" : "Gesetzlich";
export const issueSeverity = (issue: ComplianceIssue) =>
  issue.severity === "critical" ? "Kritisch" : issue.severity === "warning" ? "Warnung" : "Hinweis";

function compactShiftDate(date: string): string {
  try {
    const day = Temporal.PlainDate.from(date);
    return `${String(day.day).padStart(2, "0")}.${String(day.month).padStart(2, "0")}.${day.year}`;
  } catch {
    return "Datum nicht verfügbar";
  }
}

export function ComplianceIssueContent({
  issue,
  shifts,
  timeZone,
}: {
  readonly issue: ComplianceIssue;
  readonly shifts: readonly ShiftEntry[];
  readonly timeZone: string;
}) {
  const palette = usePalette();
  const [showShifts, setShowShifts] = useState(false);
  const model = complianceTimeline(issue, shifts, timeZone);
  const { rest, series } = model;
  const color =
    issue.severity === "critical"
      ? palette.danger
      : issue.severity === "warning"
        ? palette.warning
        : palette.primary;
  return (
    <View
      testID={`check-details-${issue.id}`}
      style={{
        gap: SPACING.md,
        backgroundColor: palette.surfaceRaised,
        borderRadius: RADII.card,
        padding: SPACING.lg,
      }}
    >
      {rest ? (
        <View style={{ gap: SPACING.sm }} testID={`check-timeline-${issue.id}`}>
          <TimelineEndpoint
            shift={rest.previous}
            date={rest.endDate}
            time={rest.previous.endTime!}
            action="endet"
            includeYear={rest.endDate.slice(0, 4) !== rest.startDate.slice(0, 4)}
          />
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingLeft: 11 }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ width: 2, height: 38, backgroundColor: palette.separator }}
            />
            <View style={{ flex: 1, gap: SPACING.xxs }}>
              <Text
                style={{ color, ...TYPOGRAPHY.highlightCount }}
                accessibilityLabel={`${restDuration(rest.minutes)} Ruhezeit`}
              >
                {restDuration(rest.minutes)}
              </Text>
              <Text style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>
                Ruhezeit dazwischen
              </Text>
            </View>
          </View>
          <TimelineEndpoint
            shift={rest.next}
            date={rest.startDate}
            time={rest.next.startTime!}
            action="beginnt"
            includeYear={rest.endDate.slice(0, 4) !== rest.startDate.slice(0, 4)}
          />
        </View>
      ) : series ? (
        <View style={{ gap: SPACING.md }} testID={`check-series-${issue.id}`}>
          <Text
            accessibilityLabel={`${model.title}, ${issueCategory(issue)}, ${issueSeverity(issue)}`}
            style={{ color: palette.text, ...TYPOGRAPHY.value }}
          >
            {model.title}
          </Text>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flexDirection: "row", gap: 3 }}
          >
            {Array.from({ length: Math.min(series.count, 31) }, (_, index) => (
              <View
                key={index}
                style={{ height: 18, flex: 1, borderRadius: RADII.pill, backgroundColor: color }}
              />
            ))}
          </View>
          {series.from && series.until ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: SPACING.sm,
              }}
            >
              <Text style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>
                {checkDate(series.from, series.from.slice(0, 4) !== series.until.slice(0, 4))}
              </Text>
              <Text style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>
                {checkDate(series.until, series.from.slice(0, 4) !== series.until.slice(0, 4))}
              </Text>
            </View>
          ) : (
            <Text style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>
              Zeitraum nicht vollständig verfügbar.
            </Text>
          )}
        </View>
      ) : null}
      {!series ? (
        <Text style={{ color: palette.text, ...TYPOGRAPHY.body }}>{model.note}</Text>
      ) : null}
      {model.missing ? (
        <Text style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>
          Einige zugehörige Dienste sind nicht mehr verfügbar.
        </Text>
      ) : null}
      {model.related.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Dienste ansehen: ${issue.title}, ${model.related.length} Dienste`}
          accessibilityHint="Öffnet die betroffenen Dienste in einem Fenster von unten"
          onPress={() => {
            selectionFeedback();
            setShowShifts(true);
          }}
          style={({ pressed }) => ({
            minHeight: MINIMUM_TOUCH_TARGET,
            justifyContent: "center",
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ color: palette.primary, ...TYPOGRAPHY.button }}>Dienste ansehen →</Text>
        </Pressable>
      ) : null}
      {showShifts ? (
        <SelectionSheet
          title="Betroffene Dienste"
          visible={showShifts}
          onClose={() => setShowShifts(false)}
        >
          {() => (
            <View style={{ paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md }}>
              {model.related.map((shift) => {
                const time =
                  shift.allDay || !shift.startTime || !shift.endTime
                    ? "Ganztägig"
                    : `${shift.startTime}–${shift.endTime}`;
                return (
                  <View
                    key={shift.id}
                    testID={`check-shift-${shift.id}`}
                    accessible
                    accessibilityLabel={`${shift.title}, ${checkDate(shift.date)}, ${time}`}
                    style={{
                      minHeight: 56,
                      paddingVertical: SPACING.md,
                      borderBottomWidth: 1,
                      borderBottomColor: palette.separator,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: SPACING.md,
                    }}
                  >
                    <ColorBadge color={shift.color} label={shift.symbol} size={24} />
                    <View style={{ flex: 1, minWidth: 0, gap: SPACING.xxs }}>
                      <Text style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}>
                        {shift.title}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                          gap: SPACING.sm,
                        }}
                      >
                        <Text style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>
                          {compactShiftDate(shift.date)}
                        </Text>
                        <Text style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>{time}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </SelectionSheet>
      ) : null}
    </View>
  );
}

function TimelineEndpoint({
  shift,
  date,
  time,
  action,
  includeYear,
}: {
  readonly shift: ShiftEntry;
  readonly date: string;
  readonly time: string;
  readonly action: "endet" | "beginnt";
  readonly includeYear: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      accessible
      accessibilityLabel={`${shift.title} ${action}, ${time}, ${checkDate(date)}`}
      style={{ flexDirection: "row", gap: SPACING.md, alignItems: "center" }}
    >
      <ColorBadge color={shift.color} label={shift.symbol} size={24} />
      <View style={{ flex: 1, minWidth: 0, gap: SPACING.xxs }}>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: SPACING.sm,
          }}
        >
          <Text style={{ flexShrink: 1, color: palette.text, ...TYPOGRAPHY.bodyStrong }}>
            {shift.title} {action}
          </Text>
          <Text style={{ color: palette.text, ...TYPOGRAPHY.value }}>{time}</Text>
        </View>
        <Text style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>
          {checkDate(date, includeYear)}
        </Text>
      </View>
    </View>
  );
}
