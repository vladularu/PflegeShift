import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import braces from "braces";
import {
  applyBracesHardening,
  verifyBracesHardening,
  isVerifiedBracesHardening,
  BRACES_ARCHIVE_INTEGRITY,
  BRACES_UPSTREAM_COMMIT,
} from "./braces-hardening.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(new URL("./braces-hardening.patch.json", import.meta.url)));
const lockEntry = JSON.parse(readFileSync(join(root, "package-lock.json"))).packages[
  "node_modules/braces"
];

function fixture({
  original = false,
  version = "3.0.3",
  entry = lockEntry,
  pin = "3.0.3",
  extra = {},
  externalLibrary = false,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "luna-braces-test-"));
  mkdirSync(join(dir, "node_modules/braces"), { recursive: true });
  if (externalLibrary) {
    const outside = mkdtempSync(join(tmpdir(), "luna-braces-external-"));
    symlinkSync(
      outside,
      join(dir, "node_modules/braces/lib"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } else {
    mkdirSync(join(dir, "node_modules/braces/lib"));
  }
  writeFileSync(join(dir, "package.json"), JSON.stringify({ overrides: { braces: pin } }));
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify({ packages: { "node_modules/braces": entry, ...extra } }),
  );
  writeFileSync(
    join(dir, "node_modules/braces/package.json"),
    JSON.stringify({ name: "braces", version }),
  );
  for (const file of data.files)
    writeFileSync(
      join(dir, "node_modules/braces", file.path),
      original ? file.originalSource : file.patchedSource,
    );
  return dir;
}

test("records the exact upstream commit and npm archive without inventing a patched version", () => {
  assert.equal(data.commit, BRACES_UPSTREAM_COMMIT);
  assert.equal(lockEntry.version, "3.0.3");
  assert.equal(lockEntry.integrity, BRACES_ARCHIVE_INTEGRITY);
  assert.equal(data.files.filter((item) => item.originalSha256 !== item.patchedSha256).length, 5);
});

test("creates opaque frozen evidence only for the actual audit checkout", () => {
  const proof = verifyBracesHardening();
  assert.ok(isVerifiedBracesHardening(proof));
  assert.ok(Object.isFrozen(proof));
  assert.ok(Object.isFrozen(proof.nodes));
  for (const fake of [null, true, { nodes: proof.nodes }, JSON.parse(JSON.stringify(proof))])
    assert.equal(isVerifiedBracesHardening(fake), false);
  assert.equal(isVerifiedBracesHardening(verifyBracesHardening(fixture())), false);
});

test("applies only the complete original and is byte-for-byte idempotent", () => {
  const dir = fixture({ original: true });
  assert.throws(() => verifyBracesHardening(dir), /BRACES_HARDENING_MISSING/);
  applyBracesHardening(dir);
  for (const file of data.files)
    assert.equal(
      readFileSync(join(dir, "node_modules/braces", file.path), "utf8"),
      file.patchedSource,
    );
  applyBracesHardening(dir);
  verifyBracesHardening(dir);
});

test("rejects mixed installations and unknown source before any writes", () => {
  const dir = fixture({ original: true });
  const altered = data.files.find((file) => file.originalSha256 !== file.patchedSha256);
  const target = join(dir, "node_modules/braces", altered.path);
  writeFileSync(target, altered.patchedSource);
  assert.throws(() => applyBracesHardening(dir), /BRACES_UNEXPECTED_SOURCE/);
  writeFileSync(target, altered.originalSource + "\n// changed\n");
  const before = data.files.map((file) =>
    readFileSync(join(dir, "node_modules/braces", file.path), "utf8"),
  );
  assert.throws(() => applyBracesHardening(dir), /BRACES_UNEXPECTED_SOURCE/);
  assert.deepEqual(
    data.files.map((file) => readFileSync(join(dir, "node_modules/braces", file.path), "utf8")),
    before,
  );
});

test("rejects wrong pin, version, integrity, URL or extra lock copies", () => {
  for (const options of [
    { pin: "^3.0.3" },
    { entry: { ...lockEntry, version: "3.0.4" } },
    { entry: { ...lockEntry, integrity: "sha512-other" } },
    { entry: { ...lockEntry, resolved: "https://example.invalid/braces.tgz" } },
    { extra: { "node_modules/other/node_modules/braces": lockEntry } },
  ])
    assert.throws(() => verifyBracesHardening(fixture(options)), /BRACES_LOCK_IDENTITY/);
  assert.throws(
    () => verifyBracesHardening(fixture({ version: "3.0.4" })),
    /BRACES_INSTALLED_VERSION/,
  );
});

test("checks all public and recursive helper source files", () => {
  for (const file of data.files) {
    const dir = fixture();
    writeFileSync(
      join(dir, "node_modules/braces", file.path),
      file.patchedSource + "\n// changed\n",
    );
    assert.throws(() => verifyBracesHardening(dir), /BRACES_HARDENING_MISSING/);
  }
});

test("rejects symlinked library files outside the verified checkout", () => {
  const dir = fixture({ externalLibrary: true });
  assert.throws(() => verifyBracesHardening(dir), /BRACES_TARGET_OUTSIDE_CHECKOUT/);
  assert.throws(() => applyBracesHardening(dir), /BRACES_TARGET_OUTSIDE_CHECKOUT/);
});

