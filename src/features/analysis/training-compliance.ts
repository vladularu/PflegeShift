import { Temporal } from "@js-temporal/polyfill";
import { trainingProfileForDate, type TrainingSnapshot } from "@/domain/training-data";
import { UNKNOWN_YOUTH_CONTEXT } from "@/domain/youth-context";
import type {
  ComplianceIssue,
  MonthlyComplianceResult,
  ShiftEntry,
  UserProfile,
} from "@/domain/types";
import { calculateYouthCompliance } from "@/engine/youth-compliance";
import type { TrainingTimeDay } from "@/engine/youth-types";
import type { RuleResolver } from "@/rules/rule-resolver";
import {
  isAdultAssessmentFinding,
  isAdultAssessmentRange,
  isAdultServiceFinding,
} from "./training-adult-findings";

export type TrainingComplianceResult = MonthlyComplianceResult & {
  readonly trainingComplete?: boolean;
  readonly trainingTimeDays?: readonly TrainingTimeDay[];
};
export type TrainingComplianceData = TrainingSnapshot & {
  readonly status: "loading" | "ready" | "error";
  readonly error: string | null;
};

/** Shared loading/error semantics for month and year, without a second rule path. */
export function trainingComplianceForState(
  input: Omit<Parameters<typeof trainingCompliance>[0], "training"> & {
    readonly training: TrainingComplianceData;
  },
): TrainingComplianceResult | null {
  if (input.training.status === "loading") return null;
  if (input.training.status === "error") {
    const date = input.month + "-01";
    return {
      month: input.month,
      trainingComplete: false,
      criticalCount: 0,
      warningCount: 0,
      infoCount: 1,
      affectedDates: [date],
      issues: [
        {
          id: "TRAINING_LOAD:" + input.month,
          date,
          severity: "info",
          kind: "LEGAL",
          rule: "Prüfungsgrundlage",
          title: "Arbeitszeitprüfung unvollständig",
          description:
            input.training.error ??
            "Ausbildungsdaten konnten nicht geladen werden. Bitte unter Mehr → Ausbildung & Alter erneut laden.",
          relatedShiftIds: [],
        },
      ],
    };
  }
  return trainingCompliance(input);
}

