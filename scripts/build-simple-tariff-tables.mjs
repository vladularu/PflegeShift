import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Inputs are immutable Git content from the accepted simple tariff implementation.
const sourceCommit = process.argv[2] ?? "22aebac2b20d8dc6bde471f59e0827adea30541c";
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error("Exact source commit required");
const text = (path) =>
  execFileSync("git", ["show", `${sourceCommit}:${path}`], { encoding: "utf8" });
const json = (path) => JSON.parse(text(path));
const sources = new Map();
const tables = [];
const layout = {};
const add = (tariffId, validFrom, validTo, sourceIds, entries) => {
  entries.sort((a, b) => a.groupId.localeCompare(b.groupId) || a.stepId.localeCompare(b.stepId));
  const keys = entries.map((e) => `${e.groupId}:${e.stepId}`);
  if (layout[tariffId] && JSON.stringify(layout[tariffId]) !== JSON.stringify(keys))
    throw new Error(`Different row layout in ${tariffId}`);
  layout[tariffId] = keys;
  tables.push({ tariffId, validFrom, validTo, sourceIds, entries });
};
const packagePeriods = {
  TVOED_VKA_E: ["tvoed-vka-anlage-a/2025-04-01-draft1", "tvoed-vka-anlage-a/2026-05-01-draft1"],
  TVAOED_PFLEGE: ["tvaoed-pflege-vka/2025-04-r1", "tvaoed-pflege-vka/2026-05-r1"],
  TVL_KR: ["tvl-kr-tdl/2025-11", "tvl-kr-tdl/2026-04", "tvl-kr-tdl/2027-03", "tvl-kr-tdl/2028-01"],
  TVAL_PFLEGE: [
    "tval-pflege-tdl/2025-11",
    "tval-pflege-tdl/2026-04",
    "tval-pflege-tdl/2027-01",
    "tval-pflege-tdl/2027-03",
    "tval-pflege-tdl/2028-01",
  ],
};
for (const [tariffId, paths] of Object.entries(packagePeriods)) {
  for (const path of paths) {
    const p = json(`rules/packages/reviewed/${path}.json`);
    const prefix = tariffId.toLowerCase().replaceAll("_", "-");
    for (const s of p.sources) sources.set(`${prefix}-${s.id}`, { ...s, id: `${prefix}-${s.id}` });
    const selected = p.rules.payTables.filter((t) => t.id === p.rules.selector.payTableId);
    if (selected.length !== 1) throw new Error(`Ambiguous source table ${path}`);
    const entries = selected[0].entries.filter(
      (e) =>
        (tariffId !== "TVAOED_PFLEGE" || e.groupId === "b") &&
        (tariffId !== "TVAL_PFLEGE" || e.groupId === "regular"),
    );
    add(
      tariffId,
      p.validFrom,
      p.validTo,
      selected[0].sourceIds.map((id) => `${prefix}-${id}`),
      entries,
    );
  }
}
const docSources = (doc) => {
  const result = [];
  const matches = [...doc.matchAll(/https:\/\/[^\s`]+/g)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const after = doc.slice(m.index + m[0].length, matches[i + 1]?.index ?? doc.length);
    const sha256 = after.match(/[a-f0-9]{64}/)?.[0];
    if (sha256) result.push({ url: m[0].replace(/[.,]$/, ""), sha256 });
  }
  return result;
};
const tvhDocs = docSources(text("docs/einfache-tvh-pflege.md"));
for (const t of json("src/engine/simple-tvh-kr-tables.json")) {
  const needle = {
    "kr-2025.pdf": "ab_1-august_2025.pdf",
    "kr-2026.pdf": "ab_1-juli_2026.pdf",
    "kr-2027.pdf": "ab_1-oktober_2027.pdf",
  }[t.source];
  const source = tvhDocs.find((s) => s.url.endsWith(needle));
  if (!source) throw new Error(`Missing official TV-H source ${t.source}`);
  const id = `tvh-kr-${t.validFrom}`;
  sources.set(id, {
    id,
    title: "Land Hessen: Entgelttabelle Pflege",
    ...source,
    documentDate: t.validFrom,
    section: `Monatstabelle, Tabellenstand ${t.validFrom}, PDF-Seite 1`,
  });
  const entries = Object.entries(t.monthlyCents).flatMap(([groupId, row]) => {
    const steps =
      groupId === "KR5" || groupId === "KR6"
        ? ["1a", "1b", "2", "3", "4", "5", "6"]
        : ["2", "3", "4", "5", "6"];
    if (steps.length !== row.length) throw new Error("TV-H layout mismatch");
    return row.map((monthlyCents, i) => ({ groupId, stepId: steps[i], monthlyCents }));
  });
  add("TVH_KR", t.validFrom, t.validTo, [id], entries);
}
const tvukDocs = docSources(text("docs/einfache-tvuk-pflege.md"));
for (const t of json("src/engine/simple-tvuk-nursing-tables.json")) {
  const source = tvukDocs.find((s) => s.url === t.sourceUrl);
  if (!source) throw new Error("Missing official TV-UK source");
  const id = `tvuk-puk-${t.validFrom}`;
  sources.set(id, {
    id,
    title: "AGU Baden-Wuerttemberg: Entgelttabelle Pflege",
    ...source,
    documentDate: t.validFrom,
    section: `Anlage B, Tabellenstand ${t.validFrom}, PDF-Seite ${t.sourcePage}`,
  });
  const entries = Object.entries(t.groups).flatMap(([groupId, row]) =>
    Object.entries(row).map(([stepId, monthlyCents]) => ({ groupId, stepId, monthlyCents })),
  );
  add("TVUK_PUK", t.validFrom, t.validTo, [id], entries);
}
const pkg = json("rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json");
pkg.versionId = "2026-05-r4";
pkg.engineContractVersion = 19;
pkg.status = "DRAFT";
pkg.review = { status: "DRAFT", reviewedBy: null, reviewedAt: null, gitCommit: null };
pkg.sources.push(...sources.values());
pkg.rules.simpleTariffTables = { contractVersion: 1, sourceCommit, tables };
const output = "rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r4.json";
writeFileSync(output, JSON.stringify(pkg, null, 2) + "\n");
writeFileSync("src/rules/simple-tariff-table-layout.json", JSON.stringify(layout, null, 2) + "\n");
console.log(
  JSON.stringify({
    sourceCommit,
    output,
    tariffCount: Object.keys(layout).length,
    periodCount: tables.length,
    values: tables.reduce((sum, t) => sum + t.entries.length, 0),
    contentSha256: createHash("sha256")
      .update(JSON.stringify(pkg.rules.simpleTariffTables))
      .digest("hex"),
  }),
);
