import { act, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { useContext, useEffect, useLayoutEffect } from "react";
import { AppState, Text } from "react-native";
import { createMonthGrid } from "@/engine/calendar";
import * as measurement from "./calendar-morph-measurement";
import type { MeasuredCalendarMorphNode } from "./calendar-morph-geometry";
import { CalendarTransitionHost, CALENDAR_VIEW_ZOOM } from "./calendar-view-transition";

describe("CalendarTransitionHost", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each(["completion", "background"])("clears a measured transition on %s", async (ending) => {
    jest.useFakeTimers();
    jest
      .spyOn(measurement, "measureCalendarRect")
      .mockResolvedValue({ x: 0, y: 100, width: 420, height: 700 });
    const appState = jest.spyOn(AppState, "addEventListener");
    function MeasuredScene() {
      const registry = useContext(measurement.CalendarMorphRegistry);
      useLayoutEffect(() => {
        const base = {
          month: "2026-09",
          fontSize: 10,
          color: "white",
          mutedColor: "gray",
          today: "2026-09-06",
          todayColor: "black",
          todayBackground: "pink",
        };
        const nodes: MeasuredCalendarMorphNode[] = [
          { ...base, kind: "MINI", rect: { x: 280, y: 400, width: 120, height: 126 } },
          ...createMonthGrid("2026-09").flatMap((cell, index): MeasuredCalendarMorphNode[] =>
            cell.inMonth
              ? [
                  {
                    ...base,
                    kind: "DAY",
                    date: cell.date,
                    fontSize: 17,
                    rect: {
                      x: 5 + (index % 7) * 60,
                      y: 135 + Math.floor(index / 7) * 100,
                      width: 30,
                      height: 30,
                    },
                  },
                ]
              : [],
          ),
        ];
        const readers = nodes.map((node) => async () => node);
        readers.forEach((read) => registry?.add(read));
        return () => {
          readers.forEach((read) => registry?.delete(read));
        };
      }, [registry]);
      return <Text>Gemessener Monat</Text>;
    }
    const content = { monthView: <MeasuredScene />, yearView: <Text>Jahr</Text> };
    const screen = await render(
      <CalendarTransitionHost month="2026-09" viewMode="YEAR" active {...content} />,
    );
    await screen.rerender(
      <CalendarTransitionHost month="2026-09" viewMode="MONTH" active {...content} />,
    );
    for (let step = 0; step < 4; step += 1) {
      await act(async () => {
        jest.advanceTimersByTime(20);
      });
    }
    expect(
      screen.getByTestId("calendar-morph-overlay", { includeHiddenElements: true }),
    ).toBeTruthy();
    await act(async () => {
      if (ending === "background") appState.mock.calls[0][1]("background");
      else jest.advanceTimersByTime(1000);
    });
    expect(
      screen.queryByTestId("calendar-morph-overlay", { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.getByText("Gemessener Monat")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Gemessener Monat")).toBeTruthy();
  });

  it("retains both scenes and restores the destination when native measurements are unavailable", async () => {
    jest.useFakeTimers();
    const unmounted = jest.fn();
    function PersistentMonth() {
      useEffect(
        () => () => {
          unmounted();
        },
        [],
      );
      return <Text>Monatskalender</Text>;
    }
    const monthView = <PersistentMonth />;
    const yearView = <Text>Jahreskalender</Text>;
    const screen = await render(
      <CalendarTransitionHost
        month="2026-01"
        viewMode="MONTH"
        active
        monthView={monthView}
        yearView={yearView}
      />,
    );
    expect(screen.getByText("Monatskalender")).toBeTruthy();
    expect(screen.queryByText("Jahreskalender")).toBeNull();
    expect(screen.getByText("Jahreskalender", { includeHiddenElements: true })).toBeTruthy();
    await screen.rerender(
      <CalendarTransitionHost
        month="2026-01"
        viewMode="YEAR"
        active
        monthView={monthView}
        yearView={yearView}
      />,
    );
    await act(async () => {
      jest.advanceTimersByTime(CALENDAR_VIEW_ZOOM.measurementTimeout + 50);
    });
    expect(screen.getByText("Jahreskalender")).toBeTruthy();
    expect(screen.queryByText("Monatskalender")).toBeNull();
    expect(unmounted).not.toHaveBeenCalled();
    expect(screen.queryByTestId("calendar-morph-overlay")).toBeNull();
  });

  it("cancels a pending transition on tab blur and permits the next transition", async () => {
    jest.useFakeTimers();
    const content = { monthView: <Text>Monat</Text>, yearView: <Text>Jahr</Text> };
    const screen = await render(
      <CalendarTransitionHost month="2026-12" viewMode="MONTH" active {...content} />,
    );
    await screen.rerender(
      <CalendarTransitionHost month="2026-12" viewMode="YEAR" active {...content} />,
    );
    await screen.rerender(
      <CalendarTransitionHost month="2026-12" viewMode="YEAR" active={false} {...content} />,
    );
    expect(screen.getByText("Jahr")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByTestId("calendar-morph-overlay")).toBeNull();
    await screen.rerender(
      <CalendarTransitionHost month="2026-12" viewMode="MONTH" active {...content} />,
    );
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Monat")).toBeTruthy();
  });

  it("accepts a rapid reversal without a stale completion hiding the restored scene", async () => {
    jest.useFakeTimers();
    const content = { monthView: <Text>Monat</Text>, yearView: <Text>Jahr</Text> };
    const screen = await render(
      <CalendarTransitionHost month="2026-09" viewMode="YEAR" active {...content} />,
    );
    await screen.rerender(
      <CalendarTransitionHost month="2026-09" viewMode="MONTH" active {...content} />,
    );
    await screen.rerender(
      <CalendarTransitionHost month="2026-09" viewMode="YEAR" active {...content} />,
    );
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Jahr")).toBeTruthy();
    expect(screen.queryByText("Monat")).toBeNull();
    expect(screen.queryByTestId("calendar-morph-overlay")).toBeNull();
  });
});
