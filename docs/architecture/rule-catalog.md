# Rule catalog contract v1

## Decision

PflegeShift calculates salary, tariff, legal, and public-holiday results locally. The app must not send shifts, salary data, or calculation inputs to a rule backend. A later delivery service distributes only signed, immutable rule packages and a signed manifest. This preserves offline operation and prevents 100,000 monthly active users from creating a backend request for every calculation.

The authoritative machine-readable contracts are:

- `rules/schema/manifest.schema.json`
- `rules/schema/rule-package.schema.json`

`src/rules/contracts.generated.ts` and `src/rules/schema-validators.generated.js` are generated from those schemas. They are never edited manually. The standalone validators are compiled during development so the app does not compile JSON Schema at runtime. Both the app and every future publishing tool must call the semantic functions in `src/rules/validation.ts`; a second validator implementation is not permitted.

WP1 does not change the existing calculation engine, persist rule packages, contact Supabase, or verify a cryptographic signature. Those integrations follow only after the contract and later parity tests are accepted.

## Local runtime integration

WP2b makes the calculation engine a consumer of this contract without adding a network dependency:

- `src/engine/tariff.ts` resolves pay-table entries and validity boundaries from a `RuleTariffPackage`.
- `src/engine/pay.ts` resolves premium windows, percentages, table references, combination priority, allowances, and work-pattern thresholds from the same tariff package.
- `src/engine/holidays.ts` derives each state holiday from the holiday package that is active on the holiday date.
- `src/engine/compliance.ts` resolves working-time, break, night-work, rest-period, and planning thresholds from a legal package.

Every public calculation keeps the bundled resolver as its default and accepts an injected `RuleResolver` at the engine boundary. That makes a later verified on-device catalog replaceable without changing UI consumers or sending calculation inputs to a server. Resolver-specific caches prevent values from one catalog being reused after another catalog is activated.

The production default is still the immutable `LEGACY_EMBEDDED` catalog. WP2b does not download or persist packages, activate a manifest, verify signatures, contact Supabase, or make the current legacy packages publishable. Those remain separate delivery and governance work.

## Local catalog persistence

WP3a adds the storage half of the future activation flow without making downloaded rules trusted or active in the app runtime:

- SQLite migration 10 creates append-only catalog generations, their raw package JSON, and one active-generation pointer in the existing SQLCipher database.
- `src/infrastructure/database/rule-catalog-repository.ts` parses the raw artifacts and calls the authoritative `validateRuleCatalog()` function before opening a write transaction.
- A new generation, all of its packages, and the active pointer are written with `BEGIN IMMEDIATE` on the already-keyed database connection. Concurrent writes are serialized per connection; any failed statement rolls back the complete candidate and leaves the prior pointer unchanged.
- Generations below the active generation are rejected. Repeating the exact active bytes is idempotent; reusing a generation with different bytes is a conflict.
- Earlier activated generations remain stored. If the current persisted generation can no longer pass structural and semantic validation, loading scans downward and returns the most recent earlier valid activation as the last-known-good catalog.

The repository stores the original JSON strings so a later verifier can retain the exact downloaded artifacts. WP3a does **not** verify manifest signatures, compare package bytes with descriptor SHA-256 or size, download artifacts, contact Supabase, or inject a stored resolver into calculations. Until those later gates exist, production calculations continue to use `LEGACY_EMBEDDED`, and untrusted network artifacts must not be passed to the activation repository.

## Local catalog verification

WP3b adds the fail-closed trust boundary in front of WP3a storage. Raw manifest and package strings are untrusted until `src/rules/rule-catalog-verification.ts` has completed every check:

- The manifest must satisfy the authoritative schema and semantic validator, belong to the expected `PREVIEW` or `PRODUCTION` channel, use a key ID from the injected channel-specific public-key ring, and reference an engine contract supported by the app.
- The Ed25519 signature is detached: the verifier removes only `signing.signature`, retains `algorithm`, `canonicalization`, `keyId`, and every other manifest field, canonicalizes that projection with RFC 8785, encodes it as UTF-8, and verifies the unpadded base64url signature with strict RFC 8032 semantics.
- Each package is limited to the schema maximum of 524,288 UTF-8 bytes. Its exact downloaded bytes must match both `sizeBytes` and lowercase SHA-256 from the signed descriptor before the existing structural and semantic catalog validation runs.
- Verification returns frozen artifacts with a module-private runtime marker. `activateRuleCatalog()` accepts only that verified type and checks the marker before opening a transaction, so plain network JSON and structurally similar caller objects cannot reach catalog storage.
- The Expo SDK 57 adapter in `src/infrastructure/rule-catalog-cryptography.ts` uses the existing `expo-crypto` native digest API and a pure-JavaScript Ed25519 verifier. The contract verifier itself remains platform-neutral so a later publisher can use the same boundary without importing React Native.

Trusted public keys are not secrets and are supplied by the app composition layer. WP3b deliberately does not add a production key, fetch a manifest, contact Supabase, select update intervals, or inject the stored catalog into calculations. Any verification or activation failure leaves the current SQLCipher generation untouched and production calculations on `LEGACY_EMBEDDED`.

## Runtime catalog selection

WP3c-a establishes one immutable resolver snapshot before calculation consumers mount:

- The composition root loads the active generation from the existing keyed SQLCipher connection and accepts only catalogs that engine contract v1 can select unambiguously: exactly one tariff, one legal, and one holiday track.
- Resolver package identities come from those signed manifest tracks. They are not aliases of the bundled legacy package IDs.
- A structurally invalid or runtime-incompatible active generation is skipped as a unit. The repository scans earlier immutable generations and returns the newest valid compatible generation as last-known-good.
- If no catalog has ever been activated, the runtime selects the singleton `LEGACY_EMBEDDED` resolver. If an active pointer exists but no stored generation remains valid and compatible, the runtime also fails closed to that legacy resolver and records a technical diagnostic.
- Runtime diagnosis exposes the active pointer generation, selected generation, manifest key ID, and fallback reason. It contains no shift, salary, or personal data.

The snapshot never combines packages from different generations: its resolver is created once from one validated catalog object, then deeply stable for the provider lifetime. WP3c-a does not contact a network, add Supabase, add production keys, download catalogs, or switch individual calculation consumers; centralized propagation and resolver-aware consumer caches are the separate WP3c-b scope.

WP3c-b completes that consumer switch without changing the offline architecture:

- Analysis, salary, tariff assessment, calendar metrics, calendar holiday labels, day details, and the day-editor ArbZG check read the same resolver snapshot from the composition provider.
- The resolver is passed explicitly through calculation windows, monthly and daily summaries, pay, compliance, and holiday lookups. Public engine functions retain the bundled resolver only as a compatibility default for isolated callers and deterministic tests.
- Holiday, pay-breakdown, and annual-report caches are isolated by resolver identity. Memoized React consumers also include the resolver identity in their equality and dependency checks, so activating another catalog cannot reuse results from the previous generation.

WP3c-b still performs no network request and does not change the active resolver while the provider is mounted. A newly activated catalog is selected atomically on the next provider initialization; every consumer in that runtime then sees the same immutable generation.

## Local publication

WP4a adds the deterministic administrative publisher and its canonical publication-request
contract. It binds every `REVIEWED` package to the rule content at its recorded Git commit,
derives canonical `PUBLISHED` package bytes, hashes, sizes, complete tracks, and a consecutive
manifest generation, then signs with an environment-only Ed25519 seed. The exact output is
self-checked through the same verifier used by the app. Immutable packages and the versioned
manifest are staged before `current.json`; same-generation changes and immutable-path changes
fail closed.

The complete source, generation, rollback, filesystem layout, and operator contract is defined
in `docs/architecture/rule-catalog-delivery.md`. WP4a still performs no network request, creates
no Supabase bucket, contains no production private key, and does not change app startup or
catalog activation.

## Contract boundaries

