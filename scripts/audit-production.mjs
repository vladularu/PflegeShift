import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

export function evaluateAuditReport(report) {
  const vulnerabilities = report?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== "object") {
    throw new Error("npm audit lieferte keinen auswertbaren Vulnerability-Report.");
  }

  const blocking = new Map();

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
      blocking.set(findingKey(finding), finding);
    }
  }

  return {
    approved: [],
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
    evaluation = evaluateAuditReport(report);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  for (const finding of evaluation.approved) {
    printFinding("Voruebergehend freigegeben:", finding);
  }

  if (evaluation.blocking.length > 0) {
    console.error("Nicht freigegebene hohe oder kritische Advisories:");
    for (const finding of evaluation.blocking) {
      printFinding("-", finding);
    }
    return 1;
  }

  const counts = report.metadata?.vulnerabilities ?? {};
  console.log(
    `Produktions-Audit bestanden: keine nicht freigegebenen hohen oder kritischen Advisories ` +
      `(${counts.high ?? 0} betroffene Meta-Pakete, ${evaluation.approved.length} befristete Upstream-Ausnahmen).`,
  );
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runProductionAudit();
}
