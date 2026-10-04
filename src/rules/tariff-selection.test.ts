import { describe, expect, it } from "vitest";
import { resolveRemunerationContext } from "@/engine/remuneration-context";
import { history, resolver } from "@/engine/remuneration-test-fixtures";
import { selectionCandidate } from "./original-tariff-selection-test-fixtures";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

describe("versioned tariff selection", () => {
  it("accepts the canonical contract and derives groups and group-specific stages from the table", () => {
    const candidate = selectionCandidate();
    expect(validateRulePackage(candidate).ok).toBe(true);
    const selection = resolveTariffSelection(candidate, "BT_K", "OTHER")!;
    expect(selection).toMatchObject({
      packageId: candidate.packageId,
      versionId: candidate.versionId,
      validFrom: candidate.validFrom,
      validTo: candidate.validTo,
    });
    expect(selection.groups.find((group) => group.id === "p5")!.levels).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
      "s6",
    ]);
    expect(selection.groups.find((group) => group.id === "p6")!.levels).toHaveLength(6);
    expect(selection.groups.find((group) => group.id === "p7")!.levels).not.toContain("s1");
    expect(selection.capabilities.annualPayment).toBe("SUPPORTED");
  });
  it("requires explicit versioning and preserves metadata-free old packages", () => {
    const candidate = selectionCandidate();
    candidate.engineContractVersion = 3;
    expect(validateRulePackage(candidate)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "UNSUPPORTED_TARIFF_SELECTION" }),
      ]),
    });
    delete candidate.rules.selection;
    delete candidate.rules.annualPaymentRules;
    expect(validateRulePackage(candidate).ok).toBe(true);
    expect(resolveTariffSelection(candidate, "BT_K", "OTHER")).toBeNull();
    candidate.engineContractVersion = 11;
    expect(validateRulePackage(candidate)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "MISSING_TARIFF_SELECTION" }),
      ]),
    });
  });
  it("does not invent cross-variant regions or normalise identifiers", () => {
    const candidate = selectionCandidate();
    expect(resolveTariffSelection(candidate, "BT_K", "KAV_BW")).not.toBeNull();
    expect(resolveTariffSelection(candidate, "BT_B", "KAV_BW")).not.toBeNull();
    const missingRegion = selectionCandidate();
    missingRegion.rules.selection!.variants[1].regions.pop();
    expect(resolveTariffSelection(missingRegion, "BT_B", "KAV_BW")).toBeNull();
    expect(resolveTariffSelection(candidate, "bt-k", "OTHER")).toBeNull();
    expect(resolveTariffSelection(candidate, "BT_K", " other ")).toBeNull();
  });
  it.each(["variant", "region", "part", "variant-source", "region-source"])(
    "rejects ambiguous or dangling %s references",
    (change) => {
      const candidate = selectionCandidate();
      const variants = candidate.rules.selection!.variants;
      if (change === "variant") variants.push(structuredClone(variants[0]));
      if (change === "region") variants[0].regions.push(structuredClone(variants[0].regions[0]));
      if (change === "part") variants[0].specialPartId = "missing";
      if (change === "variant-source") variants[0].sourceIds = ["missing"];
      if (change === "region-source") variants[0].regions[0].sourceIds = ["missing"];
      expect(validateRulePackage(candidate).ok).toBe(false);
      expect(resolveTariffSelection(candidate, "BT_K", "OTHER")).toBeNull();
    },
  );
  it.each([null, {}, { basePay: "SUPPORTED" }, { basePay: "MAYBE" }])(
    "rejects incomplete or unknown capabilities: %j",
    (capabilities) => {
      const candidate = selectionCandidate();
      expect(
        validateRulePackage({
          ...candidate,
          rules: { ...candidate.rules, selection: { ...candidate.rules.selection, capabilities } },
        }).ok,
      ).toBe(false);
    },
  );
  it("rejects executable extra data and duplicate table entries", () => {
    const candidate = selectionCandidate();
    expect(
      validateRulePackage({
        ...candidate,
        rules: {
          ...candidate.rules,
          selection: { ...candidate.rules.selection, script: "return 1" },
        },
      }).ok,
    ).toBe(false);
    candidate.rules.payTables[0].entries.push(
      structuredClone(candidate.rules.payTables[0].entries[0]),
    );
    expect(resolveTariffSelection(candidate, "BT_K", "OTHER")).toBeNull();
    expect(validateRulePackage(candidate).ok).toBe(false);
  });
  it("keeps the existing dated TVöD calculation and package date bounds", () => {
    const candidate = selectionCandidate();
    const run = (date: string) =>
      resolveRemunerationContext(date, [history()], resolver([candidate]));
    expect(run("2026-09-01")).toMatchObject({ kind: "tariff", monthlyCents: 290718 });
    expect(run("2026-04-30")).toMatchObject({ kind: "unavailable" });
    expect(run("2027-04-01")).toMatchObject({ kind: "unavailable" });
    candidate.rules.selection!.variants[0].regions.splice(0);
    expect(run("2026-09-01")).toMatchObject({
      kind: "unavailable",
      issue: { code: "TARIFF_UNSUPPORTED" },
    });
  });
  it.each([
    "family",
    "engine",
    "training",
    "basePay",
    "timePremiums",
    "allowances",
    "overtime",
    "annualPayment",
  ])("never uses TVöD for an unsupported %s declaration", (field) => {
    const candidate = selectionCandidate();
    const metadata = candidate.rules.selection!;
    if (field === "family") metadata.familyId = "caritas";
    else if (field === "engine") metadata.engineId = "future-engine";
    else if (field === "training") metadata.employmentKind = "APPRENTICE";
    else if (field === "annualPayment") metadata.capabilities.annualPayment = "UNSUPPORTED";
    else
      metadata.capabilities[field as "basePay" | "timePremiums" | "allowances" | "overtime"] =
        "UNSUPPORTED";
    expect(validateRulePackage(candidate).ok).toBe(false);
    const expectedCode = ["family", "training", "annualPayment"].includes(field)
      ? "TARIFF_UNSUPPORTED"
      : "TABLE_SELECTION_INVALID";
    expect(
      resolveRemunerationContext("2026-09-01", [history()], resolver([candidate])),
    ).toMatchObject({ kind: "unavailable", issue: { code: expectedCode } });
  });
  it("rejects mismatched special-part mapping even when both parts exist", () => {
    const candidate = selectionCandidate();
    candidate.rules.selection!.variants[0].specialPartId = "bt-b";
    expect(validateRulePackage(candidate).ok).toBe(false);
    expect(
      resolveRemunerationContext("2026-09-01", [history()], resolver([candidate])),
    ).toMatchObject({ kind: "unavailable", issue: { code: "TARIFF_UNSUPPORTED" } });
  });
});
