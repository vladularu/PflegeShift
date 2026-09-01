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
fail closed. A normal following generation must also retain every previously published track and
may only preserve or extend its date coverage. Removing a track, moving its start forward, or
moving its end backward fails with `TRACK_COVERAGE_REGRESSION`. Only an explicit rollback that
exactly reproduces its verified target generation may restore narrower historical coverage.

The complete source, generation, rollback, filesystem layout, and operator contract is defined
in `docs/architecture/rule-catalog-delivery.md`. WP4a still performs no network request, creates
no Supabase bucket, contains no production private key, and does not change app startup or
catalog activation.

WP4b adds the separate Preview delivery boundary. It re-verifies an already signed local
publication, requires a locked-down public-read/administrative-write Supabase Storage bucket, and
uploads immutable packages and the immutable versioned manifest before replacing `current.json`.
Remote generation continuity, signature trust, exact immutable-byte reuse, and final pointer
acknowledgement fail closed. The Supabase secret remains environment-only in the administrative
process; no secret or network client enters the Expo app. Production delivery, client downloads,
polling, and SQLCipher activation remain later work.

## Preview catalog synchronization

WP5a connects only an installed app whose Expo Updates channel is exactly `preview` to the public
Preview delivery path. Production, `e2e-test`, Expo Go, and development sessions therefore create
no catalog HTTP client. The Preview channel pins the public Supabase object root and trusts the
public Ed25519 keys `preview-2026` and `preview-2026-r2` during the controlled Generation-2 key
rotation. Before Generation 3, the replacement public key `preview-2026-r3` is added to the same
Preview-only trust ring and distributed to installed Preview clients before any manifest uses it.
None of these public values grants write access, and no Supabase secret enters the app.
`src/composition/rule-catalog-preview-trust.ts` is the platform-neutral source for that public URL
and key ring. Supported engine versions live separately in
`src/rules/rule-catalog-engine-support.ts`, so app composition and administrative tooling cannot
drift independently.

Startup remains local-first. The provider selects the stored SQLCipher catalog or the embedded
legacy resolver before starting synchronization in the background. A successful check suppresses
another remote check for 24 hours. A started check provisionally suppresses duplicate or failed
attempts for one hour, so repeated mounts and network outages cannot create an unbounded request
loop. With 100,000 active installations this configuration permits at most one normal
`current.json` check per installation per 24-hour success window; package downloads happen only
when the signed generation differs from the active on-device generation.

The Preview Testlabor can explicitly claim one immediate check through the same signature
verification, atomic activation, and mounted-runtime reconciliation path. This does not enable
remote catalog delivery in production.

Preview Generation 3 repairs the holiday-track discontinuity introduced by Generation 2. Its
source set retains the finite 2026 package and adds the open-ended recurring package beginning on
2027-01-01. The resulting single `de-holidays` track therefore covers 2026-01-01 through an
open-ended future without a gap; tariff and legal package selections remain unchanged. It is
signed only with `preview-2026-r3`, after that public key has passed Preview device acceptance.

The client accepts HTTP 200 from the exact requested HTTPS URL, exact `application/json`, valid
UTF-8, and no more than 524,288 bytes per artifact. It verifies `current.json` before using any
signed package path, requires byte equality with `manifests/<generation>.json`, rejects remote
rollback, and downloads packages in signed manifest order. Signature, channel, key, engine
contract, package size, SHA-256, schema, and semantic validation then run through the existing
authoritative verifier. Only its runtime-marked verified artifacts can reach the existing atomic
SQLCipher activation transaction. A failure records a technical diagnostic and leaves the prior
catalog and resolver untouched.

WP5b keeps the current resolver snapshot mounted while synchronization and the subsequent local
reload are pending. A synchronization result that reports a generation triggers a reload only when
that generation is not already the complete selected runtime. The provider accepts the reloaded
snapshot only when it comes from stored catalog data, the active and selected generations are
identical, no last-known-good fallback is involved, and the selected generation is at least the
generation reported by synchronization. It then replaces the React context once with the complete
new snapshot; individual tracks are never switched independently.

