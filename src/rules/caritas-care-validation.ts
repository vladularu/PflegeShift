import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

function realDate(value: string): boolean {
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch {
    return false;
  }
}

function expectedWorkingMinutes(
  packageId: string,
  variantId: string,
  regionId: string,
  date: string,
): number {
  if (variantId === "ANLAGE_32" || ["BW", "MITTE"].includes(regionId)) return 2340;
  if (
    packageId === "avr-caritas-p-ost" &&
    regionId === "OST_TARIF_WEST_BERLIN" &&
    date < "2025-07-01"
  )
    return 2340;
  return 2310;
}

/** Table contract only. No Caritas component is executable until its adapter is implemented. */
export function caritasCareIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const {
    selection,
    selector,
    payTables,
    employmentWorkingTimeRules: workingTimes,
    caritasCareAllowanceRates: careRates,
    caritasShiftAllowanceRates: shiftRates,
    caritasTimePremiumPolicy: timePremiumPolicy,
    caritasOvertimePolicy: overtimePolicy,
    caritasAnnualPaymentPolicy: annualPolicy,
  } = pkg.rules;
  const issues: ValidationIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const regionalId = /^avr-caritas-p-(bw|bayern|mitte|nord|nrw|ost)$/.exec(pkg.packageId);
  const claimsCaritas =
    pkg.packageId.startsWith("avr-caritas-p") || selection?.familyId === "avr-caritas-p";
  if (pkg.engineContractVersion !== 14) {
    if (claimsCaritas)
      add("CARITAS_CONTRACT", "/engineContractVersion", "Caritas Pflege requires contract 14.");
    if (careRates !== undefined)
      add(
        "CARITAS_RATE_CONTRACT",
        "/rules/caritasCareAllowanceRates",
        "Caritas rates require contract 14.",
      );
    if (shiftRates !== undefined)
      add(
        "CARITAS_SHIFT_CONTRACT",
        "/rules/caritasShiftAllowanceRates",
        "Caritas shift rates require contract 14.",
      );
    if (timePremiumPolicy !== undefined)
      add(
        "CARITAS_TIME_PREMIUM_CONTRACT",
        "/rules/caritasTimePremiumPolicy",
        "Caritas time-premium policy requires contract 14.",
      );
    if (overtimePolicy !== undefined)
      add(
        "CARITAS_OVERTIME_CONTRACT",
        "/rules/caritasOvertimePolicy",
        "Caritas overtime policy requires contract 14.",
      );
    if (annualPolicy !== undefined)
      add(
        "CARITAS_ANNUAL_CONTRACT",
        "/rules/caritasAnnualPaymentPolicy",
        "Caritas annual-payment policy requires contract 14.",
      );
    return issues;
  }
  if (
    !regionalId ||
    selector.agreementId !== "avr-caritas" ||
    selection?.familyId !== "avr-caritas-p" ||
    selection.engineId !== "avr-caritas-p-v1" ||
    selection.employmentKind !== "EMPLOYEE"
  )
    add(
      "CARITAS_IDENTITY",
      "/rules/selection",
      "Explicit regional Caritas Pflege identity required.",
    );
  const region = regionalId?.[1].toUpperCase();
  const expectedParts = new Set(["anlage-31", "anlage-32"]);
  const parts = "specialPartIds" in selector ? selector.specialPartIds : [selector.specialPartId];
  if (parts.length !== 2 || !parts.every((part) => expectedParts.delete(part)))
    add("CARITAS_PARTS", "/rules/selector", "Both distinct care annexes must be declared.");
  const expectedVariants = new Map([
    ["ANLAGE_31", "anlage-31"],
    ["ANLAGE_32", "anlage-32"],
  ]);
  const expectedRegions = new Set(
    region === "OST"
      ? ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]
      : region
        ? [region]
        : [],
  );
  const referencedTables = new Set<string>();
  for (const variant of selection?.variants ?? []) {
    if (expectedVariants.get(variant.id) !== variant.specialPartId)
      add("CARITAS_VARIANTS", "/rules/selection/variants", "Unknown or duplicate care annex.");
    expectedVariants.delete(variant.id);
    const regionIds = new Set(variant.regions.map((item) => item.id));
    if (
      variant.regions.length !== expectedRegions.size ||
      [...expectedRegions].some((id) => !regionIds.has(id))
    )
      add(
        "CARITAS_REGION",
        "/rules/selection/variants",
        "Each regional package must bind its own commission and every applicable tariff territory.",
      );
    for (const regionItem of variant.regions) {
      if (regionItem.payTableId === undefined)
        add(
          "CARITAS_TABLE_MAPPING",
          "/rules/selection/variants",
          "Every care annex and tariff territory requires an explicit pay table mapping.",
        );
      else referencedTables.add(regionItem.payTableId);
    }
  }
  if (expectedVariants.size)
    add("CARITAS_VARIANTS", "/rules/selection/variants", "Both care annexes required.");
  if (
    !selection ||
    Object.values(selection.capabilities).some((status) => status !== "UNSUPPORTED")
  )
    add(
      "CARITAS_COMPONENT_COVERAGE",
      "/rules/selection/capabilities",
      "Table-only contract must not claim calculation support.",
    );
  // Allowlist prevents accidentally inheriting TVöD/TV-L formulas or training policies.
  const allowed = new Set([
    "selection",
    "selector",
    "payTables",
    "employmentWorkingTimeRules",
    "caritasCareAllowanceRates",
    "caritasShiftAllowanceRates",
    "caritasTimePremiumRates",
    "caritasAnnualPaymentRules",
    "caritasTimePremiumPolicy",
    "caritasOvertimePolicy",
    "caritasAnnualPaymentPolicy",
    "premiumRules",
    "allowanceRules",
    "combinationRules",
    "workPatternRules",
    "workPatternPolicy",
  ]);
  if (
    Object.keys(pkg.rules).some((key) => !allowed.has(key)) ||
    [
      pkg.rules.premiumRules,
      pkg.rules.allowanceRules,
      pkg.rules.combinationRules,
      pkg.rules.workPatternRules,
    ].some((rows) => rows.length)
  )
    add(
      "CARITAS_UNSUPPORTED_RULES",
      "/rules",
      "Unimplemented or foreign calculation rules are forbidden.",
    );
  if (payTables.length < 1 || payTables.length > 4)
    add("CARITAS_TABLE_COUNT", "/rules/payTables", "One to four dated P tables required.");
  if (payTables.some((table) => !referencedTables.has(table.id)))
    add(
      "CARITAS_UNREFERENCED_TABLE",
      "/rules/payTables",
      "Every declared P table must be bound to an annex and tariff territory.",
    );
  for (const table of payTables) {
    const expected = new Set<string>();
    for (const group of [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
      for (let step = group <= 6 ? 1 : 2; step <= 6; step++) expected.add(`p${group}:${step}`);
    for (const entry of table.entries) {
      if (!expected.delete(`${entry.groupId}:${entry.stepId}`) || entry.monthlyCents <= 0)
        add(
          "CARITAS_TABLE_ENTRY",
          "/rules/payTables",
          "Invalid or duplicate P group/stage/value; P5 is not a Caritas care group.",
        );
    }
    if (expected.size)
      add("CARITAS_TABLE_INCOMPLETE", "/rules/payTables", "All 62 P group/stage values required.");
  }
  if (workingTimes !== undefined) {
    const root = "/rules/employmentWorkingTimeRules";
    const knownSources = new Set(pkg.sources.map((source) => source.id));
    const pairs = new Set(
      (selection?.variants ?? []).flatMap((variant) =>
        variant.regions.map((item) => `${variant.id}:${item.id}`),
      ),
    );
    const ids = new Set<string>();
    let invalidRange = !realDate(pkg.validFrom) || pkg.validTo === null || !realDate(pkg.validTo);
    if (
      pkg.packageId === "avr-caritas-p-ost" &&
      pkg.validFrom < "2025-07-01" &&
      selection?.variants.some((variant) =>
        variant.regions.some((item) => item.id === "OST_TARIF_WEST"),
      )
    )
      add(
        "CARITAS_WORKING_TIME_TERRITORY_AMBIGUOUS",
        root,
        "Before July 2025, Ost tariff territory West cannot distinguish Berlin from Hamburg.",
      );
    for (const [index, rule] of workingTimes.entries()) {
      const path = `${root}/${index}`;
      if (ids.has(rule.id)) add("CARITAS_WORKING_TIME_ID", path, "Duplicate working-time id.");
      ids.add(rule.id);
      const pair = `${rule.variantId}:${rule.regionId}`;
      if (!pairs.has(pair))
        add("CARITAS_WORKING_TIME_SELECTION", path, "Unknown annex or regional territory.");
      else if (realDate(rule.validFrom) && rule.validTo !== null && realDate(rule.validTo)) {
        const start = expectedWorkingMinutes(
          pkg.packageId,
          rule.variantId,
          rule.regionId,
          rule.validFrom,
        );
        const end = expectedWorkingMinutes(
          pkg.packageId,
          rule.variantId,
          rule.regionId,
          rule.validTo,
        );
        if (start !== end || rule.fullTimeWeeklyMinutes !== start)
          add(
            "CARITAS_WORKING_TIME_VALUE",
            path,
            "Unexpected regional full-time weekly minutes or an unsplit dated change.",
          );
      }
      for (const id of rule.sourceIds)
        if (!knownSources.has(id)) add("UNKNOWN_SOURCE_ID", `${path}/sourceIds`, id);
      if (
        !realDate(rule.validFrom) ||
        rule.validTo === null ||
        !realDate(rule.validTo) ||
        rule.validTo < rule.validFrom ||
        rule.validFrom < pkg.validFrom ||
        (pkg.validTo !== null && rule.validTo > pkg.validTo)
      ) {
        invalidRange = true;
        add("CARITAS_WORKING_TIME_RANGE", path, "Invalid or out-of-package working-time range.");
      }
    }
    if (!invalidRange)
      for (const pair of pairs) {
        const dated = workingTimes
          .filter((rule) => `${rule.variantId}:${rule.regionId}` === pair)
          .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
        let next = pkg.validFrom;
        for (const rule of dated) {
          if (rule.validFrom !== next)
            add("CARITAS_WORKING_TIME_COVERAGE", root, `Gap or overlap in ${pair}.`);
          next = Temporal.PlainDate.from(rule.validTo!).add({ days: 1 }).toString();
        }
        if (
          !dated.length ||
          next !== Temporal.PlainDate.from(pkg.validTo!).add({ days: 1 }).toString()
        )
          add("CARITAS_WORKING_TIME_COVERAGE", root, `Incomplete coverage for ${pair}.`);
      }
  }
  if (careRates !== undefined) {
    const root = "/rules/caritasCareAllowanceRates";
    const ids = new Set<string>();
    const pairs = new Set(
      (selection?.variants ?? []).flatMap((variant) =>
        variant.regions.map((item) => `${variant.id}:${item.id}`),
      ),
    );
    const knownSources = new Set(pkg.sources.map((source) => source.id));
    const regionalSource =
      pkg.packageId === "avr-caritas-p-ost"
        ? "caritas-rk-ost-2025-allowances"
        : `caritas-rk-${regionalId?.[1]}-2025`;
    for (const [index, rate] of careRates.entries()) {
      const path = `${root}/${index}`;
      if (ids.has(rate.id)) add("CARITAS_RATE_ID", path, "Duplicate care-allowance rate id.");
      ids.add(rate.id);
      if (!pairs.has(`${rate.variantId}:${rate.regionId}`))
        add("CARITAS_RATE_SELECTION", path, "Unknown annex or regional territory.");
      if (
        !realDate(rate.validFrom) ||
        !realDate(rate.validTo) ||
        rate.validTo < rate.validFrom ||
        rate.validFrom < pkg.validFrom ||
        (pkg.validTo !== null && rate.validTo > pkg.validTo)
      )
        add("CARITAS_RATE_RANGE", path, "Invalid or out-of-package allowance-rate range.");
      if (rate.provisionId === "SECTION_12_4") {
        if (
          !rate.sourceIds.includes("caritas-bk-2025-02-corrected") ||
          !rate.sourceIds.includes(regionalSource)
        )
          add(
            "CARITAS_RATE_SOURCE",
            path,
            "§ 12(4) requires the federal amount and regional adoption source.",
          );
      } else if (!rate.sourceIds.includes("caritas-dg-2024-care-allowances"))
        add("CARITAS_RATE_SOURCE", path, "§ 12(3) requires the regional-rate source.");
      for (const id of rate.sourceIds)
        if (!knownSources.has(id)) add("UNKNOWN_SOURCE_ID", `${path}/sourceIds`, id);
    }
    if (pkg.validTo !== null && realDate(pkg.validTo)) {
      for (const provisionId of ["SECTION_12_3", "SECTION_12_4"] as const)
        for (const pair of pairs) {
          const coverageFrom =
            provisionId === "SECTION_12_3" || pkg.validFrom >= "2025-07-01"
              ? pkg.validFrom
              : "2025-07-01";
          const dated = careRates
            .filter(
              (rate) =>
                rate.provisionId === provisionId && `${rate.variantId}:${rate.regionId}` === pair,
            )
            .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
          let next = coverageFrom;
          for (const rate of dated) {
            if (!realDate(rate.validFrom) || !realDate(rate.validTo)) continue;
            if (rate.validFrom !== next)
              add("CARITAS_RATE_COVERAGE", root, `Gap or overlap in ${provisionId}:${pair}.`);
            next = Temporal.PlainDate.from(rate.validTo).add({ days: 1 }).toString();
          }
          if (
            !dated.length ||
            next !== Temporal.PlainDate.from(pkg.validTo).add({ days: 1 }).toString()
          )
            add("CARITAS_RATE_COVERAGE", root, `Incomplete coverage for ${provisionId}:${pair}.`);
        }
    }
  }
  if (shiftRates !== undefined) {
    const root = "/rules/caritasShiftAllowanceRates";
    const ids = new Set<string>();
    const pairs = new Set(
      (selection?.variants ?? []).flatMap((variant) =>
        variant.regions.map((item) => `${variant.id}:${item.id}`),
      ),
    );
    const knownSources = new Set(pkg.sources.map((source) => source.id));
    const regionalSource =
      pkg.packageId === "avr-caritas-p-ost"
        ? "caritas-rk-ost-2025-allowances"
        : `caritas-rk-${regionalId?.[1]}-2025`;
    for (const [index, rate] of shiftRates.entries()) {
      const path = `${root}/${index}`;
      if (ids.has(rate.id)) add("CARITAS_SHIFT_ID", path, "Duplicate shift-rate id.");
      ids.add(rate.id);
      if (!pairs.has(`${rate.variantId}:${rate.regionId}`))
        add("CARITAS_SHIFT_SELECTION", path, "Unknown annex or regional territory.");
      if (
        !realDate(rate.validFrom) ||
        !realDate(rate.validTo) ||
        rate.validTo < rate.validFrom ||
        rate.validFrom < pkg.validFrom ||
        rate.validFrom < "2025-07-01" ||
        (pkg.validTo !== null && rate.validTo > pkg.validTo)
      )
        add("CARITAS_SHIFT_RANGE", path, "Invalid or out-of-package shift-rate range.");
      if (
        !rate.sourceIds.includes("caritas-bk-2025-02-corrected") ||
        !rate.sourceIds.includes(regionalSource)
      )
        add("CARITAS_SHIFT_SOURCE", path, "Federal rate and regional adoption required.");
      for (const id of rate.sourceIds)
        if (!knownSources.has(id)) add("UNKNOWN_SOURCE_ID", `${path}/sourceIds`, id);
    }
    if (pkg.validTo !== null && realDate(pkg.validTo)) {
      const coverageFrom = pkg.validFrom >= "2025-07-01" ? pkg.validFrom : "2025-07-01";
      for (const pair of pairs) {
        const dated = shiftRates
          .filter((rate) => `${rate.variantId}:${rate.regionId}` === pair)
          .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
        let next = coverageFrom;
        for (const rate of dated) {
          if (!realDate(rate.validFrom) || !realDate(rate.validTo)) continue;
          if (rate.validFrom !== next)
            add("CARITAS_SHIFT_COVERAGE", root, `Gap or overlap in ${pair}.`);
          next = Temporal.PlainDate.from(rate.validTo).add({ days: 1 }).toString();
        }
        if (
          !dated.length ||
          next !== Temporal.PlainDate.from(pkg.validTo).add({ days: 1 }).toString()
        )
          add("CARITAS_SHIFT_COVERAGE", root, `Incomplete coverage for ${pair}.`);
      }
    }
  }
  if (timePremiumPolicy !== undefined) {
    const root = "/rules/caritasTimePremiumPolicy";
    if (
      !realDate(timePremiumPolicy.validFrom) ||
      !realDate(timePremiumPolicy.validTo) ||
      timePremiumPolicy.validTo < timePremiumPolicy.validFrom ||
      timePremiumPolicy.validFrom < pkg.validFrom ||
      (pkg.validTo !== null && timePremiumPolicy.validTo > pkg.validTo)
    )
      add("CARITAS_TIME_PREMIUM_RANGE", root, "Policy dates must lie within the package.");
    const sameWindow = (
      actual: { startMinute: number; endMinute: number },
      startMinute: number,
      endMinute: number,
    ) => actual.startMinute === startMinute && actual.endMinute === endMinute;
    if (
      !sameWindow(timePremiumPolicy.nightWindow, 1260, 360) ||
      !sameWindow(timePremiumPolicy.preHolidayWindow, 360, 0) ||
      !sameWindow(timePremiumPolicy.saturdayWindow, 780, 1260) ||
      timePremiumPolicy.nightBasisPoints !== 2000 ||
      timePremiumPolicy.sundayBasisPoints !== 2500 ||
      timePremiumPolicy.holidayWithTimeOffBasisPoints !== 3500 ||
      timePremiumPolicy.holidayWithoutTimeOffBasisPoints !== 13500 ||
      timePremiumPolicy.preHolidayBasisPoints !== 3500 ||
      timePremiumPolicy.saturdayBasisPoints !== 2000 ||
      timePremiumPolicy.preHolidayMonthDays.length !== 2 ||
      !timePremiumPolicy.preHolidayMonthDays.includes("12-24") ||
      !timePremiumPolicy.preHolidayMonthDays.includes("12-31")
    )
      add(
        "CARITAS_TIME_PREMIUM_VALUE",
        root,
        "The federal Anlage 31/32 baseline must preserve its windows, rates and holiday collision rules.",
      );
    const knownSources = new Set(pkg.sources.map((source) => source.id));
    for (const id of timePremiumPolicy.sourceIds)
      if (!knownSources.has(id)) add("UNKNOWN_SOURCE_ID", `${root}/sourceIds`, id);
  }
  if (overtimePolicy !== undefined) {
    const root = "/rules/caritasOvertimePolicy";
    if (
      !realDate(overtimePolicy.validFrom) ||
      !realDate(overtimePolicy.validTo) ||
      overtimePolicy.validTo < overtimePolicy.validFrom ||
      overtimePolicy.validFrom < pkg.validFrom ||
      (pkg.validTo !== null && overtimePolicy.validTo > pkg.validTo) ||
      overtimePolicy.validFrom < "2025-01-01" ||
      overtimePolicy.validTo > "2026-12-31"
    )
      add("CARITAS_OVERTIME_RANGE", root, "Overtime policy dates need reviewed package coverage.");
    const expectedRates = new Map<string, number>([
      ...["p4", "p6", "p7", "p8", "p9", "p10", "p11"].map((group): [string, number] => [
        group,
        3000,
      ]),
      ...["p12", "p13", "p14", "p15", "p16"].map((group): [string, number] => [group, 1500]),
    ]);
    for (const band of overtimePolicy.rateBands)
      for (const group of band.groupIds) {
        if (expectedRates.get(group) !== band.premiumBasisPoints)
          add(
            "CARITAS_OVERTIME_RATE",
            `${root}/rateBands`,
            `Incorrect or repeated group ${group}.`,
          );
        expectedRates.delete(group);
      }
    if (expectedRates.size)
      add("CARITAS_OVERTIME_RATE", `${root}/rateBands`, "P-group rates are incomplete.");
    const expectedSourceId =
      overtimePolicy.validFrom.slice(0, 4) === "2025"
        ? "caritas-avr-text-2025-1"
        : "caritas-avr-text-2026-03";
    if (!overtimePolicy.sourceIds.includes(expectedSourceId))
      add("CARITAS_OVERTIME_SOURCE", `${root}/sourceIds`, "The dated AVR text source is required.");
    const knownSources = new Set(pkg.sources.map((source) => source.id));
    for (const id of overtimePolicy.sourceIds)
      if (!knownSources.has(id)) add("UNKNOWN_SOURCE_ID", `${root}/sourceIds`, id);
  }
  if (annualPolicy !== undefined) {
    const root = "/rules/caritasAnnualPaymentPolicy";
    const year = Number(annualPolicy.validFrom.slice(0, 4));
    if (
      !realDate(annualPolicy.validFrom) ||
      !realDate(annualPolicy.validTo) ||
      annualPolicy.validFrom < pkg.validFrom ||
      (pkg.validTo !== null && annualPolicy.validTo > pkg.validTo) ||
      annualPolicy.validTo.slice(0, 4) !== String(year) ||
      ![2025, 2026].includes(year) ||
      annualPolicy.validFrom > `${year}-11-01` ||
      annualPolicy.validTo < `${year}-11-30`
    )
      add("CARITAS_ANNUAL_RANGE", root, "One claim year and its November payout must be covered.");
    const expectedBands = new Map([
      [8600, new Set(["p4", "p6", "p7", "p8"])],
      [7600, new Set(["p9", "p10", "p11", "p12", "p13", "p14", "p15", "p16"])],
    ]);
    const seenRates = new Set<number>();
    for (const band of annualPolicy.rateBands) {
      const expected = expectedBands.get(band.rateBasisPoints);
      if (
        !expected ||
        seenRates.has(band.rateBasisPoints) ||
        band.groupIds.length !== expected.size ||
        band.groupIds.some((group) => !expected.has(group))
      )
        add("CARITAS_ANNUAL_RATE", `${root}/rateBands`, "P-group rate mapping is incomplete.");
      seenRates.add(band.rateBasisPoints);
    }
    if (seenRates.size !== 2)
      add("CARITAS_ANNUAL_RATE", `${root}/rateBands`, "Both sourced rate bands are required.");
    if (annualPolicy.eastTariff2025UsesWestTable !== (region === "OST" && year === 2025))
      add(
        "CARITAS_ANNUAL_EAST_BASIS",
        `${root}/eastTariff2025UsesWestTable`,
        "The east-tariff West-table exception expires at the end of 2025.",
      );
    const sourceIds = new Set(annualPolicy.sourceIds);
    const requiredIds = [
      year === 2025 ? "caritas-avr-text-2025-1" : "caritas-avr-text-2026-03",
      ...(region === "OST" && year === 2026 ? ["caritas-bk-2025-03-east-annual"] : []),
    ];
    const knownSources = new Set(pkg.sources.map((source) => source.id));
    if (requiredIds.some((id) => !sourceIds.has(id)))
      add(
        "CARITAS_ANNUAL_SOURCE",
        `${root}/sourceIds`,
        "The AVR and east amendment must be cited.",
      );
    for (const id of annualPolicy.sourceIds)
      if (!knownSources.has(id)) add("UNKNOWN_SOURCE_ID", `${root}/sourceIds`, id);
  }
  if (pkg.validTo === null || pkg.validTo > "2026-12-31")
    add(
      "CARITAS_2027_TRANSITION",
      "/validTo",
      "The AVR 2027 transition requires a separately verified contract.",
    );
  return issues;
}
