import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { ComplianceIssue, MonthlyComplianceResult, ShiftEntry } from "@/domain/types";
import { Temporal } from "@js-temporal/polyfill";
import { checkDate } from "./compliance-issue-content";
import { ComplianceDayList } from "./compliance-day-list";

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context/jest/mock") as {
    default: object;
  };
  return actual.default;
});

let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));
const issue = (
  id: string,
  date: string,
  kind: ComplianceIssue["kind"] = "LEGAL",
): ComplianceIssue => ({
  id,
  date,
  kind,
  rule: "TEST",
  severity: kind === "LEGAL" ? "critical" : "warning",
  title: id,
  description: `Vollständige Erklärung für ${id}.`,
  relatedShiftIds: ["early", "missing"],
});
const result = (issues: ComplianceIssue[]): MonthlyComplianceResult => ({
  month: "2026-09",
  issues,
  affectedDates: issues.map((item) => item.date),
  criticalCount: 2,
  warningCount: 1,
  infoCount: 0,
});
const shift: ShiftEntry = {
  kind: "SHIFT",
  id: "early",
  templateId: null,
  date: "2026-09-03",
  title: "Frühdienst",
  type: "EARLY",
  startTime: "06:00",
  endTime: "14:00",
  breakMinutes: 30,
  color: "#227766",
  symbol: "F",
  note: null,
  overtimeMinutes: 0,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  deletedAt: null,
};

describe("daily compliance list", () => {
  it.each([1, 3.1])(
    "orders days and opens only the selected issue at text scale %s",
    async (fontScale) => {
      mockFontScale = fontScale;
      const compliance = result([
        issue("Später", "2026-09-25", "PLANNING"),
        issue("Früher", "2026-09-03"),
        issue("Weiterer Hinweis", "2026-09-03"),
      ]);
      const screen = await render(
        <ComplianceDayList compliance={compliance} shifts={[shift]} showPlanning />,
      );
      expect(screen.getAllByRole("header").map((header) => header.props.children)).toEqual([
        "3. September",
        "25. September",
      ]);
      expect(screen.queryByTestId("check-details-Planungshinweis")).toBeNull();
      await fireEvent.press(
        screen.getByRole("button", { name: /3. September 2026, Früher, Gesetzlich, Kritisch/ }),
      );
      expect(screen.getByTestId("check-details-Früher")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: /Früher, Gesetzlich, Kritisch/ }).props
          .accessibilityState.expanded,
      ).toBe(true);
      expect(screen.getByText("Frühdienst")).toBeTruthy();
      expect(screen.getByText("06:00–14:00")).toBeTruthy();
      expect(screen.getByText("Einige zugehörige Dienste sind nicht mehr verfügbar.")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: /Früher, Gesetzlich, Kritisch/ }));
      expect(screen.queryByTestId("check-details-Früher")).toBeNull();
      expect(screen.queryByTestId("check-details-Planungshinweis")).toBeNull();
      expect(screen.getByRole("button", { name: /Später, Planung, Warnung/ })).toBeTruthy();
    },
  );

  it("closes a selected planning issue when it becomes hidden and does not reopen it", async () => {
    const compliance = result([issue("Planungshinweis", "2026-09-25", "PLANNING")]);
    const screen = await render(
      <ComplianceDayList compliance={compliance} shifts={[]} showPlanning />,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: /Planungshinweis, Planung, Warnung/ }),
    );
    await screen.rerender(
      <ComplianceDayList compliance={compliance} shifts={[]} showPlanning={false} />,
    );
    expect(screen.queryByTestId("check-details-Planungshinweis")).toBeNull();
    expect(screen.getByText(/Planungshinweise ausgeblendet/)).toBeTruthy();
    expect(screen.getByText("Keine Auffälligkeiten")).toBeTruthy();
    await screen.rerender(<ComplianceDayList compliance={compliance} shifts={[]} showPlanning />);
    expect(screen.queryByTestId("check-details-Planungshinweis")).toBeNull();
  });
});

it("formats valid dates even when Temporal localization is unavailable on the device", () => {
  const locale = jest
    .spyOn(Temporal.PlainDate.prototype, "toLocaleString")
    .mockImplementation(() => {
      throw new Error("Unsupported runtime localization");
    });
  try {
    expect(checkDate("2026-08-25")).toBe("25. August 2026");
    expect(checkDate("2026-08-25", false)).toBe("25. August");
    expect(checkDate("2024-02-29")).toBe("29. Februar 2024");
    expect(checkDate("2026-02-30")).toBe("Datum nicht verfügbar");
    expect(checkDate("0000-00-00")).toBe("Datum nicht verfügbar");
    expect(locale).not.toHaveBeenCalled();
  } finally {
    locale.mockRestore();
  }
});
it("centers a completed result in the available space", async () => {
  const screen = await render(
    <ComplianceDayList compliance={result([])} shifts={[]} showPlanning />,
  );
  expect(screen.getByTestId("check-complete")).toHaveStyle({
    flexGrow: 1,
    minHeight: 280,
    justifyContent: "center",
    alignItems: "center",
  });
  expect(screen.getByRole("header", { name: "Prüfung abgeschlossen" })).toBeTruthy();
});
