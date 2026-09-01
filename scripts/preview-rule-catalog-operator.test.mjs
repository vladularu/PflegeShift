import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  activatePreviewRuleCatalog,
  fetchPublicPreviewArtifact,
  parsePreviewOperatorArguments,
  preparePreviewRuleCatalog,
  previewTrustedPublicKeyArguments,
  recoverPreviewRuleCatalog,
  verifyPublishedPreviewRuleCatalog,
} from "./preview-rule-catalog-operator.mjs";

const signingSeed = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const supabaseSecret = "sb_secret_operator_test_123456789";

async function temporaryWorkspace() {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pflegeshift-preview-operator-"));
  await fs.mkdir(path.join(workspaceRoot, "rules", "releases"), { recursive: true });
  return workspaceRoot;
}

async function writeRequest(workspaceRoot, { generation = 4, rollbackOfGeneration = null } = {}) {
  const relativePath = `rules/releases/preview-generation-${generation}.json`;
  await fs.writeFile(
    path.join(workspaceRoot, ...relativePath.split("/")),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generation,
        channel: "PREVIEW",
        publishedAt: "2026-09-01T08:00:00Z",
        rollbackOfGeneration,
        packageSources: ["rules/packages/reviewed/example/2026-01.json"],
        signing: {
          algorithm: "ED25519",
          canonicalization: "RFC8785",
          keyId: "preview-2026-r3",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return relativePath;
}

function remoteManifest(generation = 3) {
  return `${JSON.stringify({ generation, channel: "PREVIEW", packages: [] })}\n`;
}

function rollbackManifest(generation = 2) {
  return `${JSON.stringify({
    generation,
    channel: "PREVIEW",
    signing: { keyId: "preview-2026-r2" },
    packages: [
      {
        packageId: "de-holidays",
        versionId: "2026",
        path: "packages/de-holidays/2026.json",
      },
    ],
  })}\n`;
}

function recoveryManifest(
  generation = 4,
  packages = [
    {
      packageId: "de-holidays",
      versionId: "2027",
      path: "packages/de-holidays/2027.json",
    },
  ],
) {
  return `${JSON.stringify({
    generation,
    channel: "PREVIEW",
    signing: { keyId: "preview-2026-r3" },
    packages,
  })}\n`;
}

test("operator argument parsing keeps Recover, Prepare, Activate, and Verify explicit", () => {
  assert.deepEqual(
    parsePreviewOperatorArguments("prepare", ["--request", "rules/releases/x.json"]),
    {
      command: "prepare",
      requestPath: "rules/releases/x.json",
    },
  );
  assert.deepEqual(parsePreviewOperatorArguments("activate", ["--generation", "4"]), {
    command: "activate",
    generation: 4,
    createBucket: false,
  });
  assert.deepEqual(
    parsePreviewOperatorArguments("activate", ["--generation", "1", "--create-bucket"]),
    {
      command: "activate",
      generation: 1,
      createBucket: true,
    },
  );
  assert.deepEqual(parsePreviewOperatorArguments("verify", ["--generation", "4"]), {
    command: "verify",
    generation: 4,
  });
  assert.deepEqual(parsePreviewOperatorArguments("recover", ["--generation", "4"]), {
    command: "recover",
    generation: 4,
  });
  assert.throws(
    () => parsePreviewOperatorArguments("activate", ["--generation", "0"]),
    /positive integer/,
  );
  assert.throws(() => parsePreviewOperatorArguments("prepare", []), /--request is required/);
  assert.throws(
    () =>
      parsePreviewOperatorArguments("recover", ["--generation", "4", "--secret", "not-accepted"]),
    /Recover accepts only --generation/,
  );
});

test("trusted-key CLI arguments are derived from the app Preview trust source", () => {
  const argumentsList = previewTrustedPublicKeyArguments();
  assert.equal(argumentsList.length, 6);
  assert.deepEqual(
    argumentsList.filter((value) => value === "--trusted-public-key"),
    ["--trusted-public-key", "--trusted-public-key", "--trusted-public-key"],
  );
  assert.match(argumentsList[1], /^preview-2026=[A-Za-z0-9_-]{43}$/);
  assert.match(argumentsList[3], /^preview-2026-r2=[A-Za-z0-9_-]{43}$/);
  assert.match(argumentsList[5], /^preview-2026-r3=[A-Za-z0-9_-]{43}$/);
});

test("public fetch treats only the real Supabase NoSuchKey response as a missing object", async () => {
  assert.equal(
    await fetchPublicPreviewArtifact("current.json", {
      allowMissing: true,
      fetchImplementation: async () =>
        Response.json(
          {
            statusCode: "404",
            error: "not_found",
            message: "Object not found",
            code: "NoSuchKey",
          },
          { status: 400 },
        ),
    }),
    null,
  );
  await assert.rejects(
    fetchPublicPreviewArtifact("current.json", {
      allowMissing: true,
      fetchImplementation: async () =>
        Response.json({ code: "BadRequest", message: "Invalid request" }, { status: 400 }),
    }),
    (error) => {
      assert.equal(error.code, "PUBLIC_DOWNLOAD_FAILED");
      return true;
    },
  );
});

test("Recover verifies and restores the current public catalog with current.json written last", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const manifestJson = recoveryManifest();
  const packageJson = '{"packageId":"de-holidays","versionId":"2027"}\n';
  const fetched = [];
  let verifiedArtifacts;
  try {
    const result = await recoverPreviewRuleCatalog({
      generation: 4,
      workspaceRoot,
      fetchPublicArtifact: async (relativePath) => {
        fetched.push(relativePath);
        if (relativePath === "current.json" || relativePath === "manifests/4.json") {
          return manifestJson;
        }
        if (relativePath === "packages/de-holidays/2027.json") return packageJson;
        throw new Error(`Unexpected public path ${relativePath}`);
      },
      verifyManifestJson: async (value) => JSON.parse(value),
      verifyCatalogArtifacts: async (artifacts) => {
        verifiedArtifacts = artifacts;
      },
      log: () => {},
    });

    assert.deepEqual(fetched, [
      "current.json",
      "manifests/4.json",
      "packages/de-holidays/2027.json",
    ]);
    assert.deepEqual(verifiedArtifacts, { manifestJson, packageJson: [packageJson] });
    assert.deepEqual(result, {
      generation: 4,
      keyId: "preview-2026-r3",
      packageCount: 1,
      createdImmutableObjects: 2,
      reusedImmutableObjects: 0,
    });
    assert.equal(
      await fs.readFile(
        path.join(
          workspaceRoot,
          "artifacts",
          "rule-catalog-operator",
          "preview",
          "packages",
          "de-holidays",
          "2027.json",
        ),
        "utf8",
      ),
      packageJson,
    );
    assert.equal(
      await fs.readFile(
        path.join(
          workspaceRoot,
          "artifacts",
          "rule-catalog-operator",
          "preview",
          "manifests",
          "4.json",
        ),
        "utf8",
      ),
      manifestJson,
    );
    assert.equal(
      await fs.readFile(
        path.join(workspaceRoot, "artifacts", "rule-catalog-operator", "preview", "current.json"),
        "utf8",
      ),
      manifestJson,
    );
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Recover retries idempotently when every immutable local object is byte-identical", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const manifestJson = recoveryManifest();
  const packageJson = '{"packageId":"de-holidays","versionId":"2027"}\n';
  const recover = () =>
    recoverPreviewRuleCatalog({
      generation: 4,
      workspaceRoot,
      fetchPublicArtifact: async (relativePath) =>
        relativePath === "packages/de-holidays/2027.json" ? packageJson : manifestJson,
      verifyManifestJson: async (value) => JSON.parse(value),
      verifyCatalogArtifacts: async () => {},
      log: () => {},
    });
  try {
    await recover();
    const retried = await recover();
    assert.equal(retried.createdImmutableObjects, 0);
    assert.equal(retried.reusedImmutableObjects, 2);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Recover rejects a public current/versioned mismatch before creating local state", async () => {
  const workspaceRoot = await temporaryWorkspace();
  try {
    await assert.rejects(
      recoverPreviewRuleCatalog({
        generation: 4,
        workspaceRoot,
        fetchPublicArtifact: async (relativePath) =>
          relativePath === "current.json" ? recoveryManifest() : `${recoveryManifest()} `,
        verifyManifestJson: async (value) => JSON.parse(value),
        verifyCatalogArtifacts: async () => {},
        log: () => {},
      }),
      (error) => {
        assert.equal(error.code, "PUBLIC_MANIFEST_MISMATCH");
        return true;
      },
    );
    assert.equal(
      await fs
        .access(path.join(workspaceRoot, "artifacts", "rule-catalog-operator"))
        .then(() => true)
        .catch(() => false),
      false,
    );
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Recover rejects a verified public manifest with a different generation identity", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const manifestJson = recoveryManifest(3);
  try {
    await assert.rejects(
      recoverPreviewRuleCatalog({
        generation: 4,
        workspaceRoot,
        fetchPublicArtifact: async () => manifestJson,
        verifyManifestJson: async (value) => JSON.parse(value),
        verifyCatalogArtifacts: async () => {},
        log: () => {},
      }),
      (error) => {
        assert.equal(error.code, "PUBLIC_MANIFEST_IDENTITY_MISMATCH");
        return true;
      },
    );
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Recover fails before package downloads when the public manifest signature is invalid", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const manifestJson = recoveryManifest();
  const fetched = [];
  try {
    await assert.rejects(
      recoverPreviewRuleCatalog({
        generation: 4,
        workspaceRoot,
        fetchPublicArtifact: async (relativePath) => {
          fetched.push(relativePath);
          return manifestJson;
        },
        verifyManifestJson: async () => {
          throw new Error("untrusted signature");
        },
        verifyCatalogArtifacts: async () => {},
        log: () => {},
      }),
      (error) => {
        assert.equal(error.code, "RECOVERY_VERIFICATION_FAILED");
        assert.equal(error.cause?.message, "untrusted signature");
        return true;
      },
    );
    assert.deepEqual(fetched, ["current.json", "manifests/4.json"]);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Recover fails before local writes when complete catalog verification fails", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const manifestJson = recoveryManifest();
  try {
    await assert.rejects(
      recoverPreviewRuleCatalog({
        generation: 4,
        workspaceRoot,
        fetchPublicArtifact: async (relativePath) =>
          relativePath === "packages/de-holidays/2027.json" ? '{"corrupt":true}\n' : manifestJson,
        verifyManifestJson: async (value) => JSON.parse(value),
        verifyCatalogArtifacts: async () => {
          throw new Error("package hash mismatch");
        },
        log: () => {},
      }),
      (error) => {
        assert.equal(error.code, "RECOVERY_VERIFICATION_FAILED");
        assert.equal(error.cause?.message, "package hash mismatch");
        return true;
      },
    );
    assert.equal(
      await fs
        .access(path.join(workspaceRoot, "artifacts", "rule-catalog-operator"))
        .then(() => true)
        .catch(() => false),
      false,
    );
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Recover preflights every immutable object before writing and rejects conflicts", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const packages = [
    {
      packageId: "de-holidays",
      versionId: "2026",
      path: "packages/de-holidays/2026.json",
    },
    {
      packageId: "de-holidays",
      versionId: "2027",
      path: "packages/de-holidays/2027.json",
    },
  ];
  const manifestJson = recoveryManifest(4, packages);
  const conflictingPath = path.join(
    workspaceRoot,
    "artifacts",
    "rule-catalog-operator",
    "preview",
    "packages",
    "de-holidays",
    "2027.json",
  );
  try {
    await fs.mkdir(path.dirname(conflictingPath), { recursive: true });
    await fs.writeFile(conflictingPath, '{"different":true}\n', "utf8");
    await assert.rejects(
      recoverPreviewRuleCatalog({
        generation: 4,
        workspaceRoot,
        fetchPublicArtifact: async (relativePath) => {
          if (relativePath === "current.json" || relativePath === "manifests/4.json") {
            return manifestJson;
          }
          return `${JSON.stringify({ relativePath })}\n`;
        },
        verifyManifestJson: async (value) => JSON.parse(value),
        verifyCatalogArtifacts: async () => {},
        log: () => {},
      }),
      (error) => {
        assert.equal(error.code, "LOCAL_IMMUTABLE_CONFLICT");
        return true;
      },
    );
    assert.equal(
      await fs
        .access(
          path.join(
            workspaceRoot,
            "artifacts",
            "rule-catalog-operator",
            "preview",
            "packages",
            "de-holidays",
            "2026.json",
          ),
        )
        .then(() => true)
        .catch(() => false),
      false,
    );
    assert.equal(
      await fs
        .access(
          path.join(workspaceRoot, "artifacts", "rule-catalog-operator", "preview", "current.json"),
        )
        .then(() => true)
        .catch(() => false),
      false,
    );
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Prepare performs only public reads, local publication, and a delivery dry-run", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const requestPath = await writeRequest(workspaceRoot);
  const environment = { RULE_CATALOG_SIGNING_KEY_BASE64URL: signingSeed };
  const commands = [];
  const fetched = [];
  try {
    const result = await preparePreviewRuleCatalog({
      requestPath,
      workspaceRoot,
      environment,
      fetchPublicArtifact: async (relativePath) => {
        fetched.push(relativePath);
        return remoteManifest();
      },
      runNpm: async (argumentsList, options) => {
        commands.push({ argumentsList, environment: options.environment });
      },
      log: () => {},
    });

    assert.deepEqual(fetched, ["current.json"]);
    assert.equal(result.generation, 4);
    assert.equal(result.manifestPath, "artifacts/rule-catalog-operator/preview/manifests/4.json");
    assert.equal(environment.RULE_CATALOG_SIGNING_KEY_BASE64URL, undefined);
    assert.equal(commands.length, 3);
    assert.deepEqual(
      commands.map(({ argumentsList }) => argumentsList.slice(0, 2)),
      [
        ["run", "rules:publish"],
        ["run", "rules:publish"],
        ["run", "rules:deliver"],
      ],
    );
    assert.equal(commands[0].argumentsList.includes("--dry-run"), true);
    assert.equal(commands[1].argumentsList.includes("--dry-run"), false);
    assert.equal(commands[2].argumentsList.includes("--dry-run"), true);
    assert.equal(commands[0].environment.RULE_CATALOG_SIGNING_KEY_BASE64URL, signingSeed);
    assert.equal(commands[1].environment.RULE_CATALOG_SIGNING_KEY_BASE64URL, signingSeed);
    assert.equal(commands[2].environment.RULE_CATALOG_SIGNING_KEY_BASE64URL, undefined);
    assert.equal(
      commands.some(({ argumentsList }) => argumentsList.includes("--create-bucket")),
      false,
    );
    assert.equal(
      commands.some(({ argumentsList }) => argumentsList.includes("--rollback-manifest")),
      false,
    );
    assert.equal(
      await fs.readFile(
        path.join(
          workspaceRoot,
          "artifacts",
          "rule-catalog-operator",
          "state",
          "previous-for-generation-4.json",
        ),
        "utf8",
      ),
      remoteManifest(),
    );
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Prepare derives and fully verifies its rollback target from the publication request", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const requestPath = await writeRequest(workspaceRoot, { rollbackOfGeneration: 2 });
  const environment = {
    RULE_CATALOG_SIGNING_KEY_BASE64URL: signingSeed,
    SUPABASE_SECRET_KEY: supabaseSecret,
    SUPABASE_URL: "https://secret-project.example",
  };
  const currentJson = remoteManifest(3);
  const targetJson = rollbackManifest(2);
  const targetPackageJson = '{"packageId":"de-holidays","versionId":"2026"}\n';
  const fetched = [];
  const commands = [];
  let verifiedArtifacts;
  try {
    const result = await preparePreviewRuleCatalog({
      requestPath,
      workspaceRoot,
      environment,
      fetchPublicArtifact: async (relativePath, options) => {
        fetched.push({ relativePath, options });
        if (relativePath === "current.json") return currentJson;
        if (relativePath === "manifests/2.json") return targetJson;
        if (relativePath === "packages/de-holidays/2026.json") return targetPackageJson;
        throw new Error(`Unexpected public path ${relativePath}`);
      },
      verifyManifestJson: async (value) => JSON.parse(value),
      verifyCatalogArtifacts: async (artifacts) => {
        verifiedArtifacts = artifacts;
      },
      runNpm: async (argumentsList, options) => {
        commands.push({ argumentsList, environment: options.environment });
      },
      log: () => {},
    });

    assert.equal(result.generation, 4);
    assert.deepEqual(
      fetched.map(({ relativePath }) => relativePath),
      ["current.json", "manifests/2.json", "packages/de-holidays/2026.json"],
    );
    assert.deepEqual(fetched[1].options, { allowMissing: true });
    assert.deepEqual(verifiedArtifacts, {
      manifestJson: targetJson,
      packageJson: [targetPackageJson],
    });
    const rollbackPath =
      "artifacts/rule-catalog-operator/state/rollback-target-2-for-generation-4.json";
    assert.equal(
      await fs.readFile(path.join(workspaceRoot, ...rollbackPath.split("/")), "utf8"),
      targetJson,
    );
    for (const command of commands.slice(0, 2)) {
      const rollbackArgumentIndex = command.argumentsList.indexOf("--rollback-manifest");
      assert.notEqual(rollbackArgumentIndex, -1);
      assert.equal(command.argumentsList[rollbackArgumentIndex + 1], rollbackPath);
    }
    assert.equal(commands[2].argumentsList.includes("--rollback-manifest"), false);
    for (const command of commands) {
      assert.equal(command.environment.SUPABASE_SECRET_KEY, undefined);
      assert.equal(command.environment.SUPABASE_URL, undefined);
    }
    assert.equal(environment.RULE_CATALOG_SIGNING_KEY_BASE64URL, undefined);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Prepare rejects a missing public rollback target before running the publisher", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const requestPath = await writeRequest(workspaceRoot, { rollbackOfGeneration: 2 });
  const environment = { RULE_CATALOG_SIGNING_KEY_BASE64URL: signingSeed };
  let commandCount = 0;
  try {
    await assert.rejects(
      preparePreviewRuleCatalog({
        requestPath,
        workspaceRoot,
        environment,
        fetchPublicArtifact: async (relativePath) =>
          relativePath === "current.json" ? remoteManifest(3) : null,
        runNpm: async () => {
          commandCount += 1;
        },
        log: () => {},
      }),
      (error) => {
        assert.equal(error.code, "ROLLBACK_TARGET_MISSING");
        return true;
      },
    );
    assert.equal(commandCount, 0);
    assert.equal(environment.RULE_CATALOG_SIGNING_KEY_BASE64URL, undefined);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Prepare rejects a rollback manifest whose verified identity differs from the request", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const requestPath = await writeRequest(workspaceRoot, { rollbackOfGeneration: 2 });
  const environment = { RULE_CATALOG_SIGNING_KEY_BASE64URL: signingSeed };
  let commandCount = 0;
  try {
    await assert.rejects(
      preparePreviewRuleCatalog({
        requestPath,
        workspaceRoot,
        environment,
        fetchPublicArtifact: async (relativePath) =>
          relativePath === "current.json" ? remoteManifest(3) : rollbackManifest(1),
        verifyManifestJson: async (value) => JSON.parse(value),
        runNpm: async () => {
          commandCount += 1;
        },
        log: () => {},
      }),
      (error) => {
        assert.equal(error.code, "ROLLBACK_TARGET_IDENTITY_MISMATCH");
        return true;
      },
    );
    assert.equal(commandCount, 0);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Prepare fails closed when the rollback manifest signature cannot be verified", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const requestPath = await writeRequest(workspaceRoot, { rollbackOfGeneration: 2 });
  const environment = { RULE_CATALOG_SIGNING_KEY_BASE64URL: signingSeed };
  const fetched = [];
  let commandCount = 0;
  try {
    await assert.rejects(
      preparePreviewRuleCatalog({
        requestPath,
        workspaceRoot,
        environment,
        fetchPublicArtifact: async (relativePath) => {
          fetched.push(relativePath);
          return relativePath === "current.json" ? remoteManifest(3) : rollbackManifest(2);
        },
        verifyManifestJson: async () => {
          throw new Error("untrusted signature");
        },
        runNpm: async () => {
          commandCount += 1;
        },
        log: () => {},
      }),
      (error) => {
        assert.equal(error.code, "ROLLBACK_TARGET_VERIFICATION_FAILED");
        assert.equal(error.cause?.message, "untrusted signature");
        return true;
      },
    );
    assert.deepEqual(fetched, ["current.json", "manifests/2.json"]);
    assert.equal(commandCount, 0);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Prepare fails closed when rollback package verification fails", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const requestPath = await writeRequest(workspaceRoot, { rollbackOfGeneration: 2 });
  const environment = { RULE_CATALOG_SIGNING_KEY_BASE64URL: signingSeed };
  let commandCount = 0;
  try {
    await assert.rejects(
      preparePreviewRuleCatalog({
        requestPath,
        workspaceRoot,
        environment,
        fetchPublicArtifact: async (relativePath) => {
          if (relativePath === "current.json") return remoteManifest(3);
          if (relativePath === "manifests/2.json") return rollbackManifest(2);
          return '{"corrupt":true}\n';
        },
        verifyManifestJson: async (value) => JSON.parse(value),
        verifyCatalogArtifacts: async () => {
          throw new Error("package hash mismatch");
        },
        runNpm: async () => {
          commandCount += 1;
        },
        log: () => {},
      }),
      (error) => {
        assert.equal(error.code, "ROLLBACK_TARGET_VERIFICATION_FAILED");
        assert.equal(error.cause?.message, "package hash mismatch");
        return true;
      },
    );
    assert.equal(commandCount, 0);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Activate separates local preflight from the one authorized remote write", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const environment = { SUPABASE_SECRET_KEY: supabaseSecret };
  const commands = [];
  const verifiedGenerations = [];
  try {
    await activatePreviewRuleCatalog({
      generation: 4,
      workspaceRoot,
      environment,
      runNpm: async (argumentsList, options) => {
        commands.push({ argumentsList, environment: options.environment });
      },
      verifyPublished: async ({ generation }) => {
        verifiedGenerations.push(generation);
        return { generation, packageCount: 4, keyId: "preview-2026-r3" };
      },
      retryDelaysMilliseconds: [0],
      log: () => {},
    });

    assert.equal(environment.SUPABASE_SECRET_KEY, undefined);
    assert.equal(commands.length, 2);
    assert.equal(commands[0].argumentsList.includes("--dry-run"), true);
    assert.equal(commands[0].environment.SUPABASE_SECRET_KEY, undefined);
    assert.equal(commands[1].argumentsList.includes("--dry-run"), false);
    assert.equal(commands[1].environment.SUPABASE_SECRET_KEY, supabaseSecret);
    assert.equal(commands[1].environment.SUPABASE_URL, "https://okcxmmekwyuuiqthmydo.supabase.co");
    assert.deepEqual(verifiedGenerations, [4]);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Activate reports a completed delivery separately from pending public verification", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const environment = { SUPABASE_SECRET_KEY: supabaseSecret };
  try {
    await assert.rejects(
      activatePreviewRuleCatalog({
        generation: 4,
        workspaceRoot,
        environment,
        runNpm: async () => {},
        verifyPublished: async () => {
          throw new Error("public cache still stale");
        },
        retryDelaysMilliseconds: [0, 0],
        wait: async () => {},
        log: () => {},
      }),
      (error) => {
        assert.equal(error.code, "PUBLIC_VERIFICATION_PENDING");
        assert.match(error.message, /Delivery completed/);
        assert.match(error.message, /Verify/);
        return true;
      },
    );
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Verify checks public current, immutable manifest, packages, and exact local bytes", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const manifestPath = path.join(
    workspaceRoot,
    "artifacts",
    "rule-catalog-operator",
    "preview",
    "manifests",
    "4.json",
  );
  const manifest = {
    generation: 4,
    channel: "PREVIEW",
    signing: { keyId: "preview-2026-r3" },
    packages: [
      {
        packageId: "de-holidays",
        versionId: "2027",
        path: "packages/de-holidays/2027.json",
      },
    ],
  };
  const manifestJson = `${JSON.stringify(manifest)}\n`;
  const packageJson = '{"packageId":"de-holidays","versionId":"2027"}\n';
  const fetched = [];
  let verifiedArtifacts;
  try {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, manifestJson, "utf8");

    const result = await verifyPublishedPreviewRuleCatalog({
      generation: 4,
      workspaceRoot,
      fetchPublicArtifact: async (relativePath) => {
        fetched.push(relativePath);
        if (relativePath === "current.json" || relativePath === "manifests/4.json") {
          return manifestJson;
        }
        if (relativePath === "packages/de-holidays/2027.json") return packageJson;
        throw new Error(`Unexpected public path ${relativePath}`);
      },
      verifyManifestJson: async (value) => JSON.parse(value),
      verifyCatalogArtifacts: async (artifacts) => {
        verifiedArtifacts = artifacts;
      },
      log: () => {},
    });

    assert.deepEqual(fetched, [
      "current.json",
      "manifests/4.json",
      "packages/de-holidays/2027.json",
    ]);
    assert.deepEqual(verifiedArtifacts, { manifestJson, packageJson: [packageJson] });
    assert.deepEqual(result, {
      generation: 4,
      keyId: "preview-2026-r3",
      packageCount: 1,
    });
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("Verify fails closed when public current differs from the immutable or local manifest", async () => {
  const workspaceRoot = await temporaryWorkspace();
  const manifestPath = path.join(
    workspaceRoot,
    "artifacts",
    "rule-catalog-operator",
    "preview",
    "manifests",
    "4.json",
  );
  try {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, remoteManifest(4), "utf8");
    await assert.rejects(
      verifyPublishedPreviewRuleCatalog({
        generation: 4,
        workspaceRoot,
        fetchPublicArtifact: async (relativePath) =>
          relativePath === "current.json" ? remoteManifest(4) : `${remoteManifest(4)} `,
        verifyManifestJson: async (value) => JSON.parse(value),
        verifyCatalogArtifacts: async () => {},
        log: () => {},
      }),
      (error) => {
        assert.equal(error.code, "PUBLIC_MANIFEST_MISMATCH");
        return true;
      },
    );
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});
