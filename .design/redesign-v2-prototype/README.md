# Flowstate Redesign V2 — A/B prototype gallery

Status: non-production visual decision artifact. This directory does not implement application behavior, connect to a backend, call Stripe, send email, enroll a gym, or alter persisted Flowstate data.

## What this compares

- A — Field Ledger: mineral/concrete/graphite with cobalt, vermilion, and teal; rectangular 0–6px geometry; hairlines; compact owner operations; roomier member flow.
- B — Training Signal: midnight/ice with sky, lime, and coral; clipped/rounded 14–18px panels; stronger time/action signals; moderate density.
- C — Paper Workshop: documented fallback only. It is intentionally not selectable in this bounded A/B artifact.

A and B render the same fictional one-location demo content and state semantics. The gallery covers:

1. Shared foundation
2. Owner shell, returning dashboard, and first-run lens
3. Schedule, roster, and row-level attendance
4. Compressed member schedule
5. Forms and implemented-only settings
6. Migration handoff
7. Billing and provider states
8. Refined landing

## Truth boundaries

- One location, web only, owner/coach/Member experiences only.
- Guardian record/signing context exists; no guardian portal or child switcher.
- Recurring template plus gym-local date is the current operating truth; one-off occurrence controls stay absent.
- No bulk attendance, live provider, production email, operator migration controls, durable waitlist enrollment, or schema-only features.
- Every mutation is labelled prototype-only and remains local browser state.
- Loading replaces the whole dynamic surface region, including loaded header status/action asides, on all eight surfaces with a unique CSS-only silhouette, `aria-busy`, one visible polite status, hidden decorative bones, no loaded names/amounts/IDs/affected actions, and static reduced-motion behavior. Boneyard is not installed or executed.
- The default dashboard and migration say in plain English that the fictional gym is ready for daily operations, its migration is complete, and both reviews are recorded. Raw workspace, migration-stage, tuple, and derived-gate values stay in collapsed Technical reference. The confirmation lens is a separate pre-launch scenario with daily operations blocked.
- Forms separate current version, derived compliance, and signing-request lifecycle in semantic data while primary cards remain plain English; raw model values stay in collapsed Technical reference. Forms, Rooms, and Programs are separate owner-route tasks, and the 390px Forms presentation uses deliberate record cards rather than a horizontally scrolling table.
- Member booking examples keep punch-card and priced drop-in transitions separate: punch use becomes locally Booked with a 5→4 balance and visible timely/late cancellation outcomes, while the drop-in uses a separate temporary Payment pending hold whose provider completion remains unknown.
- Owner Bookings retains the owner shell, current destination, normal owner-surface padding, and the operations gallery context rather than presenting itself as Member schedule. Schedule roster transitions retain an exact class-action origin so browser Back restores the same control with a persistent 3px returned-focus ring when it still exists.
- Every generic simulated explanation that disables its initiator includes an adjacent visible dismiss/reset action with focus return.
- Generic inline results pair their light color-mix surface with an explicit readable foreground across owner, Member, migration, and landing contexts.
- The fictional completed migration snapshot shows a nonblocking future-import safeguard: it contains no unrecognized statuses, and future imports must stop for review whenever Flowstate encounters a status it does not recognize.
- Fourteen owner destinations retain unique route IDs and exactly one current link even where prototype components are reused. URL/history preserves world, surface, route, state, date, program, view, class, Member, form, and role context.
- The approved Founding Gym concept is 15% off monthly software pricing for qualifying founding-waitlist gyms onboarding during the founding window, grandfathered after launch. Base price, eligibility dates/window, taxes, and cancellation/reactivation terms remain unresolved. The prototype form stores and sends nothing and confers no eligibility.

## Local viewing

Serve only this artifact directory so the artifact is available at:

`http://127.0.0.1:<owned-port>/index.html`

A plain static server is sufficient. Do not open the file directly if you want the automated request and HTTP checks.

## Deterministic verification

Run from the worktree root; the verifier confirms the chosen port is free:

`node .design/redesign-v2-prototype/verify.mjs --port <owned-port> --output test-results/redesign-v2-prototype-repair/<unique-root>`

The script:

- starts and owns a static server rooted only at `.design/redesign-v2-prototype/`;
- uses the already-installed Playwright runtime from the main Project-HitLink checkout via `createRequire`;
- makes zero external requests;
- validates HTTP/title/H1/world/surface, no-JS comprehension, viewport overflow, disabled-control explanations, the 14-route owner matrix plus separate coach/member shells, state replacement/loading privacy, filters, exact URL/history origin focus, form-version semantics, punch/drop-in transitions, generic reset recovery, readiness copy, contextual names, contrast, console/page/request diagnostics, and active-control coverage;
- captures A and B across all eight surfaces at 1440×1000, 768×1024, and 390×844;
- captures corrected Forms/Rooms/Programs routes, 1440px and 390px validation focus states, owner Bookings, punch booked/timely/late outcomes, drop-in pending, exact Back focus, generic reset, provider setup, stale, permission, confirmation, tablet, long-content, and 320px evidence in addition to the matrix and all 16 loading surfaces;
- writes screenshots plus `report.md` and `manifest.json` under the explicit ignored `--output` root (default: `test-results/redesign-v2-prototype/`);
- stops its owned server in a `finally` block.

No package, font, chart, Motion, Bklit, or other dependency is installed.

## Known prototype limits

- Static fictional content only; no production usability or customer approval is claimed.
- Browser-local state is reset by reload or visible reset controls; no result proves a server write, authorization decision, transaction, email, Stripe action, migration mutation, booking, waitlist promotion, attendance write, or signature lifecycle change.
- The artifact compares visual direction, responsive hierarchy, copy boundaries, and interaction semantics. It cannot certify server authorization, transactions, provider idempotency, migration integrity, email delivery, or durable storage.
- Production implementation remains blocked by the governed Backend, Database, Workflow, UX, Design, Localization, QA, BA/Sales, and CEO gates.

## Rollback

Remove the six prototype files in `.design/redesign-v2-prototype/` and the ignored evidence under the selected verifier output root. No schema, data, or provider rollback is required.
