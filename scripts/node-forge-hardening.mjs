import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const NODE_FORGE_ADVISORY_URL = "https://github.com/advisories/GHSA-86w9-cpqp-85rv";
export const NODE_FORGE_ORIGINAL_SHA256 =
  "fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50";
export const NODE_FORGE_PATCHED_SHA256 =
  "acc22e5d36e27832c34e02dd3933aad7977d45b047eead5016520735efedc9c5";
const archiveIntegrity =
  "sha512-LarFH0+6VfriEhqMMcLX2F7SwSXeWwnEAJEsYm5QKWchiVYVvJyV9v7UDvUv+w5HO23ZpQTXDv/GxdDdMyOuoQ==";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const proofs = new WeakSet();
const before = [
  "          // validate DigestInfo structure and element count",
  "          var capture = {};",
  "          var errors = [];",
  "          if(!asn1.validate(obj, digestInfoValidator, capture, errors) ||",
  "            obj.value.length !== 2) {",
].join("\n");
const after = [
  "          // validate DigestInfo structure and element counts (outer DigestInfo",
  "          // and nested DigestAlgorithm). asn1.validate ignores extra children,",
  "          // so length must be checked explicitly at each nesting level to",
  "          // prevent low-exponent PKCS#1 v1.5 signature forgery (CVE-2026-85393).",
  "          var capture = {};",
  "          var errors = [];",
  "          if(!asn1.validate(obj, digestInfoValidator, capture, errors) ||",
  "            obj.value.length !== 2 ||",
  "            obj.value[0].value.length !==",
  "              (('parameters' in capture) ? 2 : 1)) {",
].join("\n");

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function installedTarget(root) {
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const copies = Object.entries(lock.packages ?? {}).filter(([name]) =>
    name.endsWith("/node-forge"),
  );
  if (
    copies.length !== 1 ||
    copies[0][0] !== "node_modules/node-forge" ||
    copies[0][1].version !== "1.4.0" ||
    copies[0][1].integrity !== archiveIntegrity
  )
    throw new Error("NODE_FORGE_LOCK_IDENTITY");
  const packagePath = join(root, "node_modules/node-forge/package.json");
  const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
  if (metadata.version !== "1.4.0" || metadata.name !== "node-forge")
    throw new Error("NODE_FORGE_INSTALLED_VERSION");
  const file = join(root, "node_modules/node-forge/lib/rsa.js");
  const actual = realpathSync(file);
  const location = relative(realpathSync(root), actual).replaceAll("\\", "/");
  if (location !== "node_modules/node-forge/lib/rsa.js")
    throw new Error("NODE_FORGE_TARGET_OUTSIDE_CHECKOUT");
  for (const [parent, entry] of Object.entries(lock.packages)) {
    if (!entry.dependencies?.["node-forge"]) continue;
    const parentFile = join(root, parent, "package.json");
    if (!existsSync(parentFile)) throw new Error("NODE_FORGE_PARENT_MISSING");
    const parentRequire = createRequire(parentFile);
    if (realpathSync(parentRequire.resolve("node-forge/lib/rsa.js")) !== actual)
      throw new Error("NODE_FORGE_PARENT_RESOLUTION");
  }
  return file;
}

/** Apply only the exact 1.4.0 -> upstream PR #1152 post-image; never change the package version. */
export function applyNodeForgeHardening(root = repoRoot) {
  const file = installedTarget(root);
  const original = readFileSync(file);
  const digest = hash(original);
  if (digest === NODE_FORGE_PATCHED_SHA256) return verifyNodeForgeHardening(root);
  if (digest !== NODE_FORGE_ORIGINAL_SHA256) throw new Error("NODE_FORGE_UNEXPECTED_SOURCE");
  const text = original.toString("utf8");
  if (text.split(before).length !== 2) throw new Error("NODE_FORGE_PATCH_ANCHOR");
  const patched = text.replace(before, after);
  if (hash(patched) !== NODE_FORGE_PATCHED_SHA256) throw new Error("NODE_FORGE_PATCH_POSTIMAGE");
  writeFileSync(file, patched, "utf8");
  return verifyNodeForgeHardening(root);
}

/** Proof is opaque and cannot be supplied via environment, JSON or a caller-created object. */
export function verifyNodeForgeHardening(root = repoRoot) {
  const file = installedTarget(root);
  if (hash(readFileSync(file)) !== NODE_FORGE_PATCHED_SHA256)
    throw new Error("NODE_FORGE_HARDENING_MISSING");
  const proof = Object.freeze({ nodes: Object.freeze(["node_modules/node-forge"]) });
  proofs.add(proof);
  return proof;
}

export function isVerifiedNodeForgeHardening(proof) {
  return typeof proof === "object" && proof !== null && proofs.has(proof);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const command = process.argv[2];
    if (command === "apply") applyNodeForgeHardening();
    else if (command === "verify") verifyNodeForgeHardening();
    else throw new Error("NODE_FORGE_COMMAND");
    console.log(`node-forge 1.4.0: verified local RSA hardening (${NODE_FORGE_PATCHED_SHA256}).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
