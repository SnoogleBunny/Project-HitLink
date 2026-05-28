# Business Decision Log

This is the running ledger for Flowstate decisions. Keep entries short, dated, and linked.

## 2026-05-23

### Decision: Flowstate MVP remains single-location first

Status: accepted  
Source: [[product_decisions_ledger]], [[feature_decision_sheet]]

Flowstate should solve operations for one-location Muay Thai gyms and Hyrox/HIIT-style studios before expanding into multi-location or franchise use cases.

Why it matters:

- Keeps scheduling, billing, roster, migration, and reporting simpler.
- Avoids early architecture and UX complexity that would slow the first sellable demo.
- Matches the current implemented data model and local demo.

### Decision: Web-only demo and MVP

Status: accepted  
Source: [[product_decisions_ledger]]

Admin and member workflows are responsive web apps. Native iOS and Android are deferred until after early paying customer validation.

### Decision: Stripe is the payment rail, but demo can degrade gracefully without live Stripe

Status: accepted  
Source: [[04-demo/Working Demo State]]

The app should show billing state, membership assignment, punch cards, failed-payment readiness, and payment-method prompts even when Stripe credentials are not configured. Live checkout, Connect onboarding, billing portal, and webhooks require real Stripe credentials.

### Decision: Member self-service is part of the demo

Status: accepted  
Source: latest audit, [[mvp_ticket_board]]

The demo must include member login, schedule browsing, booking, bookings history, membership visibility, billing status, and forms visibility. This is not just an owner admin tool.

### Decision: Staff invites are record-first until email and acceptance are built

Status: accepted  
Source: [[mvp_ticket_board]], current implementation

Owner can create/resend/revoke invite records. Actual email delivery and coach acceptance UX remain deferred and must not be presented as complete.

### Decision: Forms are PDF/version/signature-record first

Status: accepted  
Source: [[product_decisions_ledger]], current implementation

Owners upload PDFs, forms are versioned, and signed state is tied to a specific form version. Full DocuSign-like richness or external signature provider polish can come later.

## Decision Hygiene

Every future entry should include:

- Date
- Decision
- Status: proposed, accepted, rejected, superseded
- Why
- Consequences
- Links to relevant code/docs/tickets

