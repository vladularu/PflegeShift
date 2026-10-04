import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import {
  caritasAnnualPaymentPolicy,
  caritasAvrText2026,
  caritasEastAnnualAmendment,
} from "./caritas-annual-source.mjs";
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
const heuristic = baseline.sources.find(
  (source) => source.id === "pflegeshift-tariff-assessment-v1",
);
assert.ok(heuristic);

const sources = {
  2025: {
    id: "caritas-rk-ost-2025-p",
    title: "Caritas RK Ost, Entgeltwerte 2025, Anlagen 31 und 32",
    url: "https://www.caritas.de/cms/contents/caritas.de/medien/dokumente/arbeitsrechtliche-ko/beschluesse/beschluesse-regional/2023-07-05-langfassu1/2023-07-05_langfassungeckpunktebeschlussrkostbeschlussdez.2019_werte_2025_gez.pdf?d=a&f=pdf",
    documentDate: "2023-07-05",
    section: "Anlage 31 Anhang B S. 8-9; Anlage 32 Anhang B S. 16-17; Tarifgebiet Ost und West",
    sha256: "ce4b2bf09fa75714c99484d45bada2eb77db2c06d3932e642677fc6c12bbaa01",
  },
  2026: {
    id: "caritas-rk-ost-2026-p",
    title: "Caritas RK Ost, Entgeltwerte 2026, Anlagen 31 und 32",
    url: "https://www.caritas.de/cms/contents/caritas.de/medien/dokumente/arbeitsrechtliche-ko/beschluesse/beschluesse-regional/2025-06-26-langfassu/2025-06-26_langfassungeckpunktebeschlussrkostbeschlussdez.2019_werte_2026_gez.pdf?d=a&f=pdf",
    documentDate: "2025-06-26",
    section: "Anlage 31 Anhang B S. 5; Anlage 32 Anhang B S. 9; 01.01.-31.12.2026",
    sha256: "2b64d9893f09df91e4daae412ec315795135c3f482e837642983ff4fb0b1a733",
  },
};
const regionalAllowance = {
  id: "caritas-rk-ost-2025-allowances",
  title: "Caritas RK Ost, Übernahme weiterer Vergütungsbestandteile 2025",
  url: "https://caritas-dienstgeber.de/fileadmin/Beschluesse/RK_Ost/2025-06-26_Beschluss_Erhoehung_Werte_weitere_Verguetungsbestandteile_gez.pdf",
  documentDate: "2025-06-26",
  section: "I, Anlagen 31/32 § 6 Abs. 5 und 6 sowie § 12 Abs. 4, gleiche Höhe und Zeitpunkte",
  sha256: "6bfe23a0a45a5ee269ddd452a96ec213a07ca111dd7fc2f6b05a817db8a74993",
};
const workingTimeSources = [
  {
    id: "caritas-rk-ost-time-2022",
    title: "Caritas RK Ost, Arbeitszeitregelung für Anlagen 31 und 32",
    url: "https://www.caritas.de/cms/contents/caritas.de/medien/dokumente/arbeitsrechtliche-ko/beschluesse/beschluesse-regional/2022-01-25-beschluss/2022_01_25_beschluss_rkost_nderung_der_anlagen_5_31bis33_redaktionell_bearbeitet_gez.pdf?d=a&f=pdf",
    documentDate: "2022-01-25",
    section: "Nr. 2 und 3: Anlage 31 ab Januar bzw. Juli 2025; Anlage 32 ab Juli 2023",
    sha256: "b8b3eff8f6c35445db0fc3e766bf1791b60989331d65ac4c7c37a01aefea0fcb",
  },
  {
    id: "caritas-dgs-ost-hospital-time-2026",
    title: "Caritas-Dienstgeber, P11 Krankenhaus Region Ost 2026",
    url: "https://caritas-dienstgeber.de/fileadmin/Faktenblaetter/Region_Ost/P11-KH-Faktenblatt_Verguetung_Ost_2026.pdf",
    documentDate: "2026-01-01",
    section: "Stand Januar 2026: Anlage 31, 38,5 h",
    sha256: "a5616c3563657de77c4dad24c8f14861ad70a3537a5c5194d773848e8ba22c9b",
  },
];

