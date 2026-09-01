import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createRequire } from "node:module";

import * as ed25519 from "@noble/ed25519";

import { canonicalizeRuleManifestForSignature } from "../src/rules/rule-catalog-verification.ts";
import {
  RULE_CATALOG_DELIVERY_CHANNELS,
  ruleCatalogDeliveryChannel,
} from "./rule-catalog-delivery-channels.mjs";
import {
  createSupabaseRuleCatalogStorage,
  deliverRuleCatalog,
  RuleCatalogDeliveryError,
  ruleCatalogDeliveryConstants,
} from "./supabase-rule-catalog-storage.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const deliveryCliPath = path.join(repositoryRoot, "scripts", "deliver-rule-catalog.mjs");
const require = createRequire(import.meta.url);
const tsxImport = pathToFileURL(require.resolve("tsx")).href;
const secretKey = "sb_secret_delivery_test_key_123456789";

test("delivery channel contract keeps only Preview remotely enabled", () => {
  const preview = ruleCatalogDeliveryChannel("PREVIEW");
  const production = ruleCatalogDeliveryChannel("PRODUCTION");

  assert.deepEqual(preview, {
    channel: "PREVIEW",
    pathSegment: "preview",
    keyIdPrefix: "preview-",
    remote: { bucket: "rule-catalog" },
  });
  assert.deepEqual(production, {
    channel: "PRODUCTION",
    pathSegment: "production",
    keyIdPrefix: "production-",
    remote: null,
  });
  assert.equal(ruleCatalogDeliveryChannel("UNKNOWN"), null);
  assert.equal(Object.isFrozen(RULE_CATALOG_DELIVERY_CHANNELS), true);
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(Object.isFrozen(preview.remote), true);
  assert.equal(Object.isFrozen(production), true);
});

function artifactSet(manifest, packageContents = ['{"package":1}\n']) {
  const channelRoot = manifest.channel.toLowerCase();
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  return {
    manifest,
    manifestJson,
    artifacts: [
      ...manifest.packages.map((descriptor, index) => ({
        objectPath: `${channelRoot}/${descriptor.path}`,
        contents: packageContents[index],
        immutable: true,
        role: "PACKAGE",
        cacheControl: ruleCatalogDeliveryConstants.immutableCacheControl,
      })),
      {
        objectPath: `${channelRoot}/manifests/${manifest.generation}.json`,
        contents: manifestJson,
        immutable: true,
        role: "VERSIONED_MANIFEST",
        cacheControl: ruleCatalogDeliveryConstants.immutableCacheControl,
      },
      {
        objectPath: `${channelRoot}/current.json`,
        contents: manifestJson,
        immutable: false,
        role: "CURRENT_MANIFEST",
        cacheControl: ruleCatalogDeliveryConstants.currentCacheControl,
      },
    ],
  };
}

function testManifest(generation = 1, publishedAt = "2026-08-28T13:00:00Z", channel = "PREVIEW") {
  return {
    generation,
    channel,
    publishedAt,
    packages: [
      {
        packageId: "test-package",
        versionId: "2026-01",
        path: "packages/test-package/2026-01.json",
      },
    ],
  };
}

