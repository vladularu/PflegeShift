# Production rule-catalog channel plan

## Current state after WP6a-2c

The Production rule-catalog channel is intentionally disabled. The app's `production` EAS channel
exists for application delivery, but it has no rule-catalog endpoint or trusted Production key.
The administrative delivery contract also has no Production remote profile. Consequently, neither
an installed Production app nor an operator command can download or upload a Production catalog.

Two version-controlled files are authoritative for the future public, non-secret configuration:

- `rules/schema/production-channel-config.schema.json` defines the closed contract;
- `rules/config/production-channel.json` is the only committed Production candidate.

The committed instance has status `DISABLED`, null project and public URLs, and an empty trust ring.
It contains only the future region, names, storage policy, intervals, and the name of the secret
environment variable. A Supabase secret or Ed25519 private signing seed is never valid contract
content.

WP6a-2c adds a versioned, write-disabled provisioning operator and a solo-owner acceptance
checklist. The operator derives its plan from the same Production channel contract and exposes only
`preflight`, `plan`, and `checklist`. It has no network, secret-read, local-write, project-creation,
bucket-creation, signing, delivery, or activation capability. The checklist is maintained in
`docs/operations/rule-catalog-production-provisioning-checklist.md`.

## Fixed isolation contract

Production must use all of the following values:

| Boundary              | Production contract                                              | Isolation proof                                      |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| Supabase project      | dedicated project                                                | origin differs from Preview                          |
| Region                | `eu-central-1`                                                   | fixed before project creation                        |
| Bucket                | `rule-catalog-production`                                        | differs from Preview `rule-catalog`                  |
| Object root           | `production`                                                     | Preview storage rejects the path                     |
| Delivery secret input | `SUPABASE_PRODUCTION_SECRET_KEY`                                 | name only; value stays outside Git and CLI arguments |
| Signing key IDs       | `production-...`                                                 | Preview key IDs are invalid                          |
| Public key bytes      | new Ed25519 key material                                         | byte equality with every Preview key fails preflight |
| Public remote URL     | derived exactly from project, bucket, and object root            | no independently editable URL                        |
| Object policy         | public read, administrative write only, JSON only, 524,288 bytes | matches signed artifact limit                        |

Supabase's official region list identifies Frankfurt as the specific AWS region `eu-central-1`.
The contract uses that exact region rather than the broader automatic `Europe` group:
<https://supabase.com/docs/guides/platform/regions>.

The Supabase backend credential and the catalog signing seed are independent secrets. A Production
project secret authorizes Storage administration; an Ed25519 seed signs public rule catalogs. They
must use separate password-manager entries and must never be copied into app configuration, EAS
public variables, repository files, command-line arguments, logs, or pull requests.

## Local preflight

Run:

```powershell
npm.cmd run rules:production:preflight
```

The command reads only `rules/config/production-channel.json` and generated local validators. It
does not read environment secrets, invoke `fetch`, inspect Supabase, create a bucket, or write any
file. It checks:

1. the complete JSON Schema and rejection of undocumented fields;
2. dedicated project, region, bucket, namespace, secret-variable name, and storage policy;
3. exact derivation of the public object URL;
4. Production key ID syntax, canonical 32-byte public keys, unique key IDs, and no Preview key-byte
   reuse;
5. continued absence of a Production remote profile in the delivery contract.

The checked-in state must currently return `BLOCKED` with `PRODUCTION_DISABLED`,
`INFRASTRUCTURE_NOT_CONFIGURED`, `REMOTE_NOT_CONFIGURED`, and `TRUST_NOT_CONFIGURED`. A complete
synthetic candidate can return `READY_FOR_APPROVAL`, but that status performs and authorizes no
activation.

## Ordered future gates

Each gate is a separate work package and authorization boundary:

1. **Infrastructure provisioning:** after explicit approval, create the dedicated Frankfurt
   Supabase project and locked `rule-catalog-production` bucket. Do not add a catalog yet.
2. **Live read-only verification:** query project identity, region, bucket policy, empty Production
   object root, and public-read behavior without changing remote state.
3. **Signing trust preparation:** generate a new Production Ed25519 seed locally, store it in the
   password manager/DPAPI operator store, derive only its public key, and update the candidate
   contract. No Preview seed or key may be reused.
4. **Trust distribution:** add the approved Production public key to the app while Production
   catalog networking remains disabled; pass CI and the required release/device gates.
5. **Generation 1 preparation:** promote reviewed packages into a signed local Production
   generation and pass publisher, delivery dry-run, rollback, and continuity checks.
6. **Controlled delivery:** separately enable the Production operator, upload immutable objects,
   write `current.json` last, and verify the public bytes. This is the first authorized Production
   catalog write.
7. **Client activation:** only after public Generation 1 is verified, populate the Production
   client remote profile and enable synchronization in a separately reviewed release.

No gate may combine project provisioning, signing-key creation, catalog upload, and client
activation in one approval. A failure leaves both the client and delivery remote profiles disabled
and keeps Production calculations on the embedded fallback catalog.

## WP6a-2b acceptance

- Contract schema and generated types/validator are current.
- The committed disabled instance is schema-valid and contains no secret or live Production URL.
- The local preflight fails closed for that disabled instance and passes only a fully isolated
  synthetic candidate as ready for later approval.
- Preview delivery and the Preview operator remain unchanged.
- No Supabase, EAS, signing, bucket, upload, or device action occurs.

## WP6a-2c local operator

The following commands are safe before any infrastructure approval:

```powershell
npm.cmd run rules:production:provisioning -- preflight
npm.cmd run rules:production:provisioning -- plan
npm.cmd run rules:production:provisioning -- checklist
```

The local planning preflight returns `PLAN_READY` only while the committed Production contract is
schema-valid, `DISABLED`, free of project and remote URLs, free of Production trust, and still has
no delivery remote profile. Once any live value appears, this planning-only operator fails closed;
the later live verification workflow owns that state.

The JSON plan records the exact dedicated project region and bucket policy plus a capability matrix
whose remote and mutation fields are all false. The checklist distinguishes the two current local
proofs from every later remote acceptance item. It deliberately requests no reviewer name, role,
signature, or manual timestamp for the solo-owner project.

WP6a-2c does not create a Supabase project or bucket, inspect live infrastructure, read a secret,
configure public trust, change either channel remote profile, sign or upload a catalog, publish an
EAS update, or require device acceptance.
