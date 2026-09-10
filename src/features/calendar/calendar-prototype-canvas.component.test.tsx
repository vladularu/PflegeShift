import { render, within } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { useSharedValue } from "react-native-reanimated";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { PrototypeMonthContent, PrototypeYear } from "./calendar-prototype-canvas";
import { calendarPrototypeLayout } from "./calendar-prototype-layout";
import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import { CALENDAR_METRICS } from "@/theme/tokens";

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
function Month({
  month = "2026-01",
  height = 640,
  entriesByDate = new Map(),
  holidays = new Map(),
}: {
  month?: string;
  height?: number;
  entriesByDate?: ReadonlyMap<string, readonly CalendarEntry[]>;
  holidays?: ReadonlyMap<string, { name: string }>;
}) {
  const progress = useSharedValue(1);
  return (
    <PrototypeMonthContent
      layout={calendarPrototypeLayout(month, 430, height)}
      progress={progress}
      entriesByDate={entriesByDate}
      holidays={holidays}
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

const holidayName = "Tag der Deutschen Einheit";
const holidayShift: ShiftEntry = {
  kind: "SHIFT",
  id: "holiday-shift",
  date: "2026-10-03",
  templateId: null,
  title: "Spät",
  type: "LATE",
  startTime: "13:18",
  endTime: "21:30",
  breakMinutes: 30,
  color: "#F15B6E",
  symbol: "sun",
  note: null,
  overtimeMinutes: 0,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

describe("holiday entry alignment", () => {
  it.each([false, true])("keeps the first shift above the holiday in dark=%s", async (dark) => {
    const scheme = jest
      .spyOn(jest.requireActual<typeof import("react-native")>("react-native"), "useColorScheme")
      .mockReturnValue(dark ? "dark" : "light");
    try {
      const screen = await render(
        <Month
          month="2026-10"
          entriesByDate={
            new Map([
              [holidayShift.date, [holidayShift]],
              [
                "2026-10-02",
                [{ ...holidayShift, id: "neighbor", date: "2026-10-02", title: "Nachbar" }],
              ],
            ])
          }
          holidays={new Map([[holidayShift.date, { name: holidayName }]])}
        />,
      );
      const content = screen.getByText(holidayName).parent!;
      expect(
        within(content)
          .getAllByText(/^(Spät|13:18|Tag der Deutschen Einheit)$/)
          .map((node) => node.props.children),
      ).toEqual(["Spät", "13:18", holidayName]);
      expect(content).toHaveStyle({ marginTop: CALENDAR_METRICS.dayNumberHeight });
      expect(screen.getByText("Nachbar").parent?.parent?.parent).toHaveStyle({
        marginTop: CALENDAR_METRICS.dayNumberHeight,
      });
      expect(screen.getByText("Spät")).toHaveStyle({ height: CALENDAR_METRICS.entryRowHeight });
      expect(screen.getByText(holidayName)).toHaveStyle({
        height: CALENDAR_METRICS.entryRowHeight,
        color: (dark ? DARK_PALETTE : LIGHT_PALETTE).textMuted,
      });
    } finally {
      scheme.mockRestore();
    }
  });

  it("keeps a holiday without entries visible and removes it when holidays are hidden", async () => {
    const screen = await render(
      <Month month="2026-10" holidays={new Map([[holidayShift.date, { name: holidayName }]])} />,
    );
    expect(screen.getByText(holidayName)).toBeTruthy();
    expect(screen.queryByText("Spät")).toBeNull();
    await screen.rerender(<Month month="2026-10" />);
    expect(screen.queryByText(holidayName)).toBeNull();
  });

  it.each([
    { height: 540, expected: ["+20", "Testfeiertag"], rows: 2, gaps: 1 },
    { height: 760, expected: ["Spät", "13:18", "+19", "Testfeiertag"], rows: 4, gaps: 2 },
  ])(
    "reserves holiday and overflow rows in a six-week month at height=$height",
    async ({ height, expected, rows, gaps }) => {
      const date = "2026-08-08";
      const entries = Array.from({ length: 20 }, (_, i) => ({
        ...holidayShift,
        date,
        id: String(i),
      }));
      const screen = await render(
        <Month
          month="2026-08"
          height={height}
          entriesByDate={new Map([[date, entries]])}
          holidays={new Map([[date, { name: "Testfeiertag" }]])}
        />,
      );
      const content = screen.getByText("Testfeiertag").parent!;
      expect(
        within(content)
          .getAllByText(/^(Spät|13:18|\+\d+|Testfeiertag)$/)
          .map((node) => node.props.children),
      ).toEqual(expected);
      const layout = calendarPrototypeLayout("2026-08", 430, height);
      const occupiedHeight =
        CALENDAR_METRICS.dayNumberHeight +
        rows * CALENDAR_METRICS.entryRowHeight +
        gaps * CALENDAR_METRICS.chipGap;
      expect(occupiedHeight).toBeLessThan(layout.weekHeight);
    },
  );
});
