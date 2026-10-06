import { describe, expect, it } from "vitest";
import { DATA_LOAD_FAILURE_MESSAGE } from "./errors";
import {
  DataLoadFailure,
  dataLoadFailureCode,
  dataLoadFailureMessage,
  withDataLoadFailureCode,
} from "./data-load-failure";

describe("safe data-load failure codes", () => {
  it("shows a fixed code without the raw parser or database error", async () => {
    const privateError = new Error("SQL secret salary=432100 and /private/customer.sqlite");
    const failure = await withDataLoadFailureCode("LOAD_PROFILE_FAILED", async () => {
      throw privateError;
    }).catch((error) => error);
    expect(dataLoadFailureMessage(failure)).toBe(
      DATA_LOAD_FAILURE_MESSAGE + "\n\nFehlercode: LOAD_PROFILE_FAILED",
    );
    expect(failure).not.toHaveProperty("cause");
    expect(JSON.stringify(failure)).not.toContain("432100");
    expect(dataLoadFailureMessage(failure)).not.toContain("/private/");
  });
  it("preserves a more specific safe nested failure", async () => {
    const conflict = new DataLoadFailure("PROFILE_SALARY_CONFLICT");
    await expect(
      withDataLoadFailureCode("LOAD_PROFILE_FAILED", () => {
        throw conflict;
      }),
    ).rejects.toBe(conflict);
    expect(dataLoadFailureCode(conflict)).toBe("PROFILE_SALARY_CONFLICT");
    expect(dataLoadFailureMessage(conflict)).toContain("Fehlercode: PROFILE_SALARY_CONFLICT");
  });
  it("uses the generic message for unknown or forged errors", () => {
    const forged = new DataLoadFailure("LOAD_PROFILE_FAILED");
    Object.defineProperty(forged, "code", { value: "private-person-salary=432100" });
    for (const error of [new Error("private"), { code: "LOAD_PROFILE_FAILED" }, forged, null]) {
      expect(dataLoadFailureCode(error)).toBeNull();
      expect(dataLoadFailureMessage(error)).toBe(DATA_LOAD_FAILURE_MESSAGE);
    }
  });
  it("preserves successful read values by identity", async () => {
    const snapshot = Object.freeze({ weeklyMinutes: 2310 });
    expect(await withDataLoadFailureCode("LOAD_PROFILE_FAILED", () => snapshot)).toBe(snapshot);
    expect(await withDataLoadFailureCode("LOAD_PROFILE_FAILED", async () => snapshot)).toBe(
      snapshot,
    );
  });
});
