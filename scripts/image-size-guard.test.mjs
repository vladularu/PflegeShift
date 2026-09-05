import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import guard from "./image-size-guard.cjs";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const { guardImageSize, guardPrefix, patchSource, parsers } = guard;

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "lunashift-image-guard-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const target = join(dir, "node_modules/image-size");
  mkdirSync(join(target, "dist/types"), { recursive: true });
  mkdirSync(join(dir, "node_modules/metro"), { recursive: true });
  writeFileSync(join(dir, "package.json"), "{}");
  writeFileSync(join(dir, "node_modules/metro/package.json"), '{"name":"metro"}');
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify({ packages: { "node_modules/image-size": { version: "1.2.1" } } }),
  );
  writeFileSync(
    join(target, "package.json"),
    JSON.stringify({ name: "image-size", version: "1.2.1", main: "dist/index.js" }),
  );
  writeFileSync(join(target, "dist/index.js"), "");
  for (const parser of parsers) {
    const installed = readFileSync(
      join(root, "node_modules/image-size/dist/types", `${parser.name}.js`),
      "utf8",
    );
    const prefix = guardPrefix(parser);
    writeFileSync(
      join(target, "dist/types", `${parser.name}.js`),
      installed.startsWith(prefix) ? installed.slice(prefix.length) : installed,
    );
  }
  return { dir, target };
}

test("clean installation is guarded idempotently; missing guard fails closed", (t) => {
  const { dir, target } = fixture(t);
  assert.throws(() => guardImageSize(dir, { check: true }), /guard missing/);
  guardImageSize(dir);
  guardImageSize(dir, { check: true });
  const before = parsers.map((p) =>
    readFileSync(join(target, "dist/types", `${p.name}.js`), "utf8"),
  );
  guardImageSize(dir);
  assert.deepEqual(
    parsers.map((p) => readFileSync(join(target, "dist/types", `${p.name}.js`), "utf8")),
    before,
  );
  for (const parser of parsers) {
    const handler = require(join(target, "dist/types", `${parser.name}.js`))[parser.symbol];
    assert.equal(handler.validate(Buffer.alloc(0)), false);
    assert.throws(() => handler.calculate(Buffer.alloc(0)), /parser disabled/);
  }
});

test("unknown source prevents all writes, including when a later parser changed", (t) => {
  const { dir, target } = fixture(t);
  const first = join(target, "dist/types/icns.js");
  const original = readFileSync(first, "utf8");
  writeFileSync(join(target, "dist/types/jxl.js"), "unexpected source");
  assert.throws(() => guardImageSize(dir), /unexpected jxl source/);
  assert.equal(readFileSync(first, "utf8"), original);
  assert.throws(
    () => patchSource(guardPrefix(parsers[0]) + "tampered", parsers[0]),
    /unexpected icns source/,
  );
});

test("changed installed version or entry point is rejected", (t) => {
  const { dir, target } = fixture(t);
  for (const metadata of [
    { name: "image-size", version: "2.0.2", main: "dist/index.js" },
    { name: "image-size", version: "1.2.1", main: "other.js" },
  ]) {
    writeFileSync(join(target, "package.json"), JSON.stringify(metadata));
    assert.throws(() => guardImageSize(dir), /unexpected installed package/);
  }
});

test("missing, changed or additional locked copies are rejected", (t) => {
  const { dir } = fixture(t);
  for (const packages of [
    {},
    { "node_modules/image-size": { version: "2.0.2" } },
    {
      "node_modules/image-size": { version: "1.2.1" },
      "node_modules/metro/node_modules/image-size": { version: "1.2.1" },
    },
  ]) {
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({ packages }));
    assert.throws(() => guardImageSize(dir), /exactly one locked/);
  }
});

test("actual installed sources are guarded", () => guardImageSize(root, { check: true }));

test("a nested installed Metro copy cannot bypass the guard", (t) => {
  const { dir } = fixture(t);
  const nested = join(dir, "node_modules/metro/node_modules/image-size");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(nested, "package.json"), '{"name":"image-size","main":"index.js"}');
  writeFileSync(join(nested, "index.js"), "");
  assert.throws(() => guardImageSize(dir), /unprotected image-size resolution/);
});

test("real Metro configuration refuses an installation without lifecycle patching", (t) => {
  const { dir } = fixture(t);
  mkdirSync(join(dir, "scripts"));
  writeFileSync(
    join(dir, "scripts/image-size-guard.cjs"),
    readFileSync(join(root, "scripts/image-size-guard.cjs")),
  );
  writeFileSync(join(dir, "metro.config.js"), readFileSync(join(root, "metro.config.js")));
  const result = spawnSync(process.execPath, ["-e", "require('./metro.config.js')"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /image-size guard missing/);
});

const malformed = {
  icns: "69636e73000000106963303700000000",
  jxl: "0000000c4a584c200d0a870a0000000c667479706a786c20000000006a786c7000000000",
  heif: "0000000c6674797068656963000000006d65746100000000",
  avif: "0000000c6674797061766966000000006d65746100000000",
};

for (const [name, hex] of Object.entries(malformed)) {
  test(`${name} rejected by buffer, file, callback, Metro and worker paths`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), "lunashift-image-input-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const fakePng = join(dir, "renamed.png");
    writeFileSync(fakePng, Buffer.from(hex, "hex"));
    // Only the CHILD handles untrusted bytes. A regression must not hang the test runner.
    const result = spawnSync(
      process.execPath,
      [
        "--max-old-space-size=64",
        "-e",
        `
      const assert = require('node:assert/strict');
      const { Worker } = require('node:worker_threads');
      const size = require('image-size');
      const input = Buffer.from(${JSON.stringify(hex)}, 'hex');
      const path = ${JSON.stringify(fakePng)};
      assert.throws(() => size(input), /unsupported file type/);
      assert.throws(() => size(path), /unsupported file type/);
      const { getAssetSize } = require('metro/private/Assets');
      assert.throws(() => getAssetSize('png', input, path), /unsupported file type/);
      Promise.all([
        new Promise((resolve, reject) => size(path, (error, dimensions) => {
          try { assert.match(error.message, /unsupported file type/); assert.equal(dimensions, undefined); resolve(); } catch(e) { reject(e); }
        })),
        new Promise((resolve, reject) => {
          const worker = new Worker("const size = require('image-size'); const assert = require('node:assert/strict'); assert.throws(() => size(Buffer.from('${hex}', 'hex')), /unsupported file type/);", { eval: true });
          worker.once('error', reject);
          worker.once('exit', code => code === 0 ? resolve() : reject(new Error('worker exit ' + code)));
        })
      ]).then(() => console.log('blocked'), e => { console.error(e); process.exitCode = 1; });
    `,
      ],
      { cwd: root, encoding: "utf8", timeout: 10000, maxBuffer: 8192 },
    );
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /blocked/);
  });
}

test("all checked-in PNG assets retain dimensions in image-size and Metro", () => {
  const size = require("image-size");
  const { getAssetSize } = require("metro/private/Assets");
  const assetRoot = join(root, "assets");
  const files = readdirSync(assetRoot, { recursive: true }).filter((file) => file.endsWith(".png"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const path = join(assetRoot, file);
    const input = readFileSync(path);
    const expected = { width: input.readUInt32BE(16), height: input.readUInt32BE(20) };
    assert.deepEqual(getAssetSize("png", input, path), expected);
    assert.equal(size(input).width, expected.width);
    assert.equal(size(input).height, expected.height);
  }
});
