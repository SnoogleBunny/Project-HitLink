# Localization readiness recovery evidence

Task: `t_3c067f23`
Audit date: 2026-07-20
Scope: repository state at `main` / `4dd5557`

## Outcome

No product wording was changed. This audit finds that Flowstate has readable English source copy and a sound workspace-timezone foundation, but it is **not yet localization-ready end to end**. User-visible copy, validation messages, email payloads, weekday labels, dates, times, and monetary values are mostly embedded directly in implementation code. There is no locale resolver, message catalogue, persisted language preference, or automated locale-variation coverage.

The clearest recovery path is to keep the MVP English-only, explicitly decide the source language/region contract, then introduce stable keys, formatter boundaries, and error/email contracts before commissioning translations. Flowstate must not claim support for any language beyond English based on the current implementation.

## Status vocabulary

This report uses the task's required status vocabulary:

- **implemented** — present in the current implementation and supported by concrete code or test evidence.
- **partial** — useful implementation exists, but the area is not localization-ready end to end.
- **missing** — the required localization-readiness capability is absent.
- **contradicted** — current documentation and implementation make materially different claims.
- **not applicable** — explicitly outside the approved MVP or this audit's scope.

## Executive status matrix

| Area | Status | Evidence-based conclusion |
| --- | --- | --- |
| Plain-English source copy | **implemented** | Owner, member, guardian, billing, forms, migration, and landing surfaces contain extensive English source copy. This is source copy only, not evidence of translated-language support. |
| Declared source language/region contract | **partial** | HTML declares `lang="en"`, formatters generally use `en-CA`, and monetary records default to `usd`. These can coexist technically, but the intended source locale and regional conventions are not documented as one stable contract. |
| Internationalization framework and message catalogues | **missing** | No common i18n dependency, locale/translation file, provider, translation hook, or message lookup was found. |
| Locale resolution and fallback | **missing** | No URL, workspace, user, cookie, session, or request-header locale resolver was found. |
| Workspace/user language persistence | **missing** | Prisma persists a location timezone and currency per financial record, but no workspace, user, member, guardian, notification, or template locale/language field. |
| User-interface and form-copy extraction | **missing** | English strings are embedded in JSX/TSX and formatter/domain modules rather than addressed by stable keys. |
| Validation and error-copy readiness | **partial** | English messages are generally plain and are often tested exactly, but code transports final rendered strings rather than stable error codes plus localized presentation. Some Stripe/provider messages are displayed directly. |
| Operational timezone calculations | **implemented** | `Location.timezone`, zoned occurrence helpers, and timezone-boundary tests exist. |
| Date/time/weekday presentation | **partial** | `Intl.DateTimeFormat` is used, but locale is fixed and most presentation calls do not specify the workspace timezone. Weekday names and 12-hour time strings are hardcoded in English. |
| Currency and number presentation | **partial** | Currency values are persisted and most money views use `Intl.NumberFormat`; locale is fixed to `en-CA`, formatter logic is duplicated, and at least one billing option renders cents with manual `toFixed(2)`. |
| Email localization contract | **partial** | A durable outbox and template-kind enum exist, but jobs store rendered English subject/body with no locale, message key, variables, or template version. |
| Documented launch-email coverage | **contradicted** | Product/email docs describe several launch emails as sent, while inspected producer code only enqueues the migration-ready announcement; current demo docs separately say staff invite email is incomplete. |
| Migration import language/region handling | **partial** | Imports are UTF-8 and accept normalized aliases, but canonical headers, statuses, weekday aliases, booleans, issue text, date format, and examples are English/ISO-specific. |
| Automated localization tests | **missing** | Existing tests verify English text and timezone behavior, but no test varies locale, language, region, text direction, plural rules, number/date conventions, or fallback behavior. |
| Additional launch languages | **not applicable** | Canonical MVP material does not commit to languages beyond English. Any future translation remains a draft until qualified human review. |
| Native-app localization | **not applicable** | The approved MVP is web-only; native mobile is deferred. |

## Evidence / technical details

### Audit boundary and method

