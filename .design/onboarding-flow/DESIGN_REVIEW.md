# Design Review: Onboarding Flow

Reviewed against: `docs/02-product/initiatives/001-migration-first-onboarding-revamp.md`
Philosophy: calm migration-first operations
Date: 2026-06-04

## Screenshots Captured

| Screenshot | Breakpoint | Description |
| --- | --- | --- |
| `screenshots/review-signup-desktop-1280.png` | Desktop 1280x800 | Owner signup |
| `screenshots/review-onboarding-empty-desktop-1280.png` | Desktop 1280x800 | Empty migration intake |
| `screenshots/review-onboarding-empty-tablet-768.png` | Tablet 768x1024 | Empty migration intake |
| `screenshots/review-onboarding-empty-mobile-375.png` | Mobile 375x812 | Empty migration intake |
| `screenshots/review-onboarding-validation-desktop-1280.png` | Desktop 1280x800 | Required-field error |
| `screenshots/review-onboarding-filled-desktop-1280.png` | Desktop 1280x800 | Filled migration intake |
| `screenshots/review-migration-status-desktop-1280.png` | Desktop 1280x800 | Migration dashboard after intake |
| `screenshots/review-migration-status-tablet-768.png` | Tablet 768x1024 | Migration dashboard after intake |
| `screenshots/review-migration-status-mobile-375.png` | Mobile 375x812 | Migration dashboard after intake |
| `screenshots/review-operational-gate-desktop-1280.png` | Desktop 1280x800 | Operational booking gate before readiness |

All screenshots are in `.design/onboarding-flow/screenshots/`.

## Summary

The migration-first direction is substantially stronger than the prior workspace-first onboarding because new owners are no longer sent into an empty daily dashboard. The current experience is not yet low-friction, though: the owner must complete a long single-page intake before seeing progress, and the post-intake dashboard exposes internal migration/import/operator surfaces that do not match the initiative's owner-facing target.

## Must Fix

1. **Separate owner status from internal migration ops**: `apps/admin-web/app/dashboard/migration/page.tsx` shows owner handoff, CSV upload, import jobs, operator controls, and manual completion controls on the same owner route. The initiative says technical import mapping, validation, dry-runs, and reconciliation should stay internal. See `review-migration-status-desktop-1280.png`. Fix: create an owner-facing migration page focused on next owner action, Flowstate responsibility, milestone, contact/support path, and uploaded/export status; move import/operator controls behind an internal admin mode or separate route.

2. **Reduce first-run form burden**: `apps/admin-web/app/onboarding/onboarding-form.tsx` asks for gym profile, migration scope, notes, and full address in one long page. On mobile the primary action is several screens away. See `review-onboarding-empty-mobile-375.png`. Fix: make the first pass only required fields plus one export/access path, then collect details progressively on the migration status page.

3. **Replace technical signup copy**: `apps/admin-web/app/signup/page.tsx` tells owners about normalized display-name/session storage. See `review-signup-desktop-1280.png`. Fix: use trust-building business copy, for example "Create the owner account you will use to coordinate your migration and manage launch readiness."

## Should Fix

1. **Clarify required versus optional fields**: The action requires gym name, timezone, and current software, but the form visually presents all fields with similar weight. See `apps/admin-web/app/onboarding/actions.ts`. Fix: mark required labels, group optional details, and let the error identify missing fields inline.

2. **Make timezone low-effort**: Timezone is still a raw text input. Fix: auto-detect, use a friendly searchable select, or hide the IANA value behind a friendly label.

3. **Constrain navigation during pre-launch**: `apps/admin-web/app/_components/admin-nav.tsx` exposes every owner area while the workspace is pre-launch. Operational gates help, but the nav still invites exploratory clicks. Fix: show a pre-launch nav with Migration, Exports, Launch Review, Support, and maybe read-only previews.

4. **Add a visible contact path**: The initiative calls for a clear contact path for migration questions, but the migration page currently has no direct support CTA. Fix: add "Message migration support" or "Book launch review" near the next owner action.

5. **Make operational gates more decisive**: The booking gate explains why the page is unavailable and links back to migration, which is good. But the owner can still arrive there through the sidebar. Fix: keep the gate, but prevent most pre-launch navigation from leading to unavailable operational pages.

## Could Improve

1. **Use a progress/checklist summary instead of raw stage cards only**: Stage cards are clear, but owners also need "what you do next" and "what Flowstate is doing now" as the dominant first-viewport content.

2. **Move data-scope defaults behind a simple choice**: All migration categories default checked, which is convenient but dense. A simpler first-run question could be "Migrate everything" with an advanced disclosure for category-level edits.

3. **Preserve a draft**: A long intake form should autosave or split into steps. Losing progress here would feel costly.

## What Works Well

- The migration-first redirect solves the biggest prior UX issue: new owners do not see the normal daily dashboard until readiness is complete.
- The copy on the intake page correctly promises white-glove migration instead of self-serve setup.
- The operational booking gate is clear, calm, and gives a direct recovery action back to migration status.
- The visual system is steady and readable, with strong focus states and touch-sized fields/buttons.
