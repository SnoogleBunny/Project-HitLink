# CEO Safe Local Verification Evidence

Date: 2026-07-20 local / 2026-07-21 UTC
Repository: `C:/Users/Jacky/Documents/Project-HitLink`
Scope: read-only or disposable-local verification only. No product implementation, existing database reset, production credentials, Stripe calls, deployment, or external contact.

## Environment facts

- Root `package.json` requires `pnpm@10.33.0`.
- Installed `pnpm` on `PATH` was `8.10.2`.
- `corepack pnpm` was unusable because the Windows launcher attempted to load `C:\c\Program Files\nodejs\node_modules\corepack\dist\corepack.js` and returned `MODULE_NOT_FOUND` under Node `v24.17.0`.
- Exact package-manager version was therefore invoked as `npx --yes pnpm@10.33.0 ...`; `npx --yes pnpm@10.33.0 --version` returned `10.33.0`.
- No repository-root `.env` existed. `.env.example` was present.
- The repository tracks 17 paths under `node_modules`; the frozen install recreated `node_modules` and left all 17 tracked paths changed on this Windows checkout. These generated/dependency changes are not product implementation and must not be committed as recovery output without a separate decision.

## Dependency installation

Command:

```text
npx --yes pnpm@10.33.0 install --frozen-lockfile
```

Result: PASS, exit `0`.

Evidence summary:

- 12 workspace projects.
- Lockfile up to date; resolution skipped.
- 360 packages reused/installed.
- pnpm warned that Prisma/client/engine and esbuild build scripts were ignored because root `package.json` allows only `sharp` under `pnpm.onlyBuiltDependencies`.

Consequence verified below: immediately after installation, generated Prisma Client exports were absent, causing type-check and auth-test failures. An explicit safe `db:generate` restored the generated client.

## Lint and formatting

### ESLint

Command:

```text
npx --yes pnpm@10.33.0 lint
```

Result: PASS, exit `0`.

- Turbo reported 9 successful lint tasks out of 9.

### Prettier check

Command:

```text
npx --yes pnpm@10.33.0 exec prettier --check .
```

Result: FAIL, exit `1`.

- Prettier reported style differences in 336 files across application code, packages, tests, design artifacts, documentation, and recovery evidence.
- No files were reformatted because broad cleanup is outside recovery scope.

## Prisma generation and type checking

### Initial type check after frozen install

Command:

```text
npx --yes pnpm@10.33.0 check-types
```

Result: FAIL, exit `2`.

- `@flowstate/db` could not import `PrismaClient` or the schema's generated enums/models from `@prisma/client`.
- This was an installation/generation-order failure, not accepted as a passing gate.

### Explicit generation

Command:

```text
npx --yes pnpm@10.33.0 db:generate
```

Result: PASS, exit `0`.

- Generated Prisma Client `v6.19.3` from `packages/db/prisma/schema.prisma`.

### Type check after generation

Command:

```text
npx --yes pnpm@10.33.0 check-types
```

Result: PASS, exit `0`.

- Turbo reported 9 successful type-check tasks out of 9.

## Unit/workspace tests

### Initial run after install but before explicit Prisma generation

Command:

```text
npx --yes pnpm@10.33.0 test
```

Result: FAIL, exit `1`.

- `packages/auth/src/session.test.ts` could not load `.prisma/client/default`.
- Other workspace packages mainly reported `No tests yet`; the database package only ran schema validation.

### Run after explicit Prisma generation

Command:

```text
npx --yes pnpm@10.33.0 test
```

Result: PASS, exit `0`.

Real test totals:

- `packages/auth`: 1 file, 7 tests passed.
- `apps/member-web`: 7 files, 29 tests passed.
- `apps/admin-web`: 25 files, 126 tests passed.
- Total executable Vitest assertions: 162 passed.
- Turbo reported 11 successful package test tasks out of 11, but several tasks are placeholders that only print `No tests yet`, and `@flowstate/db` only performs `prisma validate`. The green workspace command is therefore not equivalent to comprehensive unit/integration coverage.

## Production build

### Canonical root command

Command:

```text
npx --yes pnpm@10.33.0 build
```

Result: FAIL, exit `1`.

- `api` uses a direct `next build` package script.
- `landing-web`, `admin-web`, and `member-web` use `sh -c 'set -a; [ -f ../../.env ] && . ../../.env; set +a; next build'`.
- Under pnpm's Windows lifecycle shell, those three wrappers exited `1` before Next.js emitted build output. Running the same shell body manually from Git Bash with the package `.bin` path succeeded. This is a reproducible Windows portability/reproducibility defect in the canonical build path.

### Direct Next.js builds used only to distinguish wrapper failure from compile failure

Commands:

```text
npx --yes pnpm@10.33.0 --filter landing-web exec next build
npx --yes pnpm@10.33.0 --filter api build
npx --yes pnpm@10.33.0 --filter admin-web exec next build
npx --yes pnpm@10.33.0 --filter member-web exec next build
```

Results: PASS for all four applications.

Observed route manifests:

