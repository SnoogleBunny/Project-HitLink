# Alvin Onboarding Branch QA Report

Date: 2026-05-24 13:14 PDT
Tester: Codex
Branch tested: `origin/onboarding`
Commit tested: `3925265`
Local URL scope: `http://localhost:3000` only

## Executive Summary

The requested Vue static onboarding frontends could not be fully validated because the branch does not contain retrievable Vue app source. `apps/onboarding` is committed as a gitlink to `18a7d45aa44dbd62e880800266c7ce5d4c177279`, but the branch has no `.gitmodules` entry, so Git cannot initialize or fetch that submodule.

I performed the available local QA against the renderable `admin-web` owner onboarding/auth surface instead. Public login and signup interactions work, unauthenticated onboarding redirects to login, responsive layout is clean across desktop/tablet/mobile, and DOM snapshots were stable. The branch is not production-buildable as-is because `admin-web` fails `next build`.

## Scope

Tested:

- `apps/admin-web` public owner auth pages: `/login`, `/signup`
- Protected onboarding routing: `/onboarding`
- Automated repo checks: tests, lint, typecheck, production build
- Local browser interaction and responsive checks
- Local performance smoke checks using `curl`

Not tested:

- The requested Vue static frontend flows, because the source is not present or fetchable from the branch metadata.
- Full authenticated workspace creation in browser, because that would require creating database state and the instruction said not to touch SQL or migration flows. Unit tests for the onboarding transaction did run.

## Critical Findings

### P0 - Vue onboarding app is not recoverable from the branch

Evidence:

```text
git ls-tree HEAD apps/onboarding
160000 commit 18a7d45aa44dbd62e880800266c7ce5d4c177279 apps/onboarding
```

`git submodule status --recursive` fails with:

```text
fatal: no submodule mapping found in .gitmodules for path 'apps/onboarding'
```

Impact: the Vue static owner-flow frontends cannot be installed, served, tested, reviewed, or deployed from this branch alone.

### P0 - `admin-web` production build fails

Command:

```bash
pnpm build
```

Result: `admin-web#build` fails.

Primary error:

```text
apps/admin-web/lib/admin-access.ts:3:1
You're importing a module that depends on "next/headers".
This API is only available in Server Components in the App Router,
but you are using it in the Pages Router.
```

Concrete trace:

- `apps/admin-web/app/dashboard/forms/form-version-upload-form.tsx:5` imports `emptyFormState` from `../../../lib/admin-access`.
- `apps/admin-web/lib/admin-access.ts:3` imports `cookies` from `next/headers`.
- Because `form-version-upload-form.tsx` is a client component, this pulls server-only code into the client graph.

Secondary build error:

```text
Module not found: Can't resolve '.prisma/client/index-browser'
```

Impact: the branch cannot produce a clean production build.

## Automated Checks

| Check | Result | Notes |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Pass with warning | pnpm ignored build scripts for Prisma/esbuild until explicitly generated. |
| `pnpm --filter @flowstate/db db:generate` | Pass | Generated Prisma Client only. No SQL or migration files edited. |
| `pnpm test` | Pass | 10 workspace tasks successful. Admin: 23 files, 117 tests. Member: 7 files, 29 tests. Auth: 1 file, 6 tests. |
| `pnpm lint` | Pass | 8 workspace tasks successful. |
| `pnpm check-types` | Pass | 8 workspace tasks successful. |
| `pnpm build` | Fail | `admin-web` build failure described above. |

## Browser E2E Results

| Flow | Result | Notes |
| --- | --- | --- |
| `/login` renders | Pass | Login form, email input, password input, submit button, signup link present. |
| Empty login submit | Pass | Shows `Email and password are required.` |
| Login to signup link | Pass | Navigates to `/signup`. |
| `/signup` renders | Pass | Full name, email, password, confirm password, submit button, login link present. |
| Signup mismatched passwords | Pass | Shows `Passwords do not match.` |
| Signup to login link | Pass | Navigates to `/login`. |
| `/onboarding` unauthenticated | Pass | Redirects to `/login` with 307. |

## Responsive And Alignment Checks

Viewports tested:

- Desktop: 1280 x 720
- Tablet: 768 x 1024
- Mobile: 390 x 844

Results:

| Page | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| `/login` | No horizontal overflow, no offscreen controls | No horizontal overflow, no offscreen controls | No horizontal overflow, no offscreen controls |
| `/signup` | No horizontal overflow, no offscreen controls | No horizontal overflow, no offscreen controls | No horizontal overflow, no offscreen controls |

Screenshots:

- ![[assets/login-desktop.png]]
- ![[assets/login-tablet.png]]
- ![[assets/login-mobile.png]]
- ![[assets/signup-desktop.png]]
- ![[assets/signup-tablet.png]]
- ![[assets/signup-mobile.png]]

## Stability And Console Notes

The public auth pages had stable DOM snapshots over repeated polling:

| Page | Unique snapshots across 4 samples |
| --- | --- |
| `/login` | 1 |
| `/signup` | 1 |

No flickering or rerender loop was observable on the renderable public pages. The browser log store retained stale Prisma errors from the pre-generation run, but after Prisma Client generation and dev-server restart the pages returned 200s and rendered normally.

## Local Performance Smoke

Warm local `curl` timings:

| URL | Status | Runs |
| --- | --- | --- |
| `/login` | 200 | 33ms, 36ms, 25ms |
| `/signup` | 200 | 25ms, 34ms, 23ms |
| `/onboarding` | 307 to `/login` | 2.7ms, 3.2ms, 2.5ms |

These numbers are local development timings, not production Lighthouse numbers.

## Recommendations

1. Restore the Vue frontend source or add the missing `.gitmodules` mapping for `apps/onboarding`.
2. Fix the `admin-web` client/server import boundary by moving shared form state out of `lib/admin-access.ts` into a client-safe module such as `lib/route-decisions.ts`, or by importing `emptyFormState` directly from the client-safe source.
3. Ensure Prisma generation is part of the expected setup path for clean installs.
4. After the Vue app is recoverable, rerun E2E across every static owner-flow screen and every interactable control.