function rowsFor(year, table) {
  const file = year === 2025 ? "docs/caritas-p-ost-2025.csv" : "docs/caritas-p-ost-2026.csv";
  const rows = read(file)
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(","))
    .filter((row) => (year === 2025 && row[1] === table) || year === 2026);
  assert.equal(rows.length, 12, `Expected twelve P groups for RK Ost ${year}/${table}`);
  const groupIndex = year === 2025 ? 2 : 1;
  const amountIndex = year === 2025 ? 3 : 2;
  const entries = rows.flatMap((row) =>
    row.slice(amountIndex).flatMap((amount, index) =>
      amount
        ? [
            {
              groupId: row[groupIndex].toLowerCase(),
              stepId: String(index + 1),
              monthlyCents: Number(amount),
            },
          ]
        : [],
    ),
  );
  assert.equal(entries.length, 62, `Expected 62 P values for RK Ost ${year}/${table}`);
  assert.ok(
    entries.every((entry) => Number.isSafeInteger(entry.monthlyCents) && entry.monthlyCents > 0),
  );
  return entries;
}

function candidate(year) {
  const source = sources[year];
  const sourceIds = [source.id];
  const commonId = `caritas-ost-p-${year}-common`;
  const eastId = `caritas-ost-p-${year}-annex32-east`;
  const payTables = [
    {
      id: commonId,
      sourceIds,
      entries: rowsFor(year, "COMMON"),
    },
  ];
  if (year === 2025)
    payTables.push({
      id: eastId,
      sourceIds,
      entries: rowsFor(year, "ANLAGE_32_TARIF_OST"),
    });
  return {
    schemaVersion: 1,
    engineContractVersion: 14,
    packageId: "avr-caritas-p-ost",
    versionId: `${year}-01-draft1`,
    kind: "TARIFF",
    label: "AVR Caritas · Pflege · RK Ost",
    status: "DRAFT",
    validFrom: `${year}-01-01`,
    validTo: `${year}-12-31`,
    jurisdiction: { country: "DE", federalStates: null },
    sources: [
      source,
      federal,
      regionalAllowance,
      fixedCare,
      caritasAvrText2025,
      ...(year === 2026 ? [caritasAvrText2026, caritasEastAnnualAmendment] : []),
      caritasTimePremiumTables[year],
      ...(year === 2026 ? workingTimeSources : [workingTimeSources[0]]),
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
              id: "OST_TARIF_OST",
              label: "RK Ost · Tarifgebiet Ost",
              payTableId: year === 2025 && annex === 32 ? eastId : commonId,
              sourceIds,
            },
            {
              id: "OST_TARIF_WEST_BERLIN",
              label: "RK Ost · Tarifgebiet West · Berlin",
              payTableId: commonId,
              sourceIds,
            },
            {
              id: "OST_TARIF_WEST_HAMBURG",
              label: "RK Ost · Tarifgebiet West · Hamburg",
              payTableId: commonId,
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
        payTableId: commonId,
      },
      payTables,
      employmentWorkingTimeRules: [31, 32].flatMap((annex) =>
        ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"].flatMap(
          (territory) => {
            const periods =
              year === 2025 && annex === 31 && territory === "OST_TARIF_WEST_BERLIN"
                ? [
                    { from: "2025-01-01", to: "2025-06-30", minutes: 2340 },
                    { from: "2025-07-01", to: "2025-12-31", minutes: 2310 },
                  ]
                : [
                    {
                      from: `${year}-01-01`,
                      to: `${year}-12-31`,
                      minutes: annex === 31 ? 2310 : 2340,
                    },
                  ];
            return periods.map((period) => ({
              id: `caritas-ost-${annex}-${territory.toLowerCase().replaceAll("_", "-")}-${period.from}`,
              variantId: `ANLAGE_${annex}`,
              regionId: territory,
              validFrom: period.from,
              validTo: period.to,
              fullTimeWeeklyMinutes: period.minutes,
              sourceIds:
                year === 2026 && annex === 31
                  ? workingTimeSources.map((item) => item.id)
                  : [workingTimeSources[0].id],
            }));
          },
        ),
      ),
      caritasCareAllowanceRates: [31, 32].flatMap((annex) =>
        ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"].flatMap(
          (territory) => [
            {
              id: `caritas-ost-care-3-${annex}-${territory.toLowerCase().replaceAll("_", "-")}-${year}`,
              provisionId: "SECTION_12_3",
              variantId: `ANLAGE_${annex}`,
              regionId: territory,
              validFrom: `${year}-01-01`,
              validTo: `${year}-12-31`,
              monthlyCents: 2500,
              sourceIds: [fixedCare.id],
            },
            ...(year === 2025
              ? [{ from: "2025-07-01", to: "2025-12-31", cents: 13796 }]
              : [
                  { from: "2026-01-01", to: "2026-01-31", cents: 13796 },
                  { from: "2026-02-01", to: "2026-12-31", cents: 14182 },
                ]
            ).map((period) => ({
              id: `caritas-ost-care-${annex}-${territory.toLowerCase().replaceAll("_", "-")}-${period.from}`,
              provisionId: "SECTION_12_4",
              variantId: `ANLAGE_${annex}`,
              regionId: territory,
              validFrom: period.from,
              validTo: period.to,
              monthlyCents: period.cents,
              sourceIds: [federal.id, regionalAllowance.id],
            })),
          ],
        ),
      ),
      caritasShiftAllowanceRates: [31, 32].flatMap((annex) =>
        ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"].map((territory) => ({
          id: `caritas-ost-shift-${annex}-${territory.toLowerCase().replaceAll("_", "-")}-${year}`,
          variantId: `ANLAGE_${annex}`,
          regionId: territory,
          validFrom: year === 2025 ? "2025-07-01" : "2026-01-01",
          validTo: `${year}-12-31`,
          alternatingMonthlyCents: 25000,
          alternatingHourlyCents: annex === 31 ? 149 : 147,
          shiftMonthlyCents: 10000,
          shiftHourlyCents: 59,
          sourceIds: [federal.id, regionalAllowance.id],
        })),
      ),
      caritasTimePremiumPolicy: caritasTimePremiumPolicy(`${year}-01-01`, `${year}-12-31`),
      caritasOvertimePolicy: caritasOvertimePolicy(
        `${year}-01-01`,
        `${year}-12-31`,
        year === 2026 ? caritasAvrText2026 : caritasAvrText2025,
      ),
      caritasAnnualPaymentPolicy: caritasAnnualPaymentPolicy(
        `${year}-01-01`,
        `${year}-12-31`,
        true,
      ),
      premiumRules: [],
      allowanceRules: [],
      combinationRules: [],
      workPatternRules: [],
      // Obligatory but never executed under the unsupported Caritas engine contract.
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
for (const year of [2025, 2026]) {
  const name = `rules/packages/reviewed/avr-caritas-p-ost/${year}-01-draft1.json`;
  const target = new URL(name, root);
  const targetPath = fileURLToPath(target);
  const body = await prettier.format(JSON.stringify(preserveExistingRules(candidate(year))), {
    ...(await prettier.resolveConfig(targetPath)),
    filepath: targetPath,
  });
  if (check) assert.ok(read(name) === body, `${name} differs from its source CSV`);
  else {
    mkdirSync(fileURLToPath(new URL("./", target)), { recursive: true });
    writeFileSync(target, body);
  }
}
console.log(`Caritas Ost candidates ${check ? "checked" : "generated"}: 2`);