Inspected:

- required project guidance: `.hermes.md`, `README.md`, `docs/product_decisions_ledger.md`, `docs/mvp_ticket_board.md`, `docs/domain_model.md`, `docs/engineering_rules.md`, `docs/04-demo/Working Demo State.md`, `docs/Agents/Agent Operating Model.md`, and `docs/Agents/Localization Content.md`;
- current Prisma source of truth: `packages/db/prisma/schema.prisma`;
- all 14 `migration.sql` files plus `packages/db/prisma/migrations/migration_lock.toml`;
- 239 files under `apps/`, targeted shared-package code, and all 35 `*.test.*` / `*.spec.*` files;
- Git branch, status, recent history, tracked diff, and untracked paths before writing this report.

Searches found no common translation-library usage (`next-intl`, `react-intl`, `i18next`, FormatJS, Lingui), no translation hook/provider usage, and no filenames containing `i18n`, `locale`, or `translation` in the application repository.

A conservative static-copy heuristic found 850 candidate text/label/placeholder literals across 108 non-test UI files (668 admin, 140 member, 42 landing). This is an audit heuristic, not a catalogue count: interpolated fragments and repeated literals can inflate it, while dynamically constructed strings can be missed.

### LOC-F01 — No message catalogue or locale runtime

Status: **missing**

Evidence:

- Root and app manifests contain Next.js, React, Stripe, and project packages but no i18n runtime: `package.json:28-33`, `apps/admin-web/package.json:14-22`, `apps/member-web/package.json:14-21`.
- All four web layouts set a fixed English language tag: `apps/admin-web/app/layout.tsx:26`, `apps/member-web/app/layout.tsx:26`, `apps/landing-web/app/layout.tsx:56`, `apps/api/app/layout.tsx:16`.
- No locale-prefixed route, message-loading boundary, translation provider, hook, key function, fallback chain, or catalogue file was found.

Impact:

- Copy changes require editing source code.
- Adding a second locale would require finding and restructuring strings across all surfaces.
- There is no deterministic fallback behavior, and no way to prove which locale generated a screen or email.

### LOC-F02 — English UI and form copy is embedded in components

Status: **missing**

Representative evidence:

- Waitlist labels, offer copy, states, and button text are literals: `apps/landing-web/app/waitlist-form.tsx:15-45`, `:63-150`.
- Trial booking confirmation, labels, placeholders, guardian guidance, and pending state are literals: `apps/member-web/app/trial/[workspaceId]/trial-booking-form.tsx:35-60`, `:69-151`.
- Member forms headings, empty states, count fragments, and history wording are literals: `apps/member-web/app/app/forms/page.tsx:24-103`.
- Public-signing headings, status labels, pending labels, and link-state copy are literals: `apps/member-web/app/sign/forms/[token]/page.tsx:39-99`.
- Migration upload labels, helper copy, error rendering, and actions are literals: `apps/admin-web/app/dashboard/migration/migration-upload-form.tsx:23-58`.
- Dashboard metrics and attention items are assembled from English fragments: `apps/admin-web/lib/dashboard.ts:104-120`, `:200-224`.

Impact:

- Translators would have no stable identifiers or context notes.
- Concatenation and manual plural suffixes prevent reliable plural/grammar handling; for example, `required form` + `s` in `apps/member-web/app/app/forms/page.tsx:33-35`.
- Text expansion and reordered placeholders cannot be reviewed safely without changing implementation.

### LOC-F03 — Validation/error text is readable but coupled to English strings

Status: **partial**

Positive evidence:

- Messages are usually direct, actionable English. Examples include `Choose a valid upcoming date for this class.` and `Enter a valid email address.`
- Unit tests protect current behavior: 55 exact `message:` or `error:` English fixture/assertion lines occur across 20 test files.
- Examples: `apps/admin-web/lib/bookings.test.ts:220-273`, `apps/admin-web/lib/members.test.ts:185-238`, and `apps/member-web/app/login/actions.test.ts:118-127`.

Readiness gaps:

