import { render } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { SalaryEstimateCaption } from "./salary-estimate-caption";

describe("salary estimate transparency", () => {
  it("shows a provisional estimate but does not override a manual decision", async () => {
    const pay = calculateMonthlyPayEstimate(
      "2026-07",
      [],
      {
        federalState: "NW",
        holidayRegion: "NONE",
        weeklyMinutes: 2310,
        timeZone: "Europe/Berlin",
        regularRotatingNightWork: false,
        sundayHolidayWorkEligible: true,
        allEmploymentWorkRecorded: true,
        tariff: {
          payGroup: "P8",
          payLevel: 4,
          sector: "BT_K",
          tariffRegion: "OTHER",
          fullTimeWeeklyMinutes: 2310,
        },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      null,
    );
    const assessment = { ...pay.assessment, estimateNote: "Vorläufige Schätzung" };
    const screen = await render(
      <SalaryEstimateCaption
        pay={{ ...pay, assessment, tariffLabel: "TVöD", confirmedAllowance: null }}
      />,
    );
    expect(screen.getByText(/Vorläufige Schätzung/)).toBeTruthy();
    await screen.rerender(
      <SalaryEstimateCaption
        pay={{ ...pay, assessment, tariffLabel: "TVöD", confirmedAllowance: "NONE" }}
      />,
    );
    expect(screen.queryByText(/Vorläufige Schätzung/)).toBeNull();
    expect(screen.getByText("TVöD")).toBeTruthy();
  });
});
