import { describe, expect, it } from "vitest";
import { shift } from "./training-test-fixtures";
import {
  validateTrainingProfile,
  validateShiftTrainingData,
  validateSavedShiftTraining,
  trainingProfileForDate,
  isCurrentShiftTraining,
  requireShiftTrainingParent,
  type TrainingProfileData,
  type ShiftTrainingData,
} from "./training-data";

const profile: TrainingProfileData = {
  version: 1,
  effectiveFrom: "2026-09-01",
  birthDate: "2009-09-15",
  fullTimeCompulsorySchooling: false,
  status: "training",
  training: {
    profession: "Pflegefachperson",
    legalBasis: "PFLBG",
    startedOn: "2026-09-01",
    expectedEndOn: "2029-08-31",
    year: 1,
    yearConfirmedFrom: "2026-09-01",
    shorteningMonths: 0,
  },
};
const school: ShiftTrainingData = {
  version: 1,
  pauses: [{ start: "2026-09-15T08:00:00Z", end: "2026-09-15T08:30:00Z" }],
  school: {
    lessons: [
      { start: "2026-09-15T06:00:00Z", end: "2026-09-15T06:45:00Z" },
      { start: "2026-09-15T06:45:00Z", end: "2026-09-15T07:30:00Z" },
    ],
    travelToWorkMinutes: 20,
    travelFromWorkMinutes: 0,
    block: { startDate: "2026-09-14", endDate: "2026-09-18" },
  },
};
const entry = shift({
  date: "2026-09-15",
  type: "TRAINING",
  startTime: "08:00",
  endTime: "14:00",
  breakMinutes: 30,
});
function saved(data: ShiftTrainingData = school, source = entry) {
  return validateSavedShiftTraining({
    shiftId: source.id,
    shiftRevision: source.revision,
    shiftDate: source.date,
    shiftUpdatedAt: source.updatedAt,
    timeZone: "Europe/Berlin",
    data,
    revision: 1,
    updatedAt: source.updatedAt,
  });
}

