import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import type { TrainingSnapshot } from "@/domain/training-data";
import type { CalendarEntry, MonthlyComplianceResult } from "@/domain/types";
import { service, youthFacts, youthInput, youthProfile } from "@/engine/youth-test-fixtures";
import { useTrainingCompliance } from "./use-training-compliance";

let mockSnapshot: TrainingSnapshot;
let mockStatus: "loading" | "ready" | "error";
let mockEntries: readonly CalendarEntry[];
let mockResolver = youthInput().ruleResolver;
const mockProfile = youthInput().profile;
jest.mock("@/application/training-provider", () => ({
  useTrainingData: () => ({
    ...mockSnapshot,
    status: mockStatus,
    error: mockStatus === "error" ? "Lesefehler" : null,
  }),
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftProfile: () => ({ profile: mockProfile }),
  usePflegeShiftEntries: () => ({ entries: mockEntries }),
}));
jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({ resolver: mockResolver }),
}));
function Probe({ month = "2026-09" }: { readonly month?: string }) {
  const adult: MonthlyComplianceResult = {
    month,
    criticalCount: 0,
    warningCount: 0,
    infoCount: 0,
    affectedDates: [],
    issues: [],
  };
  const result = useTrainingCompliance(month, adult);
  return <Text testID="result">{JSON.stringify(result)}</Text>;
}
beforeEach(() => {
  const { effectiveFrom: _date, ...context } = youthFacts;
  mockSnapshot = {
    profiles: [{ ...youthProfile, data: { ...youthProfile.data, version: 2, youth: context } }],
    shifts: [],
  };
  mockStatus = "ready";
  mockEntries = [];
  mockResolver = youthInput().ruleResolver;
});
describe("training analysis data invalidation", () => {
  it("does not show an adult clear result while training data loads or fails", async () => {
    mockStatus = "loading";
    const ui = await render(<Probe />);
    expect(ui.getByTestId("result").props.children).toBe("null");
    mockStatus = "error";
    await ui.rerender(<Probe />);
    expect(ui.getByTestId("result").props.children).toContain("Arbeitszeitprüfung unvollständig");
  });
  it("recomputes after a service change and after confirmed pauses load", async () => {
    const ui = await render(<Probe />);
    expect(JSON.parse(ui.getByTestId("result").props.children).issues).toEqual([]);
    const s = service("2026-09-15", "08:00", "17:30");
    mockEntries = [s.entry];
    await ui.rerender(<Probe />);
    expect(ui.getByTestId("result").props.children).toContain("PAUSE_DATA_MISSING");
    mockSnapshot = { ...mockSnapshot, shifts: [s.details] };
    await ui.rerender(<Probe />);
    expect(ui.getByTestId("result").props.children).toContain("DAILY_TIME");
    expect(ui.getByTestId("result").props.children).not.toContain("PAUSE_DATA_MISSING");
  });
  it("drops obsolete conclusions after backup replacement and period change", async () => {
    const s = service("2026-09-15", "08:00", "17:30");
    mockEntries = [s.entry];
    mockSnapshot = { ...mockSnapshot, shifts: [s.details] };
    const ui = await render(<Probe />);
    expect(ui.getByTestId("result").props.children).toContain("DAILY_TIME");
    mockSnapshot = { profiles: [], shifts: [] };
    await ui.rerender(<Probe month="2026-10" />);
    expect(JSON.parse(ui.getByTestId("result").props.children)).toMatchObject({
      month: "2026-10",
      issues: [],
    });
  });
});
