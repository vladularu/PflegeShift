import { fireEvent, render, within } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { useState } from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import type { UserProfile } from "@/domain/types";
import { createMonthWindow } from "./month-window";
import { CalendarStablePager } from "./calendar-stable-pager";
import { SharedCalendarMonth, SharedCalendarScene } from "./calendar-shared-scene";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import { PROTOTYPE_MONTH_NAMES } from "./calendar-prototype-layout";

const profile = {
  timeZone: "Europe/Berlin",
  federalState: "HE",
  holidayRegion: "NONE",
} as UserProfile;
const noop = () => {};
const onDate = jest.fn();

// Real scene + real three-slot pager + real month glyphs: no MonthCard stub.
function Harness() {
  const [month, setMonth] = useState("2026-09");
  const [mode, setMode] = useState<"MONTH" | "YEAR">("MONTH");
  const [revision, setRevision] = useState(0);
  const months = createMonthWindow(month, 24, 36);
  return (
    <>
      <Text testID="heading">
        {mode}:{month}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Jahr"
        onPress={() => setMode("YEAR")}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Heute"
        onPress={() => {
          setMonth("2026-09");
          setMode("MONTH");
          setRevision((r) => r + 1);
        }}
      />
      <SharedCalendarScene
        month={month}
        viewMode={mode}
        active
        bottomReserve={55}
        onSelectMonth={(m) => {
          setMonth(m);
          setMode("MONTH");
        }}
        onTransitionStart={noop}
        onTransitionComplete={noop}
      >
        <CalendarStablePager
          month={month}
          months={months}
          height={700}
          enabled={mode === "MONTH"}
          revision={revision}
          onBeginDrag={noop}
          onSettled={(e) => setMonth(months[Math.round(e.nativeEvent.contentOffset.y / 700)])}
          renderMonth={(m) => (
            <SharedCalendarMonth
              month={m}
              pageHeight={700}
              entriesByDate={new Map()}
              display={{ labelMode: "FULL", showShiftTimes: true, showShiftDuration: false }}
              profile={profile}
              ruleResolver={bundledRuleResolver}
              showHolidays
              onSelectDate={onDate}
              selectedDate="2026-09-09"
              accessibilityVisible={m === month}
              testData={false}
            />
          )}
        />
      </SharedCalendarScene>
    </>
  );
}

