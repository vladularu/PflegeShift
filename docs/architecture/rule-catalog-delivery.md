# Rule catalog delivery v1

## WP4a boundary

WP4a produces release artifacts locally. It does not upload to Supabase, fetch rules in the
app, provision a production signing key, or change the active on-device catalog.

The authoritative machine-readable inputs and outputs are:

- `rules/schema/publication-request.schema.json` for the administrative publication request;
- `rules/schema/rule-package.schema.json` for reviewed source packages and published packages;
- `rules/schema/manifest.schema.json` for the signed output manifest.

Generated TypeScript types and standalone validators are derived from those schemas. The
publisher also calls `validateRulePackage()` and `validateRuleCatalog()`; it does not maintain a
second semantic validator.

## Reviewed source contract

Publishable source files live at
`rules/packages/reviewed/<packageId>/<versionId>.json`. They must be tracked, clean, and satisfy
all of the following:

- package and review status are both `REVIEWED`;
- reviewer, review time, and a 40-character Git commit are recorded;
- the package identity matches its repository path;
- the rule content equals the file at `review.gitCommit` after RFC 8785 canonicalization.

`review.gitCommit` identifies the commit whose rule content was reviewed. A Git commit cannot
contain its own hash, so the provenance comparison excludes only the mutable governance fields
`status` and `review`. Identity, validity, sources, monetary values, thresholds, and every actual
rule remain part of the compared review payload. The later commit that records the review
metadata must itself be tracked and clean before publication.

The publisher clones the reviewed input, changes only package and review status to `PUBLISHED`,
and serializes the result as canonical JSON. Source files remain `REVIEWED` and are not modified.

## Deterministic publication

One version-controlled publication request fixes:

- channel (`PREVIEW` or `PRODUCTION`);
- generation;
- UTC publication time;
- optional rollback target generation;
- exact reviewed source paths;
- Ed25519 key ID.

To make channel separation explicit, preview key IDs start with `preview-` and production key
IDs start with `production-`.

The private 32-byte Ed25519 seed is supplied only through
`RULE_CATALOG_SIGNING_KEY_BASE64URL`. It is never accepted as a command-line argument, written
to an artifact, or printed. The publisher derives package descriptors, complete tracks, SHA-256
hashes, UTF-8 byte sizes, and the signature. Package input order cannot change the output.

The manifest signature uses the same `canonicalizeRuleManifestForSignature()` function as the
app verifier. Before writing, the publisher passes its own output through
`verifyRuleCatalogArtifacts()` with the derived public key. This proves that the existing app
trust boundary accepts the exact emitted bytes.

## Generations and rollback

- Without a verified previous manifest, only generation `1` is accepted.
- A normal publication must be exactly the previous generation plus one and have a later
  `publishedAt` value.
- Re-running the identical signed generation is idempotent.
- Reusing a generation with different signed content fails.
- Previous and rollback manifests must have valid signatures from the configured trusted key
  ring and belong to the same channel.
- A rollback uses a new consecutive generation and must reproduce the complete tracks and
  package descriptors of the verified target generation exactly.

## Storage layout and write order

The local output mirrors the future Supabase Storage object layout:

```text
dist/rule-catalog/
  preview/
    packages/<packageId>/<versionId>.json
    manifests/<generation>.json
    current.json
  production/
    packages/<packageId>/<versionId>.json
    manifests/<generation>.json
    current.json
```

Immutable package objects are written first, the immutable versioned manifest second, and
`current.json` last. Existing immutable bytes may be reused only when they are identical; a
different payload at the same path is a hard conflict. `current.json` is replaced only after all
immutable writes succeed. WP4b will map the same ordered artifact list and cache policy to the
Supabase Storage API.

## Operator command

The request and reviewed sources must be committed before either command is run:

```powershell
$env:RULE_CATALOG_SIGNING_KEY_BASE64URL = "<32-byte-seed-as-unpadded-base64url>"
npm.cmd run rules:publish -- --request rules/releases/<request>.json --dry-run
npm.cmd run rules:publish -- --request rules/releases/<request>.json
Remove-Item Env:RULE_CATALOG_SIGNING_KEY_BASE64URL
```

The publisher automatically uses the channel's local `current.json` as the previous manifest.
Use `--previous-manifest`, `--rollback-manifest`, and repeatable
`--trusted-public-key <keyId=base64url>` only when the verified state or signing key is located
elsewhere. Public keys are not secret; the private seed remains environment-only.
