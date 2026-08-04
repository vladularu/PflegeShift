import { describe, expect, it } from "vitest";

import {
  parseEnumRouteParam,
  parseIdentifierRouteParam,
  parseLocalDateRouteParam,
  parseMonthRouteParam,
} from "@/navigation/route-params";

describe("route parameter parsing", () => {
  it("accepts real calendar dates and rejects impossible or repeated values", () => {
    expect(parseLocalDateRouteParam("2026-02-28")).toEqual({
      status: "valid",
      value: "2026-02-28",
    });
    expect(parseLocalDateRouteParam("2026-02-31")).toEqual({ status: "invalid" });
    expect(parseLocalDateRouteParam("2026-02-28T12:30")).toEqual({ status: "invalid" });
    expect(parseLocalDateRouteParam("+002026-02-28")).toEqual({ status: "invalid" });
    expect(parseLocalDateRouteParam("2026-02-28[u-ca=iso8601]")).toEqual({
      status: "invalid",
    });
    expect(parseLocalDateRouteParam(" 2026-02-28 ")).toEqual({ status: "invalid" });
    expect(parseLocalDateRouteParam("2024-02-29").status).toBe("valid");
    expect(parseLocalDateRouteParam("2026-02-29")).toEqual({ status: "invalid" });
    expect(parseLocalDateRouteParam(["2026-02-28", "2026-03-01"])).toEqual({
      status: "invalid",
    });
    expect(parseLocalDateRouteParam(undefined)).toEqual({ status: "missing" });
  });

  it("validates months with real month boundaries", () => {
    expect(parseMonthRouteParam("2026-12")).toEqual({
      status: "valid",
      value: "2026-12",
    });
    expect(parseMonthRouteParam("2026-13")).toEqual({ status: "invalid" });
    expect(parseMonthRouteParam("2026-1")).toEqual({ status: "invalid" });
    expect(parseMonthRouteParam(["2026-01"])).toEqual({ status: "invalid" });
    expect(parseMonthRouteParam(undefined)).toEqual({ status: "missing" });
  });

  it("accepts only explicit enum members", () => {
    const allowed = ["SHIFT", "APPOINTMENT"] as const;
    expect(parseEnumRouteParam("SHIFT", allowed)).toEqual({
      status: "valid",
      value: "SHIFT",
    });
    expect(parseEnumRouteParam("shift", allowed)).toEqual({ status: "invalid" });
    expect(parseEnumRouteParam(["SHIFT"], allowed)).toEqual({ status: "invalid" });
  });

  it("rejects empty, unsafe and oversized identifiers", () => {
    expect(parseIdentifierRouteParam("local-shift-1")).toEqual({
      status: "valid",
      value: "local-shift-1",
    });
    expect(parseIdentifierRouteParam(" ")).toEqual({ status: "invalid" });
    expect(parseIdentifierRouteParam("../../entry")).toEqual({ status: "invalid" });
    expect(parseIdentifierRouteParam("x".repeat(129))).toEqual({ status: "invalid" });
  });
});
