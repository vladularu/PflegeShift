import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { preflightProductionRuleCatalogConfig } from "./production-rule-catalog-preflight.mjs";
import {
  parseProductionProvisioningCommand,
  preflightProductionProvisioningPlan,
  runProductionProvisioningOperator,
} from "./production-rule-catalog-provisioning-operator.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const contractPath = path.join(repositoryRoot, "rules", "config", "production-channel.json");
const operatorPath = path.join(
  repositoryRoot,
  "scripts",
  "production-rule-catalog-provisioning-operator.mjs",
);
const require = createRequire(import.meta.url);
const tsxImport = pathToFileURL(require.resolve("tsx")).href;

async function committedConfig() {
  return JSON.parse(await fs.readFile(contractPath, "utf8"));
}

function preCandidateConfig(config) {
  const result = structuredClone(config);
  result.status = "DISABLED";
  result.infrastructure.supabaseProjectUrl = null;
  result.trust.trustedPublicKeys = [];
  result.remote.publicBaseUrl = null;
  return result;
}

test("operator accepts only the three write-disabled commands", () => {
  assert.equal(parseProductionProvisioningCommand(["preflight"]), "PREFLIGHT");
  assert.equal(parseProductionProvisioningCommand(["plan"]), "PLAN");
  assert.equal(parseProductionProvisioningCommand(["checklist"]), "CHECKLIST");

  for (const argumentsValue of [
    [],
    ["apply"],
    ["create-project"],
    ["create-bucket"],
    ["plan", "checklist"],
  ]) {
    assert.throws(
      () => parseProductionProvisioningCommand(argumentsValue),
      (error) => error.code === "INVALID_COMMAND",
    );
  }
});

test("committed Candidate is ready for approval and closed to provisioning planning", async () => {
  const config = await committedConfig();

  assert.deepEqual(
    preflightProductionProvisioningPlan(config).issues.map(({ code }) => code),
    [
      "PRODUCTION_NOT_DISABLED",
      "PROJECT_ALREADY_CONFIGURED",
      "REMOTE_ALREADY_CONFIGURED",
      "TRUST_ALREADY_CONFIGURED",
    ],
  );
  assert.equal(preflightProductionRuleCatalogConfig(config).status, "READY_FOR_APPROVAL");
});

test("plan is derived from the authoritative contract and exposes no write capability", async () => {
  const config = preCandidateConfig(await committedConfig());
  const result = runProductionProvisioningOperator({ command: "PLAN", config });

  assert.deepEqual(result, {
    schemaVersion: 1,
    command: "PLAN",
    status: "PLAN_READY",
    mode: "WRITE_DISABLED",
    plannedResources: {
      project: {
        provider: "SUPABASE",
        isolationMode: "DEDICATED_SUPABASE_PROJECT",
        region: "eu-central-1",
        projectUrl: null,
      },
      bucket: {
        name: "rule-catalog-production",
        publicRead: true,
        administrativeWriteOnly: true,
        allowedMimeTypes: ["application/json"],
        maximumObjectBytes: 524_288,
      },
      objectRoot: "production",
    },
    futureSecretInput: {
      environmentName: "SUPABASE_PRODUCTION_SECRET_KEY",
      valueRead: false,
    },
    capabilities: {
      localRead: true,
      localWrite: false,
      secretRead: false,
      networkAccess: false,
      projectCreation: false,
      bucketCreation: false,
      signing: false,
      delivery: false,
      activation: false,
    },
    nextApprovalBoundary: "PRODUCTION_INFRASTRUCTURE_PROVISIONING",
  });
});

test("checklist distinguishes local proof from every future remote acceptance item", async () => {
  const config = preCandidateConfig(await committedConfig());
  const result = runProductionProvisioningOperator({ command: "CHECKLIST", config });

  assert.equal(result.status, "NOT_STARTED");
  assert.deepEqual(
    result.items.map(({ id, status }) => ({ id, status })),
    [
      { id: "local-plan-preflight", status: "PASS" },
      { id: "production-delivery-disabled", status: "PASS" },
      { id: "explicit-production-write-approval", status: "PENDING" },
      { id: "dedicated-project-created", status: "NOT_STARTED" },
      { id: "project-region-verified", status: "NOT_STARTED" },
      { id: "preview-project-isolation-verified", status: "NOT_STARTED" },
      { id: "production-bucket-created", status: "NOT_STARTED" },
      { id: "bucket-policy-verified", status: "NOT_STARTED" },
      { id: "production-object-root-empty", status: "NOT_STARTED" },
      { id: "public-read-negative-check", status: "NOT_STARTED" },
      { id: "production-config-candidate-reviewed", status: "NOT_STARTED" },
    ],
  );
  assert.equal(
    result.items.every(({ requiredEvidence }) => requiredEvidence.length > 0),
    true,
  );
  assert.equal(JSON.stringify(result).includes("reviewerName"), false);
  assert.equal(JSON.stringify(result).includes("reviewerRole"), false);
});

test("operator blocks once live Production values or trust appear", async () => {
  const config = await committedConfig();

  assert.deepEqual(
    preflightProductionProvisioningPlan(config).issues.map(({ code }) => code),
    [
      "PRODUCTION_NOT_DISABLED",
      "PROJECT_ALREADY_CONFIGURED",
      "REMOTE_ALREADY_CONFIGURED",
      "TRUST_ALREADY_CONFIGURED",
    ],
  );
  assert.throws(
    () => runProductionProvisioningOperator({ command: "PLAN", config }),
    (error) => error.code === "PLAN_BLOCKED",
  );
});

test("CLI fails closed for the committed Candidate and never reads a supplied secret", async () => {
  const sentinelSecret = "sb_secret_must_not_be_read_or_printed";
  await assert.rejects(
    execFileAsync(process.execPath, ["--import", tsxImport, operatorPath, "plan"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_PRODUCTION_SECRET_KEY: sentinelSecret,
      },
    }),
    (error) => {
      assert.match(error.stderr, /PLAN_BLOCKED/u);
      assert.equal(error.stdout.includes(sentinelSecret), false);
      assert.equal(error.stderr.includes(sentinelSecret), false);
      return true;
    },
  );
});

test("CLI rejects mutating commands and source contains no remote or write primitive", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["--import", tsxImport, operatorPath, "apply"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }),
    (error) => {
      assert.match(error.stderr, /INVALID_COMMAND/);
      assert.equal(error.stdout, "");
      return true;
    },
  );

  const source = await fs.readFile(operatorPath, "utf8");
  assert.match(source, /import \{ readFile \} from "node:fs\/promises";/);
  for (const forbiddenPrimitive of [
    "fetch(",
    "process.env",
    "node:http",
    "node:https",
    "node:net",
    "node:tls",
    "fs.",
    "writeFile",
    "appendFile",
    "execFile",
    "spawn(",
  ]) {
    assert.equal(source.includes(forbiddenPrimitive), false, forbiddenPrimitive);
  }
});
