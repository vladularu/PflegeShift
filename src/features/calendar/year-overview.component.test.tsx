import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { UserProfile } from "@/domain/types";
import { YearOverview } from "@/features/calendar/year-overview";

const PROFILE: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2_400,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("YearOverview", () => {
  it("exposes the selected month and opens another month", async () => {
    const onSelectMonth = jest.fn();
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 430, height: 932 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}
      >
        <YearOverview
          entries={[]}
          onSelectMonth={onSelectMonth}
          profile={PROFILE}
          selectedMonth="2026-05"
          year={2026}
        />
      </SafeAreaProvider>,
    );

    const may = screen.getByRole("button", { name: "Mai 2026 öffnen" });
    expect(may.props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(screen.getByRole("button", { name: "Jan 2026 öffnen" }));
    expect(onSelectMonth).toHaveBeenCalledWith("2026-01");
  });
});
