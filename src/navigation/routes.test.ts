import { describe, expect, it } from "vitest";

import {
  TAB_ROUTES,
  dayDetailsRoute,
  dayEditorRoute,
  premiumDetailsRoute,
  quickAddRoute,
  settingsInfoRoute,
} from "@/navigation/routes";

describe("navigation contracts", () => {
  it("exposes the four stable tab destinations", () => {
    expect(TAB_ROUTES.map((tab) => tab.route)).toEqual(["/", "/analysis", "/salary", "/more"]);
  });

  it("keeps the selected date through day details and quick add", () => {
    expect(dayDetailsRoute("2026-08-13")).toEqual({
      pathname: "/day-details",
      params: { date: "2026-08-13" },
    });
    expect(quickAddRoute("2026-08-13")).toEqual({
      pathname: "/quick-add",
      params: { date: "2026-08-13" },
    });
  });

  it("includes entryId only for editing", () => {
    expect(dayEditorRoute("2026-08-13", "SHIFT", "shift-1")).toEqual({
      pathname: "/day-editor",
      params: { date: "2026-08-13", mode: "SHIFT", entryId: "shift-1" },
    });
    expect(dayEditorRoute("2026-08-13", "APPOINTMENT")).toEqual({
      pathname: "/day-editor",
      params: { date: "2026-08-13", mode: "APPOINTMENT" },
    });
  });

  it("keeps a valid month for the premium calculation sheet", () => {
    expect(premiumDetailsRoute("2026-07")).toEqual({
      pathname: "/premium-details",
      params: { month: "2026-07" },
    });
    expect(() => premiumDetailsRoute("2026-13")).toThrow();
  });

  it("opens explicit information sections from More", () => {
    expect(settingsInfoRoute("STORAGE")).toEqual({
      pathname: "/info-details",
      params: { section: "STORAGE" },
    });
    expect(settingsInfoRoute("CALCULATION")).toEqual({
      pathname: "/info-details",
      params: { section: "CALCULATION" },
    });
  });

  it("rejects invalid deep-link dates", () => {
    expect(() => dayDetailsRoute("2026-02-31")).toThrow();
  });
});