Resolver identity is the cache-generation boundary. Tariff materialization, pay calculations,
holiday lookup, daily targets, annual reports, and memoized calculation consumers already isolate
their results by resolver or include the resolver in their React dependencies. Replacing the one
runtime snapshot therefore makes every calculation path move to fresh caches together while old
in-flight renders finish against their immutable previous resolver. If synchronization, reload, or
snapshot consistency fails, the mounted resolver remains unchanged and a privacy-safe technical
diagnostic is recorded. The Preview-only channel and trust restrictions from WP5a remain unchanged;
WP5b does not enable production downloads.

## Channel-neutral client boundary (WP6a-1)

The runtime port now selects one closed catalog profile from the `expo-updates` build channel.
`preview` retains its existing public endpoint and complete Preview trust ring. `production` records
the local `PRODUCTION` identity but deliberately has no remote endpoint, verification keys, or
network synchronization until the later Production trust package is approved. Development,
`e2e-test`, missing, and unknown channels have neither a catalog identity nor a remote profile.

Stored catalogs pass through the active profile before the resolver can load them. Preview accepts
only a runtime-compatible `PREVIEW` manifest whose signing key ID remains in the configured Preview
trust ring. Production and disabled profiles accept no stored remote generation yet. Scheduling
metadata is keyed independently as `rule_catalog_sync_preview` or
`rule_catalog_sync_production`, so a later Production client cannot inherit Preview throttling or
generation observations. The shared synchronizer contains no channel choice of its own; endpoint,
trust, state key, and activation dependencies all come from the selected profile.

WP6a-1 does not add a Production URL or public key, contact a Production backend, create a bucket,
publish a Production manifest, change EAS configuration, or alter the embedded fallback catalog.

## Channel-neutral delivery and storage core (WP6a-2a)

The administrative delivery boundary now resolves `PREVIEW` and `PRODUCTION` through one frozen,
version-controlled channel contract. That contract owns the local and remote path segment, signing
key ID prefix, and optional remote profile. Preview retains the existing `preview/...` namespace
and `rule-catalog` bucket. Production defines only its local `production/...` namespace and
`production-` key prefix; its remote profile is deliberately `null`.

Both the delivery orchestrator and the Supabase Storage adapter require an enabled remote profile
before they can inspect a bucket or issue a request. Production therefore supports complete local
signature, schema, semantic, engine-contract, package-byte, and path validation through
`--dry-run`, but a non-dry-run exits with `CHANNEL_REMOTE_DISABLED` before credentials are read or
Storage is constructed. The Storage adapter also accepts object paths only below the selected
channel segment, preventing Preview credentials from reading or writing `production/...` paths.

WP6a-2a does not configure a Production project, bucket, URL, secret, trust key, operator, upload,
public pointer, client download, EAS channel, or catalog activation.

## Production configuration contract and local preflight (WP6a-2b)

`rules/schema/production-channel-config.schema.json` is the authoritative closed contract for a
future public Production endpoint, dedicated infrastructure identity, non-secret trust ring, and
remote intervals. Its only committed instance is `rules/config/production-channel.json`. That
instance remains `DISABLED`, with no Supabase project URL, public base URL, or Production public
key. It contains no credential or signing seed.

`npm run rules:production:preflight` validates that fixed file through the generated standalone
schema validator and channel-separation rules. It rejects Preview project/key reuse, independently
edited remote URLs, invalid or duplicate Production public keys, contract/storage drift, and a
prematurely enabled Delivery remote profile. The command reads no environment secret, performs no
network request, and writes nothing. The committed disabled instance is therefore expected to
return `BLOCKED`; a complete synthetic candidate can return only `READY_FOR_APPROVAL`, which has no
activation effect.

The complete ordered provisioning, trust-distribution, Generation-1 delivery, and later client
activation plan is recorded in `docs/architecture/rule-catalog-production-plan.md`. WP6a-2b does
not create or inspect a Supabase project or bucket, generate a signing key, change Preview, enable
Production delivery/client profiles, publish an EAS update, or activate a catalog.

WP6a-2c adds a local provisioning-plan operator without extending that authority. It reads the
same disabled contract and offers only `preflight`, `plan`, and `checklist`. Its `PLAN_READY` result
means only that the repository is safe to prepare for a later, separately approved infrastructure
write; it is not Production delivery readiness. The normal Production preflight remains `BLOCKED`.
The exact resource boundary, evidence items, and stop conditions are versioned in
`docs/operations/rule-catalog-production-provisioning-checklist.md`.

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

