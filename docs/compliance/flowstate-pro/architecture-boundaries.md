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

## WP1.2 local application shells

Provider, patient and API are independently built into their own `dist/` directories. The Pro-only build tool in `infra/pro/` copies the dependency-free Node HTTP shell into each artifact and selects its surface. This keeps runtime imports inside the artifact. The local shells have no authentication or clinical workflows. Their verification covers the HTTP and configuration boundary before framework-specific application work.

| Input or route | Local contract |
| --- | --- |
| `FLOWSTATE_PRO_PLANE` | Required plane identifier, `us` or `ca`. Each plane's manifest validates its synthetic mode, hosts, primary and recovery regions and reference names. |
| `FLOWSTATE_PRO_PORT` | Optional local bind port, defaulting to an OS-assigned port. Startup prints the selected port. The listener binds to loopback. |
| Host and browser origin | Exactly the configured surface's host and listener port. An unknown host returns 421 and a mismatched Origin returns 403. |
| `/health` and `/ready` | Fixed JSON states. Readiness covers successful local configuration only. |
| Session cookie contract | Separate plane and surface names with the `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Strict`, and `Path=/`. The shells issue no sessions. Chromium verification uses inert test cookies. |
| Database, Stripe and key references | Distinct Pro environment variable names for each plane. The synthetic shells do not load values, contact dependencies or initialize SDKs. |

Run `corepack pnpm --filter @flowstate/pro-provider-web build` and then `FLOWSTATE_PRO_PLANE=us corepack pnpm --filter @flowstate/pro-provider-web start`. Open the origin printed by combining `provider.us.pro.localhost` with the reported port. The patient and API workspaces use the corresponding package names and configured hosts. The browser check runs with `corepack pnpm test:pro-application-shells` after installing the pinned Chromium with `corepack pnpm exec playwright install chromium`.

ARC-01 covers this synthetic boundary. Runtime sessions, DB integration, deployment, white-label onboarding and provider read-back remain later controls. Revert the WP1.2 commit to remove the shell artifacts and independent build wiring from the workspaces.
