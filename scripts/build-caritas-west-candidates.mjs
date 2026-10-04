import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { caritasAnnualPaymentPolicy, caritasAvrText2026 } from "./caritas-annual-source.mjs";
import { caritasFederal2025 as federal } from "./caritas-bk-source.mjs";
import { caritasFixedCareAllowanceSource as fixedCare } from "./caritas-fixed-care-source.mjs";
import {
  caritasAvrText2025,
  caritasOvertimePolicy,
  caritasTimePremiumPolicy,
  caritasTimePremiumTables,
} from "./caritas-time-premium-source.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const baseline = JSON.parse(read("rules/packages/reviewed/tvl-kr-tdl/2026-04.json"));
const csv = read("docs/caritas-p-mittelwerte-2025-2026.csv")
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.split(","));

const workingTimeSources = {
  2025: [
    {
      id: "caritas-dgs-west-factsheets-2025",
      title: "Caritas-Dienstgeber, Faktenblätter Vergütung Regionen West 2025",
      url: "https://caritas-dienstgeber.de/fileadmin/Faktenblaetter/Faktenblaetter_2025_-_Regionen_West.zip",
      documentDate: "2025-07-01",
      section: "Stand Juli 2025: P7 Krankenhaus (Anlage 31), P10 Altenhilfe (Anlage 32)",
      sha256: "01a2a4e6681bb94e6fd85042f012d9582a6805b12ccfd1283a82ce1371a6045a",
    },
  ],
  2026: [
    {
      id: "caritas-dgs-west-hospital-time-2026",
      title: "Caritas-Dienstgeber, P7 Krankenhaus Regionen West 2026",
      url: "https://caritas-dienstgeber.de/fileadmin/Faktenblaetter/Regionen_West/P7-KH-Faktenblatt_Verguetung_West_2026.pdf",
      documentDate: "2026-02-01",
      section: "Stand Februar 2026: Anlage 31, 38,5 h bzw. 39 h in RK BW und RK Mitte",
      sha256: "6ed4d632987966d783dd4f9128bd24ca9fd911f7c084545fe748fdc1da020f49",
    },
    {
      id: "caritas-dgs-west-care-time-2026",
      title: "Caritas-Dienstgeber, P4 Altenhilfe Regionen West 2026",
      url: "https://caritas-dienstgeber.de/fileadmin/Faktenblaetter/Regionen_West/P4-AH-Faktenblatt_Verguetung_West_2026.pdf",
      documentDate: "2026-02-01",
      section: "Stand Februar 2026: Anlage 32, 39 h",
      sha256: "76f9728de35bd5b50ac68ee34866c13f13f97d2337438b2b48858ca35b65ebfd",
    },
  ],
};
const heuristic = baseline.sources.find(
  (source) => source.id === "pflegeshift-tariff-assessment-v1",
);
assert.ok(heuristic);
const careAllowanceCents = {
  "2025-07-01": 13796,
  "2026-02-01": 14182,
};

const commissions = [
  {
    id: "bw",
    name: "Baden-Württemberg",
    date: "2025-06-24",
    url: "https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_BW/2025-06-24_Beschluss_RKBW_Tarifrunde_2025_Teil1.pdf",
    sha256: "c39245927fbc96e7c602851b652f2ab2305543058a2bff9ac29a094bf203a18b",
  },
  {
    id: "bayern",
    name: "Bayern",
    date: "2025-06-26",
    url: "https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_Bayern/2025-06-26_RKBayern_Beschluss_allgemeineTarifrunde_Teil1_gez.pdf",
    sha256: "23c50f087481a0d97ca59a4758100c4eefef6a24d94a9412c360917fc219cf17",
  },
  {
    id: "mitte",
    name: "Mitte",
    date: "2025-06-26",
    url: "https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_Mitte/2025-06-26_Beschluss_RKMitte_Tarifrunde_2025gez.pdf",
    sha256: "98757c00930c91ac2d22a99169f094d014a4b7be903f84605469a0c311a81e42",
  },
  {
    id: "nord",
    name: "Nord",
    date: "2025-06-18",
    url: "https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_Nord/2025-06-18-beschluss-tarifrunde_2025-teil1-rk-nord.pdf",
    sha256: "db5311d7638a6db584b06d4e039231c9fe7b945d86328a9bdf40f4fdd56cbbbc",
  },
  {
    id: "nrw",
    name: "Nordrhein-Westfalen",
    date: "2025-06-27",
    url: "https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_NRW/2025-06-27-beschluss-tarifrunde_2025-rk-nrw.pdf",
    sha256: "14af8cb08fd8e9b4605925bfe0e16983c9476a00829b5f1d8101d227f2ad913c",
  },
];

