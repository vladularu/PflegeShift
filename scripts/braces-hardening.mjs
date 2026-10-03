import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BRACES_ADVISORY_URL = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
export const BRACES_UPSTREAM_COMMIT = "28d440b5dd449dbf1fe6f3506cf94ecca4d02660";
export const BRACES_ARCHIVE_INTEGRITY =
  "sha512-yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==";
const manifestSha256 = "535775f30a9589405694ae79427e0dc3db751df5dacf89c7cba725bcceb8041c";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const proofs = new WeakMap();
const files = [
  "index.js",
  "lib/compile.js",
  "lib/constants.js",
  "lib/expand.js",
  "lib/parse.js",
  "lib/stringify.js",
  "lib/utils.js",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function manifest() {
  const bytes = readFileSync(new URL("./braces-hardening.patch.json", import.meta.url));
  if (hash(bytes) !== manifestSha256) throw new Error("BRACES_MANIFEST_HASH");
  const data = JSON.parse(bytes);
  if (
    data.commit !== BRACES_UPSTREAM_COMMIT ||
    JSON.stringify(data.files.map((item) => item.path)) !== JSON.stringify(files)
  )
    throw new Error("BRACES_MANIFEST_IDENTITY");
  return data.files;
}

function contained(root, file, expected) {
  const actual = realpathSync(file);
  if (relative(realpathSync(root), actual).replaceAll("\\", "/") !== expected)
    throw new Error("BRACES_TARGET_OUTSIDE_CHECKOUT");
  return actual;
}

function installedTargets(root) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const copies = Object.entries(lock.packages ?? {}).filter(([name]) => name.endsWith("/braces"));
  if (
    pkg.overrides?.braces !== "3.0.3" ||
    copies.length !== 1 ||
    copies[0][0] !== "node_modules/braces" ||
    copies[0][1].version !== "3.0.3" ||
    copies[0][1].integrity !== BRACES_ARCHIVE_INTEGRITY ||
    copies[0][1].resolved !== "https://registry.npmjs.org/braces/-/braces-3.0.3.tgz"
  )
    throw new Error("BRACES_LOCK_IDENTITY");
  const packagePath = join(root, "node_modules/braces/package.json");
  contained(root, packagePath, "node_modules/braces/package.json");
  const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
  if (metadata.name !== "braces" || metadata.version !== "3.0.3")
    throw new Error("BRACES_INSTALLED_VERSION");
  const targets = manifest().map((entry) => {
    const location = "node_modules/braces/" + entry.path;
    const file = join(root, location);
    const actual = contained(root, file, location);
    return { ...entry, file, actual };
  });
  const index = targets.find((entry) => entry.path === "index.js").actual;
  const parse = targets.find((entry) => entry.path === "lib/parse.js").actual;
  for (const [parent, entry] of Object.entries(lock.packages)) {
    if (!entry.dependencies?.braces) continue;
    const parentFile = join(root, parent, "package.json");
    if (!existsSync(parentFile)) throw new Error("BRACES_PARENT_MISSING");
    const require = createRequire(parentFile);
    if (
      realpathSync(require.resolve("braces")) !== index ||
      realpathSync(require.resolve("braces/lib/parse.js")) !== parse
    )
      throw new Error("BRACES_PARENT_RESOLUTION");
  }
  return targets;
}

/** Only exact npm 3.0.3 originals or the reviewed PR #72 postimages are accepted. */
export function applyBracesHardening(root = repoRoot) {
  const targets = installedTargets(root);
  const states = targets.map((entry) => ({ ...entry, digest: hash(readFileSync(entry.file)) }));
  if (states.every((entry) => entry.digest === entry.patchedSha256))
    return verifyBracesHardening(root);
  if (!states.every((entry) => entry.digest === entry.originalSha256))
    throw new Error("BRACES_UNEXPECTED_SOURCE");
  // Validate every source and postimage before any write; reject mixed/unknown installations.
  for (const entry of states) {
    if (
      hash(entry.originalSource) !== entry.originalSha256 ||
      hash(entry.patchedSource) !== entry.patchedSha256
    )
      throw new Error("BRACES_PATCH_POSTIMAGE");
  }
  for (const entry of states) {
    if (entry.originalSha256 !== entry.patchedSha256)
      writeFileSync(entry.file, entry.patchedSource, "utf8");
  }
  return verifyBracesHardening(root);
}

/** Opaque evidence; caller-created objects, JSON and environment flags are not accepted. */
export function verifyBracesHardening(root = repoRoot) {
  const targets = installedTargets(root);
  if (targets.some((entry) => hash(readFileSync(entry.file)) !== entry.patchedSha256))
    throw new Error("BRACES_HARDENING_MISSING");
  const proof = Object.freeze({ nodes: Object.freeze(["node_modules/braces"]) });
  proofs.set(proof, realpathSync(root));
  return proof;
}

export function isVerifiedBracesHardening(proof) {
  return (
    typeof proof === "object" && proof !== null && proofs.get(proof) === realpathSync(repoRoot)
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const command = process.argv[2];
    if (command === "apply") applyBracesHardening();
    else if (command === "verify") verifyBracesHardening();
    else throw new Error("BRACES_COMMAND");
    console.log(
      "braces 3.0.3: verified upstream nesting-depth hardening (" + BRACES_UPSTREAM_COMMIT + ").",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
