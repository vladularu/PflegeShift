import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("analysis native header", () => {
  it("keeps one compact analysis screen and forwards legacy salary links", () => {
    const layoutSource = readFileSync(
      join(process.cwd(), "app", "(tabs)", "(analysis)", "_layout.tsx"),
      "utf8",
    );
    const screenSource = readFileSync(
      join(process.cwd(), "src", "features", "analysis", "insights-screen.tsx"),
      "utf8",
    );
    const annualSource = readFileSync(
      join(process.cwd(), "src", "features", "analysis", "annual-report-view.tsx"),
      "utf8",
    );

    expect(layoutSource).toContain("headerLargeTitle: false");
    expect(screenSource).toContain("headerShown: false");
    expect(screenSource).not.toContain("headerLargeTitle: true");
    expect(screenSource).toContain('title: "Auswertung"');
    expect(screenSource).toContain(
      'initialExpandedCard={requestedSection === "PAY" ? "PAY" : null}',
    );
    expect(screenSource).not.toContain("SalaryScreen");
    expect(screenSource).not.toContain("SegmentedControl");
    expect(annualSource).not.toContain("Stack.Screen");
    expect(annualSource).toContain("<AnalysisYearHeader");
  });
});
