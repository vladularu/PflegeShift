import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(process.cwd(), "src");

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.(test|component\.test)\./.test(entry.name)) {
      return [];
    }
    return [path];
  });
}

function aliasedImports(source: string): readonly string[] {
  return [...source.matchAll(/from\s+["']@\/([^"']+)["']/g)].map((match) => match[1]);
}

describe("architecture boundaries", () => {
  it.each([
    ["domain", /^(application|features|infrastructure|navigation|theme|ui)\//],
    ["engine", /^(application|features|infrastructure|navigation|theme|ui)\//],
    ["infrastructure", /^(application|features|navigation|theme|ui)\//],
  ] as const)("keeps %s independent from outer layers", (layer, forbidden) => {
    const violations = sourceFiles(join(SOURCE_ROOT, layer)).flatMap((file) =>
      aliasedImports(readFileSync(file, "utf8"))
        .filter((dependency) => forbidden.test(dependency))
        .map((dependency) => `${relative(SOURCE_ROOT, file)} -> ${dependency}`),
    );

    expect(violations).toEqual([]);
  });

  it("does not grow the current application-to-infrastructure coupling", () => {
    const allowedDependencies = new Set([
      "application/pflegeshift-provider.tsx -> infrastructure/database/repository",
      "application/pflegeshift-provider.tsx -> infrastructure/database/test-backup-status-repository",
      "application/pflegeshift-provider.tsx -> infrastructure/dev-tools-policy",
      "application/pflegeshift-provider.tsx -> infrastructure/diagnostics",
      "application/pflegeshift-provider.tsx -> infrastructure/notifications/entry-notifications",
    ]);
    const violations = sourceFiles(join(SOURCE_ROOT, "application")).flatMap((file) =>
      aliasedImports(readFileSync(file, "utf8"))
        .filter((dependency) => dependency.startsWith("infrastructure/"))
        .map(
          (dependency) => `${relative(SOURCE_ROOT, file).replaceAll("\\", "/")} -> ${dependency}`,
        )
        .filter((dependency) => !allowedDependencies.has(dependency)),
    );

    expect(violations).toEqual([]);
  });

  it.each([
    ["engine/compliance.ts", 800],
    ["engine/pay.ts", 650],
    ["application/pflegeshift-provider.tsx", 462],
    ["features/templates/template-editor-screen.tsx", 948],
    ["features/day-editor/day-editor-form.tsx", 886],
    ["features/analysis/analysis-overview-cards.tsx", 818],
    ["features/day-editor/shift-edit-overlay.tsx", 729],
    ["features/calendar/month-card.tsx", 683],
    ["features/day-editor/shift-notification-overlay.tsx", 667],
    ["features/calendar/calendar-screen.tsx", 660],
    ["features/day-editor/day-editor-screen.tsx", 685],
    ["features/analysis/analysis-screen.tsx", 725],
    ["infrastructure/database/repository-core.ts", 666],
    ["infrastructure/database/repository.ts", 600],
    ["ui/form-controls.tsx", 560],
  ] as const)("keeps %s within its refactoring budget", (file, maximumLines) => {
    const lineCount = readFileSync(join(SOURCE_ROOT, file), "utf8").split(/\r?\n/).length;
    expect(lineCount).toBeLessThanOrEqual(maximumLines);
  });
});
