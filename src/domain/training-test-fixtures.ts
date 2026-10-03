import { Temporal } from "@js-temporal/polyfill";
import type { ShiftEntry } from "./types";
import type { SavedTrainingProfile, SavedShiftTraining } from "./training-data";

/** Synthetic domain inputs; no legal limit, rule package or entitlement is implied. */
export const work = {
  timeZone: "Europe/Berlin",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
export function shift(change: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "shift",
    date: "2026-09-15",
    templateId: null,
    title: "Nacht",
    type: "NIGHT",
    startTime: "23:00",
    endTime: "01:00",
    breakMinutes: 0,
    color: "#EA5B55",
    symbol: "N",
    note: null,
    overtimeMinutes: 0,
    tariffOvertimeConfirmed: false,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    deletedAt: null,
    ...change,
  };
}
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
      (sum, p) => sum + (Date.parse(p.end) - Date.parse(p.start)) / 60000,
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
