import { describe, expect, it } from "vitest";
import { UNKNOWN_YOUTH_CONTEXT, validateYouthContext } from "./youth-context";
import { validateTrainingProfile } from "./training-data";
import { youthProfile } from "@/engine/youth-test-fixtures";

describe("versioned youth confirmations", () => {
  it("preserves old profiles byte-for-byte semantically and does not assume confirmations", () => {
    expect(validateTrainingProfile(youthProfile.data)).toEqual(youthProfile.data);
    expect(
      validateTrainingProfile({ ...youthProfile.data, version: 2, youth: null }),
    ).toMatchObject({ version: 2, youth: null });
  });
  it("copies and freezes all nested confirmations", () => {
    const source = {
      ...UNKNOWN_YOUTH_CONTEXT,
      careInstitution: true,
      shortenedWorkingDays: ["2026-09-15"],
      blockTrainingShiftIds: ["training-1"],
      holidayLostMinutes: { "2026-10-03": 0 },
    };
    const result = validateYouthContext(source);
    source.shortenedWorkingDays.push("2026-09-16");
    source.holidayLostMinutes["2026-10-03"] = 480;
    expect(result.shortenedWorkingDays).toEqual(["2026-09-15"]);
    expect(result.holidayLostMinutes["2026-10-03"]).toBe(0);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.holidayLostMinutes)).toBe(true);
  });
  it.each([
    { careInstitution: "yes" },
    { otherExceptions: undefined },
    { averageDailyTrainingMinutes: 0 },
    { averageWeeklyTrainingMinutes: 10081 },
    { shortenedWorkingDays: ["2026-02-30"] },
    { shortenedWorkingDays: ["2026-09-15", "2026-09-15"] },
    { blockTrainingShiftIds: ["", "a"] },
    { blockTrainingShiftIds: ["x".repeat(2049)] },
    { holidayLostMinutes: { "2026-10-03": null } },
    { holidayLostMinutes: { "2026-10-03": -1 } },
    { unrecognizedPrivilege: true },
  ])("rejects malformed facts %j", (patch) => {
    expect(() => validateYouthContext({ ...UNKNOWN_YOUTH_CONTEXT, ...patch })).toThrow();
  });
  it("does not accept new fields inside version 1 or unknown future versions", () => {
    expect(() =>
      validateTrainingProfile({ ...youthProfile.data, youth: UNKNOWN_YOUTH_CONTEXT }),
    ).toThrow();
    expect(() =>
      validateTrainingProfile({ ...youthProfile.data, version: 3, youth: UNKNOWN_YOUTH_CONTEXT }),
    ).toThrow();
  });
});
