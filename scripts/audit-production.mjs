import {
  BRACES_ADVISORY_URL,
  isVerifiedBracesHardening,
  verifyBracesHardening,
} from "./braces-hardening.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  NODE_FORGE_ADVISORY_URL,
  isVerifiedNodeForgeHardening,
  verifyNodeForgeHardening,
} from "./node-forge-hardening.mjs";

const severityRank = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const minimumSeverity = severityRank.high;

function isAtLeastHigh(severity) {
  return (severityRank[severity] ?? Number.POSITIVE_INFINITY) >= minimumSeverity;
}

function collectHighAdvisories(packageName, vulnerabilities, visited = new Set()) {
  if (visited.has(packageName)) {
    return [];
  }

  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability) {
    return [
      {
        name: packageName,
        severity: "high",
        title: `Unaufgeloeste Audit-Abhaengigkeit: ${packageName}`,
        url: "",
      },
    ];
  }

  const nextVisited = new Set(visited);
  nextVisited.add(packageName);
  const findings = [];

  for (const cause of vulnerability.via ?? []) {
    if (typeof cause === "string") {
      if (isAtLeastHigh(vulnerabilities[cause]?.severity)) {
        findings.push(...collectHighAdvisories(cause, vulnerabilities, nextVisited));
      }
      continue;
    }

    if (isAtLeastHigh(cause.severity)) {
      findings.push(cause);
    }
  }

  if (findings.length === 0 && isAtLeastHigh(vulnerability.severity)) {
    const hasHighDependencyCause = (vulnerability.via ?? []).some(
      (cause) => typeof cause === "string" && isAtLeastHigh(vulnerabilities[cause]?.severity),
    );
    const hasDirectAdvisory = (vulnerability.via ?? []).some(
      (cause) => typeof cause !== "string" && isAtLeastHigh(cause.severity),
    );

    if (!hasHighDependencyCause && !hasDirectAdvisory) {
      findings.push({
        name: packageName,
        severity: vulnerability.severity,
        title: `Hoher Audit-Fund ohne aufloesbare Advisory: ${packageName}`,
        url: "",
      });
    }
  }

  return findings;
}

function findingKey(finding) {
  return `${finding.source ?? "unknown"}:${finding.name}:${finding.url ?? ""}`;
}

function hasVerifiedMitigation(finding, vulnerabilities, proof, bracesProof) {
  const bracesNodes = vulnerabilities.braces?.nodes;
  if (
    isVerifiedBracesHardening(bracesProof) &&
    finding.name === "braces" &&
    finding.dependency === "braces" &&
    finding.source === 1240992 &&
    finding.severity === "high" &&
    finding.url === BRACES_ADVISORY_URL &&
    finding.range === "<=3.0.3" &&
    finding.title ===
      "braces vulnerable to stack-exhaustion denial of service through deeply nested patterns" &&
    Array.isArray(bracesNodes) &&
    bracesNodes.length === bracesProof.nodes.length &&
    bracesNodes.every((node, index) => node === bracesProof.nodes[index])
  )
    return true;
  const nodes = vulnerabilities["node-forge"]?.nodes;
  return (
    isVerifiedNodeForgeHardening(proof) &&
    finding.name === "node-forge" &&
    finding.dependency === "node-forge" &&
    finding.source === 1240912 &&
    finding.severity === "high" &&
    finding.url === NODE_FORGE_ADVISORY_URL &&
    finding.range === "<=1.4.0" &&
    finding.title ===
      "node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements" &&
    Array.isArray(nodes) &&
    nodes.length === proof.nodes.length &&
    nodes.every((node, index) => node === proof.nodes[index])
  );
}

export function evaluateAuditReport(report, hardeningProof, bracesProof) {
  const vulnerabilities = report?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== "object") {
    throw new Error("npm audit lieferte keinen auswertbaren Vulnerability-Report.");
  }

  const blocking = new Map();
  const mitigated = new Map();

  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    if (!isAtLeastHigh(vulnerability.severity)) {
      continue;
    }

    const findings = collectHighAdvisories(packageName, vulnerabilities);
    if (findings.length === 0) {
      blocking.set(`unresolved:${packageName}`, {
        name: packageName,
        severity: vulnerability.severity,
        title: `Hoher Audit-Fund konnte nicht sicher aufgeloest werden: ${packageName}`,
        url: "",
      });
      continue;
    }

    for (const finding of findings) {
      const target = hasVerifiedMitigation(finding, vulnerabilities, hardeningProof, bracesProof)
        ? mitigated
        : blocking;
      target.set(findingKey(finding), finding);
    }
  }

  return {
    approved: [],
    mitigated: [...mitigated.values()],
    blocking: [...blocking.values()],
  };
}

function printFinding(prefix, finding) {
  const reference = finding.url ? ` (${finding.url})` : "";
  console.log(`${prefix} ${finding.name}: ${finding.title}${reference}`);
}

export function runProductionAudit() {
  const npmCliPath = process.env.npm_execpath;
  const npmCommand = npmCliPath ? process.execPath : "npm";
  const npmArguments = npmCliPath
    ? [npmCliPath, "audit", "--omit=dev", "--json"]
    : ["audit", "--omit=dev", "--json"];
  const result = spawnSync(npmCommand, npmArguments, {
    encoding: "utf8",
    shell: !npmCliPath && process.platform === "win32",
  });

  if (result.error) {
    console.error(`npm audit konnte nicht gestartet werden: ${result.error.message}`);
    return 1;
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error("npm audit lieferte kein gueltiges JSON.");
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
    return 1;
  }

  if (report.error) {
    console.error(`npm audit ist fehlgeschlagen: ${report.error.message ?? "unbekannter Fehler"}`);
    return 1;
  }

  if (result.status !== 0 && result.status !== 1) {
    console.error(`npm audit endete unerwartet mit Status ${result.status ?? "unbekannt"}.`);
    return 1;
  }

  let evaluation;
  try {
    evaluation = evaluateAuditReport(report, verifyNodeForgeHardening(), verifyBracesHardening());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  for (const finding of evaluation.mitigated) {
    printFinding("Installierte Haertung verifiziert:", finding);
  }

  if (evaluation.blocking.length > 0) {
    console.error("Nicht behobene hohe oder kritische Advisories:");
    for (const finding of evaluation.blocking) {
      printFinding("-", finding);
    }
    return 1;
  }

  const counts = report.metadata?.vulnerabilities ?? {};
  console.log(
    `Produktions-Audit bestanden: keine unbehobenen hohen oder kritischen Advisories ` +
      `(${counts.high ?? 0} von npm gemeldete hohe Meta-Pakete, ${evaluation.mitigated.length} installierte Backports verifiziert).`,
  );
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runProductionAudit();
}
