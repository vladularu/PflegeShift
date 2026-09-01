import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateProductionRuleCatalogChannelConfigSchema } from "../src/rules/schema-validators.generated.js";
import { ruleCatalogDeliveryChannel } from "./rule-catalog-delivery-channels.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const productionContractPath = path.join(
  repositoryRoot,
  "rules",
  "config",
  "production-channel.json",
);

const capabilities = Object.freeze({
  localRead: true,
  localWrite: false,
  secretRead: false,
  networkAccess: false,
  projectCreation: false,
  bucketCreation: false,
  signing: false,
  delivery: false,
  activation: false,
});

const supportedCommands = Object.freeze(
  new Map([
    ["preflight", "PREFLIGHT"],
    ["plan", "PLAN"],
    ["checklist", "CHECKLIST"],
  ]),
);

export class ProductionProvisioningOperatorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProductionProvisioningOperatorError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProductionProvisioningOperatorError(code, message);
}

function issue(code, pathValue, message) {
  return Object.freeze({ code, path: pathValue, message });
}

function result(status, issues) {
  return Object.freeze({ status, issues: Object.freeze(issues) });
}

function schemaIssues() {
  const errors = validateProductionRuleCatalogChannelConfigSchema.errors ?? [];
  return errors.map((error) =>
    issue(
      "SCHEMA_INVALID",
      error.instancePath || "/",
      `Production channel contract violates ${error.keyword}.`,
    ),
  );
}

export function parseProductionProvisioningCommand(argumentsValue) {
  if (!Array.isArray(argumentsValue) || argumentsValue.length !== 1) {
    fail(
      "INVALID_COMMAND",
      "Expected exactly one write-disabled command: preflight, plan, or checklist.",
    );
  }
  const command = supportedCommands.get(argumentsValue[0]);
  if (command === undefined) {
    fail(
      "INVALID_COMMAND",
      "Only preflight, plan, and checklist are supported; remote mutations are unavailable.",
    );
  }
  return command;
}

export function preflightProductionProvisioningPlan(config) {
  if (!validateProductionRuleCatalogChannelConfigSchema(config)) {
    return result("BLOCKED", schemaIssues());
  }

  const issues = [];
  const deliveryChannel = ruleCatalogDeliveryChannel("PRODUCTION");
  if (deliveryChannel === null) {
    issues.push(
      issue(
        "DELIVERY_CHANNEL_MISSING",
        "/channel",
        "The Production delivery channel contract is missing.",
      ),
    );
  } else if (deliveryChannel.remote !== null) {
    issues.push(
      issue(
        "DELIVERY_REMOTE_ALREADY_ENABLED",
        "/channel",
        "Production delivery must stay disabled while infrastructure provisioning is only planned.",
      ),
    );
  }

  if (config.status !== "DISABLED") {
    issues.push(
      issue(
        "PRODUCTION_NOT_DISABLED",
        "/status",
        "The provisioning-plan operator requires the committed Production channel to stay disabled.",
      ),
    );
  }
  if (config.infrastructure.supabaseProjectUrl !== null) {
    issues.push(
      issue(
        "PROJECT_ALREADY_CONFIGURED",
        "/infrastructure/supabaseProjectUrl",
        "A live Production project URL is outside this planning-only work package.",
      ),
    );
  }
  if (config.remote.publicBaseUrl !== null) {
    issues.push(
      issue(
        "REMOTE_ALREADY_CONFIGURED",
        "/remote/publicBaseUrl",
        "A live Production catalog URL is outside this planning-only work package.",
      ),
    );
  }
  if (config.trust.trustedPublicKeys.length !== 0) {
    issues.push(
      issue(
        "TRUST_ALREADY_CONFIGURED",
        "/trust/trustedPublicKeys",
        "Production signing trust is outside this infrastructure planning work package.",
      ),
    );
  }

  return issues.length === 0 ? result("PLAN_READY", []) : result("BLOCKED", issues);
}

function assertPlanReady(config) {
  const preflight = preflightProductionProvisioningPlan(config);
  if (preflight.status !== "PLAN_READY") {
    fail(
      "PLAN_BLOCKED",
      `Production provisioning plan is blocked: ${preflight.issues
        .map(({ code }) => code)
        .join(", ")}.`,
    );
  }
  return preflight;
}

