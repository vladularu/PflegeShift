import { describe, expect, it } from "vitest";

import { insightSectionFromRoute } from "@/features/analysis/insight-section";

describe("insight section routing", () => {
  it("keeps legacy salary links inside the analysis tab", () => {
    expect(insightSectionFromRoute("salary")).toBe("PAY");
    expect(insightSectionFromRoute("pay")).toBe("PAY");
    expect(insightSectionFromRoute(["salary", "ignored"])).toBe("PAY");
  });

  it("opens worktime for missing or unknown sections", () => {
    expect(insightSectionFromRoute(undefined)).toBe("TIME");
    expect(insightSectionFromRoute("unknown")).toBe("TIME");
  });
});