- Application/domain results generally return the final string in a `message` or `error` field instead of a stable machine code plus parameters.
- Migration issues mix stable-looking codes with rendered English text: `apps/admin-web/lib/workspace-migration.ts:257-271`, `:489-495`, `:705-725`.
- Exact-English tests will make extraction noisier unless tests move to error codes and separately test the English catalogue.
- Stripe failure text is persisted and displayed directly: extraction at `apps/member-web/lib/member-billing.ts:136-147`; member/admin display at `apps/member-web/app/app/billing/page.tsx:61-64`, `:118-120`, `apps/admin-web/app/dashboard/billing/page.tsx:98-100`, and `apps/admin-web/app/dashboard/members/[memberId]/billing/page.tsx:220-224`, `:392-394`.

Payment review need:

- Provider failure codes should map to approved owner/member wording. Raw provider text must remain diagnostic data, not the only user-facing localized message.

### LOC-F04 — No persisted locale or language preference

Status: **missing**

Evidence:

- `Workspace` has identity and product relations but no locale/language field: `packages/db/prisma/schema.prisma:387-401`.
- `Location` correctly stores `timezone`, address, and optional `countryCode`, but no locale: `packages/db/prisma/schema.prisma:487-500`.
- `User`, member, guardian, session, email template, notification job, and notification recipient shapes contain no locale/language field.
- All migrations were inspected. The initial migration creates `locations.timezone` at `packages/db/prisma/migrations/20260404043358_init_phase2_slice1/migration.sql:35-43`; no later migration introduces locale/language persistence.

Decision required before implementation:

- Decide whether English-only MVP uses one workspace source locale, per-user locale, request negotiation, or a staged combination. Do not add speculative locale columns before Product/UX/Frontend/Backend/Database agree on the selection and fallback rules.

### LOC-F05 — Operational timezone handling is strong; presentation is inconsistent

Status: **partial** overall
Operational calculation sub-area: **implemented**

Positive evidence:

- Workspace operations receive `Location.timezone`.
- `packages/db/src/occurrences.ts:111-181` resolves zoned parts and converts local class times to UTC.
- `packages/db/src/occurrences.ts:208-247` compares occurrence dates against the workspace-local date.
- Timezone boundary behavior is covered with `America/Vancouver` in `apps/member-web/lib/trial-booking.test.ts:100-121`, `apps/admin-web/lib/bookings.test.ts:105-166`, and related roster tests.

Presentation gaps:

- There are 27 non-test `Intl.DateTimeFormat` calls; only 4 include an explicit `timeZone` option and 23 do not.
- Member form signing/history formatters omit the workspace timezone: `apps/member-web/app/app/forms/page.tsx:10-14`, `apps/member-web/app/sign/forms/[token]/page.tsx:6-14`.
- Similar page-local formatters are duplicated throughout admin/member billing, forms, members, programs, rooms, schedules, and invites.
- Some UTC display is intentional for date-only records, for example `packages/db/src/occurrences.ts:193-197`; the missing contract is a shared distinction between date-only, workspace-local date/time, and audit/server timestamp.

Risk:

- Server-rendered timestamps can vary with runtime timezone instead of the gym timezone.
- A future locale change may alter output while leaving the wrong timezone source untouched.

### LOC-F06 — Weekday and clock presentation is English/12-hour specific

Status: **partial**

Evidence:

- English weekday labels are hardcoded in `packages/db/src/occurrences.ts:13-21` and again in `apps/admin-web/lib/class-templates.ts:15-23`.
- `formatMinutesAsTime` manually emits `AM`/`PM`: `packages/db/src/occurrences.ts:184-190`; an equivalent implementation appears in `apps/admin-web/lib/class-templates.ts:253-263`.
- Occurrence labels concatenate English grammar: ``weekday, date at time`` at `packages/db/src/occurrences.ts:200-205`.
- Tests lock 12-hour output: `apps/admin-web/lib/class-templates.test.ts:64-67`, `:380-382`.

Recovery implication:

- Use locale-aware weekday/time formatting and a complete message pattern such as `{weekday}, {date} at {time}` in a catalogue. Do not translate isolated concatenated fragments.

