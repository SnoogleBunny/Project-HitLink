# Work Packet: Auth Entry Reimagination

Date: 2026-08-01
Branch: `feat/auth-entry-reimagination`
Base commit: `52a9dec258e77ca4252ed1b8e1ac8baeaa6bf01d`

## Outcome

Delete the old generic centered-card auth presentation and replace it with the Design-approved **Quiet Threshold** entry family for:

- admin login for owners and coaches;
- owner signup;
- member login;
- admin and member unauthorized states.

Reimagine the authenticated shells and entry dashboards without changing available product features:

- admin remains a compact operational rail;
- member becomes a simpler gym-first top shell;
- owner dashboard keeps its operational queue and existing data;
- member home prioritizes upcoming bookings, then membership/billing state, then recent attendance.

Authentication, separate admin/member cookies, role-aware redirects, owner onboarding, migration gating, and protected routes remain mandatory.

## Required prerequisite: fail-closed operational access

The current owner dashboard checks the accepted migration-readiness tuple, but coach operations and member portal contexts do not. Before visual implementation, Backend must close that gap with TDD.

Operational access is allowed only when all are true:

- workspace status is `ACTIVE`;
- migration exists and stage is `COMPLETE`;
- owner-review acknowledgment timestamp and nonblank actor ID both exist;
- operational-readiness timestamp and nonblank actor ID both exist.

Behavior:

- pre-ready owner login succeeds and routes to `/dashboard/migration`;
- pre-ready coach login returns a generic workspace-not-ready form error and creates no session;
- pre-ready member login returns a generic portal-not-ready form error and creates no session;
- stale/pre-ready owner sessions reaching an operations route redirect to `/dashboard/migration`;
- stale/pre-ready coach/member sessions fail closed through `/unauthorized`;
- ready owner, coach, and member destinations remain unchanged.

Credential verification and account-shape validation happen before any not-ready response. Readiness is checked before obtaining a writable cookie store or creating a session for coaches and members.

## Required skills and dependency permissions

- `impeccable`: required for logic-only critique and hierarchy. No hooks, live mode, `npx impeccable`, context script, or bundled scripts.
- `bklit-data-visualization`: not required; there are no charts or infographics in this packet.
- `motion-scroll-animations`: not required; no production animation or `motion` dependency is authorized.
- No application or design-system dependency may be added.
- Reusing the repository's existing Vitest tooling for the shared readiness predicate is allowed; do not add a new package.

## Design direction: Quiet Threshold

Shared visual world:

- warm stone canvas, white work surfaces, deep green ink, restrained borders, existing Geist typography;
- owner orientation uses deep green plus restrained brass detail;
- member orientation uses deep green plus accessible terracotta detail;
- status colors remain semantic, not decorative;
- no photography, illustration, external assets, glass-card blur, dramatic gradients, invented metrics, or decorative charting.

Auth entry:

- replace both `auth-panel.tsx` components with role-aware entry-shell components;
- desktop uses a full-height identity zone and form zone;
- tablet/mobile collapse to identity context followed by the form in DOM order;
- the form remains the primary task and keeps existing actions, fields, autocomplete, pending states, and route links;
- admin login says owner and coach access; owner signup remains owner-only and migration-first; member login remains gym-provisioned with no signup promise.

Admin shell:

- compact text-labelled rail on desktop; no icon-only navigation;
- preserve every existing role-filtered route and `aria-current` behavior;
- existing native disclosure menu remains the mobile pattern;
- workspace and role context remain visible; logout is a quiet utility action.

Member shell:

- gym name is primary, Flowstate is supporting product context;
- desktop uses a compact top identity row and horizontal navigation;
- tablet/mobile uses a native in-flow disclosure menu;
- add a named navigation landmark and non-color active-page state;
- preserve all six existing member destinations.

Dashboards:

- owner retains all current metrics, attention categories, quick actions, schedule, empty states, and destinations; reduce nested-card noise and overbroad claims;
- member home order is upcoming bookings, membership, billing, recent attendance; do not invent recommendation, streak, progress, or availability data;
- a link to the existing schedule route is allowed in the no-bookings state.

## UX and accessibility acceptance criteria

- One semantic `<main>` and one page `<h1>` per auth/unauthorized page.
- Visible labels, existing field names/types/autocomplete, programmatic required state, and at least 44px controls.
- Server errors are announced with `role="alert"` or equivalent; invalid fields expose `aria-invalid`/`aria-describedby` where the form contract supports field-specific errors.
- Generic credential failures do not reveal account existence.
- Keyboard order follows visual/DOM order; collapsed navigation is absent from focus order.
- Navigation landmarks have distinct names; active routes expose `aria-current="page"` and a non-color indicator.
- Native disclosure menus remain usable without JavaScript, disclose expanded state, and do not trap focus.
- Static identity, role guidance, headings, labels, descriptions, and ordinary links render without animation or client-only reveal.
- Verify 1440px desktop, 768px tablet, and 390px mobile with no horizontal overflow.
- Verify 200% zoom and approximately 320 CSS-pixel reflow; no control, route, error, or logout action disappears.
- Add `prefers-reduced-motion: reduce` handling for existing hover transforms/transitions; no new animation.

