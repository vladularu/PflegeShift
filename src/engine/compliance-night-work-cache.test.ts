import { Temporal } from "@js-temporal/polyfill";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ShiftEntry } from "@/domain/types";
import { isNightWork } from "@/engine/compliance-night-work";
import type { ComplianceInterval } from "@/engine/compliance-sequences";
import { bundledRuleResolver, requireResolvedPackage } from "@/rules/rule-resolver";

function interval(date: string, zone = "Europe/Berlin"): ComplianceInterval {
  const day = Temporal.PlainDate.from(date);
  const shift: ShiftEntry = {
    kind: "SHIFT",
    id: date,
    date,
    templateId: null,
    title: "Nacht",
    type: "NIGHT",
    startTime: "22:00",
    endTime: "06:00",
    breakMinutes: 0,
    overtimeMinutes: 0,
    color: "#ffffff",
    symbol: "N",
    note: null,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: date,
    updatedAt: date,
    deletedAt: null,
  };
  return {
    shift,
    start: Temporal.ZonedDateTime.from(`${date}T22:00[${zone}]`),
    end: Temporal.ZonedDateTime.from(`${day.add({ days: 1 })}T06:00[${zone}]`),
    grossMinutes: 480,
    netMinutes: 480,
  };
}

describe("reused night-time preparation", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["2026-03-28", "2026-10-24"])(
    "reuses only the preparation, including DST on %s",
    (date) => {
      const item = interval(date);
      const rules = structuredClone(
        requireResolvedPackage(bundledRuleResolver.resolveLegal(date)).rules,
      );
      const from = vi.spyOn(Temporal.ZonedDateTime, "from");
      expect(isNightWork(item, rules)).toBe(true);
      expect(from).toHaveBeenCalled();
      from.mockClear();
      expect(isNightWork(item, rules)).toBe(true);
      expect(from).not.toHaveBeenCalled();
      const threshold = {
        ...rules,
        nightWork: {
          ...rules.nightWork,
          qualification: { ...rules.nightWork.qualification, thresholdMinutes: 1000 },
        },
      };
      expect(isNightWork(item, threshold)).toBe(false);
      expect(from).not.toHaveBeenCalled();
      const window = {
        ...rules,
        nightWork: { ...rules.nightWork, startMinute: 12 * 60, endMinute: 14 * 60 },
      };
      expect(isNightWork(item, window)).toBe(false);
      expect(from).toHaveBeenCalled();
    },
  );

  it("does not reuse another interval's times or time zone", () => {
    const rules = requireResolvedPackage(bundledRuleResolver.resolveLegal("2026-03-28")).rules;
    const item = interval("2026-03-28");
    expect(isNightWork(item, rules)).toBe(true);
    const changed = {
      ...item,
      start: Temporal.ZonedDateTime.from("2026-03-28T10:00[Europe/Berlin]"),
      end: Temporal.ZonedDateTime.from("2026-03-28T16:00[Europe/Berlin]"),
    };
    expect(isNightWork(changed, rules)).toBe(false);
    expect(isNightWork(interval("2026-03-28", "UTC"), rules)).toBe(true);
  });
});
