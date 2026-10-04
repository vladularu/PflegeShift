import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { validateRulePackage } from "../src/rules/validation.ts";

const DAY_MS = 86_400_000;

function ordinal(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date))
    throw new Error(`Invalid ISO date: ${String(date)}`);
  const value = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date)
    throw new Error(`Invalid ISO date: ${date}`);
  return Math.floor(value / DAY_MS);
}

function dateFromOrdinal(value) {
  return new Date(value * DAY_MS).toISOString().slice(0, 10);
}

async function jsonFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return jsonFiles(target);
      return entry.isFile() && entry.name.endsWith(".json") ? [target] : [];
    }),
  );
  return nested.flat().sort();
}

async function loadTariffPackagesFrom(workspaceRoot, directory) {
  const root = path.join(workspaceRoot, "rules", "packages", directory);
  const files = await jsonFiles(root);
  const packages = [];
  for (const file of files) {
    const relativePath = path.relative(workspaceRoot, file).split(path.sep).join("/");
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    const validation = validateRulePackage(parsed);
    if (!validation.ok)
      throw new Error(
        `${relativePath}: ${validation.issues.map((issue) => issue.code).join(", ")}`,
      );
    const pkg = validation.value;
    if (directory === "reviewed") {
      const expected = `rules/packages/reviewed/${pkg.packageId}/${pkg.versionId}.json`;
      if (relativePath !== expected) throw new Error(`${relativePath}: expected ${expected}`);
    } else if (pkg.status !== "LEGACY_EMBEDDED") {
      throw new Error(`${relativePath}: legacy packages must remain LEGACY_EMBEDDED`);
    }
    if (pkg.kind === "TARIFF") packages.push({ pkg, relativePath });
  }
  return packages;
}

/** Read every local tariff package; invalid rows never disappear silently. */
export async function loadTariffPackages(workspaceRoot) {
  const [legacy, reviewed] = await Promise.all([
    loadTariffPackagesFrom(workspaceRoot, "legacy"),
    loadTariffPackagesFrom(workspaceRoot, "reviewed"),
  ]);
  return [...legacy, ...reviewed];
}

/** A scheduling report, not a legal determination that a document is still current. */
export function buildTariffInventory(packages, asOf, leadDays = 90) {
  const today = ordinal(asOf);
  if (!Number.isSafeInteger(leadDays) || leadDays < 1 || leadDays > 365)
    throw new Error("leadDays must be between 1 and 365.");
  const rows = packages.map(({ pkg, relativePath }) => {
    const from = ordinal(pkg.validFrom);
    const to = pkg.validTo === null ? null : ordinal(pkg.validTo);
    const daysUntilEnd = to === null ? null : to - today;
    const reviewDue = to === null ? null : dateFromOrdinal(to - leadDays);
    const validity =
      to !== null && today > to
        ? "EXPIRED"
        : today < from
          ? "FUTURE"
          : to === null
            ? "OPEN_ENDED"
            : daysUntilEnd <= leadDays
              ? "EXPIRING"
              : "CURRENT";
    return {
      packageId: pkg.packageId,
      versionId: pkg.versionId,
      familyId: pkg.rules.selection?.familyId ?? null,
      engineContractVersion: pkg.engineContractVersion,
      status: pkg.status,
      reviewStatus: pkg.review.status,
      validFrom: pkg.validFrom,
      validTo: pkg.validTo,
      validity,
      daysUntilEnd,
      reviewDue,
      reviewDueNow: reviewDue === null || asOf >= reviewDue,
      relativePath,
      sources: pkg.sources.map(({ id, title, url, documentDate, section, sha256 }) => ({
        id,
        title,
        url,
        documentDate,
        section,
        sha256,
      })),
    };
  });
  rows.sort(
    (left, right) =>
      left.packageId.localeCompare(right.packageId) ||
      left.validFrom.localeCompare(right.validFrom) ||
      left.versionId.localeCompare(right.versionId),
  );
  return { asOf, leadDays, rows };
}

function cell(value) {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

export function renderTariffInventoryMarkdown(report) {
  const lines = [
    `# Tarif- und Quelleninventar (${report.asOf})`,
    "",
    `Prüffrist: ${report.leadDays} Tage vor dem deklarierten Gültigkeitsende. DRAFT ist keine veröffentlichte Tarifunterstützung; ein offenes Enddatum ist keine Aktualitätsgarantie.`,
    "",
    "| Paket | Version | Vertrag | Status | Gültigkeit | Gültig bis | Prüfen ab | Datei |",
    "| --- | --- | ---: | --- | --- | --- | --- | --- |",
  ];
  for (const row of report.rows)
    lines.push(
      `| ${cell(row.packageId)} | ${cell(row.versionId)} | ${row.engineContractVersion} | ${cell(row.status)} / ${cell(row.reviewStatus)} | ${row.validity} | ${cell(row.validTo)} | ${cell(row.reviewDue)} | ${cell(row.relativePath)} |`,
    );
  lines.push(
    "",
    "| Paket / Version | Quellen-ID | Dokumentdatum | Fundstelle | SHA-256 | Quelle |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const row of report.rows)
    for (const source of row.sources)
      lines.push(
        `| ${cell(row.packageId)} / ${cell(row.versionId)} | ${cell(source.id)} | ${cell(source.documentDate)} | ${cell(source.section)} | ${cell(source.sha256)} | [${cell(source.title)}](${source.url}) |`,
      );
  return `${lines.join("\n")}\n`;
}

function parseArguments(args) {
  let asOf = new Date().toISOString().slice(0, 10);
  let format = "markdown";
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--as-of" && args[index + 1]) asOf = args[++index];
    else if (args[index] === "--format" && ["json", "markdown"].includes(args[index + 1]))
      format = args[++index];
    else throw new Error("Usage: rules:inventory [--as-of YYYY-MM-DD] [--format markdown|json]");
  }
  ordinal(asOf);
  return { asOf, format };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { asOf, format } = parseArguments(process.argv.slice(2));
    const packages = await loadTariffPackages(process.cwd());
    const report = buildTariffInventory(packages, asOf);
    process.stdout.write(
      format === "json"
        ? `${JSON.stringify(report, null, 2)}\n`
        : renderTariffInventoryMarkdown(report),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
