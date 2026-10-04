import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

const GROUPS = [
  "eg15",
  "eg14",
  "eg13",
  "eg12",
  "eg11",
  "eg10",
  "eg9c",
  "eg9b",
  "eg9a",
  "eg8",
  "eg7",
  "eg6",
  "eg5",
  "eg4",
  "eg3",
  "eg2",
  "eg1",
] as const;

/** Source-table contract only; no claim of complete TVöD remuneration. */
export function tvoedAnnexAIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const {
    selection,
    selector,
    payTables,
    tvoedAnnexAOvertimePolicy: overtime,
    tvoedAnnexATimePremiumPolicy: premium,
  } = pkg.rules;
  const claimsAnnexA =
    pkg.packageId === "tvoed-vka-anlage-a" || selection?.familyId === "tvoed-vka-annex-a";
  if (pkg.engineContractVersion !== 16) {
    if (claimsAnnexA)
      add("TVOED_A_CONTRACT", "/engineContractVersion", "Anlage A requires contract 16.");
    return issues;
  }

  const parts = "specialPartIds" in selector ? selector.specialPartIds : [selector.specialPartId];
  if (
    pkg.packageId !== "tvoed-vka-anlage-a" ||
    selector.agreementId !== "tvoed-vka" ||
    parts.length !== 2 ||
    !parts.includes("bt-k") ||
    !parts.includes("bt-b") ||
    selector.payTableId !== "anlage-a" ||
    selection?.familyId !== "tvoed-vka-annex-a" ||
    selection.engineId !== "tvoed-annex-a-v1" ||
    selection.employmentKind !== "EMPLOYEE"
  )
    add("TVOED_A_IDENTITY", "/rules/selection", "Explicit VKA Anlage A identity required.");

  if (
    selection?.variants.length !== 2 ||
    ["BT_K", "BT_B"].some((id) => {
      const variant = selection?.variants.find((item) => item.id === id);
      return (
        !variant ||
        variant.specialPartId !== (id === "BT_K" ? "bt-k" : "bt-b") ||
        variant.regions.length !== 1 ||
        variant.regions[0]?.id !== "VKA" ||
        variant.regions[0]?.payTableId !== "anlage-a"
      );
    })
  )
    add("TVOED_A_SELECTION", "/rules/selection/variants", "BT-K and BT-B must map to Anlage A.");

  if (
    pkg.status !== "DRAFT" ||
    Object.values(selection?.capabilities ?? {}).some((value) => value !== "UNSUPPORTED")
  )
    add(
      "TVOED_A_NOT_EXECUTABLE",
      "/rules/selection/capabilities",
      "The source-only table must remain DRAFT with all capabilities unsupported.",
    );

  const allowed = new Set([
    "selection",
    "selector",
    "payTables",
    "premiumRules",
    "allowanceRules",
    "combinationRules",
    "workPatternRules",
    "workPatternPolicy",
    "tvoedAnnexAOvertimePolicy",
    "tvoedAnnexATimePremiumPolicy",
  ]);
  if (
    Object.keys(pkg.rules).some((key) => !allowed.has(key)) ||
    [
      pkg.rules.premiumRules,
      pkg.rules.allowanceRules,
      pkg.rules.combinationRules,
      pkg.rules.workPatternRules,
    ].some((rows) => rows.length > 0)
  )
    add("TVOED_A_FOREIGN_RULES", "/rules", "Unimplemented calculation rules are forbidden.");

  if (payTables.length !== 1 || payTables[0]?.id !== "anlage-a") {
    add("TVOED_A_TABLE", "/rules/payTables", "Exactly one Anlage A table required.");
    return issues;
  }
  if (!overtime) {
    add(
      "TVOED_A_OVERTIME_MISSING",
      "/rules/tvoedAnnexAOvertimePolicy",
      "Dated § 7/§ 8 overtime facts are required while calculation remains disabled.",
    );
  } else {
    const path = "/rules/tvoedAnnexAOvertimePolicy";
    const knownSources = new Set(pkg.sources.map((source) => source.id));
    const variantSources = selection?.variants.flatMap((variant) => variant.sourceIds) ?? [];
    if (
      overtime.validFrom !== pkg.validFrom ||
      overtime.validTo !== pkg.validTo ||
      overtime.sourceIds.length !== 2 ||
      variantSources.length !== 2 ||
      variantSources.some((id) => !overtime.sourceIds.includes(id)) ||
      overtime.sourceIds.some((id) => !knownSources.has(id))
    )
      add(
        "TVOED_A_OVERTIME_SOURCE_RANGE",
        path,
        "Both variant sources and exact package validity are required.",
      );
    if (
      overtime.premiumReferenceStepId !== "s3" ||
      overtime.workPayMaximumStepId !== "s4" ||
      overtime.monthlyFactorThousandths !== 4348 ||
      overtime.standardFullTimeWeeklyMinutes !== 2340 ||
      overtime.requiresConfirmedClassification !== true ||
      overtime.requiresSeparateSettlement !== true
    )
      add(
        "TVOED_A_OVERTIME_VALUE",
        path,
        "Overtime stage basis, weekly hours or safeguards changed.",
      );
    const expectedRates = new Map<string, number>([
      ...["eg1", "eg2", "eg3", "eg4", "eg5", "eg6", "eg7", "eg8", "eg9a", "eg9b"].map(
        (group): [string, number] => [group, 3000],
      ),
      ...["eg9c", "eg10", "eg11", "eg12", "eg13", "eg14", "eg15"].map((group): [string, number] => [
        group,
        1500,
      ]),
    ]);
    for (const band of overtime.rateBands)
      for (const group of band.groupIds) {
        if (expectedRates.get(group) !== band.premiumBasisPoints)
          add(
            "TVOED_A_OVERTIME_RATE",
            `${path}/rateBands`,
            `Incorrect or repeated group ${group}.`,
          );
        expectedRates.delete(group);
      }
    if (expectedRates.size > 0)
      add("TVOED_A_OVERTIME_RATE", `${path}/rateBands`, "All EG rate groups must be covered once.");
  }
  if (!premium) {
    add(
      "TVOED_A_PREMIUM_MISSING",
      "/rules/tvoedAnnexATimePremiumPolicy",
      "Dated § 8 facts are required even while calculation remains disabled.",
    );
  } else {
    const path = "/rules/tvoedAnnexATimePremiumPolicy";
    const sourceIds = new Set(pkg.sources.map((source) => source.id));
    const variantSourceIds = selection?.variants.flatMap((variant) => variant.sourceIds) ?? [];
    if (
      premium.validFrom !== pkg.validFrom ||
      premium.validTo !== pkg.validTo ||
      premium.sourceIds.length !== 2 ||
      variantSourceIds.length !== 2 ||
      variantSourceIds.some((id) => !premium.sourceIds.includes(id)) ||
      premium.sourceIds.some((id) => !sourceIds.has(id))
    )
      add(
        "TVOED_A_PREMIUM_SOURCE_RANGE",
        path,
        "Premium facts require both sourced variants and exact package validity.",
      );
    if (
      premium.referenceStepId !== "s3" ||
      premium.monthlyFactorThousandths !== 4348 ||
      premium.standardFullTimeWeeklyMinutes !== 2340 ||
      premium.nightWindow.startMinute !== 1260 ||
      premium.nightWindow.endMinute !== 360 ||
      premium.nightBasisPoints !== 2000 ||
      premium.sundayBasisPoints !== 2500 ||
      premium.holidayWithTimeOffBasisPoints !== 3500 ||
      premium.holidayWithoutTimeOffBasisPoints !== 13500 ||
      premium.preHolidayWindow.startMinute !== 360 ||
      premium.preHolidayWindow.endMinute !== 0 ||
      premium.preHolidayMonthDays.length !== 2 ||
      !premium.preHolidayMonthDays.includes("12-24") ||
      !premium.preHolidayMonthDays.includes("12-31") ||
      premium.preHolidayBasisPoints !== 3500 ||
      premium.saturdayWindow.startMinute !== 780 ||
      premium.saturdayWindow.endMinute !== 1260 ||
      premium.saturdayBasisPoints !== 2000 ||
      premium.saturdayShiftLegacyAngestellteOnly !== true ||
      premium.competition !== "HIGHEST_SUNDAY_HOLIDAY_PREHOLIDAY_SATURDAY" ||
      premium.nightStacks !== true ||
      premium.holidayWithoutTimeOffMaximumTotalBasisPoints !== 23500 ||
      premium.localAgreementMayIncrease !== true
    )
      add("TVOED_A_PREMIUM_VALUE", path, "§ 8/BT-K/BT-B rates, windows or exception changed.");
  }
  const expected = new Set(
    GROUPS.flatMap((groupId) =>
      [2, 3, 4, 5, 6, ...(groupId === "eg1" ? [] : [1])].map((stage) => `${groupId}:s${stage}`),
    ),
  );
  for (const entry of payTables[0].entries) {
    if (
      !expected.delete(`${entry.groupId}:${entry.stepId}`) ||
      !Number.isSafeInteger(entry.monthlyCents) ||
      entry.monthlyCents <= 0
    )
      add(
        "TVOED_A_TABLE_ENTRY",
        "/rules/payTables/0/entries",
        "Invalid or duplicate EG/stage/value.",
      );
  }
  if (expected.size > 0)
    add(
      "TVOED_A_TABLE_INCOMPLETE",
      "/rules/payTables/0/entries",
      "All 101 printed amounts are required; EG 1 has no stage 1.",
    );
  return issues;
}
