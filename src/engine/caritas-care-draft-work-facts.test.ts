import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";
import {
  deriveCaritasDraftWorkFacts,
  type CaritasDraftWorkDayDecision,
} from "./caritas-care-draft-work-facts";
import type { CaritasDraftShiftNetSlice } from "./caritas-care-draft-work-slices";

const pkg = JSON.parse(
  readFileSync(
    new URL(
      "../../rules/packages/reviewed/avr-caritas-p-bw/2026-02-01-draft1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as RuleTariffPackage;

const slice = (
  date: string,
  fromMinute: number,
  throughMinute: number,
): CaritasDraftShiftNetSlice => ({
  shiftId: "shift-1",
  date,
  fromMinute,
  throughMinute,
});
const decision = (
  date: string,
  holidayTimeOff: boolean | null,
  shiftWork: boolean | null,
): CaritasDraftWorkDayDecision => ({
  shiftId: "shift-1",
  date,
  origin: "confirmed",
  holidayTimeOff,
  shiftWork,
});
const input = (
  slices: readonly CaritasDraftShiftNetSlice[],
  decisions: readonly CaritasDraftWorkDayDecision[] = [],
) => ({
  pkg,
  slices,
  decisions,
  federalState: "NW" as const,
  holidayRegion: "NONE" as const,
});

describe("Caritas DRAFT work facts from the versioned holiday resolver", () => {
  it("derives an ordinary day without inventing holiday compensation or shift classification", () => {
    expect(deriveCaritasDraftWorkFacts(input([slice("2026-09-21", 1260, 1320)]))).toMatchObject({
      kind: "confirmed-work-facts",
      slices: [{ publicHoliday: false, holidayTimeOff: null, shiftWork: null }],
    });
  });

  it("requires a confirmed compensation fact on a resolved public holiday", () => {
    const work = [slice("2026-12-25", 420, 480)];
    expect(deriveCaritasDraftWorkFacts(input(work))).toEqual({
      kind: "unavailable",
      reason: "HOLIDAY_TIME_OFF_UNCONFIRMED",
      shiftId: "shift-1",
      date: "2026-12-25",
    });
    expect(
      deriveCaritasDraftWorkFacts(input(work, [decision("2026-12-25", false, null)])),
    ).toMatchObject({
      kind: "confirmed-work-facts",
      slices: [{ publicHoliday: true, holidayTimeOff: false, shiftWork: null }],
    });
  });

  it("requires a confirmed shift-work fact only inside the Saturday window from the tariff package", () => {
    const saturday = slice("2026-09-26", 780, 840);
    expect(deriveCaritasDraftWorkFacts(input([saturday]))).toEqual({
      kind: "unavailable",
      reason: "SHIFT_WORK_UNCONFIRMED",
      shiftId: "shift-1",
      date: "2026-09-26",
    });
    expect(
      deriveCaritasDraftWorkFacts(input([saturday], [decision("2026-09-26", null, true)])),
    ).toMatchObject({
      kind: "confirmed-work-facts",
      slices: [{ publicHoliday: false, shiftWork: true }],
    });
    expect(deriveCaritasDraftWorkFacts(input([slice("2026-09-26", 600, 660)]))).toMatchObject({
      kind: "confirmed-work-facts",
      slices: [{ shiftWork: null }],
    });
  });

  it("fails closed on duplicate decisions, missing holiday rules and impossible dates", () => {
    const fact = decision("2026-12-25", true, null);
    expect(
      deriveCaritasDraftWorkFacts(input([slice("2026-12-25", 420, 480)], [fact, fact])),
    ).toEqual({
      kind: "unavailable",
      reason: "DECISION_AMBIGUOUS",
      shiftId: "shift-1",
      date: "2026-12-25",
    });
    expect(deriveCaritasDraftWorkFacts(input([slice("2026-09-31", 420, 480)]))).toEqual({
      kind: "unavailable",
      reason: "INVALID_WORKED_SLICE",
      shiftId: "shift-1",
      date: "2026-09-31",
    });
    expect(
      deriveCaritasDraftWorkFacts({
        ...input([slice("2026-09-21", 420, 480)]),
        resolver: createRuleResolver({ tariff: [], legal: [], holiday: [] }),
      }),
    ).toMatchObject({ kind: "unavailable", reason: "HOLIDAY_RULES_UNAVAILABLE" });
    expect(
      deriveCaritasDraftWorkFacts({
        ...input([slice("2026-09-21", 420, 480)]),
        federalState: "BY",
        holidayRegion: "UNKNOWN",
      }),
    ).toMatchObject({ kind: "unavailable", reason: "HOLIDAY_REGION_UNCONFIRMED" });
    expect(
      deriveCaritasDraftWorkFacts(
        input(
          [],
          [
            {
              ...decision("2026-09-21", null, null),
              origin: "estimated" as "confirmed",
            },
          ],
        ),
      ),
    ).toMatchObject({ kind: "unavailable", reason: "INVALID_DECISION" });
    expect(
      deriveCaritasDraftWorkFacts(input([], [decision("2026-09-31", null, null)])),
    ).toMatchObject({
      kind: "unavailable",
      reason: "INVALID_DECISION",
    });
    const withoutPolicy = structuredClone(pkg);
    delete withoutPolicy.rules.caritasTimePremiumPolicy;
    expect(deriveCaritasDraftWorkFacts({ ...input([]), pkg: withoutPolicy })).toEqual({
      kind: "unavailable",
      reason: "MISSING_POLICY",
    });
  });
});