describe("permanent calendar slots with the real shared scene", () => {
  it("requires acknowledgement at the new center when viewport height changes", async () => {
    const month = "2026-09";
    const props = {
      month,
      months: createMonthWindow(month, 24, 36),
      enabled: true,
      revision: 0,
      onBeginDrag: noop,
      onSettled: noop,
      renderMonth: (value: string) => <Text>{value}</Text>,
    };
    const screen = await render(<CalendarStablePager {...props} height={700} />);
    const pager = screen.getByTestId("calendar-month-pager");
    await screen.rerender(<CalendarStablePager {...props} height={640} />);
    expect(pager.props.scrollEnabled).toBe(false);
    await fireEvent.scroll(pager, { nativeEvent: { contentOffset: { x: 0, y: 700 } } });
    expect(pager.props.scrollEnabled).toBe(false);
    await fireEvent.scroll(pager, { nativeEvent: { contentOffset: { x: 0, y: 640 } } });
    expect(pager.props.scrollEnabled).toBe(true);
    expect(screen.getByTestId("calendar-month-pager")).toBe(pager);
  });

  it("keeps the visible trailing slot on October until native center acknowledgement", async () => {
    const screen = await render(<Harness />);
    const pager = screen.getByTestId("calendar-month-pager");
    await fireEvent(pager, "scrollBeginDrag");
    await fireEvent(pager, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 0, y: 1400 } },
    });
    expect(screen.getByTestId("heading")).toHaveTextContent("MONTH:2026-10");
    for (const slot of [-1, 0, 1]) {
      expect(
        within(
          screen.getByTestId(`calendar-slot-${slot}`, { includeHiddenElements: true }),
        ).getByTestId("shared-month-2026-10", { includeHiddenElements: true }),
      ).toBeTruthy();
    }
    expect(pager.props.scrollEnabled).toBe(false);
    // Delayed or intermediate native events must not restore November prematurely.
    await fireEvent.scroll(pager, { nativeEvent: { contentOffset: { x: 0, y: 1100 } } });
    expect(pager.props.scrollEnabled).toBe(false);
    await fireEvent.scroll(pager, { nativeEvent: { contentOffset: { x: 0, y: 700 } } });
    expect(pager.props.scrollEnabled).toBe(true);
    expect(
      within(screen.getByTestId("calendar-slot-1", { includeHiddenElements: true })).getByTestId(
        "shared-month-2026-11",
        { includeHiddenElements: true },
      ),
    ).toBeTruthy();
    await fireEvent(pager, "scrollBeginDrag");
    await fireEvent(pager, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });
    expect(screen.getByTestId("heading")).toHaveTextContent("MONTH:2026-09");
    await fireEvent.scroll(pager, { nativeEvent: { contentOffset: { x: 0, y: 700 } } });
    expect(pager.props.scrollEnabled).toBe(true);
  });

  it("replaces an unacknowledged target with Today without accepting old momentum", async () => {
    const screen = await render(<Harness />);
    const pager = screen.getByTestId("calendar-month-pager");
    await fireEvent(pager, "scrollBeginDrag");
    const trailing = { nativeEvent: { contentOffset: { x: 0, y: 1400 } } };
    await fireEvent(pager, "momentumScrollEnd", trailing);
    await fireEvent.press(screen.getByRole("button", { name: "Heute" }));
    await fireEvent(pager, "momentumScrollEnd", trailing);
    expect(screen.getByTestId("heading")).toHaveTextContent("MONTH:2026-09");
    expect(
      within(screen.getByTestId("calendar-slot-1", { includeHiddenElements: true })).getByTestId(
        "shared-month-2026-09",
        { includeHiddenElements: true },
      ),
    ).toBeTruthy();
    await fireEvent.scroll(pager, { nativeEvent: { contentOffset: { x: 0, y: 700 } } });
    expect(pager.props.scrollEnabled).toBe(true);
  });
  it("keeps the same center page and glyphs for September → January → Today → year", async () => {
    const screen = await render(<Harness />);
    await fireEvent(screen.getByTestId("calendar-shared-scene"), "layout", {
      nativeEvent: { layout: { width: 430, height: 700 } },
    });
    const pager = screen.getByTestId("calendar-month-pager");
    const center = screen.getByTestId("calendar-slot-0");
    const september = screen.getByTestId("shared-month-2026-09");
    await fireEvent.press(screen.getByRole("button", { name: "Jahr" }));
    expect(
      screen.getByTestId("calendar-day-2026-09-09", { includeHiddenElements: true }),
    ).not.toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Januar 2026 öffnen" }));
    expect(screen.getByTestId("heading")).toHaveTextContent("MONTH:2026-01");
    expect(screen.getByTestId("shared-month-2026-01")).toBe(september);
    expect(screen.getByTestId("calendar-month-pager")).toBe(pager);
    expect(screen.getByTestId("calendar-slot-0")).toBe(center);
    expect(within(center).getByText("Neujahr", { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Heute" }));
    expect(screen.getByTestId("heading")).toHaveTextContent("MONTH:2026-09");
    expect(within(center).queryByText("Neujahr", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId("shared-month-2026-09")).toBe(september);
    await fireEvent.press(screen.getByRole("button", { name: "Jahr" }));
    const year = screen.getByTestId("calendar-year-overview-shell");
    expect(within(year).getAllByRole("button")).toHaveLength(12);
    expect(within(year).getByText("September", { includeHiddenElements: true })).toBeTruthy();
    // Selected month's dates belong to the permanent center, not a virtualized cell.
    expect(
      within(center).getAllByText("9", { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
    expect(
      StyleSheet.flatten(
        screen.getByTestId("calendar-day-2026-09-09", { includeHiddenElements: true }).parent?.props
          .style,
      ).opacity,
    ).toBe(0);
  });

  it("commits each swipe once, handles year boundaries, and ignores stale momentum after Today", async () => {
    const screen = await render(<Harness />);
    const pager = screen.getByTestId("calendar-month-pager");
    await fireEvent.press(screen.getByRole("button", { name: "Jahr" }));
    await fireEvent.press(screen.getByRole("button", { name: "Dezember 2026 öffnen" }));
    await fireEvent(pager, "scrollBeginDrag");
    const next = { nativeEvent: { contentOffset: { x: 0, y: 1400 }, velocity: { y: 0 } } };
    await fireEvent(pager, "scrollEndDrag", next);
    await fireEvent(pager, "momentumScrollEnd", next);
    expect(screen.getByTestId("heading")).toHaveTextContent("MONTH:2027-01");
    await fireEvent(pager, "scrollBeginDrag");
    await fireEvent.press(screen.getByRole("button", { name: "Heute" }));
    await fireEvent(pager, "momentumScrollEnd", next);
    expect(screen.getByTestId("heading")).toHaveTextContent("MONTH:2026-09");
    expect(screen.getByTestId("calendar-month-pager")).toBe(pager);
  });

  it("opens every previously unvisited month using the same three slots", async () => {
    const screen = await render(<Harness />);
    const pager = screen.getByTestId("calendar-month-pager");
    const center = screen.getByTestId("calendar-slot-0");
    for (let index = 0; index < 12; index++) {
      await fireEvent.press(screen.getByRole("button", { name: "Jahr" }));
      await fireEvent.press(
        screen.getByRole("button", { name: `${PROTOTYPE_MONTH_NAMES[index]} 2026 öffnen` }),
      );
      const month = `2026-${String(index + 1).padStart(2, "0")}`;
      expect(screen.getByTestId("heading")).toHaveTextContent(`MONTH:${month}`);
      expect(within(center).getByTestId(`shared-month-${month}`)).toBeTruthy();
      expect(screen.getByTestId("calendar-month-pager")).toBe(pager);
      expect(screen.getByTestId("calendar-slot-0")).toBe(center);
      expect(screen.getAllByTestId(/calendar-slot-/, { includeHiddenElements: true })).toHaveLength(
        3,
      );
    }
  });
});
