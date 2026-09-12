import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));

test("lockfile contains no image-size and no vulnerable Metro 0.84.4 copies", () => {
  const entries = Object.entries(lock.packages);
  assert.ok(entries.some(([path]) => path.endsWith("node_modules/metro")));
  for (const [path, metadata] of entries) {
    assert.ok(!/(^|\/)node_modules\/image-size$/.test(path), path);
    if (/(^|\/)node_modules\/metro$/.test(path)) {
      assert.equal(metadata.version, "0.84.5", path);
      assert.equal(metadata.dependencies?.["image-size"], undefined, path);
      const installed = JSON.parse(readFileSync(join(root, path, "package.json"), "utf8"));
      assert.equal(installed.version, metadata.version, path);
      assert.equal(installed.dependencies?.["image-size"], undefined, path);
    }
  }
});

test("all PNG assets retain their dimensions with upstream Metro parsers", () => {
  const { getAssetSize } = require("metro/private/Assets");
  const assetRoot = join(root, "assets");
  const files = readdirSync(assetRoot, { recursive: true }).filter((file) => file.endsWith(".png"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const path = join(assetRoot, file);
    const input = readFileSync(path);
    const expected = { width: input.readUInt32BE(16), height: input.readUInt32BE(20) };
    assert.deepEqual(getAssetSize("png", input, path), expected, file);
  }
});
