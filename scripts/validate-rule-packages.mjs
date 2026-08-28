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

async function findJsonFiles(directory) {
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findJsonFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
    }),
  );

  return nestedFiles.flat().sort();
}

function workspaceRelativePath(inputPath) {
  return path.relative(workspaceRoot, inputPath).split(path.sep).join("/");
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

      const candidateDirectory = path.join(workspaceRoot, "rules/packages/reviewed");
      const candidateFiles = await findJsonFiles(candidateDirectory);
      for (const candidatePath of candidateFiles) {
        const relativePath = workspaceRelativePath(candidatePath);
        const candidatePackage = await readJson(candidatePath);
        const candidateResult = validateRulePackage(candidatePackage);
        if (!candidateResult.ok) {
          for (const validationIssue of candidateResult.issues) {
            console.error(
              `${relativePath} ${validationIssue.code} ${validationIssue.path}: ${validationIssue.message}`,
            );
          }
          process.exitCode = 1;
          continue;
        }

        const expectedPath =
          `rules/packages/reviewed/${candidateResult.value.packageId}/` +
          `${candidateResult.value.versionId}.json`;
        if (relativePath !== expectedPath) {
          console.error(`${relativePath} must match package identity ${expectedPath}.`);
          process.exitCode = 1;
        }
        if (!["DRAFT", "REVIEWED"].includes(candidateResult.value.status)) {
          console.error(`${relativePath} must be DRAFT or REVIEWED before publication.`);
          process.exitCode = 1;
        }
      }
      if (candidateFiles.length > 0 && process.exitCode !== 1) {
        console.log(`Validated ${candidateFiles.length} rule package candidates.`);
      }
    }
    console.log(
      `Validated generation ${result.value.manifest.generation} with ${result.value.packages.length} rule packages.`,
    );
  }
}
