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
