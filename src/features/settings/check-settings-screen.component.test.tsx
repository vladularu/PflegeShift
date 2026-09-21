import { act, fireEvent, render as renderNative, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { CheckSettingsScreen } from "./check-settings-screen";
import { CheckPreferencesProvider, useCheckPreferences } from "./check-preferences";
import { AssessmentSummaryCard } from "@/features/analysis/analysis-screen";
import { AnnualReportScreen } from "@/features/analysis/annual-report-view";
import { buildAnnualCoreReport } from "@/features/analysis/annual-core-report";
import { classifyChecks } from "@/features/analysis/check-visibility";
import type { MonthlyComplianceResult } from "@/domain/types";

const render = (ui: ReactNode) =>
  renderNative(<CheckPreferencesProvider>{ui}</CheckPreferencesProvider>);

const mockDb = {};
const mockLoad = jest.fn<() => Promise<boolean>>();
const mockSave = jest.fn<(db: unknown, value: boolean) => Promise<void>>();
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDb }));
jest.mock("@/infrastructure/database/preferences-repository", () => ({
  loadPlanningHintsPreference: () => mockLoad(),
  savePlanningHintsPreference: (db: unknown, value: boolean) => mockSave(db, value),
}));
beforeEach(() => {
  mockLoad.mockReset().mockResolvedValue(true);
  mockSave.mockReset().mockResolvedValue();
});

it("loads the saved choice and explains the shared display setting", async () => {
  mockLoad.mockResolvedValue(false);
  const screen = await render(<CheckSettingsScreen />);
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise").props.value).toBe(false));
  expect(screen.getByText(/Deine Auswahl gilt für Monats- und Jahresauswertung/)).toBeTruthy();
  expect(mockSave).not.toHaveBeenCalled();
});

it("updates already mounted month and year cards from the same saved selection", async () => {
  const issues: MonthlyComplianceResult["issues"] = [
    {
      id: "legal",
      kind: "LEGAL",
      severity: "critical",
      rule: "REST",
      title: "Gesetzlicher Testhinweis",
      description: "",
      date: "2026-09-01",
      relatedShiftIds: [],
    },
    {
      id: "info",
      kind: "LEGAL",
      severity: "info",
      rule: "EVIDENCE",
      title: "Fehlende Angaben",
      description: "",
      date: "2026-09-01",
      relatedShiftIds: [],
    },
    {
      id: "planning",
      kind: "PLANNING",
      severity: "warning",
      rule: "NIGHTS",
      title: "Freiwilliger Testhinweis",
      description: "",
      date: "2026-09-01",
      relatedShiftIds: [],
    },
  ];
  const compliance: MonthlyComplianceResult = {
    month: "2026-09",
    issues,
    criticalCount: 1,
    warningCount: 1,
    infoCount: 1,
    affectedDates: ["2026-09-01"],
  };
  const core = buildAnnualCoreReport(2026, [], { timeZone: "Europe/Berlin" });
  const report = {
    ...core,
    complianceCoverageComplete: true,
    months: core.months.map((month, index) => ({
      ...month,
      checkCounts: classifyChecks(index === 8 ? issues : []),
    })),
  };
  function Month() {
    const preferences = useCheckPreferences();
    return (
      <AssessmentSummaryCard
        compliance={compliance}
        expanded
        onToggle={() => {}}
        shifts={[]}
        showPlanning={preferences.enabled !== false}
      />
    );
  }
  const screen = await render(
    <>
      <CheckSettingsScreen />
      <Month />
      <AnnualReportScreen
        report={report}
        testMonths={[]}
        onBackToMonth={() => {}}
        onMoveYear={() => {}}
      />
    </>,
  );
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Prüfung, 3 Meldungen" })).toHaveLength(2),
  );
  expect(screen.getByText("Freiwilliger Testhinweis")).toBeTruthy();
  await fireEvent(screen.getByLabelText("Planungshinweise"), "valueChange", false);
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Prüfung, 2 Meldungen" })).toHaveLength(2),
  );
  expect(screen.queryByText("Freiwilliger Testhinweis")).toBeNull();
  expect(screen.getByText("Gesetzlicher Testhinweis")).toBeTruthy();
  expect(screen.getByText("Fehlende Angaben")).toBeTruthy();
  expect(screen.getAllByText(/Planungshinweise ausgeblendet/).length).toBeGreaterThan(0);
  await fireEvent(screen.getByLabelText("Planungshinweise"), "valueChange", true);
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Prüfung, 3 Meldungen" })).toHaveLength(2),
  );
  expect(screen.getByText("Freiwilliger Testhinweis")).toBeTruthy();
});

it("saves the choice and prevents overlapping writes", async () => {
  let resolve!: () => void;
  mockSave.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const screen = await render(<CheckSettingsScreen />);
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise")).toBeTruthy());
  await fireEvent(screen.getByLabelText("Planungshinweise"), "valueChange", false);
  expect(screen.getByLabelText("Planungshinweise").props.disabled).toBe(true);
  expect(mockSave).toHaveBeenCalledWith(mockDb, false);
  await act(async () => resolve());
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise").props.value).toBe(false));
});

it("keeps the previous choice on write failure and permits retry", async () => {
  mockSave.mockRejectedValueOnce(new Error("write failed"));
  const screen = await render(<CheckSettingsScreen />);
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise")).toBeTruthy());
  await fireEvent(screen.getByLabelText("Planungshinweise"), "valueChange", false);
  await waitFor(() => expect(screen.getByText(/Nicht gespeichert/)).toBeTruthy());
  expect(screen.getByLabelText("Planungshinweise").props.value).toBe(true);
  await fireEvent(screen.getByLabelText("Planungshinweise"), "valueChange", false);
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise").props.value).toBe(false));
});

it("shows a load error without writing defaults and can reload", async () => {
  mockLoad.mockRejectedValueOnce(new Error("read failed"));
  const screen = await render(<CheckSettingsScreen />);
  await waitFor(() =>
    expect(screen.getByText("Prüfungseinstellungen konnten nicht geladen werden.")).toBeTruthy(),
  );
  expect(mockSave).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Erneut versuchen"));
  await waitFor(() => expect(screen.getByLabelText("Planungshinweise")).toBeTruthy());
});