### LOC-F07 — Currency data is supported; localized monetary presentation is fragmented

Status: **partial**

Positive evidence:

- Monetary amounts are stored in integer cents with currency codes across plans, products, records, invoices, payments, refunds, credits, events, and lessons: representative schema fields at `packages/db/prisma/schema.prisma:794-797`, `:835-838`, `:1173-1176`, `:1208-1211`.
- Most current price readouts use `Intl.NumberFormat` with the record's currency, for example `apps/member-web/app/app/billing/page.tsx:23-31` and `apps/admin-web/app/dashboard/billing/page.tsx:23-27`.

Readiness gaps:

- Every money formatter found fixes the locale to `en-CA`.
- Formatter code is duplicated across billing, membership, access-product, and plan surfaces rather than using one tested locale/currency boundary.
- `apps/admin-web/app/dashboard/members/[memberId]/billing/billing-forms.tsx:38-42` manually renders uppercase currency plus `(cents / 100).toFixed(2)`.
- Schema/migration defaults are `usd`, while the display locale is `en-CA`: examples at `packages/db/prisma/migrations/20260408130000_memberships_billing_slice/migration.sql:69-74` and `packages/db/prisma/migrations/20260409160000_access_products_waitlist_slice/migration.sql:59-64`, `:109-114`. This is not inherently invalid, but it must be an explicit region/currency decision rather than an accidental mix.

Payment review need:

- Confirm currency-entry constraints, currency symbol/code disambiguation, decimal rules, and Stripe-supported currency behavior with Backend, QA, and payment-domain review before any regional expansion.

### LOC-F08 — Email outbox exists without a localizable rendering contract

Status: **partial**

Positive evidence:

- The schema has `EmailTemplateKind`, `NotificationJob`, and `EmailTemplate` concepts.
- `NotificationJob` persists recipient, rendered subject/body, state, retry, and provider metadata: `packages/db/prisma/schema.prisma:1715-1729`.
- The outbox trims and queues subject/body and has delivery/retry boundaries: `packages/db/src/notification-outbox.ts:77-138`, `:148-224`.

Readiness gaps:

- Neither `EmailTemplate` nor `NotificationJob` persists a rendering locale, source message key, interpolation variables, or template version: `packages/db/prisma/schema.prisma:1715-1747`.
- The only inspected application producer is the migration-ready announcement, whose English subject/body are assembled in an action: `apps/admin-web/app/dashboard/migration/actions.ts:123-143`.
- Once rendered English is saved, a retry is stable, but there is no auditable way to answer which locale/catalogue generated it.

Contradiction:

- `docs/product_decisions_ledger.md` under “Email at launch” lists trial confirmation, booking confirmation, class reminders, failed-payment notices, and announcements.
- `docs/emailing_system_plain.md:1-13` states that Flowstate sends these categories.
- Current demo guidance says staff invite email/acceptance is not complete: `docs/04-demo/Working Demo State.md:45-47`.
- Inspected producer code did not show trial, booking, reminder, or failed-payment email creation. The outbox foundation and enum are not evidence that those customer emails are implemented.

Required correction:

- Reconcile product documentation with actual producer coverage before localizing email. Keep incomplete categories labelled planned/partial rather than sent.

### LOC-F09 — Migration intake assumes English canonical data conventions

Status: **partial**

Positive evidence:

- CSV is decoded as UTF-8, accepts BOMs, and normalizes headers: `apps/admin-web/lib/workspace-migration.ts:465-474`.
- Alias-based field lookup is bounded and auditable: `apps/admin-web/lib/workspace-migration.ts:242-288`.

Readiness gaps:

- Member headers use English aliases such as `full_name`, `member_name`, `birthdate`, `parent_name`, and `guardian_name`: `apps/admin-web/lib/workspace-migration.ts:477-519`.
- Date-only intake accepts only `YYYY-MM-DD`: `apps/admin-web/lib/workspace-migration.ts:167-176`, with an English warning at `:489-495`.
- Weekdays accept English names/abbreviations only: `apps/admin-web/lib/workspace-migration.ts:345-367`.
- Time parsing recognizes numeric time plus English `am`/`pm`: `apps/admin-web/lib/workspace-migration.ts:370-399`.
- Schedule-import issue copy gives English examples: `apps/admin-web/lib/workspace-migration.ts:705-725`.
- The upload UI refers to “canonical CSV headers” without exposing a versioned import contract: `apps/admin-web/app/dashboard/migration/migration-upload-form.tsx:36-42`.

Recovery implication:

- Keep one locale-neutral canonical import contract (UTF-8, ISO dates, machine status codes) and version it. Add source-system/locale adapters only when a real migration requires them; do not silently parse ambiguous regional dates.

### LOC-F10 — Consent and policy wording needs specialist review before translation

Status: **missing** review evidence

Evidence:

- Signature consent is embedded directly in the component: `apps/member-web/app/_components/form-signature-form.tsx:60-84`.
- The component records a full legal name, optional email, and checkbox acceptance, then confirms a saved signature: `apps/member-web/app/_components/form-signature-form.tsx:43-50`, `:60-84`.
- Membership policy references and form/PDF content are persisted as workspace-authored text, not system-localized copy: representative schema fields at `packages/db/prisma/schema.prisma:794-798`, `:1352-1355`.

Required reviews:

- **Legal/consent:** approve the source consent, signer/guardian distinctions, and what translated consent would mean. This audit makes no legal or compliance approval claim.
- **Accessibility:** review checkbox labelling, error association/live regions, embedded PDF access, and translated text expansion.
- **Native speaker:** required for any future translated consent, billing, or form copy. Any machine/agent translation must remain labelled **draft** until qualified human review.

### LOC-F11 — Tests protect English behavior, not localization behavior

Status: **missing** localization coverage

Evidence:

- All 35 test/spec files were inspected: 25 admin unit files, 7 member unit files, 1 auth unit file, and 2 Playwright specifications.
- Admin unit result: 25 files / 126 tests passed.
- Member unit result: 7 files / 29 tests passed.
- Prisma schema validation passed.
- Current unit tests cover timezone-sensitive business dates and exact English validation text.
- E2E selectors and assertions depend on English accessible names and text throughout `tests/e2e/flowstate-demo.spec.ts` and `tests/e2e/migration-first-onboarding.spec.ts`.
- No test was found that varies locale/language, loads a catalogue, checks fallback, validates placeholder completeness, exercises plural categories, checks text direction, or snapshots multiple regional formats.

Interpretation:

- The passing suite is useful baseline behavior evidence; it does not establish localization readiness.

## Recommended source-copy and key contract

This is a proposed implementation contract, not evidence of an implemented framework and not a translation approval.

### Key structure

Use stable semantic keys, not English sentences as keys:

`<surface>.<domain>.<flow-or-component>.<element>[.<state>]`

Examples:

- `admin.migration.handoff.complete.button`
- `admin.migration.csv.dateOfBirth.invalid`
- `member.forms.signature.consent.checkboxLabel`
- `member.trial.booking.confirmation.summary`
- `shared.validation.email.invalid`
- `billing.failure.paymentMethodMissing`
- `email.migration.ready.subject`
- `email.migration.ready.body`

Rules:

1. Keys describe meaning and ownership, not layout position.
2. Use named variables (`{gymName}`, `{memberName}`, `{classDate}`, `{amount}`), never positional substitutions.
3. Use plural/select messages for counts and role/state variants; do not append `s` or concatenate translated fragments.
4. Keep domain/error codes stable and separate from presentation keys.
5. Format dates, times, numbers, and money at render time from typed values; do not interpolate preformatted server-English values unless the persisted channel intentionally stores a rendered snapshot.
6. Email jobs should record rendered subject/body **and** rendering provenance (locale, template key/version, and structured variables) so retries and support audits are deterministic.
7. Workspace-authored names, notes, announcements, and uploaded PDF/policy content are content, not interface translations. Preserve them verbatim and label their source language where future workflow requires it.

### Source locale decision

