import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, afterEach, describe, expect, it, jest } from "@jest/globals";
import { service, youthFacts, youthInput, youthProfile } from "@/engine/youth-test-fixtures";
import type { CalendarEntry } from "@/domain/types";
import type { TrainingComplianceData } from "./training-compliance";
import { useDeferredAnnualReport } from "./use-annual-report";

let mockTraining: TrainingComplianceData;
let mockEntries: readonly CalendarEntry[] = [];
const mockHistory = {
  status: "ready",
  profiles: [],
  allowanceDecisions: [],
  overtimeAllocations: [],
  paidAbsences: [],
  actualAnnualPayments: [],
};
jest.mock("@/application/training-provider", () => ({ useTrainingData: () => mockTraining }));
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationData: () => mockHistory,
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: mockEntries }),
}));
jest.mock("./use-local-reference-date", () => ({ useLocalReferenceDate: () => "2026-12-31" }));
jest.mock("@/ui/schedule-idle-work", () => ({
  scheduleIdleWork: (work: () => void) => {
    const id = setTimeout(work, 0);
    return () => clearTimeout(id);
  },
}));
const base = youthInput();
const inputs = {
  enabled: true,
  entries: [] as readonly CalendarEntry[],
  profile: base.profile,
  tariffDecisions: [],
  year: 2026,
  ruleResolver: base.ruleResolver,
  workPatternSettings: {
    workplaceCoverage: "UNKNOWN",
    assignment: "UNKNOWN",
    updatedAt: null,
  } as const,
};
const flush = () =>
  act(async () => {
    jest.runAllTimers();
  });
beforeEach(() => {
  jest.useFakeTimers();
  const { effectiveFrom: _date, ...context } = youthFacts;
  mockTraining = {
    status: "ready",
    error: null,
    shifts: [],
    profiles: [
      {
        ...youthProfile,
        data: { ...youthProfile.data, version: 2, youth: context },
      },
    ],
  };
  mockEntries = [];
});
afterEach(() => {
  jest.useRealTimers();
});

describe("annual training provider integration", () => {
  it("invalidates completed results after restored pause values change at the same revision", async () => {
    const s = service("2026-09-15", "08:00", "17:30");
    mockEntries = [s.entry];
    mockTraining = { ...mockTraining, shifts: [s.details] };
    const ui = await renderHook(() => useDeferredAnnualReport(inputs));
    await flush();
    const before = ui.result.current.report!.months[8].checkCounts!.legal;
    expect(before.warningCount).toBeGreaterThan(0);
    mockTraining = {
      ...mockTraining,
      shifts: [{ ...s.details, data: { ...s.details.data, pauses: null } }],
    };
    await ui.rerender({});
    expect(ui.result.current.report).toBeNull();
    await flush();
    expect(ui.result.current.report!.months[8].checkCounts!.legal.infoCount).toBeGreaterThan(
      before.infoCount,
    );
    expect(ui.result.current.report!.complianceCoverageComplete).toBe(false);
  });
  it("recomputes after an age-profile restore without changing service revisions", async () => {
    const s = service("2026-09-15", "08:00", "17:30");
    mockEntries = [s.entry];
    mockTraining = { ...mockTraining, shifts: [s.details] };
    const ui = await renderHook(() => useDeferredAnnualReport(inputs));
    await flush();
    const before = ui.result.current.report!;
    mockTraining = {
      ...mockTraining,
      profiles: [
        {
          ...mockTraining.profiles[0],
          data: {
            ...mockTraining.profiles[0].data,
            birthDate: "1990-01-01",
          },
        },
      ],
    };
    await ui.rerender({});
    await flush();
    expect(ui.result.current.report).not.toBe(before);
    expect(ui.result.current.report!.months[8].checkCounts!.legal.warningCount).toBe(0);
  });
  it("does not reuse ready coverage after a training reload fails", async () => {
    mockTraining = { ...mockTraining, profiles: [] };
    const ui = await renderHook(() => useDeferredAnnualReport(inputs));
    await flush();
    const before = ui.result.current.report!;
    mockTraining = { ...mockTraining, status: "error", error: "Lesefehler" };
    await ui.rerender({});
    await flush();
    expect(ui.result.current.report!.complianceCoverageComplete).toBe(false);
    expect(ui.result.current.report!.months[8].checkCounts!.legal.infoCount).toBe(1);
    expect(ui.result.current.report!.actualMinutes).toBe(before.actualMinutes);
  });
});