function createFakeSupabase({ bucketExists = false, bucketOverride = {} } = {}) {
  const requests = [];
  const objects = new Map();
  let bucket = bucketExists
    ? {
        id: "rule-catalog",
        name: "rule-catalog",
        public: true,
        file_size_limit: ruleCatalogDeliveryConstants.maximumArtifactBytes,
        allowed_mime_types: ["application/json"],
        ...bucketOverride,
      }
    : null;

  async function fetchImplementation(input, init = {}) {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    requests.push({ method, pathname: url.pathname, headers, body: init.body ?? null });
    assert.equal(headers.get("apikey"), secretKey);
    assert.equal(headers.get("authorization"), `Bearer ${secretKey}`);

    if (url.pathname === "/storage/v1/bucket/rule-catalog" && method === "GET") {
      return bucket === null
        ? new Response("", { status: 404 })
        : Response.json(bucket, { status: 200 });
    }
    if (url.pathname === "/storage/v1/bucket" && method === "POST") {
      const inputBucket = JSON.parse(init.body);
      bucket = {
        id: inputBucket.id,
        name: inputBucket.name,
        public: inputBucket.public,
        file_size_limit: inputBucket.file_size_limit,
        allowed_mime_types: inputBucket.allowed_mime_types,
      };
      return Response.json({ name: bucket.name }, { status: 200 });
    }
    const objectPrefix = "/storage/v1/object/rule-catalog/";
    if (url.pathname.startsWith(objectPrefix)) {
      const objectPath = url.pathname.slice(objectPrefix.length);
      if (method === "GET") {
        const stored = objects.get(objectPath);
        return stored === undefined
          ? Response.json(
              {
                statusCode: "404",
                error: "not_found",
                message: "Object not found",
                code: "NoSuchKey",
              },
              { status: 400 },
            )
          : new Response(stored, {
              status: 200,
              headers: { "content-length": String(stored.byteLength) },
            });
      }
      if (method === "POST") {
        assert.equal(headers.get("content-type"), "application/json");
        const upsert = headers.get("x-upsert") === "true";
        if (objects.has(objectPath) && !upsert) {
          return Response.json({ message: "Asset Already Exists" }, { status: 400 });
        }
        objects.set(objectPath, Buffer.from(init.body, "utf8"));
        return Response.json({ Key: `rule-catalog/${objectPath}` }, { status: 200 });
      }
    }
    return new Response("", { status: 404 });
  }

  return { requests, objects, fetchImplementation };
}

function storageFor(fake) {
  return createSupabaseRuleCatalogStorage({
    channel: "PREVIEW",
    supabaseUrl: "http://127.0.0.1",
    secretKey,
    fetchImplementation: fake.fetchImplementation,
  });
}

test("delivery creates the locked bucket, uploads immutable artifacts first, and retries idempotently", async () => {
  const fake = createFakeSupabase();
  const storage = storageFor(fake);
  const publication = artifactSet(testManifest());

  const delivered = await deliverRuleCatalog({
    storage,
    publication,
    verifyRemoteManifest: async (json) => JSON.parse(json),
    createBucket: true,
  });
  assert.deepEqual(delivered, {
    created: 2,
    reused: 0,
    currentChanged: true,
    idempotent: false,
  });
  const objectWrites = fake.requests
    .filter(
      (request) => request.method === "POST" && request.pathname.includes("/object/rule-catalog/"),
    )
    .map((request) => request.pathname.split("/object/rule-catalog/")[1]);
  assert.deepEqual(objectWrites, [
    "preview/packages/test-package/2026-01.json",
    "preview/manifests/1.json",
    "preview/current.json",
  ]);
  const immutableWrite = fake.requests.find(
    (request) =>
      request.method === "POST" &&
      request.pathname.endsWith("preview/packages/test-package/2026-01.json"),
  );
  assert.equal(immutableWrite.headers.get("x-upsert"), "false");
  assert.equal(
    immutableWrite.headers.get("cache-control"),
    ruleCatalogDeliveryConstants.immutableCacheControl,
  );
  const currentWrite = fake.requests.find(
    (request) => request.method === "POST" && request.pathname.endsWith("preview/current.json"),
  );
  assert.equal(currentWrite.headers.get("x-upsert"), "true");
  assert.equal(
    currentWrite.headers.get("cache-control"),
    ruleCatalogDeliveryConstants.currentCacheControl,
  );

  const requestCount = fake.requests.length;
  const retried = await deliverRuleCatalog({
    storage,
    publication,
    verifyRemoteManifest: async (json) => JSON.parse(json),
  });
  assert.deepEqual(retried, {
    created: 0,
    reused: 2,
    currentChanged: false,
    idempotent: true,
  });
  assert.equal(
    fake.requests.slice(requestCount).some((request) => request.method === "POST"),
    false,
  );
});

