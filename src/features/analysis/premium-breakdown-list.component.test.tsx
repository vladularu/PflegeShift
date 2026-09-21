import { fireEvent, render, within } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { createManualMonthlyPayEstimate } from "@/engine/pay-fallback";
import { PremiumBreakdownList } from "./premium-breakdown-list";

const pay = {
  ...createManualMonthlyPayEstimate("2026-09", 320000),
  timePremiumAmount: 45,
  shiftBreakdowns: [
    {
      shiftId: "later",
      date: "2026-09-20",
      netMinutes: 480,
      overtimeBaseAmount: 0,
      overtimePremiumAmount: 0,
      totalAmount: 40,
      premiumLines: [
        {
          key: "night",
          label: "Nachtarbeit",
          minutes: 180,
          percentage: 20,
          hourlyRate: 25,
          amount: 15,
        },
        {
          key: "sunday",
          label: "Sonntagsarbeit",
          minutes: 240,
          percentage: 25,
          hourlyRate: 25,
          amount: 25,
        },
      ],
    },
    {
      shiftId: "earlier",
      date: "2026-09-01",
      netMinutes: 480,
      overtimeBaseAmount: 0,
      overtimePremiumAmount: 0,
      totalAmount: 5,
      premiumLines: [
        {
          key: "night",
          label: "Nachtarbeit",
          minutes: 60,
          percentage: 20,
          hourlyRate: 25,
          amount: 5,
        },
      ],
    },
  ],
};
describe("premium details interaction", () => {
  it("opens individual services and filters without replacing the monthly total", async () => {
    const screen = await render(<PremiumBreakdownList pay={pay} shifts={[]} />);
    expect(screen.queryByText("Sonntagsarbeit")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /Sonntag, 25/ }));
    expect(screen.getByText(/Gefiltert: Sonntag/)).toBeTruthy();
    expect(within(screen.getByTestId("analysis-detail-summary")).getByText("45,00 €")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /Dienst, 25/ }));
    expect(screen.getByText("Sonntagsarbeit")).toBeTruthy();
    expect(screen.queryByText("Nachtarbeit")).toBeNull();
    expect(screen.getByText(/Berücksichtigte Zeit: 4:00 h/)).toBeTruthy();
    expect(screen.getByText(/25 % · Stundenbasis 25,00/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /Alle, 45/ }));
    expect(screen.queryByText(/Gefiltert:/)).toBeNull();
    expect(screen.queryByText("Sonntagsarbeit")).toBeNull();
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(2);
  });
  it("explains a tariff month without premiums", async () => {
    const screen = await render(
      <PremiumBreakdownList
        pay={{ ...pay, timePremiumAmount: 0, shiftBreakdowns: [] }}
        shifts={[]}
      />,
    );
    expect(
      screen.getByLabelText(
        "Keine Zeitzuschläge. In diesem Monat wurden keine Zeitzuschläge berechnet.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
