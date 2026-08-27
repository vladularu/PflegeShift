import { readFileSync } from "node:fs";
import { relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = process.cwd();
const CONFIG_PATH = `${PROJECT_ROOT}/tsconfig.json`;
const EXPECTED_INCLUDE = [
  "app/**/*.ts",
  "app/**/*.tsx",
  "src/**/*.ts",
  "src/**/*.tsx",
  "modules/**/*.ts",
  "modules/**/*.tsx",
  "scripts/**/*.ts",
  "scripts/**/*.tsx",
  "app.config.ts",
  "vitest.config.ts",
  ".expo/types/**/*.ts",
  "expo-env.d.ts",
];
const ALLOWED_DIRECTORIES = ["app/", "src/", "modules/", "scripts/", ".expo/types/"];
const ALLOWED_ROOT_FILES = new Set(["app.config.ts", "vitest.config.ts", "expo-env.d.ts"]);

function projectPath(file: string): string {
  return relative(PROJECT_ROOT, file).replaceAll("\\", "/");
}

describe("TypeScript project scope", () => {
  it("only includes versioned project source roots", () => {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as {
      readonly include?: readonly string[];
    };
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, PROJECT_ROOT);
    const files = parsed.fileNames.map(projectPath);
    const unexpectedFiles = files.filter(
      (file) =>
        !ALLOWED_ROOT_FILES.has(file) &&
        !ALLOWED_DIRECTORIES.some((directory) => file.startsWith(directory)),
    );

    expect(config.include).toEqual(EXPECTED_INCLUDE);
    expect(unexpectedFiles).toEqual([]);
    expect(files.some((file) => file.startsWith("artifacts/"))).toBe(false);
  });
});
