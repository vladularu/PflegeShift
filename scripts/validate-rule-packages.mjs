import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  validateRuleCatalog,
  validateRuleCatalogPublicationRequest,
  validateRulePackage,
} from "../src/rules/validation.ts";

const workspaceRoot = process.cwd();
const requestedPaths = process.argv.slice(2);
const inputPaths =
  requestedPaths.length > 0
    ? requestedPaths
    : [
        "rules/examples/manifest.valid.json",
        "rules/examples/tariff-package.valid.json",
        "rules/examples/legal-package.valid.json",
        "rules/examples/holiday-package.valid.json",
      ];
const validateBundledLegacy = requestedPaths.length === 0;

async function readJson(inputPath) {
  const absolutePath = path.resolve(workspaceRoot, inputPath);
  return JSON.parse(await fs.readFile(absolutePath, "utf8"));
}

if (inputPaths.length < 2) {
  console.error("Usage: validate-rule-packages <manifest.json> <package.json> [...]");
  process.exitCode = 2;
} else {
  const [manifest, ...packages] = await Promise.all(inputPaths.map(readJson));
  const result = validateRuleCatalog(manifest, packages);
  if (!result.ok) {
    for (const validationIssue of result.issues) {
      console.error(`${validationIssue.code} ${validationIssue.path}: ${validationIssue.message}`);
    }
    process.exitCode = 1;
  } else {
    if (validateBundledLegacy) {
      const publicationRequest = await readJson("rules/examples/publication-request.valid.json");
      const publicationRequestResult = validateRuleCatalogPublicationRequest(publicationRequest);
      if (!publicationRequestResult.ok) {
        for (const validationIssue of publicationRequestResult.issues) {
          console.error(
            `publication-request.valid.json ${validationIssue.code} ${validationIssue.path}: ${validationIssue.message}`,
          );
        }
        process.exitCode = 1;
      } else {
        console.log("Validated the rule catalog publication request contract fixture.");
      }

      const legacyDirectory = path.join(workspaceRoot, "rules/packages/legacy");
      let legacyFiles = [];
      try {
        legacyFiles = (await fs.readdir(legacyDirectory))
          .filter((fileName) => fileName.endsWith(".json"))
          .sort();
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      for (const fileName of legacyFiles) {
        const legacyPackage = await readJson(path.join(legacyDirectory, fileName));
        const legacyResult = validateRulePackage(legacyPackage);
        if (!legacyResult.ok) {
          for (const validationIssue of legacyResult.issues) {
            console.error(
              `${fileName} ${validationIssue.code} ${validationIssue.path}: ${validationIssue.message}`,
            );
          }
          process.exitCode = 1;
        } else if (legacyResult.value.status !== "LEGACY_EMBEDDED") {
          console.error(`${fileName} must remain LEGACY_EMBEDDED.`);
          process.exitCode = 1;
        }
      }
      if (legacyFiles.length > 0 && process.exitCode !== 1) {
        console.log(`Validated ${legacyFiles.length} bundled legacy rule packages.`);
      }
    }
    console.log(
      `Validated generation ${result.value.manifest.generation} with ${result.value.packages.length} rule packages.`,
    );
  }
}
