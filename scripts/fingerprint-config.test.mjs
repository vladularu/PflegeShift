import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const config = require("../fingerprint.config.js");
const { applyNativeTabTransitionPatch } = require("../plugins/with-native-tab-transitions.js");
const filePath = "node_modules/react-native-screens/ios/tabs/host/RNSTabBarController.mm";
const original = readFileSync(resolve(import.meta.dirname, "..", filePath));

function transform(bytes, chunkSize = 1024, path = filePath) {
  const source = { type: "file", filePath: path };
  const parts = [];
  for (let start = 0; start < bytes.length; start += chunkSize) {
    const result = config.fileHookTransform(
      source,
      bytes.subarray(start, start + chunkSize),
      false,
      "utf8",
    );
    if (result !== null) parts.push(result);
  }
  const end = config.fileHookTransform(source, null, true, "utf8");
  if (end !== null) parts.push(end);
  return Buffer.concat(parts.map((part) => Buffer.from(part)));
}

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("hashes the actual prebuild patch identically before and after patching", () => {
  const patched = Buffer.from(applyNativeTabTransitionPatch(original.toString("utf8")));
  assert.deepEqual(transform(original), patched);
  assert.equal(hash(transform(original)), hash(transform(patched)));
});

test("buffers split UTF-8 and patch anchors independently of chunk boundaries", () => {
  const input = Buffer.concat([original, Buffer.from("\n// Grüße 🌙\n")]);
  assert.deepEqual(transform(input, 1), transform(input, input.length));
  assert.deepEqual(transform(input, 13, filePath.replaceAll("/", "\\")), transform(input));
});

test("does not hide changes in the controller or in the applied native patch", () => {
  const patched = Buffer.from(applyNativeTabTransitionPatch(original.toString("utf8")));
  const changedPatch = Buffer.from(patched.toString("utf8").replace("0.40", "0.41"));
  assert.notEqual(hash(transform(patched)), hash(transform(changedPatch)));
  assert.notEqual(
    hash(transform(original)),
    hash(transform(Buffer.concat([original, Buffer.from("\n// native change")]))),
  );
});

test("passes other native files and config contents through unchanged", () => {
  const bytes = Buffer.from("native code");
  assert.deepEqual(transform(bytes, 2, "node_modules/react-native-screens/ios/Other.mm"), bytes);
  assert.equal(
    config.fileHookTransform({ type: "contents", id: "expoConfig" }, bytes, true, "utf8"),
    bytes,
  );
});

test("rejects unexpected or incomplete patch input", () => {
  assert.throws(() => transform(Buffer.from("unknown source")), /anchors changed/);
  assert.throws(
    () => transform(Buffer.from("PFLEGESHIFT_NATIVE_TAB_TRANSITION_ANIMATOR")),
    /incomplete/,
  );
});

test("keeps concurrent streams for the same path independent", () => {
  const a = { type: "file", filePath };
  const b = { type: "file", filePath };
  const changed = Buffer.concat([original, Buffer.from("\n// second stream")]);
  config.fileHookTransform(a, original, false, "utf8");
  config.fileHookTransform(b, changed, false, "utf8");
  assert.equal(
    config.fileHookTransform(a, null, true, "utf8"),
    applyNativeTabTransitionPatch(original.toString("utf8")),
  );
  assert.equal(
    config.fileHookTransform(b, null, true, "utf8"),
    applyNativeTabTransitionPatch(changed.toString("utf8")),
  );
});

test("includes the transform configuration in fingerprint sources", () => {
  assert.ok(config.extraSources.some((source) => source.filePath === "fingerprint.config.js"));
  assert.equal(config.ignorePaths, undefined);
  assert.equal(config.sourceSkips, undefined);
});
