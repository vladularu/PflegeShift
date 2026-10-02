import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, privateEncrypt, constants, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import forge from "node-forge";
import {
  applyNodeForgeHardening,
  verifyNodeForgeHardening,
  isVerifiedNodeForgeHardening,
  NODE_FORGE_ORIGINAL_SHA256,
  NODE_FORGE_PATCHED_SHA256,
} from "./node-forge-hardening.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const patchedBytes = readFileSync(join(root, "node_modules/node-forge/lib/rsa.js"));
const lockEntry = JSON.parse(readFileSync(join(root, "package-lock.json"))).packages[
  "node_modules/node-forge"
];
function fixture({ source = patchedBytes, version = "1.4.0", entry = lockEntry, extra = {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "luna-forge-test-"));
  mkdirSync(join(directory, "node_modules/node-forge/lib"), { recursive: true });
  writeFileSync(
    join(directory, "package-lock.json"),
    JSON.stringify({ packages: { "node_modules/node-forge": entry, ...extra } }),
  );
  writeFileSync(
    join(directory, "node_modules/node-forge/package.json"),
    JSON.stringify({ name: "node-forge", version }),
  );
  writeFileSync(join(directory, "node_modules/node-forge/lib/rsa.js"), source);
  return directory;
}

test("verifies the installed hash and creates only opaque registered proofs", () => {
  assert.equal(createHash("sha256").update(patchedBytes).digest("hex"), NODE_FORGE_PATCHED_SHA256);
  const proof = verifyNodeForgeHardening();
  assert.ok(isVerifiedNodeForgeHardening(proof));
  assert.ok(Object.isFrozen(proof));
  assert.ok(Object.isFrozen(proof.nodes));
  for (const fake of [null, true, { nodes: proof.nodes }, JSON.parse(JSON.stringify(proof))])
    assert.equal(isVerifiedNodeForgeHardening(fake), false);
});

test("applies the exact upstream postimage and is idempotent", () => {
  const after = [
    "          // validate DigestInfo structure and element counts (outer DigestInfo",
    "          // and nested DigestAlgorithm). asn1.validate ignores extra children,",
    "          // so length must be checked explicitly at each nesting level to",
    "          // prevent low-exponent PKCS#1 v1.5 signature forgery (CVE-2026-85393).",
    "          var capture = {};",
    "          var errors = [];",
    "          if(!asn1.validate(obj, digestInfoValidator, capture, errors) ||",
    "            obj.value.length !== 2 ||",
    "            obj.value[0].value.length !==",
    "              (('parameters' in capture) ? 2 : 1)) {",
  ].join("\n");
  const before = [
    "          // validate DigestInfo structure and element count",
    "          var capture = {};",
    "          var errors = [];",
    "          if(!asn1.validate(obj, digestInfoValidator, capture, errors) ||",
    "            obj.value.length !== 2) {",
  ].join("\n");
  const original = patchedBytes.toString("utf8").replace(after, before);
  assert.equal(createHash("sha256").update(original).digest("hex"), NODE_FORGE_ORIGINAL_SHA256);
  const directory = fixture({ source: original });
  assert.throws(() => verifyNodeForgeHardening(directory), /NODE_FORGE_HARDENING_MISSING/);
  assert.ok(isVerifiedNodeForgeHardening(applyNodeForgeHardening(directory)));
  assert.deepEqual(
    readFileSync(join(directory, "node_modules/node-forge/lib/rsa.js")),
    patchedBytes,
  );
  applyNodeForgeHardening(directory);
  assert.deepEqual(
    readFileSync(join(directory, "node_modules/node-forge/lib/rsa.js")),
    patchedBytes,
  );
});

test("fails closed for version, archive identity, extra copies and altered source", () => {
  assert.throws(
    () => applyNodeForgeHardening(fixture({ version: "1.4.1" })),
    /NODE_FORGE_INSTALLED_VERSION/,
  );
  assert.throws(
    () => applyNodeForgeHardening(fixture({ entry: { ...lockEntry, integrity: "unknown" } })),
    /NODE_FORGE_LOCK_IDENTITY/,
  );
  assert.throws(
    () =>
      applyNodeForgeHardening(
        fixture({ extra: { "node_modules/parent/node_modules/node-forge": lockEntry } }),
      ),
    /NODE_FORGE_LOCK_IDENTITY/,
  );
  const altered = fixture({ source: Buffer.concat([patchedBytes, Buffer.from("\n// changed\n")]) });
  assert.throws(() => applyNodeForgeHardening(altered), /NODE_FORGE_UNEXPECTED_SOURCE/);
  assert.throws(() => verifyNodeForgeHardening(altered), /NODE_FORGE_HARDENING_MISSING/);
});