- Landing: `/` and `/_not-found`.
- API: `/`, `/_not-found`, `/api/v1/health`.
- Admin: authentication/onboarding plus dashboard routes for migration, programs, rooms, schedule/roster, bookings, coach today, members/billing, forms, memberships, access products, billing/Stripe settings, and staff invites.
- Member: login, `/app` schedule/bookings/membership/forms/billing/checkout, public form-signing routes, and `/trial/[workspaceId]`.

All direct builds warned that Next.js inferred `C:\Users\Jacky` as the workspace root because a separate `C:\Users\Jacky\package-lock.json` exists. No external lockfile was changed.

## Prisma schema, migrations, and demo seed

### Schema validation

Command:

```text
npx --yes pnpm@10.33.0 db:validate
```

Result: PASS, exit `0`.

- Prisma reported `packages/db/prisma/schema.prisma` valid.

### Disposable database verification

A temporary local `postgres:16-alpine` container was started on host port `55433` with an isolated database named `hitlink_recovery_audit`. It had no persistent volume and was stopped/removed after verification. It did not use the DB specialist's separate container on port `55432` and did not touch any existing application database.

Commands, with the local disposable connection string redacted here:

```text
DATABASE_URL=[DISPOSABLE LOCAL DATABASE] npx --yes pnpm@10.33.0 --filter @flowstate/db exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL=[DISPOSABLE LOCAL DATABASE] npx --yes pnpm@10.33.0 --filter @flowstate/db exec prisma migrate status --schema prisma/schema.prisma
DATABASE_URL=[DISPOSABLE LOCAL DATABASE] npx --yes pnpm@10.33.0 --filter @flowstate/db exec node prisma/seed-demo.mjs
```

Results: PASS.

- Prisma found and successfully applied all 14 migrations in order, from `20260404043358_init_phase2_slice1` through `20260530120000_migration_first_onboarding_ops`.
- `prisma migrate status` reported `Database schema is up to date!`.
- Demo seed completed and created one workspace, two users, one member, one class template, and one form document.
- Post-seed database counts: `_prisma_migrations=14`, `workspaces=1`, `users=2`, `members=1`, `class_templates=1`, `form_documents=1`.

Caveat: the seed deletes prior records matching its fixed demo workspace name and fixed demo user emails. It was safe only because it ran against the isolated disposable database.

## End-to-end tests

Setup:

- Used the migrated and seeded disposable database above.
- Served successful production builds locally on ports 3000 and 3001 and the API on 3002.
- No Stripe credentials were supplied; no live payment operation was attempted.

Command:

```text
DATABASE_URL=[DISPOSABLE LOCAL DATABASE] npx --yes pnpm@10.33.0 exec playwright test --project=chromium
```

Result: FAIL, exit `1`; 1 passed, 1 failed.

Passed:

- `tests/e2e/migration-first-onboarding.spec.ts`: signup, intake validation, CSV staging/validation, import, reconciliation display, migration gating, status progression, and readiness path completed in 5.1 seconds.

Failed:

- `tests/e2e/flowstate-demo.spec.ts` failed at line 180 after 10.1 seconds.
- Expected roster text: `2 / 20 booked`.
- Observed page snapshot: `1 / 20 booked`, containing only Demo Member.
- Database evidence after failure showed two valid `class_bookings`, but on different dates:
  - Demo Member: `MEMBERSHIP`, `MEMBER_PORTAL`, `2026-07-27`.
  - Demo Trial Prospect: `TRIAL`, `PUBLIC_TRIAL`, `2026-07-20`.
- The test navigated to the membership booking's `2026-07-27` roster, so the trial was absent. This demonstrates a time/date/occurrence inconsistency or time-dependent test assumption between the member schedule and public-trial schedule. It is not an infrastructure-only failure and should remain a broken/unverified workflow until the scheduling semantics are reconciled.
- Failure artifact: `test-results/flowstate-demo-Flowstate-w-6b066-and-API-flows-are-connected-chromium/error-context.md` (generated test artifacts are gitignored).

## Gate verdict

- Dependency restore: PASS only when invoked with the declared pnpm version; reproducibility caveats remain.
- Lint: PASS.
- Formatting: FAIL (336 files).
- Type check: PASS only after an explicit Prisma generation step not performed by the frozen install.
- Unit/workspace tests: PASS after Prisma generation, with 162 actual Vitest assertions and many placeholder package tasks.
- Canonical production build: FAIL on Windows because three package scripts use non-portable nested `sh -c` lifecycle wrappers.
- Direct application compile/build: PASS for all four apps.
- Prisma schema: PASS.
- Fresh migration chain: PASS against a disposable PostgreSQL 16 database.
- Demo seed: PASS against the disposable database.
- E2E: FAIL (1 passed, 1 failed) due to a schedule/trial date mismatch that makes the expected connected roster workflow unreliable.

Overall recovery status: Milestone 0 is not complete. The repository can be migrated and seeded in a clean disposable environment, but the canonical Windows build command is broken, generated Prisma client setup is not automatic under the declared pnpm policy, formatting is broadly noncompliant, and the main connected demo E2E workflow is red.