describe("explicit training and school contracts", () => {
  it("keeps age independent of training and permits unknown school duty", () => {
    expect(
      validateTrainingProfile({
        ...profile,
        status: "employment",
        training: null,
        fullTimeCompulsorySchooling: null,
      }).birthDate,
    ).toBe("2009-09-15");
    expect(validateTrainingProfile({ ...profile, birthDate: null }).status).toBe("training");
    expect(
      validateTrainingProfile({ ...profile, birthDate: "1980-01-01" }).training?.legalBasis,
    ).toBe("PFLBG");
  });
  it("keeps unconfirmed year and shortening unknown", () => {
    expect(
      validateTrainingProfile({
        ...profile,
        training: {
          ...profile.training,
          year: null,
          yearConfirmedFrom: null,
          shorteningMonths: null,
        },
      }).training,
    ).toMatchObject({ year: null, shorteningMonths: null });
  });
  it("selects dated status without backdating or automatic year advancement", () => {
    const first = {
      data: validateTrainingProfile(profile),
      revision: 1,
      updatedAt: "2026-09-01T00:00:00Z",
    };
    const end = {
      ...first,
      data: validateTrainingProfile({
        ...profile,
        effectiveFrom: "2029-09-01",
        status: "employment",
        training: null,
      }),
    };
    expect(trainingProfileForDate([end, first], "2026-08-31")).toBeNull();
    expect(trainingProfileForDate([end, first], "2027-09-01")?.data.training?.year).toBe(1);
    expect(trainingProfileForDate([end, first], "2029-09-01")?.data.status).toBe("employment");
  });
  it.each([
    { version: 2 },
    { extra: true },
    { birthDate: "2026-09-02" },
    { effectiveFrom: "2026-02-30" },
    { fullTimeCompulsorySchooling: "no" },
    { status: "employment" },
    { training: null },
    { training: { ...profile.training, year: 0 } },
    { training: { ...profile.training, year: 1.5 } },
    { training: { ...profile.training, yearConfirmedFrom: null } },
    { training: { ...profile.training, yearConfirmedFrom: "2026-08-31" } },
    { training: { ...profile.training, expectedEndOn: "2020-01-01" } },
    { training: { ...profile.training, legalBasis: "automatic" } },
  ])("rejects invalid profile %j", (patch) =>
    expect(() => validateTrainingProfile({ ...profile, ...patch })).toThrow(),
  );
  it("copies and freezes nested caller-owned data", () => {
    const input = JSON.parse(JSON.stringify(school));
    const result = validateShiftTrainingData(input);
    input.school.lessons[0].end = "2026-09-15T07:00:00Z";
    expect(result.school?.lessons[0]?.end).toBe("2026-09-15T06:45:00Z");
    expect(Object.isFrozen(result.school?.lessons)).toBe(true);
    expect(Object.isFrozen(result.pauses?.[0])).toBe(true);
  });
  it("keeps unknown pauses distinct from no pauses and does not classify a title", () => {
    expect(validateShiftTrainingData({ version: 1, pauses: null, school: null }).pauses).toBeNull();
    expect(validateShiftTrainingData({ version: 1, pauses: [], school: null }).pauses).toEqual([]);
    expect(
      saved({ version: 1, pauses: null, school: null }, { ...entry, title: "Schule" }).data.school,
    ).toBeNull();
  });
  it("accepts explicit school details and preserves nullable travel", () => {
    requireShiftTrainingParent(saved(), entry);
    expect(
      validateShiftTrainingData({
        ...school,
        school: { ...school.school, travelToWorkMinutes: null },
      }).school?.travelToWorkMinutes,
    ).toBeNull();
  });
  it("stores a versioned, minute-accurate school-to-work interval without rewriting old data", () => {
    const old = validateShiftTrainingData(school);
    const current = validateShiftTrainingData({
      ...school,
      version: 3,
      exam: null,
      school: {
        ...school.school,
        travelToWorkInterval: {
          start: "2026-09-15T07:30:00Z",
          end: "2026-09-15T07:50:00Z",
        },
        travelFromWorkInterval: null,
      },
    });
    expect(old.version).toBe(1);
    expect(old.school?.travelToWorkInterval).toBeUndefined();
    expect(current.version).toBe(3);
    expect(current.school?.travelToWorkInterval?.end).toBe("2026-09-15T07:50:00Z");
    expect(Object.isFrozen(current.school?.travelToWorkInterval)).toBe(true);
    requireShiftTrainingParent(saved(current), entry);
  });
  it("rejects unversioned, contradictory, overlapping or remote school travel intervals", () => {
    const interval = { start: "2026-09-15T07:30:00Z", end: "2026-09-15T07:50:00Z" };
    const v3 = {
      ...school,
      version: 3,
      exam: null,
      school: { ...school.school, travelToWorkInterval: interval, travelFromWorkInterval: null },
    };
    expect(() => validateShiftTrainingData({ ...school, school: v3.school })).toThrow();
    expect(() =>
      validateShiftTrainingData({
        ...v3,
        school: { ...school.school, travelToWorkInterval: interval },
      }),
    ).toThrow();
    expect(() =>
      validateShiftTrainingData({
        ...v3,
        school: { ...v3.school, travelToWorkMinutes: 21 },
      }),
    ).toThrow("Wegezeit");
    expect(() =>
      validateShiftTrainingData({
        ...v3,
        school: {
          ...v3.school,
          travelToWorkInterval: { start: "2026-09-15T06:10:00Z", end: "2026-09-15T06:30:00Z" },
        },
      }),
    ).toThrow("überschneiden");
    const remote = validateShiftTrainingData({
      ...v3,
      school: {
        ...v3.school,
        travelToWorkInterval: {
          start: "2026-09-17T07:30:00Z",
          end: "2026-09-17T07:50:00Z",
        },
      },
    });
    expect(() => requireShiftTrainingParent(saved(remote), entry)).toThrow("Weg liegt nicht");
  });
  it("validates a separately classified written final exam without inferring § 10 eligibility", () => {
    const data = validateShiftTrainingData({
      version: 2,
      pauses: [{ start: "2026-09-15T08:00:00Z", end: "2026-09-15T08:30:00Z" }],
      school: null,
      exam: {
        kind: "EXAM",
        requiredByRuleOrContract: true,
        finalWritten: true,
        precedingWorkDate: "2026-09-14",
        participation: [
          { start: "2026-09-15T06:00:00Z", end: "2026-09-15T08:00:00Z" },
          { start: "2026-09-15T08:30:00Z", end: "2026-09-15T10:00:00Z" },
        ],
        travelToWorkMinutes: 0,
        travelFromWorkMinutes: null,
      },
    });
    expect(data.exam?.finalWritten).toBe(true);
    expect(data.exam?.travelFromWorkMinutes).toBeNull();
    requireShiftTrainingParent(saved(data), entry);
    expect(Object.isFrozen(data.exam?.participation)).toBe(true);
  });
  it("validates located exam travel separately from participation and legacy minutes", () => {
    const exam = {
      kind: "EXAM",
      requiredByRuleOrContract: true,
      finalWritten: false,
      precedingWorkDate: null,
      participation: [
        { start: "2026-09-15T06:00:00Z", end: "2026-09-15T08:00:00Z" },
        { start: "2026-09-15T08:30:00Z", end: "2026-09-15T10:00:00Z" },
      ],
      travelToWorkMinutes: 20,
      travelFromWorkMinutes: 0,
      travelToWorkInterval: {
        start: "2026-09-15T10:00:00Z",
        end: "2026-09-15T10:20:00Z",
      },
      travelFromWorkInterval: null,
    };
    const value = {
      version: 3,
      pauses: [{ start: "2026-09-15T08:00:00Z", end: "2026-09-15T08:30:00Z" }],
      school: null,
      exam,
    };
    const data = validateShiftTrainingData(value);
    expect(data.exam?.travelToWorkInterval?.end).toBe("2026-09-15T10:20:00Z");
    requireShiftTrainingParent(saved(data), entry);
    expect(() => validateShiftTrainingData({ ...value, version: 2 })).toThrow();
    expect(() =>
      validateShiftTrainingData({
        ...value,
        exam: { ...exam, travelToWorkMinutes: 19 },
      }),
    ).toThrow("Wegezeit");
    expect(() =>
      validateShiftTrainingData({
        ...value,
        exam: {
          ...exam,
          travelToWorkInterval: {
            start: "2026-09-15T09:30:00Z",
            end: "2026-09-15T09:50:00Z",
          },
        },
      }),
    ).toThrow("überschneiden");
  });
  it("rejects mixed school/exam facts, overlapping pauses and unsupported version fields", () => {
    const exam = {
      kind: "EXAM",
      requiredByRuleOrContract: null,
      finalWritten: null,
      precedingWorkDate: null,
      participation: [{ start: "2026-09-15T06:00:00Z", end: "2026-09-15T07:00:00Z" }],
      travelToWorkMinutes: 0,
      travelFromWorkMinutes: 0,
    };
    const value = { version: 2, pauses: null, school: null, exam };
    expect(() => validateShiftTrainingData({ ...school, exam })).toThrow();
    expect(() => validateShiftTrainingData({ ...value, school: school.school })).toThrow();
    expect(() =>
      validateShiftTrainingData({
        ...value,
        exam: { ...exam, kind: "EXTERNAL_TRAINING", finalWritten: true },
      }),
    ).toThrow();
    expect(() =>
      validateShiftTrainingData({
        ...value,
        pauses: [{ start: "2026-09-15T06:30:00Z", end: "2026-09-15T06:45:00Z" }],
      }),
    ).toThrow();
    expect(() =>
      requireShiftTrainingParent(saved(validateShiftTrainingData(value)), {
        ...entry,
        type: "DAY",
      }),
    ).toThrow();
    expect(() =>
      requireShiftTrainingParent(
        saved(
          validateShiftTrainingData({
            ...value,
            exam: { ...exam, finalWritten: true, precedingWorkDate: entry.date },
          }),
        ),
        entry,
      ),
    ).toThrow("vorausgehende Arbeitstag");
  });
  it.each([
    { version: 2 },
    { extra: true },
    { school: { ...school.school, lessons: [] } },
    { school: { ...school.school, travelToWorkMinutes: -1 } },
    { pauses: [{ start: "2026-09-15T06:20:00Z", end: "2026-09-15T06:30:00Z" }] },
    { pauses: [{ start: "2026-09-15T08:30:00Z", end: "2026-09-15T08:00:00Z" }] },
    { pauses: [{ start: "2026-09-15T08:00:01Z", end: "2026-09-15T08:30:00Z" }] },
    {
      pauses: [
        { start: "2026-09-15T08:00:00Z", end: "2026-09-15T08:30:00Z" },
        { start: "2026-09-15T08:20:00Z", end: "2026-09-15T08:40:00Z" },
      ],
    },
  ])("rejects invalid school/pause data %j", (patch) =>
    expect(() => validateShiftTrainingData({ ...school, ...patch })).toThrow(),
  );
  it("rejects wrong types, out-of-bounds pauses and total mismatch without judging legality", () => {
    expect(() =>
      requireShiftTrainingParent(saved(school, { ...entry, type: "DAY" }), {
        ...entry,
        type: "DAY",
      }),
    ).toThrow();
    expect(() => requireShiftTrainingParent(saved(), { ...entry, breakMinutes: 60 })).toThrow();
    const short = {
      version: 1 as const,
      school: null,
      pauses: [{ start: "2026-09-15T08:00:00Z", end: "2026-09-15T08:05:00Z" }],
    };
    requireShiftTrainingParent(saved(short), { ...entry, breakMinutes: 5 });
    expect(() =>
      requireShiftTrainingParent(
        saved({
          ...short,
          pauses: [{ start: "2026-09-15T05:00:00Z", end: "2026-09-15T05:05:00Z" }],
        }),
        { ...entry, breakMinutes: 5 },
      ),
    ).toThrow();
  });
  it("makes edited or deleted shifts and changed time zones ineligible", () => {
    const result = saved();
    expect(isCurrentShiftTraining(result, entry, "Europe/Berlin")).toBe(true);
    for (const changed of [
      { ...entry, revision: entry.revision + 1 },
      { ...entry, date: "2026-09-16" },
      { ...entry, updatedAt: "2099-01-01T00:00:00Z" },
      { ...entry, deletedAt: entry.updatedAt },
    ])
      expect(isCurrentShiftTraining(result, changed, "Europe/Berlin")).toBe(false);
    expect(isCurrentShiftTraining(result, entry, "UTC")).toBe(false);
    expect(() =>
      requireShiftTrainingParent(result, { ...entry, revision: entry.revision - 1 }),
    ).toThrow();
  });
  it("preserves stale evidence without accepting a future parent", () => {
    requireShiftTrainingParent(saved(), {
      ...entry,
      revision: entry.revision + 1,
      allDay: true,
      type: "FREE",
    });
    expect(() => requireShiftTrainingParent({ ...saved(), shiftId: "other" }, entry)).toThrow();
  });
  it("records actual pauses across midnight and the repeated DST hour", () => {
    const night = shift({
      date: "2026-10-24",
      startTime: "21:00",
      endTime: "07:00",
      breakMinutes: 60,
    });
    const data: ShiftTrainingData = {
      version: 1,
      school: null,
      pauses: [{ start: "2026-10-25T02:15:00+02:00", end: "2026-10-25T02:15:00+01:00" }],
    };
    requireShiftTrainingParent(saved(data, night), night);
    expect(() =>
      requireShiftTrainingParent(
        saved(data, { ...night, startTime: "02:15", date: "2026-10-25" }),
        { ...night, startTime: "02:15", date: "2026-10-25" },
      ),
    ).toThrow();
  });
});

