# Current Flowstate Standard baseline

**Status:** `TECHNICALLY_VERIFIED` repository snapshot; root package gates are `BLOCKED` by missing local prerequisites  
**Snapshot date:** 2026-09-22  
**Product:** Flowstate Standard only  
**Base snapshot commit:** `d4f2098b4940cae61b9f36345cb480bda33d990d` on `hermes/pro-wp0-1-baseline`  
**WP0.1 documentation candidate:** [`evidence/wp0.1-standard-baseline/candidate-manifest.txt`](evidence/wp0.1-standard-baseline/candidate-manifest.txt)  
**Worktree:** `/Users/alvinlo/Desktop/Project-HitLink-wp0-1`

## 1. Purpose and non-claim

This file freezes reproducible repository evidence about the existing one-location gym product so later Flowstate Pro work does not reuse Standard identities, roles, schema, data, sessions, stores, Stripe resources, migrations, or direct database-access patterns as clinical foundations.

It does not establish production behavior, legal compliance, operational effectiveness, a clean release candidate, or any implemented Pro model/control. No local database, customer/demo payload, `.env` file, production credential, vendor console, or external system was inspected.

## 2. Snapshot identity and limitations

| Item | Observed result |
|---|---|
| Git worktree | `/Users/alvinlo/Desktop/Project-HitLink-wp0-1` |
| Branch | `hermes/pro-wp0-1-baseline` |
| HEAD | `d4f2098b4940cae61b9f36345cb480bda33d990d` |
| Requested base | `d4f2098` — matches HEAD |
| Initial dirty state | `?? docs/compliance/flowstate-pro/work-packets/` (the allowed WP0.1 packet directory) |
| Remote | `origin`, SSH URL redacted in review evidence |
| Node | `v22.23.0` |
| pnpm | not available on `PATH` |
| Corepack | `0.34.6`; `corepack pnpm --version` resolved pinned pnpm `10.33.0` |
| Git | `2.50.1 (Apple Git-155)` |
| Platform | macOS `26.6.2` build `25G83`, `arm64` |
| Dependencies | `node_modules` absent; no install performed |

The unrelated `.DS_Store` modification in the original worktree was not copied or modified. See `evidence/wp0.1-standard-baseline/snapshot-and-toolchain.txt`.

## 3. Reproducible counts

### Prisma schema and migrations

Run from the repository root:

```bash
python3 - <<'PY'
import pathlib, re, subprocess
root = pathlib.Path('.')
schema = (root / 'packages/db/prisma/schema.prisma').read_text()
models = re.findall(r'^model\s+(\w+)\s*\{', schema, re.M)
enums = re.findall(r'^enum\s+(\w+)\s*\{', schema, re.M)
tracked = subprocess.check_output(['git', 'ls-files'], text=True).splitlines()
migrations = [
    path for path in tracked
    if re.fullmatch(r'packages/db/prisma/migrations/[^/]+/migration\.sql', path)
]
print(f'models={len(models)} enums={len(enums)} migration_sql={len(migrations)}')
PY
```

Observed result:

- **65** Prisma models.
- **48** Prisma enums.
- **16** committed `migration.sql` files.

### Direct Prisma delegate-call inventory

The exact per-file output is in `evidence/wp0.1-standard-baseline/prisma-inventory.txt`.

Rules:

- Inputs are tracked `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, and `.cjs` files from `git ls-files`.
- Model delegate names are generated from the current schema model names by lowercasing the first character.
- A call is counted when source text across whitespace/newlines matches `(prisma|db|tx).<schema delegate>.<method>(`.
- Production excludes `test`, `tests`, `__tests__`, `fixture(s)`, and `script(s)` directories, `*.test.*`, `*.spec.*`, and Prisma seed/verification executables.
- The count includes multiline calls. It is static and does not prove runtime reachability, execution frequency, transaction count, or aliases other than `prisma`, `db`, and `tx`.

Observed result:

| Scope | Calls | Files |
|---|---:|---:|
| Production tracked source | **363** | **39** |
| Production outside `packages/db` | **299** | **36** |
| Excluded tests/fixtures/scripts | **181** | **6** |

The regenerated production counts match the historical plan values, but this snapshot—not the historical prose—is the evidence source.

### Raw SQL

A tracked-code search for `$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, and `$executeRawUnsafe` found **0 call sites**. This does not prove that PostgreSQL receives no generated SQL; it means no application raw-SQL API call was found under the stated static rules.

## 4. Implemented boundary inventory

### Applications and packages

| Classification | Boundary | Evidence |
|---|---|---|
| `IMPLEMENTED` | Owner/coach Next.js application | `apps/admin-web/package.json`, `apps/admin-web/app/`, `apps/admin-web/lib/` |
| `IMPLEMENTED` | Member/public-trial/signing Next.js application | `apps/member-web/package.json`, `apps/member-web/app/`, `apps/member-web/lib/` |
| `IMPLEMENTED` | Public landing/waitlist Next.js application | `apps/landing-web/package.json`, `apps/landing-web/app/`, `apps/landing-web/lib/waitlist.ts` |
| `IMPLEMENTED` | Thin API app with health endpoint | `apps/api/app/api/v1/health/route.ts` |
| `IMPLEMENTED` | Shared auth/session package | `packages/auth/src/session.ts` |
| `IMPLEMENTED` | Standard Prisma client/schema and domain helpers | `packages/db/src/index.ts`, `packages/db/src/`, `packages/db/prisma/schema.prisma` |
| `IMPLEMENTED` | Shared UI/config/types/tooling packages | `packages/ui`, `packages/config`, `packages/types`, `packages/eslint-config`, `packages/typescript-config` |
| `UNKNOWN` | Actual deployment topology, regions, TLS termination, backup configuration, infrastructure logs, database encryption, and production access | Not provable from this repository snapshot |

### HTTP, server-action, and data boundaries

- **5 route handlers** are implemented:
  - `apps/api/app/api/v1/health/route.ts`.
  - `apps/admin-web/app/api/stripe/webhook/route.ts`.
  - `apps/admin-web/app/dashboard/forms/[formId]/versions/[versionId]/file/route.ts`.
  - `apps/member-web/app/app/forms/[requestId]/document/route.ts`.
  - `apps/member-web/app/sign/forms/[token]/document/route.ts`.
- **28 server-action modules** exist under the three web applications. They cover logout, signup/login/onboarding, programs, rooms, schedule/roster/attendance, bookings, members, forms/signing, migration, membership/access products, billing/Stripe settings, member checkout/billing, trial booking, and the landing waitlist. Exact paths are reproducible with:

```bash
python3 - <<'PY'
from pathlib import Path
import subprocess

paths = []
for path in subprocess.check_output(['git', 'ls-files'], text=True).splitlines():
    if path.startswith('apps/') and Path(path).suffix in {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'}:
        if '"use server"' in Path(path).read_text(errors='ignore'):
            paths.append(path)
print(len(paths))
print(*paths, sep='\n')
PY
```

- Standard business behavior is mostly app-local server actions and library functions; `apps/api` is not the main Standard business API.
- Direct Prisma delegate-call expressions are present in **36 production files outside `packages/db`**. The exact files and call counts are listed in `evidence/wp0.1-standard-baseline/prisma-inventory.txt`.
- Shared domain helpers in `packages/db/src/class-access.ts`, `packages/db/src/forms.ts`, and `packages/db/src/notification-outbox.ts` account for **64** production delegate calls; the remaining **299** are outside `packages/db`.

### Authentication and sessions

| Classification | Observation | Exact path |
|---|---|---|
| `IMPLEMENTED` | Separate Standard admin and member cookie names; opaque random session token, SHA-256 hash in PostgreSQL, HTTP-only/Lax cookie, secure flag in production | `packages/auth/src/session.ts` |
| `IMPLEMENTED` | Seven-day absolute expiry; no idle-expiry or MFA control observed | `packages/auth/src/session.ts` |
| `IMPLEMENTED` | Database session record includes current active workspace role; Standard roles are `OWNER`, `COACH`, `CUSTOMER` | `packages/auth/src/session.ts`, `packages/db/prisma/schema.prisma` |
| `IMPLEMENTED` | Admin/member proxies redirect based on session-cookie presence; server-side helpers perform session/role/workspace checks | `apps/admin-web/proxy.ts`, `apps/member-web/proxy.ts`, `apps/admin-web/lib/admin-access.ts`, `apps/member-web/lib/member-auth.ts` |
| `UNKNOWN` | Production cookie-domain/origin isolation, reverse-proxy header trust, device policy, revocation operations, and access monitoring | Requires deployed configuration/operational evidence |

### Files, providers, jobs, logging, browser, and filesystem surfaces

| Classification | Observation | Exact path |
|---|---|---|
| `IMPLEMENTED` | Form PDFs are uploaded and stored as `Bytes` in PostgreSQL with filename, MIME, size, and SHA-256 metadata | `apps/admin-web/app/dashboard/forms/actions.ts`, `apps/admin-web/lib/forms.ts`, `packages/db/prisma/schema.prisma` (`FormVersion`) |
| `IMPLEMENTED` | Owner, member-session, and token-path document routes serve stored bytes with private revalidation caching and inline filenames | form route handlers listed above |
| `IMPLEMENTED` | Stripe SDK use, Connect account references, checkout/session flows, billing state, and authenticated webhook route | `apps/admin-web/lib/stripe-billing.ts`, `apps/admin-web/app/api/stripe/webhook/route.ts`, `apps/member-web/lib/member-commerce.ts`, `apps/member-web/lib/member-billing.ts` |
| `IMPLEMENTED` | Database notification outbox helper stores recipient, subject/body, attempts, provider message ID, and provider failure text | `packages/db/src/notification-outbox.ts`, `packages/db/prisma/schema.prisma` (`NotificationJob`) |
| `IMPLEMENTED` | Notification enqueueing, persistence, retry/processing, and adapter logic exists and is exported, but no production caller or scheduler for `enqueueNotificationJob` or `processNotificationOutbox` was found; outbound delivery is therefore unwired and not runtime-verified | `packages/db/src/notification-outbox.ts`, `packages/db/src/index.ts` |
| `IMPLEMENTED` | Landing waitlist appends business-contact/application submissions to a configurable filesystem JSONL path; default is `data/waitlist-submissions.jsonl` | `apps/landing-web/lib/waitlist.ts` |
| `IMPLEMENTED` | Application console warnings exist for blocked onboarding/migration acknowledgements; seed/reset scripts also use console output but are excluded scripts | `apps/admin-web/app/onboarding/actions.ts`, `apps/admin-web/app/dashboard/migration/actions.ts`, `packages/db/prisma/*.mjs` |
| `UNKNOWN` | A bounded tracked-source static search found no application use of `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, or service workers; this is a negative search result, not implemented behavior | tracked source static search; runtime/browser state not inspected |
| `UNKNOWN` | Absence of Web Storage calls does not establish absence of browser/framework/CDN caches, access logs, browser history, extensions, or telemetry in deployment | Requires browser/network and infrastructure evidence |
| `UNKNOWN` | No general application logger/redaction boundary or telemetry SDK was identified; production platform logging is not visible here | repository and deployment review required |

## 5. Implemented, schema-only, historical, and unknown claims

| Status | Claim | Evidence/limitation |
|---|---|---|
| `IMPLEMENTED` | One-location gym product with Standard owner/coach/customer identities, scheduling, bookings/waitlists, attendance, members/guardians, forms/signing, memberships/access products, Stripe billing, member portal, and migration workflows | Current code plus `packages/db/prisma/schema.prisma`; individual workflows still require exact runtime evidence |
| `IMPLEMENTED` | Migration intake/review/import operations and readiness gating exist | `apps/admin-web/lib/workspace-migration.ts`, migration actions/pages, schema migration/import models |
| `SCHEMA_ONLY` | Messaging conversations/messages/announcements/email templates are represented in schema without an exposed production workflow found | schema models `ConversationThread`, `ConversationParticipant`, `Message`, `Announcement`, `EmailTemplate`; no production delegate calls found for these delegates |
| `SCHEMA_ONLY` | Events and private lessons are represented in schema without an exposed production workflow found | schema models `Event`, `EventBooking`, `PrivateLessonSlot`, `PrivateLessonBooking`; no production delegate calls found |
| `SCHEMA_ONLY` | Progress/belt/promotion models are represented without an exposed production workflow found | schema models `ProgressModuleSetting`, `BeltDefinition`, `MemberProgressState`, `PromotionRecord`; no production delegate calls found |
| `SCHEMA_ONLY` | Deeper invoice/payment/refund/credit/policy/payment-method/failed-case models exist; current operational billing primarily uses membership billing state, billing records, Stripe references, and selected member/admin helpers | schema plus delegate inventory; model presence is not complete workflow proof |
| `HISTORICAL` | `docs/04-demo/Working Demo State.md` records a 2026-05-23 local demo and passing commands | Historical only; not rerun on this candidate |
| `HISTORICAL` | The plan recorded 65/48/16 and 363/39/299/36 counts | Regenerated here; historical text alone is not evidence |
| `UNKNOWN` | Production deployment, runtime volume, real outbound email behavior, cloud/host filesystem durability, backup/restore, retention, log destinations, and vendor agreement state | Outside repository evidence and prohibited from inspection in WP0.1 |

## 6. Sensitivity hotspots and trust-boundary implications

No payloads were copied. Paths below identify storage or flow surfaces only.

| Hotspot | Classification | Evidence and implication |
|---|---|---|
| Member and guardian identity/contact, DOB, notes, and tags | `IMPLEMENTED` | `Member` and `Guardian` in `packages/db/prisma/schema.prisma`; admin/member/trial code under `apps/admin-web/lib/members.ts`, `apps/member-web/lib/member-auth.ts`, and `apps/member-web/lib/trial-booking.ts` |
| Attendance and coach note | `IMPLEMENTED` | `AttendanceRecord.state` and `note`; roster/attendance code in `apps/admin-web/lib/rosters.ts` |
| PDF bodies and metadata | `IMPLEMENTED` | `FormVersion.fileData Bytes`, filename/MIME/hash/size; bytes returned through three document routes |
| Signing evidence | `IMPLEMENTED` | `SignatureRequest.tokenHash`, token-path signing, signer name/email snapshots, method, provider reference, IP, user agent, and signed time in `SignedDocument` |
| Migration access instructions and raw/mapped content | `IMPLEMENTED` | `WorkspaceMigration.accessInstructions`, `ImportSourceFile.rawContent`, `StagingRecord.rawData/mappedData`, validation messages, reconciliation JSON; migration admin flows in `apps/admin-web/lib/workspace-migration.ts` |
| Stripe metadata/references and provider failures | `IMPLEMENTED` | Workspace/member/product IDs are sent as Stripe metadata in billing helpers; schema stores account/customer/subscription/invoice/payment/refund IDs plus `failureCode`, `failureMessage`, and webhook `lastError` |
| Notification recipients and bodies | `IMPLEMENTED` storage/helper, unwired delivery | `NotificationJob.recipientEmail`, `subject`, `body`, `lastError`; enqueue/process/retry logic is exported, but no production caller or scheduler was found and no outbound delivery is runtime-verified |
| Staff invite token | `IMPLEMENTED` plaintext-at-rest hotspot | `StaffInvite.token String @unique`; `apps/admin-web/lib/staff-invites.ts` generates and stores the raw token rather than a hash |
| Session and signature tokens | `IMPLEMENTED` hashed-at-rest | `AuthSession.tokenHash`, `SignatureRequest.tokenHash`; bearer session/signature tokens still exist in cookies or paths while in use |
| URL/query exposure | `IMPLEMENTED` risk surface | Signature bearer token is a route segment under `apps/member-web/app/sign/forms/[token]/`; member search accepts `q` in `apps/admin-web/app/dashboard/members/page.tsx`; roster date and migration state also use query parameters |
| Host-derived return URLs | `IMPLEMENTED` risk surface | Member Stripe return/success/cancel URLs derive protocol/host from `x-forwarded-proto`, `x-forwarded-host`, or `host` in member billing/membership actions; deployed proxy trust is `UNKNOWN` |
| Console/error/provider text | `IMPLEMENTED` surfaces | App `console.warn` sites, Stripe/provider failure strings, webhook `lastError`, import failure messages, validation messages, and notification `lastError` require payload-aware review; no general redaction boundary was found |
| Filesystem landing waitlist | `IMPLEMENTED` | Owner name, gym, email, style, note, and timestamp append to JSONL through `apps/landing-web/lib/waitlist.ts`; deployed path, encryption, access, backup, and lifecycle are `UNKNOWN` |

## 7. Required root command state

The exact commands were run from this worktree. All failed before project execution because `pnpm` was unavailable on `PATH`; `node_modules` was also absent. These are **blocked checks**, not passes.

| Command | Exit | Duration | Result |
|---|---:|---:|---|
| `pnpm db:generate` | 127 | 0.002887 s | `pnpm: command not found` |
| `pnpm db:validate` | 127 | 0.002062 s | `pnpm: command not found` |
| `pnpm test` | 127 | 0.001955 s | `pnpm: command not found` |
| `pnpm lint` | 127 | 0.001940 s | `pnpm: command not found` |
| `pnpm check-types` | 127 | 0.001774 s | `pnpm: command not found` |
| `pnpm build` | 127 | 0.001891 s | `pnpm: command not found` |
| `pnpm exec playwright test --list` | 127 | 0.001834 s | `pnpm: command not found` |

Corepack itself resolved the repository-pinned pnpm `10.33.0`, but WP0.1 did not install dependencies, create a shim, or substitute a different command for the required exact baseline. See `evidence/wp0.1-standard-baseline/root-command-results.txt`.

## 8. Explicit non-claims and Pro separation implications

- No Flowstate Pro application, identity, role, session, schema, migration, clinical model, RLS policy, audit ledger, legal-hold control, regional data plane, vendor, billing configuration, or production control is implemented in this snapshot.
- Standard's `OWNER`, `COACH`, and `CUSTOMER` roles are not Pro roles.
- Standard's database-backed seven-day sessions, direct Prisma imports, application-filter scoping, PostgreSQL PDF blobs, filesystem waitlist, Stripe objects, notification records, and migration stores are evidence of Standard boundaries, not approved Pro foundations.
- No Standard-to-Pro migration exists or is authorized.
- Repository evidence cannot prove production geography, encryption, logging, backups, retention, contracts, agreements, or operational access controls.
- Gate G0 remains blocked. WP0.1 cannot approve its own evidence or authorize Pro implementation.

## 9. Gaps, reviewers, and next authorized packet

Required review remains:

- **Database:** schema/model/enum/migration counts, delegate-call rules, and direct-access inventory.
- **Backend:** production/excluded call-site classification and route/action boundary inventory.
- **Security/Privacy:** hotspot, trust-boundary, logging, token, URL, file, and external-unknown wording.
- **QA/Assurance:** reproducibility, redaction, blocked root commands, content checks, and hidden-failure review.
- **CEO/Product owner:** WP0.1 acceptance within the wider dossier; this review does not by itself grant G0.

The next authorized work packet is **WP0.2 — Author the product and architecture specifications**. Gate G0 remains `BLOCKED` pending the complete dossier, conflict resolution, and named human approvals.
