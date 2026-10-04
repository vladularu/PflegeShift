import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildTariffInventory,
  loadTariffPackages,
  renderTariffInventoryMarkdown,
} from "./report-tariff-inventory.mjs";

function candidate(validFrom, validTo, status = "DRAFT") {
  return {
    relativePath: "rules/packages/reviewed/example/2026.json",
    pkg: {
      packageId: "example",
      versionId: "2026",
      engineContractVersion: 11,
      status,
      review: { status },
      validFrom,
      validTo,
      rules: { selection: { familyId: "example-family" } },
      sources: [
        {
          id: "source-1",
          title: "Official source",
          url: "https://example.org/source.pdf",
          documentDate: "2026-01-01",
          section: "§ 1 | page 2",
          sha256: "a".repeat(64),
        },
      ],
    },
  };
}

test("inventory derives a 90-day review date without treating DRAFT as released", () => {
  const report = buildTariffInventory([candidate("2026-05-01", "2027-03-31")], "2026-09-23");
  const [row] = report.rows;
  assert.equal(row.validity, "CURRENT");
  assert.equal(row.reviewDue, "2026-12-31");
  assert.equal(row.reviewDueNow, false);
  assert.equal(row.status, "DRAFT");
  assert.equal(row.reviewStatus, "DRAFT");
  assert.equal(row.sources[0].sha256, "a".repeat(64));
});

test("inventory distinguishes upcoming, expiring, expired and open-ended candidates", () => {
  assert.equal(
    buildTariffInventory([candidate("2027-01-01", "2027-12-31")], "2026-09-23").rows[0].validity,
    "FUTURE",
  );
  assert.equal(
    buildTariffInventory([candidate("2026-01-01", "2026-10-01")], "2026-09-23").rows[0].validity,
    "EXPIRING",
  );
  assert.equal(
    buildTariffInventory([candidate("2025-01-01", "2026-09-22")], "2026-09-23").rows[0].validity,
    "EXPIRED",
  );
  const open = buildTariffInventory([candidate("2026-01-01", null)], "2026-09-23").rows[0];
  assert.equal(open.validity, "OPEN_ENDED");
  assert.equal(open.reviewDue, null);
  assert.equal(open.reviewDueNow, true);
});

test("inventory rejects invalid dates and lead times instead of reporting false freshness", () => {
  assert.throws(() => buildTariffInventory([], "2026-02-30"), /Invalid ISO date/u);
  assert.throws(() => buildTariffInventory([], "2026-09-23", 0), /leadDays/u);
});

test("Markdown includes package status, review date, complete source hash and URL", () => {
  const markdown = renderTariffInventoryMarkdown(
    buildTariffInventory([candidate("2026-05-01", "2027-03-31")], "2026-09-23"),
  );
  assert.match(markdown, /DRAFT \/ DRAFT \| CURRENT/u);
  assert.match(markdown, /2026-12-31/u);
  assert.match(markdown, /§ 1 \\\| page 2/u);
  assert.match(markdown, /a{64}/u);
  assert.match(markdown, /https:\/\/example\.org\/source\.pdf/u);
});

test("real inventory includes legacy tariffs and all six Caritas regions without omitting invalid packages", async () => {
  const workspaceRoot = path.resolve(import.meta.dirname, "..");
  const packages = await loadTariffPackages(workspaceRoot);
  const report = buildTariffInventory(packages, "2026-09-23");
  const regions = new Set(
    report.rows
      .map((row) => row.packageId)
      .filter((packageId) => packageId.startsWith("avr-caritas-p-")),
  );
  assert.deepEqual(
    regions,
    new Set([
      "avr-caritas-p-bw",
      "avr-caritas-p-bayern",
      "avr-caritas-p-mitte",
      "avr-caritas-p-nord",
      "avr-caritas-p-nrw",
      "avr-caritas-p-ost",
    ]),
  );
  assert.ok(report.rows.every((row) => row.sources.length > 0));
  assert.ok(report.rows.some((row) => row.packageId === "tvoed-vka-bt-k"));
  assert.ok(report.rows.some((row) => row.status === "LEGACY_EMBEDDED"));
  const drk = report.rows.filter((row) => row.packageId.startsWith("drk-rtv-"));
  assert.equal(drk.length, 13);
  for (const [packageId, dates] of [
    ["drk-rtv-e", ["2024-06-01", "2025-09-01", "2026-10-01", "2027-10-01"]],
    ["drk-rtv-p", ["2024-06-01", "2025-09-01", "2026-10-01"]],
    ["drk-rtv-s", ["2024-10-01", "2025-09-01", "2026-10-01"]],
    ["drk-rtv-training", ["2024-06-01", "2025-09-01", "2026-10-01"]],
  ]) {
    assert.deepEqual(
      new Set(drk.filter((row) => row.packageId === packageId).map((row) => row.validFrom)),
      new Set(dates),
    );
  }
  assert.ok(drk.every((row) => row.status === "DRAFT"));
  assert.ok(
    drk.every((row) =>
      row.sources.some(
        (source) =>
          source.sha256 === "97c25f8030b40897c10d828a92382655847212d5f924ce0132073034a13b19d8",
      ),
    ),
  );
});