describe("training profile selection boundaries", () => {
  const savedProfile = { data: profile, revision: 1, updatedAt: "2026-09-01T00:00:00Z" };

  it("rejects duplicate dates, including future duplicates, independently of input order", () => {
    const future = { ...savedProfile, data: { ...profile, effectiveFrom: "2027-09-01" } };
    for (const history of [
      [savedProfile, savedProfile],
      [future, savedProfile, future],
      [future, future, savedProfile],
    ]) {
      expect(() => trainingProfileForDate(history, "2026-09-15")).toThrow(/eindeutige/);
    }
  });
  it("returns a detached immutable selected profile while preserving the confirmed training year", () => {
    const raw = structuredClone(savedProfile);
    const selected = trainingProfileForDate([raw], "2028-01-01")!;
    expect(selected.data.training?.year).toBe(1);
    expect(selected).not.toBe(raw);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected.data.training)).toBe(true);
    Object.assign(raw.data.training!, { profession: "changed" });
    expect(selected.data.training?.profession).toBe("Pflegefachperson");
  });
  it.each([
    { revision: 0 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { updatedAt: "invalid" },
    { data: { ...profile, effectiveFrom: "2026-02-30" } },
    { inferred: true },
  ])("rejects malformed saved history %#", (change) => {
    expect(() =>
      trainingProfileForDate([{ ...savedProfile, ...change } as typeof savedProfile], "2026-09-15"),
    ).toThrow();
  });
});
