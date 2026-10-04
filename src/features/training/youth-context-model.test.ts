import { describe, expect, it } from "vitest";
import { UNKNOWN_YOUTH_CONTEXT } from "@/domain/youth-context";
import {
  addYouthDayFact,
  removeYouthDayFact,
  youthContextDraft,
  youthContextFromDraft,
  setYouthBlockActivity,
} from "./youth-context-model";

const profileFrom = "01.09.2026";

describe("youth day confirmations", () => {
  it("adds and removes a shortened workday without changing unknown facts", () => {
    const draft = youthContextDraft({
      ...UNKNOWN_YOUTH_CONTEXT,
      blockTrainingShiftIds: ["school-block-1"],
    });
    const added = addYouthDayFact({ ...draft, dayDate: "14.09.2026" }, profileFrom);
    expect(added.context.shortenedWorkingDays).toEqual(["2026-09-14"]);
    expect(added.context.blockTrainingShiftIds).toEqual(["school-block-1"]);
    expect(added.context.otherExceptions).toBeNull();
    expect(addYouthDayFact({ ...added, dayDate: "14.09.2026" }, profileFrom).context).toEqual(
      added.context,
    );
    expect(
      removeYouthDayFact(added, "shortened", "2026-09-14").context.shortenedWorkingDays,
    ).toEqual([]);
  });

  it("preserves explicitly zero holiday minutes and can withdraw that answer", () => {
    const draft = { ...youthContextDraft(), dayKind: "holiday" as const };
    const added = addYouthDayFact(
      { ...draft, dayDate: "03.10.2026", holidayMinutes: "0" },
      profileFrom,
    );
    expect(added.context.holidayLostMinutes).toEqual({ "2026-10-03": 0 });
    expect(youthContextFromDraft(added).holidayLostMinutes["2026-10-03"]).toBe(0);
    expect(removeYouthDayFact(added, "holiday", "2026-10-03").context.holidayLostMinutes).toEqual(
      {},
    );
  });

  it.each(["31.02.2026", "31.08.2026", "bad"])(
    "rejects invalid or pre-profile date %s",
    (dayDate) => {
      expect(() => addYouthDayFact({ ...youthContextDraft(), dayDate }, profileFrom)).toThrow();
    },
  );
  it.each(["", "-1", "1441", "1.5", "abc"])(
    "rejects missing or invalid holiday minutes %s",
    (holidayMinutes) => {
      expect(() =>
        addYouthDayFact(
          { ...youthContextDraft(), dayKind: "holiday", dayDate: "03.10.2026", holidayMinutes },
          profileFrom,
        ),
      ).toThrow("0 bis 1440");
    },
  );
  it("does not silently discard an unadded date or holiday amount on profile save", () => {
    expect(() => youthContextFromDraft({ ...youthContextDraft(), dayDate: "14.09.2026" })).toThrow(
      "Tagesangabe bitte erst hinzufügen",
    );
    expect(() => youthContextFromDraft({ ...youthContextDraft(), holidayMinutes: "480" })).toThrow(
      "Tagesangabe bitte erst hinzufügen",
    );
  });
  it("confirms and withdraws only the version-bound extra training event", () => {
    const binding = '["youth-block-v1","shift-1",1]';
    const confirmed = setYouthBlockActivity(youthContextDraft(), binding, true);
    expect(confirmed.context.blockTrainingShiftIds).toEqual([binding]);
    expect(setYouthBlockActivity(confirmed, binding, true).context.blockTrainingShiftIds).toEqual([
      binding,
    ]);
    expect(setYouthBlockActivity(confirmed, binding, false).context.blockTrainingShiftIds).toEqual(
      [],
    );
    expect(() => setYouthBlockActivity(confirmed, "shift-1", true)).toThrow(
      "aktuellen Dienststand",
    );
  });
});
