# Data Model Brain

Use [[domain_model]] and `packages/db/prisma/schema.prisma` as source references.

## Implemented Areas

- Workspace, location, room, workspace user, settings, staff invites.
- User, auth session, member, guardian, family links.
- Programs, class templates, class bookings, waitlist entries, attendance records.
- Membership plans, member memberships, punch cards, drop-ins, billing states, billing records, Stripe settings/webhooks.
- Form documents, form versions, required assignments, signature requests, signed documents.

## Important Model Choices

- Staff is `User` plus `WorkspaceUser`.
- Coach assignment currently lives on `ClassTemplate`.
- Current class occurrences are derived from templates and scheduled dates.
- Billing is functional through membership/billing state and records, with deeper invoice/payment models planned.
- Signed form status is version-specific.

## Risks To Watch

- Derived occurrences are fine for the current demo, but one-off edits/cancellations will need stronger instance modeling.
- Billing UX must distinguish "Stripe not connected" from "payment failed" from "member action required."
- Guardian/member account linking should stay deliberately simple until family self-service expands.