export function trainingCompliance({
  month,
  adult,
  training,
  shifts,
  profile,
  ruleResolver,
}: {
  readonly month: string;
  readonly adult: MonthlyComplianceResult | null;
  readonly training: TrainingSnapshot;
  readonly shifts: readonly ShiftEntry[];
  readonly profile: UserProfile;
  readonly ruleResolver: RuleResolver;
}): TrainingComplianceResult | null {
  const first = Temporal.PlainDate.from(month + "-01");
  const dates = Array.from({ length: first.daysInMonth }, (_, i) =>
    first.add({ days: i }).toString(),
  );
  const selected = dates.map((date) => ({
    date,
    data: trainingProfileForDate(training.profiles, date)?.data,
  }));
  const ages = new Map<string, boolean>();
  const isAdultOn = (date: string) => {
    if (ages.has(date)) return ages.get(date)!;
    const birthDate = trainingProfileForDate(training.profiles, date)?.data.birthDate;
    const adult =
      birthDate != null &&
      Temporal.PlainDate.from(birthDate).until(date, { largestUnit: "years" }).years >= 18;
    ages.set(date, adult);
    return adult;
  };
  const adultPeriodKnown =
    adult?.assessmentRange !== undefined &&
    isAdultAssessmentRange(adult.assessmentRange, isAdultOn);
  // A missing optional profile leaves the established adult flow unchanged.
  const relevant =
    (training.profiles.length > 0 && !adultPeriodKnown) ||
    selected.some(
      ({ date, data }) =>
        data &&
        (data.birthDate === null ||
          data.status === "training" ||
          Temporal.PlainDate.from(data.birthDate).until(date, { largestUnit: "years" }).years < 18),
    );
  if (!relevant) return adult;
  const facts = training.profiles.map(({ data }) => ({
    ...(data.version === 2 && data.youth ? data.youth : UNKNOWN_YOUTH_CONTEXT),
    effectiveFrom: data.effectiveFrom,
  }));
  const youth = calculateYouthCompliance({
    month,
    profiles: training.profiles,
    details: training.shifts,
    facts,
    shifts,
    profile,
    ruleResolver,
  });
  const hasYouthOrUnknown = selected.some(
    ({ date, data }) =>
      !data?.birthDate ||
      Temporal.PlainDate.from(data.birthDate).until(date, { largestUnit: "years" }).years < 18,
  );
  if (!hasYouthOrUnknown && adult === null) return null;
  const issues: ComplianceIssue[] = (adult?.issues ?? []).filter(
    (i) =>
      (!hasYouthOrUnknown && adultPeriodKnown) ||
      i.kind === "PLANNING" ||
      isAdultServiceFinding(i, shifts, isAdultOn) ||
      isAdultAssessmentFinding(i, shifts, isAdultOn),
  );
  issues.push(
    ...youth.findings.map((finding): ComplianceIssue => ({
      id: "YOUTH:" + finding.date + ":" + finding.code,
      date: finding.date,
      rule: finding.section,
      kind: "LEGAL",
      severity: finding.severity === "WARNING" ? "warning" : "info",
      title:
        finding.severity === "INCOMPLETE"
          ? "Jugend-/Ausbildungsprüfung unvollständig"
          : finding.severity === "RECOMMENDATION"
            ? "Gesetzliche Soll-Regel"
            : finding.section.includes("BBiG") || finding.section.includes("PflBG")
              ? "Ausbildungsfreistellung"
              : "Jugendarbeitsschutz",
      description:
        finding.message +
        (finding.packageId
          ? ` Regelstand: ${finding.packageId}/${finding.versionId}; Quellen: ${finding.sourceIds.join(", ")}.`
          : ""),
      relatedShiftIds: finding.shiftIds,
    })),
  );
  const adultDate = selected.find(
    ({ date, data }) =>
      data?.birthDate &&
      Temporal.PlainDate.from(data.birthDate).until(date, { largestUnit: "years" }).years >= 18,
  )?.date;
  const adultPeriodIncomplete = Boolean(adultDate && (hasYouthOrUnknown || !adultPeriodKnown));
  if (adultDate && adultPeriodIncomplete)
    issues.push({
      id: "YOUTH:ADULT_TRANSITION:" + month,
      date: adultDate,
      rule: "ArbZG / JArbSchG",
      kind: "LEGAL",
      severity: "info",
      title: "Prüfung des Übergangs unvollständig",
      description:
        adult === null
          ? "Dieser Monat enthält volljährige Tage; deren Erwachsenenprüfung liegt noch nicht vor. Die bekannten Jugendmeldungen bleiben sichtbar; keine Gesamtfreigabe."
          : adult.assessmentRange
            ? `Gesicherte Tages- und Periodenmeldungen bleiben sichtbar. Der Prüfzeitraum ${adult.assessmentRange.from} bis ${adult.assessmentRange.through} enthält minderjährige Tage oder ungeklärte Altersangaben. Altersübergreifende Ausgleichszeiträume und Jahresquoten sind nicht vollständig geprüft; keine Gesamtfreigabe.`
            : "Der Erwachsenenprüfung fehlen nachgewiesene Prüfzeiträume. Gesicherte Tagesmeldungen bleiben sichtbar; Ausgleichszeiträume und Jahresquoten sind unvollständig.",
      relatedShiftIds: [],
    });
  return {
    month,
    trainingComplete: youth.status !== "INCOMPLETE" && !adultPeriodIncomplete,
    trainingTimeDays: youth.trainingTimeDays,
    issues,
    criticalCount: issues.filter((i) => i.severity === "critical").length,
    warningCount: issues.filter((i) => i.severity === "warning").length,
    infoCount: issues.filter((i) => i.severity === "info").length,
    affectedDates: [...new Set(issues.map((i) => i.date))].sort(),
  };
}
