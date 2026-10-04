import { Temporal } from "@js-temporal/polyfill";
import candidate from "../../rules/packages/reviewed/de-arbzg-care/2026-01-youth-r1.json";
import { BUNDLED_HOLIDAY_RULES } from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";
import type { RuleLegalPackage } from "@/rules/contracts.generated";
import type { SavedTrainingProfile, SavedShiftTraining } from "@/domain/training-data";
import type { YouthFacts, YouthInput } from "./youth-types";
import { shift, work } from "./remuneration-test-fixtures";

export const youthPackage = candidate as RuleLegalPackage;
export const youthProfile: SavedTrainingProfile = {
  data: {
    version: 1,
    effectiveFrom: "2026-01-01",
    birthDate: "2009-01-01",
    fullTimeCompulsorySchooling: false,
    status: "employment",
    training: null,
  },
  revision: 1,
  updatedAt: work.updatedAt,
};
export const youthFacts: YouthFacts = {
  effectiveFrom: "2026-01-01",
  careInstitution: true,
  medicalEmergencyService: false,
  multiShiftOperation: false,
  otherExceptions: false,
  allWorkAndSchoolRecorded: true,
  pausesPredefined: true,
  averageDailyTrainingMinutes: 480,
  averageWeeklyTrainingMinutes: 2400,
  shortenedWorkingDays: [],
  blockTrainingShiftIds: [],
  holidayLostMinutes: { "2026-10-03": 0 },
};
export const youthInput = (patch: Partial<YouthInput> = {}): YouthInput => ({
  month: "2026-09",
  shifts: [],
  details: [],
  profiles: [youthProfile],
  facts: [youthFacts],
  profile: work,
  ruleResolver: createRuleResolver(
    { tariff: [], legal: [youthPackage], holiday: BUNDLED_HOLIDAY_RULES },
    {
      tariff: "unused",
      legal: youthPackage.packageId,
      holiday: BUNDLED_HOLIDAY_RULES[0].packageId,
    },
  ),
  ...patch,
});
export function at(date: string, time: string): string {
  return Temporal.PlainDate.from(date)
    .toPlainDateTime(time)
    .toZonedDateTime(work.timeZone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
export function service(
  date = "2026-09-15",
  start = "08:00",
  end = "17:00",
  pauses = [
    ["10:00", "10:30"],
    ["13:00", "13:30"],
  ],
  school = false,
) {
  const data: SavedShiftTraining["data"] = {
    version: 1,
    pauses: pauses.map(([start, end]) => ({ start: at(date, start), end: at(date, end) })),
    school: null,
  };
  const entry = shift({
    id: date + start,
    date,
    type: school ? "TRAINING" : "EARLY",
    startTime: start,
    endTime: end,
    breakMinutes: data.pauses!.reduce(
      (n, p) => n + (Date.parse(p.end) - Date.parse(p.start)) / 60000,
      0,
    ),
  });
  const details: SavedShiftTraining = {
    shiftId: entry.id,
    shiftDate: date,
    shiftRevision: entry.revision,
    shiftUpdatedAt: entry.updatedAt,
    timeZone: work.timeZone,
    revision: 1,
    updatedAt: work.updatedAt,
    data,
  };
  return { entry, details };
}
