// Run: node --require tsx/cjs scripts/benchmark-annual-report.cjs --compare <base-commit>
// Pure CPU benchmark: no database, React, idle scheduling or device rendering.
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const path = require("node:path");
const assert = require("node:assert/strict");

const compareIndex = process.argv.indexOf("--compare");
if (compareIndex !== -1) {
  const base = process.argv[compareIndex + 1];
  assert.match(base, /^[0-9a-f]{7,40}$/i, "Use a verified commit hash");
  const run = (args) =>
    JSON.parse(
      execFileSync(process.execPath, ["--require", "tsx/cjs", __filename, ...args], {
        encoding: "utf8",
      }),
    );
  const before = run(["--baseline", base]);
  const after = run([]);
  assert.deepEqual(
    after.map(({ key, digest }) => ({ key, digest })),
    before.map(({ key, digest }) => ({ key, digest })),
    "Annual results changed",
  );
  console.log(JSON.stringify({ resultsIdentical: true, before, after }, null, 2));
} else {
  const baselineIndex = process.argv.indexOf("--baseline");
  if (baselineIndex !== -1) {
    // Load only the pre-optimization engine module, without changing checkout files.
    const ref = process.argv[baselineIndex + 1];
    assert.match(ref, /^[0-9a-f]{7,40}$/i);
    const Module = require("node:module");
    const ts = require("typescript");
    const relative = "src/engine/compliance-sunday-holiday-rest.ts";
    const filename = path.resolve(__dirname, "..", relative);
    const source = execFileSync("git", ["show", `${ref}:${relative}`], {
      encoding: "utf8",
      cwd: path.resolve(__dirname, ".."),
    });
    const baseline = new Module(filename, module);
    baseline.filename = filename;
    baseline.paths = Module._nodeModulePaths(path.dirname(filename));
    baseline._compile(
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      filename,
    );
    require.cache[filename] = baseline;
  }
  const { generateTestPlan } = require("../src/engine/test-data-generator");
  const {
    buildAnnualAvailableReportSteps,
  } = require("../src/features/analysis/annual-core-report");
  const { bundledRuleResolver } = require("../src/rules/rule-resolver");
  const profile = {
    federalState: "NW",
    holidayRegion: "NONE",
    weeklyMinutes: 2310,
    timeZone: "Europe/Berlin",
    regularRotatingNightWork: false,
    sundayHolidayWorkEligible: true,
    allEmploymentWorkRecorded: true,
    tariff: {
      payGroup: "P8",
      payLevel: 4,
      sector: "BT_K",
      tariffRegion: "OTHER",
      fullTimeWeeklyMinutes: 2310,
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const all = [2025, 2026, 2027].flatMap(
    (year) =>
      generateTestPlan(
        {
          startMonth: `${year}-01`,
          range: 12,
          scenario: "UI_STRESS",
        },
        "NW",
      ).shifts,
  );
  const results = [];
  for (const limit of [0, 20, Infinity]) {
    const counts = new Map();
    const entries = all
      .filter((s) => {
        const month = s.date.slice(0, 7);
        const count = counts.get(month) || 0;
        counts.set(month, count + 1);
        return count < limit;
      })
      .map((s, i) => ({
        ...s,
        kind: "SHIFT",
        id: `synthetic-${i}`,
        templateId: null,
        note: null,
        startTime: s.startTime ?? null,
        endTime: s.endTime ?? null,
        breakMinutes: s.breakMinutes ?? 0,
        overtimeMinutes: 0,
        holidayPremiumMode: "WITH_TIME_OFF",
        revision: 1,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        deletedAt: null,
      }));
    for (const year of [2026, 2027]) {
      const steps = buildAnnualAvailableReportSteps(
        year,
        entries,
        profile,
        [],
        {
          workplaceCoverage: "UNKNOWN",
          assignment: "UNKNOWN",
          updatedAt: null,
        },
        "2026-09-10",
        bundledRuleResolver,
      );
      let cpuMs = 0,
        maxStepMs = 0,
        calls = 0;
      const stages = {};
      for (;;) {
        const start = performance.now();
        const step = steps.next();
        const elapsed = performance.now() - start;
        cpuMs += elapsed;
        maxStepMs = Math.max(maxStepMs, elapsed);
        calls++;
        const stage = step.done ? "finish" : String(step.value);
        stages[stage] = (stages[stage] || 0) + elapsed;
        if (step.done) {
          results.push({
            key: `${entries.length}/${year}`,
            cpuMs,
            maxStepMs,
            calls,
            stages,
            digest: createHash("sha256").update(JSON.stringify(step.value)).digest("hex"),
          });
          break;
        }
      }
    }
  }
  console.log(JSON.stringify(results));
}