test("rejects parents resolving braces to an external private installation", () => {
  const dir = fixture(),
    outside = fixture();
  const fake = JSON.parse(readFileSync(join(dir, "package-lock.json")));
  // A parent with a private braces junction must not resolve to an external installation.
  mkdirSync(join(dir, "node_modules/parent/node_modules"), { recursive: true });
  symlinkSync(
    join(outside, "node_modules/braces"),
    join(dir, "node_modules/parent/node_modules/braces"),
    process.platform === "win32" ? "junction" : "dir",
  );
  writeFileSync(
    join(dir, "node_modules/parent/package.json"),
    JSON.stringify({ name: "parent", dependencies: { braces: "3.0.3" } }),
  );
  fake.packages["node_modules/parent"] = { dependencies: { braces: "3.0.3" } };
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify(fake));
  assert.throws(() => verifyBracesHardening(dir), /BRACES_PARENT_RESOLUTION/);
});

test("rejects a junctioned parent whose real Node resolution reaches an unpatched external copy", () => {
  const dir = fixture(),
    outside = fixture({ original: true });
  mkdirSync(join(outside, "parent"));
  writeFileSync(join(outside, "parent/package.json"), "{}");
  symlinkSync(
    join(outside, "parent"),
    join(dir, "node_modules/parent"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const lock = JSON.parse(readFileSync(join(dir, "package-lock.json")));
  lock.packages["node_modules/parent"] = { dependencies: { braces: "3.0.3" } };
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify(lock));
  const parentFile = join(dir, "node_modules/parent/package.json");
  // The lexical path would falsely resolve to the verified copy; Node loads a parent's real path.
  assert.equal(
    createRequire(parentFile).resolve("braces"),
    join(dir, "node_modules/braces/index.js"),
  );
  assert.equal(
    createRequire(realpathSync(parentFile)).resolve("braces"),
    join(outside, "node_modules/braces/index.js"),
  );
  assert.throws(() => verifyBracesHardening(dir), /BRACES_TARGET_OUTSIDE_CHECKOUT/);
  assert.throws(() => applyBracesHardening(dir), /BRACES_TARGET_OUTSIDE_CHECKOUT/);
});

test("requires every recorded parent and accepts the expected hoisted resolution", () => {
  const dir = fixture({ extra: { "node_modules/parent": { dependencies: { braces: "3.0.3" } } } });
  assert.throws(() => verifyBracesHardening(dir), /BRACES_PARENT_MISSING/);
  mkdirSync(join(dir, "node_modules/parent"), { recursive: true });
  writeFileSync(join(dir, "node_modules/parent/package.json"), "{}");
  verifyBracesHardening(dir);
});

const methods = {
  default: braces,
  parse: braces.parse,
  compile: braces.compile,
  expand: braces.expand,
  stringify: braces.stringify,
};
for (const [name, method] of Object.entries(methods)) {
  test(
    name + ": rejects the reported short deeply nested attack with a bounded input error",
    () => {
      const pattern = "{".repeat(4500) + "a,b" + "}".repeat(4500);
      assert.ok(pattern.length < 10000);
      assert.throws(
        () => method(pattern),
        (error) =>
          error instanceof SyntaxError &&
          /Input depth \(101\), exceeds max depth \(100\)/.test(error.message),
      );
    },
  );
  test(name + ": accepts depth 100 and rejects 101 for braces and parentheses", () => {
    for (const [left, right] of [
      ["{", "}"],
      ["(", ")"],
    ]) {
      assert.doesNotThrow(() => method(left.repeat(100) + "a,b" + right.repeat(100)));
      assert.throws(
        () => method(left.repeat(101) + "a,b" + right.repeat(101)),
        /exceeds max depth/,
      );
    }
  });
  test(name + ": caps requested unlimited depth and honors stricter fractional limits", () => {
    assert.throws(
      () => method("{".repeat(101) + "a,b" + "}".repeat(101), { maxDepth: 5000 }),
      /exceeds max depth/,
    );
    assert.doesNotThrow(() => method("{a,b}", { maxDepth: 1.5 }));
    assert.throws(() => method("{{a,b},c}", { maxDepth: 1.5 }), /exceeds max depth/);
    assert.throws(() => method("((a))", { maxDepth: 1 }), /exceeds max depth/);
  });
}

function ast(depth) {
  let result = { type: "text", value: "a" };
  for (let index = 0; index < depth; index++) result = { type: "brace", nodes: [result] };
  return { type: "root", nodes: [result] };
}
for (const name of ["compile", "expand", "stringify"]) {
  test(name + ": bounds caller-supplied AST depth", () => {
    assert.doesNotThrow(() => braces[name](ast(100)));
    assert.throws(() => braces[name](ast(101)), /AST depth \(101\), exceeds max depth \(100\)/);
    assert.throws(() => braces[name](ast(4500)), /exceeds max depth/);
  });
}

test("rejects self and multi-node parent cycles with a bounded expansion error", () => {
  const require = createRequire(import.meta.url);
  const expand = require("../node_modules/braces/lib/expand.js");
  for (const multi of [false, true]) {
    const node = { type: "paren", nodes: [{ type: "text", value: "a" }] };
    if (multi) {
      node.parent = { type: "paren", parent: node };
    } else {
      node.parent = node;
    }
    assert.throws(
      () => vm.runInNewContext("expand(node)", { expand, node }, { timeout: 500 }),
      /AST parent chain contains a cycle/,
    );
  }
});

test("preserves normal expansion, ranges, parentheses and stringify escaping", () => {
  assert.deepEqual(braces("a/{b,c}/d"), ["a/(b|c)/d"]);
  assert.deepEqual(braces.expand("a/{b,c}/d"), ["a/b/d", "a/c/d"]);
  assert.deepEqual(braces.expand("file{01..03}.ts"), ["file01.ts", "file02.ts", "file03.ts"]);
  assert.deepEqual(braces.expand("foo/({a,b})"), ["foo/(a)", "foo/(b)"]);
  for (const pattern of ["{{a}}", "{a,{b}}", "{{x}y}", "{a,{b,{c}}", "{}{a}"])
    assert.equal(braces.stringify(braces.parse(pattern), { escapeInvalid: true }), pattern);
});