`schemaVersion` describes the data shape. `engineContractVersion` describes behavior the calculation engine must understand. Both start at `1`. Engine contract v2 adds the tariff `overtimeBaseRule`: the individual hourly rate for actual overtime work is limited by the configured maximum table step. Tariff engine contract v3 replaces embedded hourly table amounts with the documented monthly-factor formula and resolves full-time weekly minutes by special part and tariff region. Legal engine contract v3 separates night work from night-worker status, requires either explicit confirmation of regular rotating night work or at least 48 recorded night-work days in the calendar year, evaluates the calendar-month and configured rolling average windows, and does not infer worked minutes from vacation or sickness entries. Legal engine contract v4 adds the §-3 average for extended standard working days: starting with each day over eight and up to ten net hours, the engine evaluates both the following six-calendar-month period and the following 24-week period. One compliant alternative is sufficient. Paid vacation and sickness days without actual work are removed from the statutory-workday denominator so that they remain neutral and cannot compensate excess working time. Legal engine contract v5 adds § 11 ArbZG for the care and hospital sectors: work is detected by its actual local-time overlap with a Sunday or a weekday public holiday; each occurrence needs its own explicitly recorded `FREE` replacement day within a period that includes the workday. The replacement day must be free of recorded work. A block shorter than the configured 35 hours triggers a separate review warning because § 11(4) permits technical or operational reasons to prevent the normal connection with the §-5 rest; it does not cause the replacement day itself to be discarded. The engine also checks the configured annual minimum of free Sundays. Legal engine contract v6 models the one-calendar-month alternative alongside the 28-day compensation period for shortened care-sector rest. Holiday engine contract v2 adds explicitly selected regional scopes and region IDs; unknown regional applicability remains visible instead of being guessed. Holiday engine contract v7 adds open-ended recurring holiday rules. The distinct version ensures older app releases reject this behavior fail-closed.

The v5 matching window is inclusive and may lie before or after the worked Sunday or weekday public holiday. Candidate `FREE` days are assigned one-to-one in earliest-deadline order, so one day cannot compensate multiple obligations. A federal state is mandatory for the complete v5 assessment because a weekday candidate may itself be a state-specific public holiday. Missing holiday-package coverage is reported explicitly while independently calculable Sunday obligations remain active. The current package models the statutory baseline only. Tariff deviations under § 12 ArbZG and operational shifts of the Sunday/holiday-rest period under § 9(2) are separate future contracts.

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
5. Complete the documented owner review against the recorded sources. In the solo project the owner may perform this review; an independent second reviewer, a legal name, and a separate role record are not required. `REVIEWED` means that the source-to-rule comparison was completed, not that a legal opinion or certification was issued. Record a stable non-personal reviewer ID, the automatically captured UTC review time, and the exact 40-character Git commit containing the reviewed rule content. Set both package and review status to `REVIEWED` in a later clean commit; the publisher compares the canonical rule payload while excluding only `status` and `review`, because a commit cannot contain its own hash.
6. The WP4a publisher revalidates the same files, checks review provenance, changes only the release artifact to `PUBLISHED`, computes the real file hash and size, and produces the next manifest generation.
7. The publisher canonicalizes and signs the manifest, uploads immutable package paths first, then makes the manifest available. Publication must fail if a `COMPLETE` track contains a gap or overlap.
8. Clients verify signature, generation, hash, size, schema, semantic contract, and engine compatibility before atomically activating the catalog. On any failure they retain the last verified compatible catalog.
9. A rollback publishes a new higher generation whose `rollbackOfGeneration` points to an earlier generation. It never lowers the generation counter and never mutates the earlier manifest.

Steps 6 through 9 are delivery work, not implemented in WP1.

## Verification commands

- `npm run rules:generate` regenerates TypeScript contracts and standalone validators.
- `npm run rules:check` fails when generated files are stale or the complete example catalog is invalid.
- `npm run rules:publish -- --request <path> --dry-run` validates, signs, and self-verifies a release without writing artifacts.
- `npm run rules:deliver -- --manifest <path> --trusted-public-key <keyId=base64url> --dry-run` verifies a signed local Preview publication without network access.
- `npm run test:rules` runs valid and adversarial contract tests.
- `npm run verify:fast` includes contract freshness, fixture validation, all repository tests, lint, formatting, type checking, and diff checks.

The files in `rules/examples` are contract fixtures. Their hashes, signatures, source metadata, and sample monetary values are deliberately non-production placeholders and must never be published as a real catalog.
