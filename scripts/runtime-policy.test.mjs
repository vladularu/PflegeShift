import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { validateIosRuntimePolicy, validateResolvedIosRuntimePolicies } from "./runtime-policy.mjs";

const fingerprint = { policy: "fingerprint" };

test("accepts inherited and explicit iOS fingerprint policies", () => {
  assert.deepEqual(validateIosRuntimePolicy({ runtimeVersion: fingerprint }, "test"), []);
  assert.deepEqual(validateIosRuntimePolicy({ ios: { runtimeVersion: fingerprint } }, "test"), []);
});

test("rejects the old fixed iOS runtime even when the root uses fingerprint", () => {
  assert.equal(
    validateIosRuntimePolicy(
      { runtimeVersion: fingerprint, ios: { runtimeVersion: "ios-2026.09.1" } },
      "test",
    ).length,
    1,
  );
});

test("rejects missing, null, fixed and version-based runtime policies", () => {
  for (const runtime of [
    undefined,
    null,
    "1.0.0",
    { policy: "appVersion" },
    { policy: "sdkVersion" },
  ]) {
    assert.equal(validateIosRuntimePolicy({ runtimeVersion: runtime }, "test").length, 1);
    if (runtime !== undefined) {
      assert.equal(
        validateIosRuntimePolicy(
          { runtimeVersion: fingerprint, ios: { runtimeVersion: runtime } },
          "test",
        ).length,
        1,
      );
    }
  }
});

test("checks both real app variants after resolving app.config.ts", () => {
  assert.deepEqual(validateResolvedIosRuntimePolicies(resolve(import.meta.dirname, "..")), []);
});

test("detects a dynamic preview-only override and restores the caller environment", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "lunashift-runtime-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await writeFile(join(fixture, "package.json"), JSON.stringify({ name: "runtime-fixture" }));
  await writeFile(
    join(fixture, "app.config.js"),
    `module.exports = () => ({
      name: "Runtime fixture", slug: "runtime-fixture", sdkVersion: "57.0.0",
      runtimeVersion: { policy: "fingerprint" },
      ios: process.env.APP_VARIANT === "internal" ? { runtimeVersion: "legacy" } : {}
    });`,
  );
  const originalVariant = process.env.APP_VARIANT;
  t.after(() => {
    if (originalVariant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = originalVariant;
  });
  for (const previous of [undefined, "caller-variant"]) {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
    const failures = validateResolvedIosRuntimePolicies(fixture);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /APP_VARIANT=internal/);
    assert.equal(process.env.APP_VARIANT, previous);
  }
});
