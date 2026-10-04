import { describe, expect, it } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { calculateYouthCompliance } from "./youth-compliance";
import { at, service, youthFacts, youthInput, youthProfile } from "./youth-test-fixtures";
import type { YouthInput } from "./youth-types";
import type { SavedShiftTraining } from "@/domain/training-data";
import { youthBlockShiftBinding } from "@/domain/youth-block-binding";

function school(date = "2026-09-15", count = 6, block = false) {
  const times = [
    ["08:00", "08:45"],
    ["08:45", "09:30"],
    ["09:45", "10:30"],
    ["10:30", "11:15"],
    ["11:30", "12:15"],
    ["12:15", "13:00"],
  ];
  const s = service(
    date,
    "08:00",
    times[count - 1][1],
    [
      ["09:30", "09:45"],
      ["11:15", "11:30"],
    ],
    true,
  );
  const monday = Temporal.PlainDate.from(date).subtract({
    days: Temporal.PlainDate.from(date).dayOfWeek - 1,
  });
  const data: SavedShiftTraining["data"] = {
    ...s.details.data,
    school: {
      lessons: times
        .slice(0, count)
        .map(([start, end]) => ({ start: at(date, start), end: at(date, end) })),
      travelToWorkMinutes: 0,
      travelFromWorkMinutes: 0,
      block: block
        ? { startDate: monday.toString(), endDate: monday.add({ days: 4 }).toString() }
        : null,
    },
  };
  return { ...s, details: { ...s.details, data } };
}
function assess(list: ReturnType<typeof service>[], patch: Partial<YouthInput> = {}) {
  return calculateYouthCompliance(
    youthInput({ shifts: list.map((s) => s.entry), details: list.map((s) => s.details), ...patch }),
  );
}
const codes = (result: ReturnType<typeof assess>) => result.findings.map((f) => f.code);
const free = (date: string) => ({
  ...service(date).entry,
  type: "FREE" as const,
  allDay: true,
  startTime: null,
  endTime: null,
  breakMinutes: 0,
});

