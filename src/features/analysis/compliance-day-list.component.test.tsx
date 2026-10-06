import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { ComplianceIssue, MonthlyComplianceResult, ShiftEntry } from "@/domain/types";
import { Temporal } from "@js-temporal/polyfill";
import { checkDate } from "./compliance-issue-content";
import { ComplianceDayList } from "./compliance-day-list";
jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual<{ default: object }>("react-native-safe-area-context/jest/mock").default,
);
let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));
const shift: ShiftEntry = {
  kind: "SHIFT",
  id: "late",
  templateId: null,
  date: "2026-11-30",
  title: "Spät",
  type: "LATE",
  startTime: "13:18",
  endTime: "21:30",
  breakMinutes: 30,
  color: "#227766",
  symbol: "S",
  note: null,
  overtimeMinutes: 0,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  deletedAt: null,
};
const early = {
  ...shift,
  id: "early",
  date: "2026-12-01",
  title: "Früh",
  startTime: "07:00",
  endTime: "15:12",
};
const issue = (change: Partial<ComplianceIssue> = {}): ComplianceIssue => ({
  id: "rest",
  date: "2026-12-01",
  kind: "LEGAL",
  rule: "ARBZG_5_REST_10H",
  severity: "critical",
  title: "Ruhezeit unter 10 Stunden",
  description:
    "Zwischen den Diensten liegen nur 9.5 h Ruhezeit. Damit wird auch die für Krankenhäuser und Pflegeeinrichtungen mögliche Verkürzung auf 10 Stunden unterschritten.",
  relatedShiftIds: [shift.id, early.id],
  ...change,
});
const result = (issues: readonly ComplianceIssue[]): MonthlyComplianceResult => ({
  month: "2026-12",
  issues,
  affectedDates: issues.map((i) => i.date),
  criticalCount: 1,
  warningCount: 1,
  infoCount: 0,
});
const list = (
  issues: readonly ComplianceIssue[],
  shifts: readonly ShiftEntry[] = [early, shift],
  showPlanning = true,
) => (
  <ComplianceDayList
    compliance={result(issues)}
    shifts={shifts}
    showPlanning={showPlanning}
    timeZone="Europe/Berlin"
  />
);

