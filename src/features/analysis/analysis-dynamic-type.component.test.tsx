import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";

import { AnalysisMonthHeader, AnalysisYearHeader } from "./analysis-period-header";
import {
  ReportCardTitle,
  ShiftTypeCountCard,
  ShiftTypeHoursCard,
  WorktimeCard,
} from "./analysis-report-cards";
import { ExpandableHighlightCard } from "./expandable-highlight-card";
import { ComplianceDetails } from "./compliance-details";

let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 430, height: 932, scale: 3, fontScale: mockFontScale }),
}));

describe("analysis Dynamic Type layout", () => {
  beforeEach(() => {
    mockFontScale = 1;
  });

  it.each([1, 1.29, 1.3, 2, 3.1])(
    "adapts the period and hours at scale %s without changing values",
    async (fontScale) => {
      mockFontScale = fontScale;
      const stacked = fontScale >= 1.3;
      const previous = jest.fn();
      const next = jest.fn();
      const year = jest.fn();
      const screen = await render(
        <>
          <AnalysisMonthHeader
            label="Di. 1. Sep. - 30. Sep. 2026"
            onPrevious={previous}
            onNext={next}
            onOpenYear={year}
          />
          <WorktimeCard target="169:24" actual="178:24" balance="+9:00" balanceAccent="#008000" />
          <ShiftTypeHoursCard
            analysis={{
              items: [{ type: "EARLY", count: 9, minutes: 10680 }],
              totalCount: 9,
              totalMinutes: 10680,
            }}
          />
        </>,
      );
      expect(screen.getByTestId("analysis-month-toolbar")).toHaveStyle({
        flexWrap: stacked ? "wrap" : "nowrap",
      });
      const period = screen.getByText("Di. 1. Sep. - 30. Sep. 2026");
      if (stacked) expect(period.parent).toHaveStyle({ width: "100%" });
      expect(period.props.numberOfLines).toBeUndefined();
      expect(period.props.maxFontSizeMultiplier).toBe(0);
      expect(screen.getByLabelText("Soll: 169:24").parent).toHaveStyle({
        flexDirection: stacked ? "column" : "row",
      });
      expect(screen.getByLabelText("Ist: 178:24")).toBeTruthy();
      expect(screen.getByLabelText("Saldo: +9:00")).toBeTruthy();
      expect(screen.getByLabelText("Früh: 178:00 Stunden")).toHaveStyle({
        flexDirection: "row",
        flexWrap: stacked ? "wrap" : "nowrap",
      });
      expect(screen.getByLabelText("Gesamt: 178:00 h")).toHaveStyle({
        flexDirection: stacked ? "column" : "row",
      });
      const back = screen.getByRole("button", { name: /Vorheriger Monat/ });
      expect(back).toHaveStyle({ width: 44, height: 44 });
      await fireEvent.press(back);
      await fireEvent.press(screen.getByRole("button", { name: /Nächster Monat/ }));
      await fireEvent.press(screen.getByRole("button", { name: "Jahresauswertung öffnen" }));
      expect(previous).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledTimes(1);
      expect(year).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["COUNT", "HOURS"])(
    "keeps icon and name together in %s rows when text changes",
    async (mode) => {
      const Card = mode === "COUNT" ? ShiftTypeCountCard : ShiftTypeHoursCard;
      const analysis = {
        items: [{ type: "TRAINING" as const, count: 3, minutes: 1386 }],
        totalCount: 3,
        totalMinutes: 1386,
      };
      const screen = await render(<Card analysis={analysis} />);
      for (const fontScale of [3.1, 1.3, 1]) {
        mockFontScale = fontScale;
        await screen.rerender(<Card analysis={analysis} />);
        const name = screen.getByText("Fortbildung");
        expect(name).toHaveStyle({ flex: 1, minWidth: 0 });
        expect(name.props.numberOfLines).toBeUndefined();
        expect(name.props.maxFontSizeMultiplier).toBe(0);
        expect(name.parent).toHaveStyle({
          flexDirection: "row",
          flexWrap: fontScale >= 1.3 ? "wrap" : "nowrap",
        });
        const values = screen.getAllByText(mode === "COUNT" ? "3" : "23:06 h");
        expect(values[0]).toHaveStyle({ width: fontScale >= 1.3 ? "100%" : undefined });
        expect(values[0].props.maxFontSizeMultiplier).toBe(0);
      }
    },
  );

  it("reacts to large text and back without losing the annual period", async () => {
    const props = {
      year: 2026,
      activeMonthCount: 12,
      onPrevious: jest.fn(),
      onNext: jest.fn(),
      onOpenMonth: jest.fn(),
    };
    const screen = await render(<AnalysisYearHeader {...props} />);
    for (const fontScale of [3.1, 1]) {
      mockFontScale = fontScale;
      await screen.rerender(<AnalysisYearHeader {...props} />);
      expect(screen.getByText("2026")).toBeTruthy();
      expect(screen.getByText("12 Monate mit Einträgen")).toBeTruthy();
      expect(screen.getByTestId("analysis-year-toolbar")).toHaveStyle({
        flexWrap: fontScale >= 1.3 ? "wrap" : "nowrap",
      });
    }
  });

  it.each([0, 100])("lets the %s message badge grow and retains the toggle", async (count) => {
    mockFontScale = 3.1;
    const toggle = jest.fn();
    const screen = await render(
      <ExpandableHighlightCard
        title="Prüfung"
        value="Meldungen"
        countBadge={count}
        icon="warning-outline"
        accent="#008000"
        expanded={false}
        onToggle={toggle}
      >
        <></>
      </ExpandableHighlightCard>,
    );
    const badge = screen.getByText(String(count), { includeHiddenElements: true });
    const style = StyleSheet.flatten(badge.parent?.props.style);
    expect(style.minHeight).toBe(44);
    expect(style.minWidth).toBe(44);
    expect(style.height).toBeUndefined();
    expect(style.width).toBeUndefined();
    expect(badge.props.maxFontSizeMultiplier).toBe(0);
    expect(screen.getByText("Meldungen").parent).toHaveStyle({ flexDirection: "column" });
    await fireEvent.press(screen.getByRole("button", { name: `Prüfung, ${count} Meldungen` }));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("gives card titles a bounded full width and separates the clear-check message", async () => {
    mockFontScale = 3.1;
    const screen = await render(
      <>
        <ReportCardTitle title="Schichten zählen" />
        <ComplianceDetails
          embedded
          shifts={[]}
          compliance={{
            month: "2026-09",
            criticalCount: 0,
            warningCount: 0,
            infoCount: 0,
            affectedDates: [],
            issues: [],
          }}
        />
      </>,
    );
    const title = screen.getByText("Schichten zählen");
    expect(title).toHaveStyle({ alignSelf: "stretch" });
    expect(title.props.numberOfLines).toBeUndefined();
    expect(title.props.maxFontSizeMultiplier).toBe(0);
    const message = screen.getByText(/Gesetzliche Prüfung\s+keine Auffälligkeiten/);
    expect(message.props.children.join("")).toContain("\n");
    expect(message.props.numberOfLines).toBeUndefined();
  });
});