## Product-truth copy boundaries

Allowed:

- guided, validated, reviewable migration handoff;
- owner and coach admin access;
- gym-provisioned member portal access;
- one gym location with optional rooms;
- existing schedule, bookings, membership, billing status, forms, roster, and attendance capabilities.

Forbidden:

- automatic/one-click/perfect migration, guaranteed timing, no-data-loss, or support response promises;
- member self-signup, coach self-signup, password recovery, or invite-delivery claims;
- pricing, outreach CTAs, live Stripe claims, native-app language, multi-location switchers, recommendations, or new feature claims.

## Backend allowed paths

- `packages/db/src/workspace-readiness.ts` (new)
- `packages/db/src/workspace-readiness.test.ts` (new)
- `packages/db/src/index.ts`
- `packages/db/package.json` only to include the new test in the existing test command; no dependency entry
- `apps/admin-web/app/login/actions.ts`
- narrowly scoped admin login action test (new if absent)
- `apps/admin-web/lib/operations-workspace.ts`
- `apps/admin-web/lib/operations-workspace.test.ts`
- `apps/admin-web/lib/workspace-migration.ts` only to remove/delegate the old predicate
- existing callers/tests of `isWorkspaceMigrationReady` only as needed to consume the shared predicate
- `apps/member-web/app/login/actions.ts`
- `apps/member-web/app/login/actions.test.ts`
- `apps/member-web/lib/member-auth.ts`
- `apps/member-web/lib/member-auth.test.ts`

No Prisma schema, migration, seed, data mutation, cookie-name, proxy, package dependency, or route-destination change is allowed.

## Frontend allowed paths

Admin:

- `apps/admin-web/app/_components/auth-panel.tsx` (delete after replacement)
- `apps/admin-web/app/_components/entry-shell.tsx` (new)
- `apps/admin-web/app/_components/admin-shell.tsx`
- `apps/admin-web/app/_components/admin-nav.tsx`
- `apps/admin-web/app/login/page.tsx`
- `apps/admin-web/app/login/login-form.tsx`
- `apps/admin-web/app/signup/page.tsx`
- `apps/admin-web/app/signup/signup-form.tsx`
- `apps/admin-web/app/unauthorized/page.tsx`
- `apps/admin-web/app/dashboard/page.tsx`
- `apps/admin-web/app/globals.css`
- directly corresponding presentation tests only.

Member:

- `apps/member-web/app/_components/auth-panel.tsx` (delete after replacement)
- `apps/member-web/app/_components/entry-shell.tsx` (new)
- `apps/member-web/app/_components/member-shell.tsx`
- `apps/member-web/app/_components/member-nav.tsx`
- `apps/member-web/app/login/page.tsx`
- `apps/member-web/app/login/login-form.tsx`
- `apps/member-web/app/unauthorized/page.tsx`
- `apps/member-web/app/app/page.tsx`
- `apps/member-web/app/globals.css`
- directly corresponding presentation tests only.

Do not touch server actions during Frontend implementation. Do not alter route destinations or data queries.

## TDD sequence

1. Backend writes failing readiness-predicate matrix tests and proves RED.
2. Backend implements the shared predicate and proves GREEN.
3. Backend writes failing coach/member login and live-context guard tests and proves RED.
4. Backend implements the minimum query/guard changes and proves GREEN.
5. Frontend writes/updates presentation tests for entry-shell semantics, copy, nav landmarks/active state, and existing form action wiring; prove RED before UI code.
6. Frontend implements the approved visual packet and proves focused tests GREEN.
7. Run affected workspace tests, lint, type checks, and production builds.
8. Run seeded browser verification against an explicit disposable local database.

## Required browser evidence

Fresh exact-candidate screenshots and diagnostics at 1440px, 768px, and 390px for:

- admin login;
- owner signup;
- member login;
- operational owner dashboard;
- coach roster shell;
- member overview;
- representative admin/member disclosure-menu open state.

Evidence must include final URL, heading/landmark marker, `clientWidth`, `scrollWidth`, console errors, page errors, keyboard/focus checks, invalid login/signup state, no-JavaScript static comprehension, reduced-motion behavior, and 200%/400% zoom/reflow disposition.

Use only a disposable localhost database whose name contains `e2e` or `test`, with `FLOWSTATE_E2E_DISPOSABLE_DATABASE=1`. Never reset or mutate `flowstate_dev`.

## Required reviews

Before local commit:

- Backend and Database: readiness invariant and query boundaries;
- Design: exact Quiet Threshold implementation and responsive screenshots;
- UX: role clarity, forms, navigation, focus, menus, zoom/reflow, no-JS;
- Gym Workflow: migration fail-closed behavior and owner/coach/member priorities;
- Localization/Content: exact user-visible copy;
- QA: exact candidate, regressions, accessibility, browser diagnostics, responsive evidence;
- BA/Sales: buyer/operator credibility and no unsupported claims;
- CEO: final staged tree and local gates.

## Rollback

Revert the final candidate commit. No schema migration, persistent data transformation, production action, remote push, or deployment is part of this packet.
