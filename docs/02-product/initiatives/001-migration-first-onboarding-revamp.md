# Initiative 001: Migration-First Onboarding Revamp

Status: accepted
Date: 2026-05-30
Owner: Product
Related decision: [[01-decisions/Business Decision Log#Decision: All new onboarding is migration-first]]
Evidence: [[06-experience-reports/codex-onboarding-business-ux/2026-05-30-onboarding-business-ux-review]]

## Context

Flowstate's first customers are expected to arrive with an existing gym-management system, not as blank-slate businesses. The onboarding experience should therefore assume that every new owner is migrating from another app and that Flowstate will handle the migration internally in a white-glove way after the owner gives enough context.

The current first-run path creates an account and workspace, then drops the owner into the daily operations dashboard. That makes sense for an already-configured gym, but it sends the wrong signal for a business that still needs members, billing state, schedule, forms, and historical context migrated.

## Business Decision

All new onboarding is migration-first.

Flowstate should not ask a new owner to self-configure the whole gym before they can trust the product. The owner-facing job is to provide migration context, export files or access instructions, and confirm launch readiness. The Flowstate-facing job is to perform the migration, validate the result, and coordinate go-live.

## UX Problem

The current flow treats a new owner like an active operator before the business is operationally ready. The daily dashboard can say the day is clear even though the real work is incomplete. Prominent operational actions, especially booking creation, appear before the required data exists.

This creates friction in three ways:

- The owner does not know what Flowstate needs from them next.
- The product appears empty or unfinished instead of guided.
- Setup tasks compete with migration work even though migration is supposed to be handled internally.

## Target Experience

After signup and basic gym profile creation, the owner lands on a migration status dashboard instead of the normal daily operations dashboard.

The experience should show:

- The current migration stage: Intake received, exports needed, migration in progress, review ready, go-live scheduled, or complete.
- The next owner action, such as uploading exports, sharing access instructions, reviewing imported data, or confirming a launch date.
- What Flowstate is responsible for, written in plain business language.
- The expected next milestone or response window.
- A clear contact path for migration questions.

The normal operations dashboard becomes primary only after migration is complete or the workspace is explicitly marked operationally ready.

## Implementation Task List

- Replace self-serve setup framing with migration intake framing.
- Redirect new owners after workspace creation to a migration dashboard, not the daily operations dashboard.
- Collect migration intake details: current software, target go-live date, member count, billing status, schedule complexity, forms and waivers, and data scope.
- Show owner-facing migration stages: Intake received, exports needed, migration in progress, review ready, go-live scheduled, complete.
- Hide or demote operational actions like Create booking until migration is complete or the workspace is operationally ready.
- Add a migration status dashboard showing next owner action, Flowstate responsibility, expected next milestone, and contact path.
- Remove internal roadmap wording like "slice" from customer-facing onboarding copy.
- Keep technical import mapping, validation, dry-runs, and reconciliation internal for now.

## Success Criteria

- A brand-new owner lands on migration status after signup and workspace creation.
- The first dashboard does not imply that an unmigrated gym is ready to operate.
- The owner can understand exactly what Flowstate needs from them next.
- Operational quick actions are gated until migration readiness is complete.
- Existing admin workflows remain accessible for non-migration or completed accounts.
- Customer-facing copy speaks in owner language, not internal roadmap language.

## Out Of Scope For This Revamp

- Building full customer self-serve field mapping.
- Exposing import dry-runs, validation rules, or reconciliation internals to owners.
- Supporting multi-location migration flows.
- Building a general integration marketplace.
- Replacing the existing import schema or staging concepts unless the implementation requires a small supporting field.

## Links To Supporting Evidence

- [[06-experience-reports/codex-onboarding-business-ux/2026-05-30-onboarding-business-ux-review]]
- [[02-product/Product Strategy]]
- [[02-product/MVP Scope Brain]]
- [[product_decisions_ledger]]
- [[mvp_ticket_board]]