test("delivery rejects immutable conflicts before replacing current.json", async () => {
  const fake = createFakeSupabase({ bucketExists: true });
  const storage = storageFor(fake);
  const publication = artifactSet(testManifest());
  await deliverRuleCatalog({
    storage,
    publication,
    verifyRemoteManifest: async (json) => JSON.parse(json),
  });
  fake.objects.set(
    "preview/packages/test-package/2026-01.json",
    Buffer.from("different immutable bytes", "utf8"),
  );
  const writesBeforeConflict = fake.requests.filter(
    (request) => request.method === "POST" && request.pathname.endsWith("preview/current.json"),
  ).length;

  await assert.rejects(
    deliverRuleCatalog({
      storage,
      publication,
      verifyRemoteManifest: async (json) => JSON.parse(json),
    }),
    (error) => {
      assert.ok(error instanceof RuleCatalogDeliveryError);
      assert.equal(error.code, "IMMUTABLE_CONFLICT");
      return true;
    },
  );
  assert.equal(
    fake.requests.filter(
      (request) => request.method === "POST" && request.pathname.endsWith("preview/current.json"),
    ).length,
    writesBeforeConflict,
  );
});

test("delivery rejects remote generation gaps before uploading", async () => {
  const fake = createFakeSupabase({ bucketExists: true });
  const storage = storageFor(fake);
  const generationOne = artifactSet(testManifest());
  await deliverRuleCatalog({
    storage,
    publication: generationOne,
    verifyRemoteManifest: async (json) => JSON.parse(json),
  });
  const writesBeforeGap = fake.requests.filter((request) => request.method === "POST").length;
  const generationThree = artifactSet(testManifest(3, "2026-08-28T15:00:00Z"));

  await assert.rejects(
    deliverRuleCatalog({
      storage,
      publication: generationThree,
      verifyRemoteManifest: async (json) => JSON.parse(json),
    }),
    (error) => {
      assert.ok(error instanceof RuleCatalogDeliveryError);
      assert.equal(error.code, "REMOTE_GENERATION_CONFLICT");
      return true;
    },
  );
  assert.equal(
    fake.requests.filter((request) => request.method === "POST").length,
    writesBeforeGap,
  );
});

test("delivery rejects an untrusted remote pointer before uploading", async () => {
  const fake = createFakeSupabase({ bucketExists: true });
  const storage = storageFor(fake);
  await deliverRuleCatalog({
    storage,
    publication: artifactSet(testManifest()),
    verifyRemoteManifest: async (json) => JSON.parse(json),
  });
  const writesBeforeRejection = fake.requests.filter((request) => request.method === "POST").length;

  await assert.rejects(
    deliverRuleCatalog({
      storage,
      publication: artifactSet(testManifest(2, "2026-08-28T14:00:00Z")),
      verifyRemoteManifest: async () => {
        throw new Error("invalid signature");
      },
    }),
    (error) => {
      assert.ok(error instanceof RuleCatalogDeliveryError);
      assert.equal(error.code, "INVALID_REMOTE_STATE");
      assert.equal(error.message.includes(secretKey), false);
      return true;
    },
  );
  assert.equal(
    fake.requests.filter((request) => request.method === "POST").length,
    writesBeforeRejection,
  );
});

test("delivery rejects the production channel before contacting Supabase", async () => {
  const fake = createFakeSupabase({ bucketExists: true });
  const productionManifest = testManifest(1, "2026-08-28T13:00:00Z", "PRODUCTION");
  await assert.rejects(
    deliverRuleCatalog({
      storage: storageFor(fake),
      publication: artifactSet(productionManifest),
      verifyRemoteManifest: async (json) => JSON.parse(json),
    }),
    (error) => {
      assert.ok(error instanceof RuleCatalogDeliveryError);
      assert.equal(error.code, "CHANNEL_REMOTE_DISABLED");
      return true;
    },
  );
  assert.equal(fake.requests.length, 0);
});

