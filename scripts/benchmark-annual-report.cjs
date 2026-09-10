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
  const before = run(["--cold", "--baseline", base]);
  const after = run(["--cold"]);
  assert.deepEqual(
    after.map(({ key, digest }) => ({ key, digest })),
    before.map(({ key, digest }) => ({ key, digest })),
    "Annual results changed",
  );
  console.log(JSON.stringify({ resultsIdentical: true, before, after }, null, 2));
} else if (process.argv.includes("--cold")) {
  // Each sample starts a fresh process: no inherited date, interval or report cache.
  const baselineIndex = process.argv.indexOf("--baseline");
  const baselineArgs = baselineIndex === -1 ? [] : ["--baseline", process.argv[baselineIndex + 1]];
  const samples = ["0", "20", "all", "sparse"].flatMap((limit) =>
    [2026, 2027].flatMap((year) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ["--require", "tsx/cjs", __filename, "--case", `${limit}/${year}`, ...baselineArgs],
          { encoding: "utf8" },
        ),
      ),
    ),
  );
  console.log(JSON.stringify(samples, null, 2));
} else {
  const baselineIndex = process.argv.indexOf("--baseline");
  if (baselineIndex !== -1) {
    // Load the changed pre-optimization engine modules, without changing checkout files.
    const ref = process.argv[baselineIndex + 1];
    assert.match(ref, /^[0-9a-f]{7,40}$/i);
    const Module = require("node:module");
    const ts = require("typescript");
    for (const relative of [
      "src/engine/compliance-sunday-holiday-rest.ts",
      "src/engine/compliance-night-work.ts",
      "src/features/analysis/annual-core-report.ts",
    ]) {
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
  }
  const { generateTestPlan } = require("../src/engine/test-data-generator");
  const {
    buildAnnualAvailableReportSteps,
    createAnnualAvailableReportCache,
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
  for (const limit of [0, 20, Infinity, "sparse"]) {
    const counts = new Map();
    const entries = all
      .filter((s) => {
        const month = s.date.slice(0, 7);
        if (
          limit === "sparse" &&
          !(
            (month >= "2026-01" && month <= "2026-05") ||
            (month >= "2027-01" && month <= "2027-02")
          )
        )
          return false;
        const count = counts.get(month) || 0;
        counts.set(month, count + 1);
        return count < (limit === "sparse" ? 20 : limit);
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
      const caseIndex = process.argv.indexOf("--case");
      if (
        caseIndex !== -1 &&
        process.argv[caseIndex + 1] !== `${limit === Infinity ? "all" : limit}/${year}`
      )
        continue;
      const editBenchmark = process.argv.includes("--edit");
      const cache = editBenchmark ? createAnnualAvailableReportCache() : undefined;
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
        { cache },
      );
      let cpuMs = 0,
        maxStepMs = 0,
        calls = 0,
        coreReadyMs = null;
      const stages = {};
      for (;;) {
        const start = performance.now();
        const step = steps.next();
        const elapsed = performance.now() - start;
        cpuMs += elapsed;
        maxStepMs = Math.max(maxStepMs, elapsed);
        calls++;
        if (!step.done && step.value === 0) coreReadyMs = cpuMs;
        const stage = step.done ? "finish" : String(step.value);
        stages[stage] = (stages[stage] || 0) + elapsed;
        if (step.done) {
          results.push({
            key: `${entries.length}/${year}`,
            cpuMs,
            maxStepMs,
            calls,
            coreReadyMs,
            stages,
            digest: createHash("sha256")
              .update(
                JSON.stringify(step.value, (_key, value) =>
                  value instanceof Map ? [...value] : value,
                ),
              )
              .digest("hex"),
          });
          break;
        }
      }
      if (editBenchmark && entries.length > 0) {
        const updated = [
          ...entries,
          {
            ...entries[0],
            id: "added-shift",
            date: `${year}-${year === 2026 ? "06" : "03"}-15`,
          },
        ];
        const calculate = (reuse) => {
          const iterator = buildAnnualAvailableReportSteps(
            year,
            updated,
            profile,
            [],
            { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
            "2026-09-10",
            bundledRuleResolver,
            reuse ? { cache } : {},
          );
          const started = performance.now();
          let coreReadyMs = null;
          for (;;) {
            const step = iterator.next();
            if (step.done)
              return { report: step.value, cpuMs: performance.now() - started, coreReadyMs };
            if (step.value === 0) coreReadyMs = performance.now() - started;
          }
        };
        const incrementalSamples = [];
        const completeSamples = [];
        for (let sample = 0; sample < 5; sample++) {
          // Restore pre-edit inputs so each incremental sample must process the edit.
          const prime = buildAnnualAvailableReportSteps(
            year,
            entries,
            profile,
            [],
            { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
            "2026-09-10",
            bundledRuleResolver,
            { cache },
          );
          while (!prime.next().done) {
            /* prepare only; not measured */
          }
          // Alternate order to avoid rewarding the second run's warmer engine caches.
          const first = calculate(sample % 2 === 0);
          const second = calculate(sample % 2 !== 0);
          const incremental = sample % 2 === 0 ? first : second;
          const complete = sample % 2 === 0 ? second : first;
          assert.deepEqual(incremental.report, complete.report, "Changed-year results differ");
          incrementalSamples.push(incremental);
          completeSamples.push(complete);
        }
        const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
        results.push({
          key: `${entries.length}/${year}/added-shift`,
          cpuMs: median(incrementalSamples.map((item) => item.cpuMs)),
          fullRecalculationMs: median(completeSamples.map((item) => item.cpuMs)),
          coreReadyMs: median(incrementalSamples.map((item) => item.coreReadyMs)),
          samples: 5,
          resultsIdentical: true,
        });
      }
    }
  }
  console.log(JSON.stringify(results));
}
