import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import type { UserProfile } from "@/domain/types";
import { createVisibleMonthGrid, formatDateTitle } from "@/engine/calendar";
import { MonthCard } from "@/features/calendar/month-card";
import { LIGHT_PALETTE } from "@/theme/palette-values";

const PROFILE: UserProfile = {
  federalState: "NW",
  weeklyMinutes: 2_400,
  timeZone: "Europe/Berlin",
  tariff: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("MonthCard", () => {
  it("keeps interactive days outside the month at full contrast", async () => {
    const outsideDate = createVisibleMonthGrid("2026-08")[0].date;
    const screen = await render(
      <MonthCard
        bottomReserve={80}
        entriesByDate={new Map()}
        month="2026-08"
        onSelectDate={jest.fn()}
        pageHeight={700}
        profile={PROFILE}
        selectedDate={null}
      />,
    );

    const outsideDay = screen.getByRole("button", {
      name: new RegExp(formatDateTitle(outsideDate)),
    });
    expect(outsideDay).toHaveStyle({
      backgroundColor: LIGHT_PALETTE.outsideMonth,
    });
    expect(outsideDay).not.toHaveStyle({ opacity: 0.3 });
  });

  it("describes the active stamp action on every calendar day", async () => {
    const screen = await render(
      <MonthCard
        bottomReserve={80}
        entriesByDate={new Map()}
        month="2026-08"
        onSelectDate={jest.fn()}
        pageHeight={700}
        profile={PROFILE}
        selectedDate={null}
        stampMode
        stampToolLabel="Frühdienst"
      />,
    );

    const day = screen.getByRole("button", {
      name: new RegExp(formatDateTitle("2026-08-04")),
    });
    expect(day.props.accessibilityHint).toContain("Frühdienst");
    expect(day.props.accessibilityHint).toContain("entfernt");
  });
});
