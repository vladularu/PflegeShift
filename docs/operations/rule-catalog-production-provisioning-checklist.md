# Production rule-catalog provisioning checklist

## Scope

This checklist prepares the later creation and acceptance of the dedicated Production Supabase
project and its empty Storage bucket. WP6a-2c performs none of those remote actions. It does not
read a credential, call Supabase, create a project or bucket, generate a signing key, upload an
object, enable delivery, or activate the app client.

WP6a-3a adds the versioned trust-preparation code only. It does not execute its DPAPI wrapper or
create a real Production seed. Seed generation remains a separate explicit approval boundary.

The only authoritative input is `rules/config/production-channel.json`. Run the versioned local
operator from the repository root:

```powershell
npm.cmd run rules:production:provisioning -- preflight
npm.cmd run rules:production:provisioning -- plan
npm.cmd run rules:production:provisioning -- checklist
```

All three commands only read the committed contract and print JSON to standard output. They have no
remote or local mutation command. `apply`, `create-project`, `create-bucket`, extra arguments, and
unknown commands fail with `INVALID_COMMAND`.

The provisioning-plan preflight must return `PLAN_READY`. This does not contradict
`npm.cmd run rules:production:preflight`, which must still return `BLOCKED` until infrastructure,
public trust, and the remote URL exist and are approved.

## Exact planned boundary

| Resource                | Required value                                                        |
| ----------------------- | --------------------------------------------------------------------- |
| Provider                | Supabase                                                              |
| Project topology        | New dedicated project, never the Preview project                      |
| Region                  | `eu-central-1` (Frankfurt)                                            |
| Bucket                  | `rule-catalog-production`                                             |
| Bucket visibility       | Public read                                                           |
| Write authority         | Backend administration only                                           |
| MIME allowlist          | `application/json` only                                               |
| Maximum object size     | 524,288 bytes                                                         |
| Reserved object root    | `production`                                                          |
| Initial object count    | 0                                                                     |
| Future credential input | `SUPABASE_PRODUCTION_SECRET_KEY`, value outside Git and CLI arguments |

The Supabase project display name is not a security or runtime identifier and is deliberately not
duplicated in the contract. The public project URL, its origin, and the verified region are the
later identity evidence.

## Solo-owner acceptance record

No reviewer name, role, signature, or manual timestamp is required. Retain only the technical
evidence named below. The operator prints the same item IDs and current statuses.

| ID                                     | Required evidence                                               | Current state |
| -------------------------------------- | --------------------------------------------------------------- | ------------- |
| `local-plan-preflight`                 | Committed disabled contract passes the local planning preflight | `PASS`        |
| `production-delivery-disabled`         | Production delivery channel has no remote profile               | `PASS`        |
| `explicit-production-write-approval`   | Separate approval limited to creating the project and bucket    | `PENDING`     |
| `dedicated-project-created`            | New Production project reference and public project URL         | `NOT_STARTED` |
| `project-region-verified`              | Read-only evidence for `eu-central-1`                           | `NOT_STARTED` |
| `preview-project-isolation-verified`   | Production origin differs from the Preview origin               | `NOT_STARTED` |
| `production-bucket-created`            | Bucket exists only in the Production project                    | `NOT_STARTED` |
| `bucket-policy-verified`               | Bucket metadata matches visibility, MIME, and size contract     | `NOT_STARTED` |
| `production-object-root-empty`         | Empty listing for `production/` before first delivery           | `NOT_STARTED` |
| `public-read-negative-check`           | Unauthenticated missing-object response without a credential    | `NOT_STARTED` |
| `production-config-candidate-reviewed` | Later diff contains only public project and derived remote URLs | `NOT_STARTED` |

## Trust-preparation code gate

Before any Production seed is generated, retain these local proofs:

| ID                                    | Required evidence                                                       | Current state |
| ------------------------------------- | ----------------------------------------------------------------------- | ------------- |
| `trust-operator-preflight`            | Secret-free command returns `READY_TO_PREPARE`                          | `PASS`        |
| `trust-operator-no-remote-capability` | Tests prove no network, Supabase, signing, delivery, or activation path | `PASS`        |
| `trust-wrapper-dpapi-contract`        | Static checks cover `CurrentUser`, round-trip, `CreateNew`, and cleanup | `PASS`        |
| `production-signing-seed-created`     | Separately approved real run creates the DPAPI-protected initial seed   | `NOT_STARTED` |
| `production-public-key-recorded`      | Only the derived public key is recorded in the Candidate contract       | `NOT_STARTED` |

## Stop conditions

Stop without correcting remote state when any of the following is observed:

- the selected project is the Preview project or is outside `eu-central-1`;
- the bucket already exists with unknown objects or a different policy;
- any object exists below `production/` before the controlled Generation-1 delivery;
- a secret appears in a file, command argument, log, screenshot, issue, or pull request;
- Production delivery or client synchronization becomes enabled during infrastructure work;
- the local planning operator or the normal Production preflight reports an undocumented status.

After remote provisioning, the next work package must be read-only verification. It must not create
trust, sign a catalog, upload Generation 1, or enable the app client.
