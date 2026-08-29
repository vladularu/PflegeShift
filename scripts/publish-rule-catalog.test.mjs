import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const publisherPath = path.join(repositoryRoot, "scripts", "publish-rule-catalog.mjs");
const require = createRequire(import.meta.url);
const tsxImport = pathToFileURL(require.resolve("tsx")).href;
const signingKey = Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index)).toString(
  "base64url",
);

async function git(workspace, args) {
  return execFileAsync("git", args, { cwd: workspace, encoding: "utf8" });
}

async function writeJson(workspace, relativePath, value) {
  const target = path.join(workspace, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fixture(fileName) {
  return JSON.parse(
    await fs.readFile(path.join(repositoryRoot, "rules", "examples", fileName), "utf8"),
  );
}

async function runPublisher(workspace, extraArguments = []) {
  return execFileAsync(
    process.execPath,
    [
      "--import",
      tsxImport,
      publisherPath,
      "--request",
      "rules/releases/preview-1.json",
      ...extraArguments,
    ],
    {
      cwd: workspace,
      encoding: "utf8",
      env: { ...process.env, RULE_CATALOG_SIGNING_KEY_BASE64URL: signingKey },
      maxBuffer: 1024 * 1024,
    },
  );
}

test("publisher CLI dry-runs, writes in order, retries idempotently, and protects immutable paths", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "pflegeshift-publisher-"));
  try {
    await git(workspace, ["init"]);
    await git(workspace, ["config", "user.name", "PflegeShift Test"]);
    await git(workspace, ["config", "user.email", "test@pflegeshift.invalid"]);

    const packages = await Promise.all([
      fixture("tariff-package.valid.json"),
      fixture("legal-package.valid.json"),
      fixture("holiday-package.valid.json"),
    ]);
    packages[0].engineContractVersion = 2;
    packages[0].rules.overtimeBaseRule = {
      maximumStepId: "s2",
      sourceIds: ["tvoed-vka-2026"],
    };
    packages[1].engineContractVersion = 6;
    packages[1].rules.workingTime.standardAverage = {
      calendarMonths: 6,
      weeks: 24,
      assessmentMode: "FORWARD_FROM_EXTENDED_WORKDAY",
      neutralAbsenceTypes: ["VACATION", "SICK"],
    };
    packages[1].rules.nightWork.workerQualification = {
      regularRotatingNightWorkRequiresConfirmation: true,
      annualNightWorkDaysThreshold: 48,
    };
    packages[1].rules.sundayHolidayRest = {
      eligibleSectorIds: ["hospital", "care"],
      minimumFreeSundaysPerCalendarYear: 15,
      sundayCompensationPeriodDays: 14,
      weekdayHolidayCompensationPeriodDays: 56,
      replacementDayMinutes: 1440,
      connectedRestMinutes: 660,
      connectionExceptionMode: "TECHNICAL_OR_OPERATIONAL_REVIEW",
      evidenceShiftType: "FREE",
      matchingMode: "ONE_TO_ONE_EARLIEST_DEADLINE",
      sourceIds: ["arbzg-2026"],
    };
    packages[1].rules.restPeriod.deviations[0].compensationWithinCalendarMonths = 1;
    const packagePaths = packages.map(
      (rulePackage) =>
        `rules/packages/reviewed/${rulePackage.packageId}/${rulePackage.versionId}.json`,
    );
    for (const [index, rulePackage] of packages.entries()) {
      rulePackage.status = "DRAFT";
      rulePackage.review = {
        status: "DRAFT",
        reviewedBy: null,
        reviewedAt: null,
        gitCommit: null,
      };
      await writeJson(workspace, packagePaths[index], rulePackage);
    }
    await git(workspace, ["add", "rules/packages/reviewed"]);
    await git(workspace, ["commit", "-m", "test: add reviewed rule content"]);
    const { stdout: reviewCommitOutput } = await git(workspace, ["rev-parse", "HEAD"]);
    const reviewCommit = reviewCommitOutput.trim();

    for (const [index, rulePackage] of packages.entries()) {
      rulePackage.status = "REVIEWED";
      rulePackage.review = {
        status: "REVIEWED",
        reviewedBy: "publisher-integration-test",
        reviewedAt: "2026-08-28T12:00:00Z",
        gitCommit: reviewCommit,
      };
      await writeJson(workspace, packagePaths[index], rulePackage);
    }
    await writeJson(workspace, "rules/releases/preview-1.json", {
      schemaVersion: 1,
      generation: 1,
      channel: "PREVIEW",
      publishedAt: "2026-08-28T13:00:00Z",
      rollbackOfGeneration: null,
      packageSources: packagePaths,
      signing: {
        algorithm: "ED25519",
        canonicalization: "RFC8785",
        keyId: "preview-test-2026",
      },
    });
    await git(workspace, ["add", "rules"]);
    await git(workspace, ["commit", "-m", "test: record publication review"]);

    const dryRun = await runPublisher(workspace, ["--dry-run"]);
    assert.match(dryRun.stdout, /Validated PREVIEW generation 1/);
    assert.match(dryRun.stdout, /Writes: none \(dry-run\)/);
    assert.equal(dryRun.stdout.includes(signingKey), false);
    await assert.rejects(fs.stat(path.join(workspace, "dist")), { code: "ENOENT" });

    const published = await runPublisher(workspace);
    assert.match(published.stdout, /Published PREVIEW generation 1/);
    assert.match(published.stdout, /packages, versioned manifest, current\.json last/);
    const channelRoot = path.join(workspace, "dist", "rule-catalog", "preview");
    const currentJson = await fs.readFile(path.join(channelRoot, "current.json"), "utf8");
    assert.equal(
      currentJson,
      await fs.readFile(path.join(channelRoot, "manifests", "1.json"), "utf8"),
    );
    for (const packagePath of packagePaths) {
      const [, , , packageId, fileName] = packagePath.split("/");
      await fs.access(path.join(channelRoot, "packages", packageId, fileName));
    }

    const retried = await runPublisher(workspace);
    assert.match(retried.stdout, /Result: idempotent retry/);
    assert.equal(retried.stdout.includes(signingKey), false);

    await writeJson(workspace, "rules/releases/preview-1.json", {
      schemaVersion: 1,
      generation: 2,
      channel: "PREVIEW",
      publishedAt: "2026-08-28T14:00:00Z",
      rollbackOfGeneration: null,
      packageSources: packagePaths,
      signing: {
        algorithm: "ED25519",
        canonicalization: "RFC8785",
        keyId: "preview-test-2026",
      },
    });
    await git(workspace, ["add", "rules/releases/preview-1.json"]);
    await git(workspace, ["commit", "-m", "test: advance publication generation"]);
    const advanced = await runPublisher(workspace);
    assert.match(advanced.stdout, /Published PREVIEW generation 2/);
    const advancedCurrent = JSON.parse(
      await fs.readFile(path.join(channelRoot, "current.json"), "utf8"),
    );
    assert.equal(advancedCurrent.generation, 2);
    assert.equal(
      await fs.readFile(path.join(channelRoot, "current.json"), "utf8"),
      await fs.readFile(path.join(channelRoot, "manifests", "2.json"), "utf8"),
    );

    const immutablePackage = path.join(
      channelRoot,
      "packages",
      packages[0].packageId,
      `${packages[0].versionId}.json`,
    );
    await fs.appendFile(immutablePackage, " ", "utf8");
    await assert.rejects(runPublisher(workspace), (error) => {
      assert.match(error.stderr, /Immutable publication artifact conflict/);
      assert.equal(error.stderr.includes(signingKey), false);
      return true;
    });
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