describe("visible check timelines", () => {
  it.each([1, 3.1])(
    "shows both endpoints and the gap without opening an explanation at text scale %s",
    async (scale) => {
      mockFontScale = scale;
      const screen = await render(list([issue()]));
      expect(screen.getByText("Ruhezeit zu kurz")).toBeTruthy();
      expect(screen.getByText("9:30 h")).toBeTruthy();
      expect(screen.getByText("Spät endet")).toBeTruthy();
      expect(screen.getByText("Früh beginnt")).toBeTruthy();
      expect(screen.getByText("21:30")).toBeTruthy();
      expect(screen.getByText("07:00")).toBeTruthy();
      expect(screen.getByText("Mindestens 10 Std. Ruhezeit nötig.")).toBeTruthy();
      expect(screen.queryByText(issue().description)).toBeNull();
      expect(screen.queryByRole("button", { name: /Erklärung|Über die Prüfung/ })).toBeNull();
      expect(screen.queryByTestId("check-shift-late")).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: /Dienste ansehen:/ }));
      expect(screen.getAllByTestId(/^check-shift-/).map((row) => row.props.testID)).toEqual([
        "check-shift-late",
        "check-shift-early",
      ]);
      expect(screen.getByText("13:18–21:30")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Auswahl abbrechen" }));
      await waitFor(() => expect(screen.queryByTestId("check-shift-late")).toBeNull());
      expect(screen.getByText("9:30 h")).toBeTruthy();
    },
  );
  it("keeps every finding immediately visible, in date and severity order", async () => {
    const screen = await render(
      list([
        issue({
          id: "later",
          date: "2026-12-04",
          rule: "TEST",
          title: "Später",
          description: "Später prüfen",
          kind: "PLANNING",
          severity: "warning",
        }),
        issue(),
      ]),
    );
    expect(screen.getAllByRole("header").map((h) => h.props.children)).toEqual([
      "1. Dezember",
      "4. Dezember",
    ]);
    expect(screen.getByTestId("check-details-rest")).toBeTruthy();
    expect(screen.getByTestId("check-details-later")).toBeTruthy();
    expect(screen.getByText("Später prüfen")).toBeTruthy();
  });
  it("closes a planning sheet when the finding is filtered out", async () => {
    const planning = issue({ id: "planning", kind: "PLANNING" });
    const screen = await render(list([planning]));
    await fireEvent.press(screen.getByRole("button", { name: /Dienste ansehen:/ }));
    await screen.rerender(list([planning], [shift, early], false));
    expect(screen.queryByTestId("check-shift-late")).toBeNull();
    expect(screen.getByText(/Planungshinweise ausgeblendet/)).toBeTruthy();
    expect(screen.getByText("Keine Auffälligkeiten")).toBeTruthy();
    await screen.rerender(list([planning]));
    expect(screen.queryByTestId("check-shift-late")).toBeNull();
  });
  it.each([1, 3.1])(
    "keeps a long work series compact and opens all days at text scale %s",
    async (scale) => {
      mockFontScale = scale;
      const shifts = Array.from({ length: 12 }, (_, index) => ({
        ...shift,
        id: `day-${index}`,
        date: Temporal.PlainDate.from("2026-11-23").add({ days: index }).toString(),
      }));
      const series = issue({
        id: "series",
        rule: "PLANNING_7_DAYS",
        kind: "PLANNING",
        date: "2026-12-04",
        description: "12 aufeinanderfolgende Arbeitstage wurden erkannt.",
        relatedShiftIds: shifts.map((s) => s.id),
      });
      const screen = await render(list([series], [...shifts].reverse()));
      expect(screen.getByText("12 Arbeitstage hintereinander")).toBeTruthy();
      expect(screen.getByText("23. November")).toBeTruthy();
      expect(screen.getAllByText("4. Dezember")).toHaveLength(2);
      expect(screen.queryByTestId("check-shift-day-0")).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: /Dienste ansehen:/ }));
      expect(screen.getAllByTestId(/^check-shift-/).map((r) => r.props.testID)).toEqual(
        shifts.map((s) => `check-shift-${s.id}`),
      );
      expect(screen.getByTestId("check-shift-day-0").props.accessibilityLabel).toBe(
        "Spät, 23. November 2026, 13:18–21:30",
      );
    },
  );
  it("falls back without a made-up gap and explains missing/deleted shifts", async () => {
    const screen = await render(list([issue()], [{ ...early, deletedAt: "2026-12-01" }, shift]));
    expect(screen.queryByText("9:30 h")).toBeNull();
    expect(screen.getByText("Einige zugehörige Dienste sind nicht mehr verfügbar.")).toBeTruthy();
    expect(screen.getByText("Nur 9,5 Std. Ruhezeit.")).toBeTruthy();
  });
  it("shows an unknown finding fully without a hidden explanation", async () => {
    const finding = issue({
      rule: "UNKNOWN",
      title: "Offene Bedingung",
      description: "Unbekannte Bedingung und Frist bleiben sichtbar.",
      relatedShiftIds: [],
    });
    const screen = await render(list([finding], []));
    expect(screen.getByText(finding.description)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("centers an actually completed result", async () => {
    const screen = await render(list([], []));
    expect(screen.getByTestId("check-complete")).toHaveStyle({
      flexGrow: 1,
      minHeight: 280,
      justifyContent: "center",
      alignItems: "center",
    });
    expect(screen.getByRole("header", { name: "Prüfung abgeschlossen" })).toBeTruthy();
  });
});
it("formats dates even when localization is unavailable", () => {
  const locale = jest
    .spyOn(Temporal.PlainDate.prototype, "toLocaleString")
    .mockImplementation(() => {
      throw new Error("Unsupported runtime localization");
    });
  try {
    expect(checkDate("2026-08-25")).toBe("25. August 2026");
    expect(checkDate("2024-02-29", false)).toBe("29. Februar");
    expect(checkDate("2026-02-30")).toBe("Datum nicht verfügbar");
    expect(locale).not.toHaveBeenCalled();
  } finally {
    locale.mockRestore();
  }
});
