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
- a stable non-personal reviewer ID, UTC review time, and a 40-character Git commit are recorded;
- the package identity matches its repository path;
- the rule content equals the file at `review.gitCommit` after RFC 8785 canonicalization.

`review.gitCommit` identifies the commit whose rule content was reviewed. A Git commit cannot
contain its own hash, so the provenance comparison excludes only the mutable governance fields
`status` and `review`. Identity, validity, sources, monetary values, thresholds, and every actual
rule remain part of the compared review payload. The later commit that records the review
metadata must itself be tracked and clean before publication.

For the solo project, `reviewedBy` may be a stable owner identifier such as `project-owner`.
No legal name, role field, or second reviewer is required. `REVIEWED` records a completed
source-to-rule owner check; it must not be presented as a legal opinion or external
certification. `reviewedAt` is captured when that check is completed, while
`review.gitCommit` remains the immutable technical evidence of what was checked.

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

Publisher and delivery accept exactly two local roots. `dist/rule-catalog` remains the disposable
low-level default. `artifacts/rule-catalog-operator` is the ignored, durable operator staging root;
Expo exports may replace `dist` but do not replace this operator state. Similarly named sibling
paths are rejected. Both roots use the same Supabase Storage object layout:

```text
<approved-root>/
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

### Signing-key rotation

A replacement signing key is activated in the app before a manifest signed by that key becomes
`current.json`. During the transition the Preview verifier trusts the previous and replacement
public keys, while the new private seed remains only in the operator's password manager and process
environment. The previous private seed is not required: the publisher can verify the downloaded
Generation-1 `current.json` through `--previous-manifest` when the previous public key is supplied
with `--trusted-public-key`. Publisher and delivery receive both public keys until the predecessor
generation no longer participates in continuity or rollback verification.

## WP4b Preview delivery

WP4b adds a backend-only Supabase Storage adapter and deliberately remains separate from the app
runtime. It accepts one already published local manifest below either approved root at
`<approved-root>/.../preview/manifests/<generation>.json`, loads the package paths from that
manifest, and verifies the signature, byte size, SHA-256, schema, semantic catalog contract, and
engine compatibility again before any network request.

The adapter is Preview-only. A `PRODUCTION` manifest, production key ID, unsafe path, generation
gap, untrusted remote pointer, or bucket configuration drift fails closed. It never receives the
private catalog signing seed. Public signing keys are supplied with repeatable
`--trusted-public-key <keyId=base64url>` arguments.

### Supabase boundary

The Storage bucket is named `rule-catalog` and has one exact configuration:

- public reads, because packages and manifests contain no user or shift data;
- authenticated administrative writes only;
- `application/json` as the only MIME type;
- 524,288 bytes as the per-object limit, matching the signed rule contract.

The administrative adapter uses `SUPABASE_URL` and a current `SUPABASE_SECRET_KEY` with the
`sb_secret_` prefix. The secret is accepted only from the process environment, removed from that
environment after startup, never passed as a command-line argument, and never included in output
or remote error bodies. Legacy `service_role` JWTs and client-side `EXPO_PUBLIC_` secrets are not
accepted.

The first operator run may create the bucket with `--create-bucket`. Later runs verify the exact
configuration and never silently loosen it. Public access affects downloads only; uploads remain
authorized by the backend secret.

### Remote ordering and concurrency

Delivery preserves the WP4a artifact order:

1. immutable package paths with `x-upsert: false`;
2. `preview/manifests/<generation>.json` with `x-upsert: false`;
3. `preview/current.json` with `x-upsert: true`, only after every immutable write succeeds.

An existing immutable object is reused only after an exact byte comparison. A concurrent writer
with different bytes collides on the versioned manifest and cannot update `current.json`; the
immutable manifest therefore acts as the publication serialization barrier. The adapter also
requires remote `current.json` to have a trusted signature and to equal its immutable versioned
manifest before accepting a consecutive generation. After replacing `current.json`, it reads the
origin object back and requires exact acknowledgement.

Immutable objects use `public, max-age=31536000, immutable`. The stable pointer uses
`public, max-age=0, must-revalidate`. This keeps package and versioned-manifest URLs cacheable
without allowing a mutable package path.

### Operator commands

Verify the complete signed local publication without contacting Supabase:

```powershell
npm.cmd run rules:deliver -- --manifest dist/rule-catalog/preview/manifests/1.json --trusted-public-key "preview-2026=<public-key-base64url>" --dry-run
```

For the first authorized Preview delivery, configure the project URL and a dedicated secret key,
then create the locked-down bucket and upload:

```powershell
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SECRET_KEY = "<sb_secret_...>"
npm.cmd run rules:deliver -- --manifest dist/rule-catalog/preview/manifests/1.json --trusted-public-key "preview-2026=<public-key-base64url>" --create-bucket
Remove-Item Env:SUPABASE_SECRET_KEY
Remove-Item Env:SUPABASE_URL
```

Omit `--create-bucket` after provisioning. A real remote delivery remains a separately approved
publication action. WP4b does not configure a production bucket or key, download into the app,
schedule update checks, or activate a catalog in SQLCipher.