test("delivery rejects a channel-mismatched storage port before touching it", async () => {
  let storageTouched = false;
  await assert.rejects(
    deliverRuleCatalog({
      storage: {
        channel: "PRODUCTION",
        ensureBucket: async () => {
          storageTouched = true;
        },
      },
      publication: artifactSet(testManifest()),
      verifyRemoteManifest: async (json) => JSON.parse(json),
    }),
    (error) => {
      assert.ok(error instanceof RuleCatalogDeliveryError);
      assert.equal(error.code, "CHANNEL_MISMATCH");
      return true;
    },
  );
  assert.equal(storageTouched, false);
});

test("delivery fails closed when bucket restrictions drift", async () => {
  const fake = createFakeSupabase({
    bucketExists: true,
    bucketOverride: { public: false },
  });
  await assert.rejects(storageFor(fake).ensureBucket(), (error) => {
    assert.ok(error instanceof RuleCatalogDeliveryError);
    assert.equal(error.code, "BUCKET_CONFIGURATION_MISMATCH");
    return true;
  });
});

test("storage rejects an unrelated HTTP 400 instead of treating it as a missing object", async () => {
  const storage = createSupabaseRuleCatalogStorage({
    channel: "PREVIEW",
    supabaseUrl: "http://127.0.0.1",
    secretKey,
    fetchImplementation: async () =>
      Response.json(
        {
          statusCode: "400",
          error: "bad_request",
          message: "Invalid object request",
          code: "BadRequest",
        },
        { status: 400 },
      ),
  });

  await assert.rejects(storage.readObject("preview/current.json"), (error) => {
    assert.ok(error instanceof RuleCatalogDeliveryError);
    assert.equal(error.code, "REMOTE_REJECTED");
    return true;
  });
});

test("storage isolates channel object paths before any request", async () => {
  const fake = createFakeSupabase({ bucketExists: true });
  const storage = storageFor(fake);

  await assert.rejects(storage.readObject("production/current.json"), (error) => {
    assert.ok(error instanceof RuleCatalogDeliveryError);
    assert.equal(error.code, "INVALID_ARTIFACT_SET");
    return true;
  });
  assert.equal(fake.requests.length, 0);
});

test("storage cannot be configured for Production while its remote profile is disabled", () => {
  let contacted = false;
  assert.throws(
    () =>
      createSupabaseRuleCatalogStorage({
        channel: "PRODUCTION",
        supabaseUrl: "http://127.0.0.1",
        secretKey,
        fetchImplementation: async () => {
          contacted = true;
          return new Response("", { status: 500 });
        },
      }),
    (error) => {
      assert.ok(error instanceof RuleCatalogDeliveryError);
      assert.equal(error.code, "CHANNEL_REMOTE_DISABLED");
      return true;
    },
  );
  assert.equal(contacted, false);
});

async function fixture(fileName) {
  return JSON.parse(
    await fs.readFile(path.join(repositoryRoot, "rules", "examples", fileName), "utf8"),
  );
}

async function writeSignedCliFixture(publicationRoot, channel = "PREVIEW") {
  ed25519.hashes.sha512 = (message) =>
    Uint8Array.from(createHash("sha512").update(message).digest());
  const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index);
  const publicKey = ed25519.getPublicKey(privateKey);
  await fs.mkdir(publicationRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(publicationRoot, "delivery-test-"));
  const channelDirectory = channel.toLowerCase();
  const channelRoot = path.join(root, channelDirectory);
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
  const packageJson = packages.map((value) => `${JSON.stringify(value, null, 2)}\n`);
  const manifest = await fixture("manifest.valid.json");
  manifest.channel = channel;
  manifest.packages = packages.map((rulePackage, index) => ({
    packageId: rulePackage.packageId,
    versionId: rulePackage.versionId,
    kind: rulePackage.kind,
    engineContractVersion: rulePackage.engineContractVersion,
    validFrom: rulePackage.validFrom,
    validTo: rulePackage.validTo,
    path: `packages/${rulePackage.packageId}/${rulePackage.versionId}.json`,
    sha256: createHash("sha256").update(packageJson[index], "utf8").digest("hex"),
    sizeBytes: Buffer.byteLength(packageJson[index], "utf8"),
  }));
  manifest.signing.keyId = `${channelDirectory}-delivery-test`;
  manifest.signing.signature = "";
  manifest.signing.signature = Buffer.from(
    ed25519.sign(canonicalizeRuleManifestForSignature(manifest), privateKey),
  ).toString("base64url");
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  for (const [index, descriptor] of manifest.packages.entries()) {
    const target = path.join(channelRoot, ...descriptor.path.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, packageJson[index], "utf8");
  }
  const manifestPath = path.join(channelRoot, "manifests", "1.json");
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, manifestJson, "utf8");
  return {
    root,
    manifestPath,
    trustedKey: `${channelDirectory}-delivery-test=${Buffer.from(publicKey).toString("base64url")}`,
  };
}