function tableEntries(date) {
  const rows = csv.filter((row) => row[0] === date);
  assert.equal(rows.length, 12, `Expected twelve P groups at ${date}`);
  const entries = rows.flatMap((row) =>
    row.slice(2).flatMap((amount, index) =>
      amount
        ? [
            {
              groupId: row[1].toLowerCase(),
              stepId: String(index + 1),
              monthlyCents: Number(amount),
            },
          ]
        : [],
    ),
  );
  assert.equal(entries.length, 62, `Expected 62 P values at ${date}`);
  assert.ok(
    entries.every((entry) => Number.isSafeInteger(entry.monthlyCents) && entry.monthlyCents > 0),
  );
  return entries;
}

function candidate(commission, date, validTo) {
  const regional = {
    id: `caritas-rk-${commission.id}-2025`,
    title: `Caritas Regionalkommission ${commission.name}, Tarifrunde 2025 Teil 1`,
    url: commission.url,
    documentDate: commission.date,
    section:
      "Übernahme der Bundesmittelwerte in gleicher Höhe und zu denselben Zeitpunkten ab 01.07.2025",
    sha256: commission.sha256,
  };
  const tableId = `caritas-p-${date}`;
  const sourceIds = [federal.id, regional.id];
  const timeSources = workingTimeSources[date.slice(0, 4)];
  const timePremiumTables = Array.from(
    { length: Number(validTo.slice(0, 4)) - Number(date.slice(0, 4)) + 1 },
    (_, index) => caritasTimePremiumTables[Number(date.slice(0, 4)) + index],
  );
  return {
    schemaVersion: 1,
    engineContractVersion: 14,
    packageId: `avr-caritas-p-${commission.id}`,
    versionId: `${date}-draft1`,
    kind: "TARIFF",
    label: `AVR Caritas · Pflege · RK ${commission.name}`,
    status: "DRAFT",
    validFrom: date,
    validTo,
    jurisdiction: { country: "DE", federalStates: null },
    sources: [
      federal,
      regional,
      fixedCare,
      ...timeSources,
      caritasAvrText2025,
      ...(date.startsWith("2026") ? [caritasAvrText2026] : []),
      ...timePremiumTables,
      heuristic,
    ],
    review: { status: "DRAFT", reviewedBy: null, reviewedAt: null, gitCommit: null },
    rounding: { moneyScale: 2, mode: "HALF_UP", stage: "PER_LINE" },
    rules: {
      selection: {
        familyId: "avr-caritas-p",
        engineId: "avr-caritas-p-v1",
        employmentKind: "EMPLOYEE",
        variants: [31, 32].map((annex) => ({
          id: `ANLAGE_${annex}`,
          label: `Anlage ${annex}`,
          specialPartId: `anlage-${annex}`,
          sourceIds,
          regions: [
            {
              id: commission.id.toUpperCase(),
              label: `RK ${commission.name}`,
              payTableId: tableId,
              sourceIds,
            },
          ],
        })),
        capabilities: {
          basePay: "UNSUPPORTED",
          timePremiums: "UNSUPPORTED",
          allowances: "UNSUPPORTED",
          overtime: "UNSUPPORTED",
          annualPayment: "UNSUPPORTED",
        },
      },
      selector: {
        agreementId: "avr-caritas",
        specialPartIds: ["anlage-31", "anlage-32"],
        payTableId: tableId,
      },
      payTables: [{ id: tableId, sourceIds, entries: tableEntries(date) }],
      employmentWorkingTimeRules: [31, 32].map((annex) => ({
        id: `caritas-${commission.id}-${annex}-${date}`,
        variantId: `ANLAGE_${annex}`,
        regionId: commission.id.toUpperCase(),
        validFrom: date,
        validTo,
        fullTimeWeeklyMinutes:
          annex === 32 || ["bw", "mitte"].includes(commission.id) ? 2340 : 2310,
        sourceIds: [timeSources[annex === 31 ? 0 : timeSources.length - 1].id],
      })),
      caritasCareAllowanceRates: [31, 32].flatMap((annex) => [
        {
          id: `caritas-${commission.id}-care-3-${annex}-${date}`,
          provisionId: "SECTION_12_3",
          variantId: `ANLAGE_${annex}`,
          regionId: commission.id.toUpperCase(),
          validFrom: date,
          validTo,
          monthlyCents: commission.id === "bw" ? 3500 : 2500,
          sourceIds: [fixedCare.id],
        },
        {
          id: `caritas-${commission.id}-care-${annex}-${date}`,
          provisionId: "SECTION_12_4",
          variantId: `ANLAGE_${annex}`,
          regionId: commission.id.toUpperCase(),
          validFrom: date,
          validTo,
          monthlyCents: careAllowanceCents[date],
          sourceIds,
        },
      ]),
      caritasShiftAllowanceRates: [31, 32].map((annex) => ({
        id: `caritas-${commission.id}-shift-${annex}-${date}`,
        variantId: `ANLAGE_${annex}`,
        regionId: commission.id.toUpperCase(),
        validFrom: date,
        validTo,
        alternatingMonthlyCents: 25000,
        alternatingHourlyCents: annex === 31 ? 149 : 147,
        shiftMonthlyCents: 10000,
        shiftHourlyCents: 59,
        sourceIds,
      })),
      caritasTimePremiumPolicy: caritasTimePremiumPolicy(date, validTo),
      caritasOvertimePolicy: caritasOvertimePolicy(
        date,
        validTo,
        date.startsWith("2026") ? caritasAvrText2026 : caritasAvrText2025,
      ),
      caritasAnnualPaymentPolicy: caritasAnnualPaymentPolicy(
        date,
        date.startsWith("2025") ? "2025-12-31" : validTo,
        false,
      ),
      premiumRules: [],
      allowanceRules: [],
      combinationRules: [],
      workPatternRules: [],
      // The schema still requires this non-executed product heuristic; it is not an AVR rule.
      workPatternPolicy: baseline.rules.workPatternPolicy,
    },
  };
}

