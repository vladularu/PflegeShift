import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import holidayCandidateValue from "../../rules/packages/reviewed/de-holidays/2026.json";
import generationOneRequestValue from "../../rules/releases/preview-generation-1.json";
import generationThreeRequestValue from "../../rules/releases/preview-generation-3.json";
import type { RuleHolidayPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

const generationOneHolidayPath = fileURLToPath(
  new URL("../../rules/packages/reviewed/de-holidays/2026.json", import.meta.url),
);
const futureHolidayPath = fileURLToPath(
  new URL("../../rules/packages/reviewed/de-holidays/2027.json", import.meta.url),
);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function makeOpenEndedCandidate(): unknown {
  const candidate = clone(holidayCandidateValue);
  candidate.engineContractVersion = 7;
  candidate.versionId = "2027";
  candidate.label = "Gesetzliche Feiertage Deutschland ab 2027";
  candidate.validFrom = "2027-01-01";
  (candidate as { validTo: string | null }).validTo = null;
  for (const holiday of candidate.rules.holidays) {
    holiday.validFrom = "2027-01-01";
    (holiday as { validTo: string | null }).validTo = null;
  }
  return candidate;
}

describe("open-ended holiday catalog contract", () => {
  it("accepts open-ended validity on each recurring holiday rule", () => {
    const validation = validateRulePackage(makeOpenEndedCandidate());

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.value.kind).toBe("HOLIDAY");
    if (validation.value.kind !== "HOLIDAY") return;
    expect(validation.value.validTo).toBeNull();
    expect(validation.value.rules.holidays.every((holiday) => holiday.validTo === null)).toBe(true);
  });

  it("requires engine contract v7 for open-ended holiday rules", () => {
    const candidate = makeOpenEndedCandidate() as { engineContractVersion: number };
    candidate.engineContractVersion = 2;

    const validation = validateRulePackage(candidate);

    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_OPEN_HOLIDAY_RANGE" })]),
    );
  });

  it("rejects package-only open validity on the legacy holiday contract", () => {
    const candidate = clone(holidayCandidateValue) as {
      engineContractVersion: number;
      validTo: string | null;
    };
    candidate.engineContractVersion = 2;
    candidate.validTo = null;

    const validation = validateRulePackage(candidate);

    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNSUPPORTED_OPEN_HOLIDAY_PACKAGE_RANGE" }),
      ]),
    );
  });

  it("rejects an open-ended one-off holiday date", () => {
    const candidate = makeOpenEndedCandidate() as {
      rules: {
        holidays: {
          calculation: { type: string; date?: string };
          validTo: string | null;
        }[];
      };
    };
    candidate.rules.holidays[0].calculation = {
      type: "SPECIFIC_DATE",
      date: "2027-01-01",
    };

    const validation = validateRulePackage(candidate);

    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "OPEN_ENDED_SPECIFIC_HOLIDAY" })]),
    );
  });

  it("rejects finite recurring rules inside an open-ended package", () => {
    const candidate = makeOpenEndedCandidate() as {
      rules: { holidays: { validTo: string | null }[] };
    };
    for (const holiday of candidate.rules.holidays) {
      holiday.validTo = "2027-12-31";
    }

    const validation = validateRulePackage(candidate);

    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "FINITE_RECURRING_HOLIDAY_IN_OPEN_PACKAGE" }),
      ]),
    );
  });

  it("keeps the open-ended 2027 package valid across its review lifecycle", () => {
    expect(existsSync(futureHolidayPath)).toBe(true);
    if (!existsSync(futureHolidayPath)) return;

    const candidate = JSON.parse(readFileSync(futureHolidayPath, "utf8")) as unknown;
    const validation = validateRulePackage(candidate);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const rulePackage = validation.value as RuleHolidayPackage;

    expect(rulePackage).toMatchObject({
      packageId: "de-holidays",
      versionId: "2027",
      kind: "HOLIDAY",
      validFrom: "2027-01-01",
      validTo: null,
    });
    expect(["DRAFT", "REVIEWED"]).toContain(rulePackage.status);
    expect(rulePackage.review.status).toBe(rulePackage.status);
    if (rulePackage.status === "DRAFT") {
      expect(rulePackage.review).toEqual({
        status: "DRAFT",
        reviewedBy: null,
        reviewedAt: null,
        gitCommit: null,
      });
    } else {
      expect(rulePackage.review).toMatchObject({
        status: "REVIEWED",
        reviewedBy: "project-owner",
      });
      expect(rulePackage.review.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(rulePackage.review.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    }
    expect(rulePackage.rules.holidays).not.toHaveLength(0);
    expect(
      rulePackage.rules.holidays
        .filter((holiday) => holiday.calculation.type !== "SPECIFIC_DATE")
        .every((holiday) => holiday.validTo === null),
    ).toBe(true);

    const {
      status: _candidateStatus,
      review: _candidateReview,
      ...candidatePayload
    } = candidate as Record<string, unknown>;
    const {
      status: _expectedStatus,
      review: _expectedReview,
      ...expectedPayload
    } = makeOpenEndedCandidate() as Record<string, unknown>;
    expect(candidatePayload).toEqual(expectedPayload);
  });

  it("keeps the already published Generation 1 holiday input byte-identical", () => {
    const bytes = readFileSync(generationOneHolidayPath);

    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "f72173427925e869744cd831e6895ce82bf8f86ca301820f571c8ad53527f96c",
    );
    expect(generationOneRequestValue.packageSources).toContain(
      "rules/packages/reviewed/de-holidays/2026.json",
    );
    expect(generationOneRequestValue.packageSources).not.toContain(
      "rules/packages/reviewed/de-holidays/2027.json",
    );
  });

  it("defines Generation 3 as one continuous holiday track from 2026 onward", () => {
    expect(generationThreeRequestValue).toMatchObject({
      generation: 3,
      channel: "PREVIEW",
      rollbackOfGeneration: null,
      signing: { keyId: "preview-2026-r2" },
    });
    expect(generationThreeRequestValue.packageSources).toEqual([
      "rules/packages/reviewed/tvoed-vka-bt-k/2026-05.json",
      "rules/packages/reviewed/de-arbzg-care/2026-01.json",
      "rules/packages/reviewed/de-holidays/2026.json",
      "rules/packages/reviewed/de-holidays/2027.json",
    ]);
  });
});