Before implementing catalogues, approve one explicit source contract:

- source language: English;
- source locale/region: decision required (`en`, `en-CA`, or another approved identifier);
- fallback: decision required;
- selection precedence: decision required (workspace, user, request, or fixed MVP English);
- HTML `lang`, date/number formatters, email rendering, and screenshots must use that same decision.

Do not infer supported launch languages from browser capabilities or add language selectors until backed by approved catalogues and human review.

## Bounded recovery tickets

### RL-LOC-001 — Approve the English source locale and fallback contract

Priority: P0, decision-first
Owners/reviewers: Product/CEO, Localization, UX, Frontend, Backend

Scope:

- Decide the English source locale/region and whether MVP locale is fixed or workspace-selected.
- Document selection precedence, fallback, and unsupported-locale behavior.
- Reconcile `lang="en"`, `en-CA` formatter usage, and USD defaults without changing pricing or market commitments.

Acceptance:

- One approved decision is recorded in canonical product/engineering docs.
- No additional launch language is claimed.
- Frontend, Backend, Database, UX, and QA have an unambiguous contract.

### RL-LOC-002 — Add a minimal locale runtime and typed catalogue boundary

Priority: P0 after RL-LOC-001
Owners/reviewers: Frontend, Backend, Localization, QA

Scope:

- Select one framework compatible with Next.js 16/React 19.
- Load the approved English source catalogue with deterministic fallback.
- Expose typed message keys and named variables.
- Set document `lang` from the resolved locale.

Acceptance:

- Missing keys fail CI or tests in a deterministic way.
- A fallback test passes.
- The implementation still exposes only approved English.
- No broad copy rewrite is included in this foundation ticket.

### RL-LOC-003 — Persist locale only at the approved ownership level

Priority: P1 after RL-LOC-001
Owners/reviewers: Backend, Database, Frontend, QA

Scope:

- If the approved contract requires persistence, add the smallest schema field(s), migration, validation, and resolver integration.
- Avoid per-user/per-member fields if MVP is workspace-fixed.
- Carry resolved locale into notification rendering.

Acceptance:

- Schema and every migration path are tested.
- Invalid/unsupported locales fall back safely.
- Timezone remains a separate setting from locale.
- Existing workspaces receive an explicit safe default.

### RL-LOC-004 — Centralize date, time, weekday, number, and money formatting

Priority: P1
Owners/reviewers: Frontend, Backend, QA, Localization

Scope:

- Create shared typed formatters for date-only, workspace-local date/time, audit timestamp, weekday/time, number, and money.
- Replace duplicate page-local formatters and manual `AM`/`PM` / `toFixed(2)` presentation in bounded slices.
- Require an explicit locale and, for instants, explicit timezone.

Acceptance:

- Tests cover at least the approved source locale plus one non-shipping contrast locale to prove architecture, without claiming support.
- Tests cover workspace timezone boundaries and date-only non-shift behavior.
- Currency tests cover code/symbol disambiguation and minor-unit behavior.
- No user-visible timestamp relies implicitly on server timezone.

### RL-LOC-005 — Separate domain errors from localized error presentation

Priority: P1, slice by domain
Owners/reviewers: Backend, Frontend, Localization, UX, QA

Scope:

- Introduce stable error codes and structured parameters.
- Map codes to source messages at the UI/channel boundary.
- Preserve diagnostic/provider details separately.
- Start with billing and migration because they carry payment/provider/import risk.

Acceptance:

- Existing exact-English behavior tests move to code assertions plus English catalogue tests.
- Unknown errors use an approved safe fallback.
- Raw Stripe/provider errors are not the sole member-facing text.
- UX and QA approve recovery clarity.

### RL-LOC-006 — Make email rendering locale-aware and reconcile coverage claims

Priority: P1 before launch-email expansion
Owners/reviewers: Backend, Localization, Product, QA

Scope:

- Inventory actual producers for each `EmailTemplateKind`.
- Correct docs that currently overstate implemented delivery.
- Render from versioned keys/templates with structured variables and resolved locale.
- Persist locale and template provenance alongside the rendered snapshot.