const preservedTracks = JSON.parse(read("rules/data/caritas-legacy-augmentation.json")).tracks;
function preserveExistingRules(pkg) {
  const stable = preservedTracks[`${pkg.packageId}/${pkg.versionId}`];
  assert.ok(stable, "Missing preserved regional revision");
  const weeklyValues = (rows) =>
    rows
      .map((row) =>
        [
          row.variantId,
          row.regionId,
          row.validFrom,
          row.validTo ?? null,
          row.fullTimeWeeklyMinutes,
        ].join("|"),
      )
      .sort();
  assert.deepEqual(
    weeklyValues(pkg.rules.employmentWorkingTimeRules),
    weeklyValues(stable.employmentWorkingTimeRules),
    "Weekly time differs from the independently delivered values",
  );
  pkg.sources = [
    ...structuredClone(stable.sources),
    ...pkg.sources.filter(
      (source) => !stable.sources.some((existing) => existing.id === source.id),
    ),
  ];
  pkg.rules.employmentWorkingTimeRules = structuredClone(stable.employmentWorkingTimeRules);
  pkg.rules.caritasCareAllowanceRates = pkg.rules.caritasCareAllowanceRates.map((row) => {
    const key = [row.provisionId, row.variantId, row.regionId, row.validFrom, row.validTo].join(
      "|",
    );
    const id = stable.careRateIds[key];
    assert.ok(id, "Missing preserved care rate identifier");
    return { ...row, id };
  });
  Object.assign(pkg.rules, structuredClone(stable.additionalRules));
  return pkg;
}
const check = process.argv.includes("--check");
for (const commission of commissions) {
  for (const [date, end] of [
    ["2025-07-01", "2026-01-31"],
    ["2026-02-01", "2026-12-31"],
  ]) {
    const name = `rules/packages/reviewed/avr-caritas-p-${commission.id}/${date}-draft1.json`;
    const target = new URL(name, root);
    const targetPath = fileURLToPath(target);
    const body = await prettier.format(
      JSON.stringify(preserveExistingRules(candidate(commission, date, end))),
      {
        ...(await prettier.resolveConfig(targetPath)),
        filepath: targetPath,
      },
    );
    if (check) assert.ok(read(name) === body, `${name} differs from its source CSV`);
    else {
      mkdirSync(fileURLToPath(new URL("./", target)), { recursive: true });
      writeFileSync(target, body);
    }
  }
}
console.log(`Caritas West candidates ${check ? "checked" : "generated"}: 10`);