test("delivery CLI verifies a signed local publication without network access", async () => {
  const publicationRoots = [
    path.join(repositoryRoot, "dist", "rule-catalog"),
    path.join(repositoryRoot, "artifacts", "rule-catalog-operator"),
  ];
  const fixtureRoots = [];
  try {
    for (const publicationRoot of publicationRoots) {
      const fixtureRoot = await writeSignedCliFixture(publicationRoot);
      fixtureRoots.push(fixtureRoot);
      const result = await execFileAsync(
        process.execPath,
        [
          "--import",
          tsxImport,
          deliveryCliPath,
          "--manifest",
          fixtureRoot.manifestPath,
          "--trusted-public-key",
          fixtureRoot.trustedKey,
          "--dry-run",
        ],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            SUPABASE_URL: "not-used-in-dry-run",
            SUPABASE_SECRET_KEY: "must-not-be-needed-in-dry-run",
          },
        },
      );
      assert.match(result.stdout, /Validated local PREVIEW generation 1 for delivery/);
      assert.match(result.stdout, /Network writes: none \(dry-run\)/);
      assert.equal(result.stdout.includes("must-not-be-needed-in-dry-run"), false);
      assert.equal(result.stderr, "");
    }

    await assert.rejects(
      execFileAsync(
        process.execPath,
        [
          "--import",
          tsxImport,
          deliveryCliPath,
          "--manifest",
          path.join(
            repositoryRoot,
            "artifacts",
            "rule-catalog-operator-neighbor",
            "preview",
            "manifests",
            "1.json",
          ),
          "--trusted-public-key",
          fixtureRoots[0].trustedKey,
          "--dry-run",
        ],
        { cwd: repositoryRoot, encoding: "utf8" },
      ),
      (error) => {
        assert.match(error.stderr, /approved local rule-catalog roots/);
        return true;
      },
    );
  } finally {
    await Promise.all(
      fixtureRoots.map((fixtureRoot) => fs.rm(fixtureRoot.root, { recursive: true, force: true })),
    );
  }
});

test("delivery CLI validates Production locally but blocks remote delivery before credentials or network", async () => {
  const fixtureRoot = await writeSignedCliFixture(
    path.join(repositoryRoot, "dist", "rule-catalog"),
    "PRODUCTION",
  );
  try {
    const dryRun = await execFileAsync(
      process.execPath,
      [
        "--import",
        tsxImport,
        deliveryCliPath,
        "--manifest",
        fixtureRoot.manifestPath,
        "--trusted-public-key",
        fixtureRoot.trustedKey,
        "--dry-run",
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    assert.match(dryRun.stdout, /Validated local PRODUCTION generation 1 for delivery/);
    assert.match(dryRun.stdout, /Network writes: none \(dry-run\)/);

    await assert.rejects(
      execFileAsync(
        process.execPath,
        [
          "--import",
          tsxImport,
          deliveryCliPath,
          "--manifest",
          fixtureRoot.manifestPath,
          "--trusted-public-key",
          fixtureRoot.trustedKey,
        ],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            SUPABASE_URL: "http://127.0.0.1",
            SUPABASE_SECRET_KEY: secretKey,
          },
        },
      ),
      (error) => {
        assert.match(error.stderr, /CHANNEL_REMOTE_DISABLED/);
        assert.equal(error.stderr.includes(secretKey), false);
        return true;
      },
    );
  } finally {
    await fs.rm(fixtureRoot.root, { recursive: true, force: true });
  }
});