Acceptance:

- Every implemented producer has subject/body tests, fallback tests, and a plain-text rendering review.
- Incomplete categories are labelled planned/partial.
- Retries resend the same approved rendered snapshot.
- Native-speaker review is recorded before any translated email is called final.

### RL-LOC-007 — Version and document the canonical migration import contract

Priority: P1
Owners/reviewers: Backend, Workflow, Localization, QA

Scope:

- Publish canonical UTF-8 headers, machine statuses, ISO date/time expectations, currency codes, and validation codes.
- Keep errors addressable by stable code.
- Add source-system/locale adapters only for verified customer exports.

Acceptance:

- Ambiguous regional dates are rejected, not guessed.
- Fixtures cover BOM/Unicode names and at least one non-ASCII customer record.
- English headers are documented as canonical technical identifiers, not translated UI promises.
- Migration issue UI renders approved source messages from issue codes.

### RL-LOC-008 — Run content, accessibility, legal/payment, and screenshot review

Priority: P1 after first extracted vertical slice
Owners/reviewers: Localization, UX, QA, Frontend; Legal/payment specialist where noted

Scope:

- Review owner, member, guardian, consent, billing, migration, validation, and email source copy.
- Capture desktop/tablet/mobile screenshots for changed user-visible slices.
- Test long-string expansion, wrapping, focus/error announcements, and embedded-form/PDF accessibility.

Acceptance:

- Before/after copy and rationale are recorded.
- QA records comprehension and screenshot results.
- Consent/legal and payment wording have explicit qualified review where required.
- Any translation is labelled **draft** unless qualified native-speaker review is evidenced.

## Suggested delivery order

1. RL-LOC-001 — decide source locale/fallback.
2. RL-LOC-002 and RL-LOC-003 — establish runtime and only the persistence the decision requires.
3. RL-LOC-004 and RL-LOC-005 — centralize formatting/error contracts.
4. Extract one high-risk vertical slice: member billing + payment errors.
5. RL-LOC-006 and RL-LOC-007 — email and migration contracts.
6. RL-LOC-008 — cross-role content, accessibility, specialist, and screenshot review.
7. Only then assess whether an additional language has product approval and qualified reviewers.

## Before/after copy

No before/after product wording applies to this task because no UI, error, email, consent, billing, or migration copy was changed.

The examples in “Recommended source-copy and key contract” are proposed keys only. They do not approve new customer-facing wording or translations.

## Unresolved review needs

- Product decision: source locale/region and locale ownership/precedence.
- Frontend/Backend: framework, rendering boundary, error-code contract, server/client locale handoff.
- Database: locale persistence only after ownership is decided; notification rendering provenance.
- UX: comprehension, plural/grammar context, long-string behavior, and fallback experience.
- QA: locale matrix, timezone/date-only cases, currency cases, and screenshot review at desktop/tablet/mobile widths.
- Legal/consent: signing acknowledgement, guardian/signer wording, waivers/policies.
- Payment: provider-error mapping, currency display, and Stripe regional behavior.
- Accessibility: form errors/live regions, checkbox labels, PDF access, language metadata, and text expansion.
- Qualified native speaker: required before any future translation is final. No such review occurred in this audit.

## Verification evidence

Executed against the audited source state:

- `pnpm --filter admin-web test` — 25 files, 126 tests passed.
- `pnpm --filter member-web test` — 7 files, 29 tests passed.
- `pnpm --filter @flowstate/db test` — Prisma schema valid.

The two Playwright specifications and the auth unit file were inspected but not executed for this documentation-only audit. No UI implementation changed, so no new screenshots were captured.

Repository note: the working tree was already dirty before this report, including documentation and `node_modules` changes plus untracked project-agent/status files. An unrelated generated change to `apps/api/next-env.d.ts` and another recovery-evidence file also appeared while this audit was running; neither is a task-owned edit. This task created or edited only `docs/recovery/evidence/localization.md`, so allowed-path verification must use that task-owned path rather than assume a globally clean or single-agent tree.
