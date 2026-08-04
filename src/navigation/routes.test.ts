import { describe, expect, it } from "vitest";

import {
  TAB_ROUTES,
  analysisRoute,
  calendarRoute,
  complianceDetailsRoute,
  dayDetailsRoute,
  dayEditorRoute,
  premiumDetailsRoute,
  quickAddRoute,
  settingsEditorRoute,
  settingsInfoRoute,
  tariffAssessmentRoute,
  templateEditorRoute,
} from "@/navigation/routes";
import {
  parseIdentifierRouteParam,
  parseLocalDateRouteParam,
  parseMonthRouteParam,
} from "@/navigation/route-params";

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

  it("keeps a valid month for the compliance sheet", () => {
    expect(complianceDetailsRoute("2026-07")).toEqual({
      pathname: "/compliance-details",
      params: { month: "2026-07" },
    });
    expect(() => complianceDetailsRoute("2026-13")).toThrow();
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
    expect(settingsInfoRoute("TVOED_ALLOWANCE")).toEqual({
      pathname: "/info-details",
      params: { section: "TVOED_ALLOWANCE" },
    });
  });

  it("rejects invalid deep-link dates", () => {
    expect(() => dayDetailsRoute("2026-02-31")).toThrow();
    expect(() => dayDetailsRoute("2026-02-28T12:30")).toThrow();
  });

  it("builds validated month destinations without typed-route casts", () => {
    expect(calendarRoute("2026-08")).toEqual({
      pathname: "/",
      params: { month: "2026-08" },
    });
    expect(analysisRoute("2026-08")).toEqual({
      pathname: "/analysis",
      params: { month: "2026-08" },
    });
    expect(tariffAssessmentRoute("2026-08")).toEqual({
      pathname: "/tariff-assessment",
      params: { month: "2026-08" },
    });
    expect(parseMonthRouteParam(calendarRoute("2026-08").params.month).status).toBe("valid");
  });

  it("builds validated editor destinations", () => {
    expect(templateEditorRoute("default-early")).toEqual({
      pathname: "/template-editor",
      params: { id: "default-early" },
    });
    expect(settingsEditorRoute("TARIFF")).toEqual({
      pathname: "/settings-editor",
      params: { section: "TARIFF" },
    });
    const dayRoute = dayEditorRoute("2026-08-13", "SHIFT", "local-shift-1");
    expect(parseLocalDateRouteParam(dayRoute.params.date).status).toBe("valid");
    expect(parseIdentifierRouteParam(dayRoute.params.entryId).status).toBe("valid");
    expect(() => dayEditorRoute("2026-08-13", "SHIFT", "../../entry")).toThrow();
  });
});
