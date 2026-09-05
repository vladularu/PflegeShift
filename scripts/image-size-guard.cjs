const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync, realpathSync } = require("node:fs");
const { createRequire } = require("node:module");
const { join, resolve } = require("node:path");

const packagePath = "node_modules/image-size";
const version = "1.2.1";
const parsers = [
  {
    name: "icns",
    symbol: "ICNS",
    hash: "5e6a097fca237b0bb3b68a1be920e39a3846c0018d8917658b5ed88590a710e8",
  },
  {
    name: "heif",
    symbol: "HEIF",
    hash: "21c673dbce64e0fe43c27e43442ba1c8da2492c375aa78493357cb80d4d61138",
  },
  {
    name: "jxl",
    symbol: "JXL",
    hash: "2958da1fbda466a2aff5769e3353dc8da6848ae1be0e1f9ec6cd7af25f759721",
  },
];

function guardPrefix(parser) {
  // Return from the CommonJS module BEFORE upstream validation or parsing runs.
  // Preserve the original bytes below for exact, idempotent source verification.
  return `"use strict";
// LUNA Shift: build-only mitigation for GHSA-w3rx-r6r6-pgpr / GHSA-5p2g-fcmc-qvqq.
Object.defineProperty(exports, "__esModule", { value: true });
exports.${parser.symbol} = Object.freeze({
  validate() { return false; },
  calculate() { throw new TypeError("LUNA Shift: ${parser.name} parser disabled"); }
});
return;
`;
}

function patchSource(source, parser) {
  const prefix = guardPrefix(parser);
  const original = source.startsWith(prefix) ? source.slice(prefix.length) : source;
  const hash = createHash("sha256").update(original).digest("hex");
  if (hash !== parser.hash) {
    throw new Error(
      `image-size guard: unexpected ${parser.name} source; review dependency changes.`,
    );
  }
  return prefix + original;
}

function guardImageSize(root = resolve(__dirname, ".."), { check = false } = {}) {
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const copies = Object.keys(lock.packages ?? {}).filter((key) =>
    /(^|\/)node_modules\/image-size$/.test(key),
  );
  if (
    copies.length !== 1 ||
    copies[0] !== packagePath ||
    lock.packages[packagePath].version !== version
  ) {
    throw new Error(
      "image-size guard: expected exactly one locked image-size@1.2.1; review dependency changes.",
    );
  }
  const target = join(root, packagePath);
  const metadata = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
  if (
    metadata.name !== "image-size" ||
    metadata.version !== version ||
    metadata.main !== "dist/index.js"
  ) {
    throw new Error("image-size guard: unexpected installed package.");
  }
  const expectedEntry = realpathSync(join(target, "dist/index.js"));
  const rootRequire = createRequire(join(root, "package.json"));
  const metroRequire = createRequire(rootRequire.resolve("metro/package.json"));
  for (const resolver of [rootRequire, metroRequire]) {
    if (realpathSync(resolver.resolve("image-size")) !== expectedEntry) {
      throw new Error("image-size guard: unprotected image-size resolution.");
    }
  }
  // Validate ALL files before any write. Unknown versions/sources must fail closed.
  const changes = parsers.map((parser) => {
    const path = join(target, "dist/types", `${parser.name}.js`);
    const before = readFileSync(path, "utf8");
    return { path, before, after: patchSource(before, parser) };
  });
  if (check && changes.some(({ before, after }) => before !== after)) {
    throw new Error("image-size guard missing. Run npm run security:patch before starting Metro.");
  }
  if (!check) {
    for (const { path, before, after } of changes) {
      if (before !== after) writeFileSync(path, after);
    }
  }
}

module.exports = { guardImageSize, guardPrefix, patchSource, parsers };

if (require.main === module) {
  try {
    guardImageSize(undefined, { check: process.argv.includes("--check") });
    console.log("image-size@1.2.1: ICNS, HEIF/HEIC/AVIF and container JXL parsers blocked.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
