import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);

function componentTests(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return componentTests(path);
    return entry.isFile() && entry.name.endsWith(".component.test.tsx") ? [path] : [];
  });
}

it("discovers every source component test with the default Jest configuration", () => {
  const output = execFileSync(
    process.execPath,
    [require.resolve("jest/bin/jest"), "--listTests", "--json", "--runInBand"],
    { cwd: projectRoot, encoding: "utf8", timeout: 30_000 },
  );
  const normalize = (path: string) => relative(projectRoot, resolve(path)).replaceAll("\\", "/");
  const expected = componentTests(join(projectRoot, "src")).map(normalize).sort();
  const discovered = (JSON.parse(output) as string[]).map(normalize).sort();

  expect(expected.length).toBeGreaterThan(0);
  expect(discovered).toEqual(expected);
}, 35_000);
