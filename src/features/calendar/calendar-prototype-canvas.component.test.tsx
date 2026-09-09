import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { useSharedValue } from "react-native-reanimated";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { PrototypeMonthContent, PrototypeYear } from "./calendar-prototype-canvas";
import { calendarPrototypeLayout } from "./calendar-prototype-layout";
import type { CalendarEntry } from "@/domain/types";

function Year({ year = "2026", entries = [] }: { year?: string; entries?: CalendarEntry[] }) {
  const progress = useSharedValue(0);
  return (
    <PrototypeYear
      layouts={Array.from({ length: 12 }, (_, i) =>
        calendarPrototypeLayout(`${year}-${String(i + 1).padStart(2, "0")}`, 430, 640),
      )}
      selectedMonth={`${year}-01`}
      referenceMonth="2026-09"
      progress={progress}
      onSelect={() => {}}
      entriesByDate={new Map([["2026-01-08", entries]])}
    />
  );
}
function Month() {
  const progress = useSharedValue(1);
  return (
    <PrototypeMonthContent
      layout={calendarPrototypeLayout("2026-01", 430, 640)}
      progress={progress}
      entriesByDate={new Map()}
      holidays={new Map()}
      visible
      display={{ labelMode: "FULL", showShiftTimes: true, showShiftDuration: false }}
      timeZone="Europe/Berlin"
    />
  );
}
describe("calendar orientation", () => {
  it("restores up to two live shift color marks, including the selected month", async () => {
    const entry = {
      kind: "SHIFT",
      id: "a",
      date: "2026-01-08",
      color: "#59CA50",
      deletedAt: null,
    } as CalendarEntry;
    const entries = [entry, { ...entry, id: "b", color: "#FFA338" }, { ...entry, id: "c" }];
    const screen = await render(<Year entries={entries} />);
    const marks = screen.getByTestId("calendar-mini-shifts-2026-01-08", {
      includeHiddenElements: true,
    });
    expect(marks.children).toHaveLength(2);
    expect(marks.children[0]).toHaveStyle({ backgroundColor: "#59CA50" });
    expect(marks.children[1]).toHaveStyle({ backgroundColor: "#FFA338" });
    await screen.rerender(
      <Year
        entries={[
          { ...entry, deletedAt: "2026-09-10" },
          { ...entry, kind: "APPOINTMENT" } as CalendarEntry,
        ]}
      />,
    );
    expect(
      screen.queryByTestId("calendar-mini-shifts-2026-01-08", { includeHiddenElements: true }),
    ).toBeNull();
  });
  it.each([false, true])("highlights only the real current month (dark=%s)", async (dark) => {
    const spy = jest
      .spyOn(jest.requireActual<typeof import("react-native")>("react-native"), "useColorScheme")
      .mockReturnValue(dark ? "dark" : "light");
    try {
      const palette = dark ? DARK_PALETTE : LIGHT_PALETTE;
      const screen = await render(<Year />);
      expect(screen.getByText("September", { includeHiddenElements: true })).toHaveStyle({
        color: palette.calendarYearAccent,
      });
      expect(screen.getByText("Januar", { includeHiddenElements: true })).toHaveStyle({
        color: palette.text,
      });
      await screen.rerender(<Year year="2027" />);
      expect(screen.getByText("September", { includeHiddenElements: true })).toHaveStyle({
        color: palette.text,
      });
    } finally {
      spy.mockRestore();
    }
  });
  it("shows faded boundary dates without claiming holiday coverage or adding editing targets", async () => {
    const screen = await render(<Month />);
    expect(screen.getByTestId("calendar-adjacent-2025-12-31")).toHaveStyle({ opacity: 0.5 });
    expect(screen.getByTestId("calendar-adjacent-2026-02-01")).toHaveTextContent("1");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