test("fails closed when a locked parent does not resolve the verified installed copy", () => {
  const extra = { "node_modules/test-parent": { dependencies: { "node-forge": "^1.3.3" } } };
  const directory = fixture({ extra });
  assert.throws(() => verifyNodeForgeHardening(directory), /NODE_FORGE_PARENT_MISSING/);
  mkdirSync(join(directory, "node_modules/test-parent/node_modules/node-forge/lib"), {
    recursive: true,
  });
  writeFileSync(join(directory, "node_modules/test-parent/package.json"), "{}");
  writeFileSync(
    join(directory, "node_modules/test-parent/node_modules/node-forge/lib/rsa.js"),
    patchedBytes,
  );
  assert.throws(() => verifyNodeForgeHardening(directory), /NODE_FORGE_PARENT_RESOLUTION/);
});

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKey = forge.pki.publicKeyFromPem(
  keys.publicKey.export({ type: "spki", format: "pem" }),
);
const message = Buffer.from("luna-node-forge-controlled-regression");
const digest = createHash("sha256").update(message).digest("latin1");
const asn1 = forge.asn1;
const element = (type, constructed, value) =>
  asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
function digestInfoSignature({ withNull = true, extra = null } = {}) {
  const algorithm = [
    element(asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.sha256).getBytes()),
  ];
  if (withNull) algorithm.push(element(asn1.Type.NULL, false, ""));
  if (extra) algorithm.push(extra);
  const info = element(asn1.Type.SEQUENCE, true, [
    element(asn1.Type.SEQUENCE, true, algorithm),
    element(asn1.Type.OCTETSTRING, false, digest),
  ]);
  return privateEncrypt(
    { key: keys.privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(asn1.toDer(info).getBytes(), "latin1"),
  );
}

test("accepts standard Node signatures and rejects a changed digest", () => {
  const signature = sign("sha256", message, keys.privateKey).toString("latin1");
  assert.equal(publicKey.verify(digest, signature), true);
  assert.equal(
    publicKey.verify(createHash("sha256").update("different message").digest("latin1"), signature),
    false,
  );
});

test("accepts valid DigestAlgorithm structures with optional NULL", () => {
  for (const withNull of [true, false])
    assert.equal(
      publicKey.verify(digest, digestInfoSignature({ withNull }).toString("latin1")),
      true,
    );
});

test("rejects extra nested DigestAlgorithm children with and without NULL", () => {
  for (const withNull of [true, false]) {
    for (const extra of [
      element(asn1.Type.OCTETSTRING, false, "EXTRA"),
      element(asn1.Type.NULL, false, ""),
      element(asn1.Type.SEQUENCE, true, []),
    ]) {
      // A single optional NULL after the OID is valid, so use a third child for this case.
      const signature = digestInfoSignature({
        withNull: !withNull && extra.type === asn1.Type.NULL ? true : withNull,
        extra,
      });
      assert.throws(
        () => publicKey.verify(digest, signature.toString("latin1")),
        /valid RSASSA-PKCS1-v1_5 DigestInfo/,
      );
    }
  }
});

test("rejects a dependency junction outside the checkout before writing", () => {
  const outside = fixture();
  const directory = mkdtempSync(join(tmpdir(), "luna-forge-junction-test-"));
  mkdirSync(join(directory, "node_modules"));
  writeFileSync(
    join(directory, "package-lock.json"),
    JSON.stringify({ packages: { "node_modules/node-forge": lockEntry } }),
  );
  symlinkSync(
    join(outside, "node_modules/node-forge"),
    join(directory, "node_modules/node-forge"),
    "junction",
  );
  assert.throws(() => applyNodeForgeHardening(directory), /NODE_FORGE_TARGET_OUTSIDE_CHECKOUT/);
  assert.deepEqual(readFileSync(join(outside, "node_modules/node-forge/lib/rsa.js")), patchedBytes);
});
