# Flowstate Pro workspace boundaries · WP1.1

**Scope** — Synthetic workspace dependency checks authorized for WP1.1. See the [G0 scope decision](../../plans/2026-11-20-flowstate-pro-execution-ledger.md) and [implementation plan](../../plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md#wp11--add-architectural-boundary-tests-first).

| Workspace | Package | Allowed cross-workspace runtime dependency |
| --- | --- | --- |
| `apps/pro-provider-web` | `@flowstate/pro-provider-web` | None. Its future Pro API connection is HTTP. |
| `apps/pro-patient-web` | `@flowstate/pro-patient-web` | None. Its future Pro API connection is HTTP. |
| `apps/pro-api` | `@flowstate/pro-api` | `@flowstate/pro-db` |
| `packages/pro-db` | `@flowstate/pro-db` | None |

The four manifests are private. Existing Standard workspaces retain their dependency graph. Pro and Standard have no shared runtime allowlist. This also excludes Standard role, session, billing, database, application-local and shared package code from Pro. Provider and patient web external imports remain disallowed until approved in a later packet. Their future application setup must preserve the API boundary, including restrictions on persistence, policy, storage, KMS and vendor code.

## Verification and control evidence

- **ARC-01, DEV-02 and QUA-01** — Run `corepack pnpm test:pro-product-boundaries` with the existing toolchain. The suite runs against the actual workspace graph and temporary synthetic fixtures for prohibited dependencies.
- **DEV-01** — The fixtures contain inert names and source text. The suite needs no application credentials, database or live service.
- **Reproducibility** — The lockfile adds only the four importers for the private Pro packages. The API-to-DB link uses `workspace:*`. Run pnpm with a frozen lockfile to confirm workspace registration.
- **Evidence limits** — This check covers the declared workspace graph and supported static source imports. It does not exercise runtime isolation or deployment. The execution ledger records the exact verification outcomes and checkpoint.
- **Owner and rollback** — Architecture/Backend owns the boundary. Changes to the allowed graph require a scoped review. Reverting WP1.1 removes the four inert workspace registrations, focused test, and their associated documentation and lockfile entries.