function plan(config) {
  return Object.freeze({
    schemaVersion: 1,
    command: "PLAN",
    status: "PLAN_READY",
    mode: "WRITE_DISABLED",
    plannedResources: Object.freeze({
      project: Object.freeze({
        provider: "SUPABASE",
        isolationMode: config.infrastructure.isolationMode,
        region: config.infrastructure.region,
        projectUrl: null,
      }),
      bucket: Object.freeze({
        name: config.infrastructure.bucketName,
        publicRead: config.infrastructure.storagePolicy.publicRead,
        administrativeWriteOnly: config.infrastructure.storagePolicy.administrativeWriteOnly,
        allowedMimeTypes: Object.freeze([...config.infrastructure.storagePolicy.allowedMimeTypes]),
        maximumObjectBytes: config.infrastructure.storagePolicy.maximumObjectBytes,
      }),
      objectRoot: config.infrastructure.objectRoot,
    }),
    futureSecretInput: Object.freeze({
      environmentName: config.infrastructure.deliverySecretEnvironmentName,
      valueRead: false,
    }),
    capabilities,
    nextApprovalBoundary: "PRODUCTION_INFRASTRUCTURE_PROVISIONING",
  });
}

function checklistItem(id, status, requiredEvidence) {
  return Object.freeze({ id, status, requiredEvidence });
}

function checklist() {
  return Object.freeze({
    schemaVersion: 1,
    command: "CHECKLIST",
    status: "NOT_STARTED",
    mode: "WRITE_DISABLED",
    items: Object.freeze([
      checklistItem(
        "local-plan-preflight",
        "PASS",
        "The committed disabled contract passes the local provisioning-plan preflight.",
      ),
      checklistItem(
        "production-delivery-disabled",
        "PASS",
        "The Production delivery channel still has no remote profile.",
      ),
      checklistItem(
        "explicit-production-write-approval",
        "PENDING",
        "A separate approval limited to the Production project and bucket provisioning.",
      ),
      checklistItem(
        "dedicated-project-created",
        "NOT_STARTED",
        "The new Production Supabase project reference and public project URL.",
      ),
      checklistItem(
        "project-region-verified",
        "NOT_STARTED",
        "Read-only evidence that the project region is eu-central-1.",
      ),
      checklistItem(
        "preview-project-isolation-verified",
        "NOT_STARTED",
        "Read-only evidence that the Production and Preview project origins differ.",
      ),
      checklistItem(
        "production-bucket-created",
        "NOT_STARTED",
        "Read-only evidence that rule-catalog-production exists only in the Production project.",
      ),
      checklistItem(
        "bucket-policy-verified",
        "NOT_STARTED",
        "Read-only bucket metadata proving public read, administrative write, JSON-only, and 524288-byte limit.",
      ),
      checklistItem(
        "production-object-root-empty",
        "NOT_STARTED",
        "An empty listing for the production object root before catalog delivery.",
      ),
      checklistItem(
        "public-read-negative-check",
        "NOT_STARTED",
        "An unauthenticated missing-object response without exposing a credential.",
      ),
      checklistItem(
        "production-config-candidate-reviewed",
        "NOT_STARTED",
        "A later contract diff containing only the public project URL and derived public base URL.",
      ),
    ]),
    capabilities,
  });
}

export function runProductionProvisioningOperator({ command, config }) {
  if (!["PREFLIGHT", "PLAN", "CHECKLIST"].includes(command)) {
    fail("INVALID_COMMAND", "The provisioning operator received an unsupported command.");
  }
  const preflight = assertPlanReady(config);
  if (command === "PREFLIGHT") {
    return Object.freeze({
      schemaVersion: 1,
      command,
      ...preflight,
      mode: "WRITE_DISABLED",
      capabilities,
    });
  }
  return command === "PLAN" ? plan(config) : checklist();
}

async function main() {
  const command = parseProductionProvisioningCommand(process.argv.slice(2));
  let config;
  try {
    config = JSON.parse(await readFile(productionContractPath, "utf8"));
  } catch {
    fail("CONTRACT_UNREADABLE", "The committed Production channel contract is unreadable.");
  }
  const output = runProductionProvisioningOperator({ command, config });
  console.log(JSON.stringify(output, null, 2));
}

const invokedPath = process.argv[1] === undefined ? null : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    const code =
      error instanceof ProductionProvisioningOperatorError ? error.code : "OPERATOR_FAILED";
    console.error(`${code}: ${error instanceof Error ? error.message : "Unknown operator error."}`);
    process.exitCode = 1;
  }
}