describe("school and weekly youth reference cases", () => {
  it("requires complete scope even for an empty calendar", () => {
    const result = assess([], { facts: [] });
    expect(result.status).toBe("INCOMPLETE");
    expect(codes(result)).toContain("SCOPE_INCOMPLETE");
  });
  it("accepts an explicitly shortened working day as the basis for 8.5 hours", () => {
    const list = [
      service("2026-09-14", "08:00", "12:00", []),
      service("2026-09-15", "08:00", "17:30"),
    ];
    expect(
      codes(assess(list, { facts: [{ ...youthFacts, shortenedWorkingDays: ["2026-09-14"] }] })),
    ).not.toContain("DAILY_TIME");
    expect(
      codes(
        assess([service("2026-09-14"), list[1]], {
          facts: [{ ...youthFacts, shortenedWorkingDays: ["2026-09-14"] }],
        }),
      ),
    ).toContain("DAILY_TIME");
  });
  it("does not invent shorter work from an empty or free day", () => {
    expect(
      codes(
        assess([service("2026-09-15", "08:00", "17:30")], {
          facts: [{ ...youthFacts, shortenedWorkingDays: ["2026-09-14"] }],
        }),
      ),
    ).toContain("DAILY_TIME");
  });
  it("protects a day of six individual 45-minute lessons against further employment", () => {
    const result = assess([school(), service("2026-09-15", "14:00", "16:00", [])]);
    expect(codes(result)).toContain("PROTECTED_SCHOOL_DAY");
    expect(codes(result)).toContain("DAILY_TIME");
  });
  it("protects only one of two long school days when one remains employment-free", () => {
    const result = assess([
      school(),
      school("2026-09-17"),
      service("2026-09-17", "14:00", "16:00", []),
    ]);
    expect(codes(result)).not.toContain("PROTECTED_SCHOOL_DAY");
    expect(codes(result)).not.toContain("DAILY_TIME");
  });
  it("does not divide one long lesson into six lesson units", () => {
    const s = service("2026-09-15", "08:00", "12:30", [], true);
    s.details = {
      ...s.details,
      data: {
        ...s.details.data,
        school: {
          lessons: [{ start: at("2026-09-15", "08:00"), end: at("2026-09-15", "12:30") }],
          travelToWorkMinutes: 0,
          travelFromWorkMinutes: 0,
          block: null,
        },
      },
    };
    expect(codes(assess([s, service("2026-09-15", "14:00", "16:00", [])]))).not.toContain(
      "PROTECTED_SCHOOL_DAY",
    );
  });
  it("counts school pauses and necessary travel for ordinary school-day credit", () => {
    const s = school("2026-09-15", 5);
    s.details.data = {
      ...s.details.data,
      school: { ...s.details.data.school!, travelToWorkMinutes: 30 },
    };
    const result = assess([s, service("2026-09-15", "13:00", "17:00", [])]);
    expect(codes(result)).toContain("DAILY_TIME");
    expect(codes(result)).toContain("SCHOOL_TRAVEL_POSITION");
  });
  it("uses a confirmed route as activity rather than silently treating it as a break", () => {
    const s = school("2026-09-15", 5);
    s.details.data = {
      ...s.details.data,
      version: 3,
      exam: null,
      school: {
        ...s.details.data.school!,
        travelToWorkMinutes: 30,
        travelFromWorkMinutes: 0,
        travelToWorkInterval: {
          start: at("2026-09-15", "12:15"),
          end: at("2026-09-15", "12:45"),
        },
        travelFromWorkInterval: null,
      },
    };
    const result = assess([s, service("2026-09-15", "13:00", "15:00", [])]);
    expect(codes(result)).not.toContain("SCHOOL_TRAVEL_POSITION");
    expect(codes(result)).toContain("BREAK_DURATION");
  });
  it("does not accept an unpaired school route as a completed time assessment", () => {
    const s = school("2026-09-15", 5);
    s.details.data = {
      ...s.details.data,
      version: 3,
      exam: null,
      school: {
        ...s.details.data.school!,
        travelToWorkMinutes: 30,
        travelFromWorkMinutes: 0,
        travelToWorkInterval: {
          start: at("2026-09-15", "12:15"),
          end: at("2026-09-15", "12:45"),
        },
        travelFromWorkInterval: null,
      },
    };
    const result = assess([s]);
    expect(codes(result)).toContain("SCHOOL_TRAVEL_POSITION");
    expect(result.status).toBe("INCOMPLETE");
  });
  it("does not silently interpret missing school travel as zero", () => {
    const s = school("2026-09-15", 5);
    s.details.data = {
      ...s.details.data,
      school: { ...s.details.data.school!, travelToWorkMinutes: null },
    };
    expect(codes(assess([s]))).toContain("SCHOOL_CREDIT_MISSING");
  });
  it("uses the school start, not a wider calendar envelope, for early-school protection", () => {
    const s = school();
    s.entry = { ...s.entry, startTime: "06:00" };
    expect(codes(assess([s, service("2026-09-15", "06:30", "07:30", [])]))).toContain(
      "WORK_BEFORE_EARLY_SCHOOL",
    );
  });
  it("ends late work at 20:00 before early school even when the following day is the 18th birthday", () => {
    const result = assess(
      [service("2026-09-14", "17:00", "22:00", [["19:00", "19:30"]]), school()],
      {
        profiles: [{ ...youthProfile, data: { ...youthProfile.data, birthDate: "2008-09-15" } }],
        facts: [{ ...youthFacts, multiShiftOperation: true }],
      },
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "EMPLOYMENT_WINDOW", date: "2026-09-14" }),
    );
  });
  it("recognizes five-day blocks of 25 individual lesson units across a month boundary", () => {
    const list = Array.from({ length: 5 }, (_, i) =>
      school(Temporal.PlainDate.from("2026-08-31").add({ days: i }).toString(), 5, true),
    );
    expect(codes(assess(list))).not.toContain("WORK_IN_SCHOOL_BLOCK");
    const result = assess([...list, service("2026-09-03", "14:00", "16:00", [])]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "WORK_IN_SCHOOL_BLOCK",
        date: "2026-09-01",
        severity: "WARNING",
      }),
    );
  });
  it("keeps the youth block review incomplete even after a current extra event is confirmed", () => {
    const list = Array.from({ length: 5 }, (_, i) =>
      school(Temporal.PlainDate.from("2026-09-14").add({ days: i }).toString(), 5, true),
    );
    const extra = service("2026-09-17", "14:00", "16:00", []);
    const binding = youthBlockShiftBinding(
      extra.entry,
      extra.details,
      youthInput().profile.timeZone,
    );
    expect(binding).not.toBeNull();
    const result = assess([...list, extra], {
      facts: [{ ...youthFacts, blockTrainingShiftIds: [binding!] }],
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "WORK_IN_SCHOOL_BLOCK", severity: "INCOMPLETE" }),
    );
  });
  it("requires confirmed block averages and handles an average changing within the week", () => {
    const list = Array.from({ length: 5 }, (_, i) =>
      school(Temporal.PlainDate.from("2026-09-14").add({ days: i }).toString(), 5, true),
    );
    expect(
      codes(assess(list, { facts: [{ ...youthFacts, averageWeeklyTrainingMinutes: null }] })),
    ).toContain("BLOCK_AVERAGE_MISSING");
    expect(
      codes(
        assess(list, {
          facts: [
            youthFacts,
            { ...youthFacts, effectiveFrom: "2026-09-16", averageWeeklyTrainingMinutes: 2300 },
          ],
        }),
      ),
    ).toContain("BLOCK_AVERAGE_CHANGED");
  });
  it("requires an explicit school-free replacement for permitted weekend employment", () => {
    const s = service("2026-09-19", "08:00", "12:00", []);
    expect(codes(assess([s]))).toContain("REPLACEMENT_DAY_MISSING");
    const input = { shifts: [s.entry, free("2026-09-18")] };
    expect(codes(assess([s], input))).not.toContain("REPLACEMENT_DAY_MISSING");
    expect(
      codes(
        assess([s, school("2026-09-18")], {
          shifts: [s.entry, school("2026-09-18").entry, free("2026-09-18")],
        }),
      ),
    ).toContain("REPLACEMENT_DAY_MISSING");
  });
  it("does not use one free day for both Saturday and Sunday employment", () => {
    const list = [
      service("2026-09-19", "08:00", "12:00", []),
      service("2026-09-20", "08:00", "12:00", []),
    ];
    const result = assess(list, { shifts: [...list.map((s) => s.entry), free("2026-09-18")] });
    expect(result.findings.filter((f) => f.code === "REPLACEMENT_DAY_MISSING")).toHaveLength(1);
  });
  it("distinguishes unconfirmed from ineligible weekend sectors", () => {
    const list = [service("2026-09-19", "08:00", "12:00", [])];
    expect(
      assess(list, { facts: [{ ...youthFacts, careInstitution: null }] }).findings,
    ).toContainEqual(
      expect.objectContaining({ code: "WEEKEND_ELIGIBILITY", severity: "INCOMPLETE" }),
    );
    expect(
      assess(list, { facts: [{ ...youthFacts, careInstitution: false }] }).findings,
    ).toContainEqual(expect.objectContaining({ code: "WEEKEND_ELIGIBILITY", severity: "WARNING" }));
  });
  it("treats minimum free Sundays as binding but free Saturdays as a recommendation", () => {
    const list = [5, 6, 12, 13, 19, 20].map((day) =>
      service("2026-09-" + String(day).padStart(2, "0"), "08:00", "12:00", []),
    );
    const result = assess(list);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "FREE_SUNDAYS", severity: "WARNING" }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "FREE_SATURDAYS", severity: "RECOMMENDATION" }),
    );
  });
  it("retains absolute Christmas protection despite the care-institution exception", () => {
    expect(
      codes(assess([service("2026-12-25", "08:00", "12:00", [])], { month: "2026-12" })),
    ).toContain("ABSOLUTE_HOLIDAY");
  });
  it("allows Christmas Eve until 14:00 but not a minute beyond", () => {
    expect(
      codes(assess([service("2026-12-24", "10:00", "14:00", [])], { month: "2026-12" })),
    ).not.toContain("HOLIDAY_EVE");
    expect(
      codes(assess([service("2026-12-24", "10:00", "14:01", [])], { month: "2026-12" })),
    ).toContain("HOLIDAY_EVE");
  });
  it("does not double-count a single overnight shift as two shifts with no rest", () => {
    const s = service("2026-09-15", "23:00", "03:00", []);
    const result = assess([s]);
    expect(codes(result)).not.toContain("DAILY_REST");
    expect(codes(result)).toContain("EMPLOYMENT_WINDOW");
  });
  it("does not guess ambiguous autumn-clock parent times", () => {
    const s = service("2026-10-25", "01:00", "04:00", []);
    s.entry = { ...s.entry, startTime: "02:30" };
    expect(codes(assess([s], { month: "2026-10" }))).toContain("TIMES_AMBIGUOUS");
  });
  it("does not turn missing previous-month times into zero hours in the current week", () => {
    const s = service("2026-08-31");
    s.entry = { ...s.entry, allDay: true, startTime: null, endTime: null };
    expect(codes(assess([s]))).toContain("WEEKLY_CREDIT_INCOMPLETE");
  });
  it("rejects malformed facts instead of approving the calendar", () => {
    expect(
      assess([], { facts: [{ ...youthFacts, averageDailyTrainingMinutes: Number.NaN }] }).status,
    ).toBe("INCOMPLETE");
    expect(codes(assess([], { facts: [youthFacts, youthFacts] }))).toContain("INVALID_FACTS");
  });
});
