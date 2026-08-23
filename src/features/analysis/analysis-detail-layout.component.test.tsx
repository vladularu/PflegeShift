import { render } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";

import { AnalysisDetailSummaryCard } from "@/features/analysis/analysis-detail-layout";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";

describe("analysis detail layout", () => {
  it("uses one semantic hierarchy for period, result and explanation", async () => {
    const screen = await render(
      <AnalysisDetailSummaryCard
        caption="Automatische Prüfung deiner Dienste."
        period="August 2026"
        title="3 Meldungen"
      />,
    );

    expect(screen.getByRole("header", { name: "3 Meldungen" })).toHaveStyle(TYPOGRAPHY.screenTitle);
    expect(screen.getByText("August 2026")).toHaveProp("maxFontSizeMultiplier", TEXT_MAX_SCALE);
    expect(screen.getByTestId("analysis-detail-summary")).toHaveStyle({
      gap: SPACING.xs,
      padding: SPACING.xl,
    });
  });

  it("gives numeric outcomes a stronger but still tokenized emphasis", async () => {
    const screen = await render(
      <AnalysisDetailSummaryCard
        caption="2 Zuschlagspositionen"
        emphasis="metric"
        period="August 2026"
        title="123,45 €"
      />,
    );

    expect(screen.getByRole("header", { name: "123,45 €" })).toHaveStyle(TYPOGRAPHY.hero);
    expect(screen.getByRole("header", { name: "123,45 €" })).toHaveProp(
      "dynamicTypeRamp",
      "largeTitle",
    );
  });
});