The schema accepts only typed data modules. It does not accept JavaScript, expressions, templates, arbitrary operators, or remote schema references. `additionalProperties: false` closes every data object. Fields such as `script`, `code`, or unrecognized future fields fail validation.

Canonical units are fixed:

- money: integer cents;
- percentages: integer basis points;
- time of day and durations: integer minutes;
- dates: ISO calendar dates (`YYYY-MM-DD`);
- timestamps: UTC with a trailing `Z`;
- package integrity: lowercase SHA-256 hex;
- signature contract: Ed25519 over RFC 8785 canonical JSON.

The two validation layers have different jobs:

1. Generated JSON Schema validators enforce shape, closed fields, types, ranges, and discriminated tariff/legal/holiday variants.
2. `src/rules/validation.ts` enforces relationships that JSON Schema cannot express safely: real calendar dates, source and rule references, unique identities, review consistency, non-overlapping validity intervals, complete coverage without gaps, and equality between manifest descriptors and loaded packages.

Only `PUBLISHED` packages may be part of a validated catalog. `DRAFT` and `REVIEWED` packages may be validated individually but cannot become active through a manifest.

## Version and compatibility rules

`schemaVersion` describes the data shape. `engineContractVersion` describes behavior the calculation engine must understand. Both start at `1`.

A change is compatible within the same versions only when it adds an optional field that old consumers can ignore without changing an existing result. The following require a new schema or engine contract version before publication:

- a new required field;
- a new rule kind, operator, enum value, unit, or rounding meaning;
- changed interpretation of an existing field;
- removal or renaming of any accepted field;
- a calculation change that can alter an old input's result.

Published package files are immutable. A correction creates a new `versionId` and a new manifest generation. Existing files are never overwritten or deleted while a supported app can reference them. An app that does not support a package's `engineContractVersion` must keep its last verified compatible catalog and report the incompatibility; it must not guess or partially interpret the new package.

## Exact update procedure

Every tariff or legal change follows this sequence:

1. Record the primary source URL, document date, exact section, and SHA-256 of the reviewed source document.
2. Create a new immutable package version with the correct `validFrom` and `validTo`. Begin with `status: DRAFT` and empty review evidence.
3. Run `npm run rules:generate` only if the schema changed. Commit the schema and generated outputs together.
4. Run `npm run rules:validate` and `npm run test:rules`. Add a regression fixture for every changed result boundary, including the day before and the first day of validity.
5. Obtain the required tariff/legal review. Record reviewer, UTC review time, and the exact 40-character Git commit containing the reviewed rule content. Set both package and review status to `REVIEWED` in a later clean commit; the publisher compares the canonical rule payload while excluding only `status` and `review`, because a commit cannot contain its own hash.
6. The WP4a publisher revalidates the same files, checks review provenance, changes only the release artifact to `PUBLISHED`, computes the real file hash and size, and produces the next manifest generation.
7. The publisher canonicalizes and signs the manifest, uploads immutable package paths first, then makes the manifest available. Publication must fail if a `COMPLETE` track contains a gap or overlap.
8. Clients verify signature, generation, hash, size, schema, semantic contract, and engine compatibility before atomically activating the catalog. On any failure they retain the last verified compatible catalog.
9. A rollback publishes a new higher generation whose `rollbackOfGeneration` points to an earlier generation. It never lowers the generation counter and never mutates the earlier manifest.

Steps 6 through 9 are delivery work, not implemented in WP1.

## Verification commands

- `npm run rules:generate` regenerates TypeScript contracts and standalone validators.
- `npm run rules:check` fails when generated files are stale or the complete example catalog is invalid.
- `npm run rules:publish -- --request <path> --dry-run` validates, signs, and self-verifies a release without writing artifacts.
- `npm run test:rules` runs valid and adversarial contract tests.
- `npm run verify:fast` includes contract freshness, fixture validation, all repository tests, lint, formatting, type checking, and diff checks.

The files in `rules/examples` are contract fixtures. Their hashes, signatures, source metadata, and sample monetary values are deliberately non-production placeholders and must never be published as a real catalog.
