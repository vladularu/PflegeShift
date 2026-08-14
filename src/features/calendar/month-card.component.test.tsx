import { render, within } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { useSharedValue } from "react-native-reanimated";

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

function MonthCardWithTransition({ progress }: { readonly progress: number }) {
  const stampTransitionProgress = useSharedValue(progress);
  return (
    <MonthCard
      bottomReserve={80}
      entriesByDate={new Map()}
      month="2026-08"
      onSelectDate={jest.fn()}
      pageHeight={700}
      profile={PROFILE}
      selectedDate={null}
      stampMode
      stampTransitionProgress={stampTransitionProgress}
      stampToolLabel={null}
    />
  );
}

describe("MonthCard", () => {
  it("places the ISO week number inside the Monday cell instead of a separate grid column", async () => {
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

    const monday = screen.getByRole("button", {
      name: new RegExp(formatDateTitle("2026-08-03")),
    });
    const weekNumber = within(monday).getByText("32");
    expect(weekNumber).toBeTruthy();
    expect(weekNumber).toHaveStyle({ left: 1 });
  });

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

  it("shows an outlined insertion slot on empty days while stamp mode is active", async () => {
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
        stampToolLabel={null}
      />,
    );

    const slot = screen.getByTestId("quick-stamp-slot-2026-08-04");
    expect(slot).toHaveStyle({
      minHeight: 17,
      borderWidth: 1,
      borderColor: LIGHT_PALETTE.border,
      borderRadius: 4,
      backgroundColor: LIGHT_PALETTE.overlaySubtle,
      opacity: 1,
    });
  });

  it("keeps insertion fields invisible at the beginning of the shared transition", async () => {
    const screen = await render(<MonthCardWithTransition progress={0} />);

    expect(screen.getByTestId("quick-stamp-slot-2026-08-04")).toHaveStyle({ opacity: 0 });
  });

  it("keeps the cell surface stable in stamp mode and only marks the date number", async () => {
    const screen = await render(
      <MonthCard
        bottomReserve={80}
        entriesByDate={new Map()}
        month="2026-08"
        onSelectDate={jest.fn()}
        pageHeight={700}
        profile={PROFILE}
        selectedDate="2026-08-04"
        stampMode
        stampToolLabel="Frühdienst"
      />,
    );

    const day = screen.getByRole("button", {
      name: new RegExp(formatDateTitle("2026-08-04")),
    });
    const dateNumber = within(day).getByText("4");

    expect(day).not.toHaveStyle({ backgroundColor: LIGHT_PALETTE.primarySoft });
    expect(dateNumber.parent).toHaveStyle({
      backgroundColor: LIGHT_PALETTE.calendarSelection,
    });
  });
});
