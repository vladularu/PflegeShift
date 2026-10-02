import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAuditReport } from "./audit-production.mjs";

const allowedImageSizeAdvisory = {
  source: 1138808,
  name: "image-size",
  severity: "high",
  title: "ICNS parser denial of service",
  url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
};

function report(vulnerabilities) {
  return { vulnerabilities };
}

test("blocks the formerly approved image-size advisory and its cyclic meta chain", () => {
  const result = evaluateAuditReport(
    report({
      "image-size": { severity: "high", via: [allowedImageSizeAdvisory] },
      metro: { severity: "high", via: ["image-size"] },
      "virtualized-lists": { severity: "high", via: ["react-native"] },
      "react-native": { severity: "high", via: ["metro", "virtualized-lists"] },
    }),
    new Date("2026-08-14T00:00:00Z"),
  );

  assert.deepEqual(result.blocking, [allowedImageSizeAdvisory]);
  assert.deepEqual(result.approved, []);
});

test("blocks an unrelated high advisory", () => {
  const unrelated = {
    source: 9999999,
    name: "another-package",
    severity: "high",
    title: "Unexpected vulnerability",
    url: "https://github.com/advisories/GHSA-xxxx-xxxx-xxxx",
  };
  const result = evaluateAuditReport(
    report({ "another-package": { severity: "high", via: [unrelated] } }),
    new Date("2026-08-14T00:00:00Z"),
  );

  assert.deepEqual(result.blocking, [unrelated]);
  assert.equal(result.approved.length, 0);
});

test("blocks an advisory that spoofs an approved source with another URL", () => {
  const spoofed = {
    ...allowedImageSizeAdvisory,
    url: "https://github.com/advisories/GHSA-xxxx-xxxx-xxxx",
  };
  const result = evaluateAuditReport(
    report({ "image-size": { severity: "high", via: [spoofed] } }),
    new Date("2026-08-14T00:00:00Z"),
  );

  assert.deepEqual(result.blocking, [spoofed]);
  assert.equal(result.approved.length, 0);
});

test("blocks the second formerly approved image-size advisory", () => {
  const advisory = {
    ...allowedImageSizeAdvisory,
    source: 1138809,
    url: "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
  };
  const result = evaluateAuditReport(
    report({ "image-size": { severity: "high", via: [advisory] } }),
    new Date("2026-09-15T00:00:00Z"),
  );

  assert.deepEqual(result.blocking, [advisory]);
  assert.equal(result.approved.length, 0);
});

test("does not block moderate advisories", () => {
  const result = evaluateAuditReport(
    report({
      uuid: {
        severity: "moderate",
        via: [
          {
            source: 1119441,
            name: "uuid",
            severity: "moderate",
            title: "Bounds check",
            url: "https://github.com/advisories/GHSA-w5hq-g745-h8pq",
          },
        ],
      },
    }),
    new Date("2026-08-14T00:00:00Z"),
  );

  assert.equal(result.blocking.length, 0);
  assert.equal(result.approved.length, 0);
});
import { NODE_FORGE_ADVISORY_URL, verifyNodeForgeHardening } from "./node-forge-hardening.mjs";
const forgeAdvisory = {
  source: 1240912,
  name: "node-forge",
  dependency: "node-forge",
  severity: "high",
  title:
    "node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements",
  url: NODE_FORGE_ADVISORY_URL,
  range: "<=1.4.0",
};
const forgeReport = (advisory = forgeAdvisory, nodes = ["node_modules/node-forge"]) =>
  report({
    "node-forge": { severity: "high", via: [advisory], nodes },
  });

test("blocks node-forge without an opaque proof of installed hardening", () => {
  const proof = verifyNodeForgeHardening();
  for (const fake of [undefined, true, { nodes: proof.nodes }, JSON.parse(JSON.stringify(proof))]) {
    const result = evaluateAuditReport(forgeReport(), fake);
    assert.deepEqual(result.blocking, [forgeAdvisory]);
    assert.deepEqual(result.mitigated, []);
  }
});

test("records the exact hardened advisory and its cyclic meta chain as mitigated", () => {
  const input = forgeReport();
  input.vulnerabilities.cli = { severity: "high", via: ["node-forge", "expo"] };
  input.vulnerabilities.expo = { severity: "high", via: ["cli"] };
  const result = evaluateAuditReport(input, verifyNodeForgeHardening());
  assert.deepEqual(result.blocking, []);
  assert.deepEqual(result.approved, []);
  assert.deepEqual(result.mitigated, [forgeAdvisory]);
});

test("blocks changed advisory identity, severity, range or title even with installed hardening", () => {
  const proof = verifyNodeForgeHardening();
  for (const change of [
    { source: 9999 },
    { name: "another-package" },
    { dependency: "another-package" },
    { severity: "critical" },
    { range: "<=1.4.1" },
    { title: "Another issue" },
    { url: "https://github.com/advisories/GHSA-xxxx-xxxx-xxxx" },
  ]) {
    const advisory = { ...forgeAdvisory, ...change };
    assert.deepEqual(evaluateAuditReport(forgeReport(advisory), proof).blocking, [advisory]);
  }
});

test("blocks additional, unexpected, absent or malformed audited install locations", () => {
  const proof = verifyNodeForgeHardening();
  for (const nodes of [
    [],
    ["node_modules/other/node_modules/node-forge"],
    ["node_modules/node-forge", "node_modules/other/node_modules/node-forge"],
    undefined,
    "node_modules/node-forge",
  ]) {
    const input = forgeReport();
    input.vulnerabilities["node-forge"].nodes = nodes;
    assert.deepEqual(evaluateAuditReport(input, proof).blocking, [forgeAdvisory]);
  }
});

test("a verified node-forge backport never exempts unrelated high advisories", () => {
  const input = forgeReport();
  input.vulnerabilities["image-size"] = { severity: "high", via: [allowedImageSizeAdvisory] };
  const result = evaluateAuditReport(input, verifyNodeForgeHardening());
  assert.deepEqual(result.blocking, [allowedImageSizeAdvisory]);
  assert.deepEqual(result.mitigated, [forgeAdvisory]);
  assert.deepEqual(result.approved, []);
});
