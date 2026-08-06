# Product Decisions Ledger

## Product thesis
A Zen Planner replacement for Muay Thai gyms and Hyrox/HIIT-style class studios, focused on:
- usability
- reliability
- scheduling
- billing
- attendance
- member self-service
- migration confidence

## Core value proposition
Help gyms move off clunky software to a calmer, easier operational system without losing their core data.

## Primary differentiation
- better UX
- more reliable daily operations
- migration-friendly onboarding and import
- cleaner member self-service

## Target customers
### Primary ICP
- Muay Thai gyms
- Hyrox/HIIT-style class-based studios

### Secondary fit
- one-location boutique class gyms with similar scheduling and billing needs

### Not primary target for MVP
- multi-location groups
- franchise systems
- retail-heavy gyms
- enterprise chains

## Product guardrails
### MVP guardrails
- one location only
- web only for MVP
- owner, coach, customer roles only
- modular monolith
- Next.js + Postgres
- Stripe for payments
- email only at launch
- optional multiple rooms within one location

### Explicitly deferred
- native iOS app
- native Android app
- multi-location support
- SMS
- push notifications
- public API
- integrations marketplace

## User roles
### Owner
Handles business setup, schedule, staff, billing policies, communication, migration approval, forms.

### Coach
Handles roster, attendance, notes, substitute requests, member messaging, progress updates when enabled.

### Customer
Handles booking, billing self-service, messaging staff, forms, progress viewing if enabled, freeze/cancel requests if allowed.

### Front desk
No separate front-desk role in MVP. Coach role covers those workflows.

## Business model and billing
### Supported in MVP
- recurring monthly memberships
- drop-ins
- punch cards

### Not supported in MVP
- weekly plans
- separate class packs outside punch cards

### Cancellation behavior
- owner approval required
- effective at end of billing cycle
- gyms may require notice logic such as 2 months paid notice before final cancellation
- cancellation policy must be owner-configurable

### Freeze behavior
- immediate and scheduled freezes supported
- owner approval required
- self-serve request optional and owner-controlled

### Failed payment behavior
- grace period configurable by owner
- failed payment recovery queue required
- retry behavior supported
- payment update request supported

### Refunds and credits
- partial refunds supported
- account credits supported
- owners control what credits can be used for

## Drop-ins, punch cards, events, private lessons
### Drop-ins
- paid at booking
- owner can enable/disable

### Punch cards
- do not expire
- owner can enable/disable
- not shareable
- can be general or class-type-specific
- late cancel consumes a punch
- no-show consumes a punch
- members can buy them if enabled

### Events
- prepaid only
- owner-configurable availability

### Private lessons
- prepaid only
- visible in member portal
- coach assignment required
- owner-configurable availability

## Scheduling and class operations
- recurring weekly schedule required
- one-off class edits supported
- recurring series edits supported
- class cancellation supported
- class rescheduling supported
- one location only
- multiple rooms supported if enabled
- class capacity limits supported
- waitlist supported
- booking cutoff rules supported
- cancellation cutoff rules supported
- substitute coach workflow required

## Member portal
### Included at launch
- browse classes
- book/cancel classes
- join waitlist
- view upcoming bookings
- view private lesson bookings
- buy drop-ins and punch cards if enabled
- view membership details
- view invoices and receipts
- update payment method
- message staff
- request freeze/cancel if enabled

### Delivery model
- responsive web only for MVP
- native mobile after first 1–2 paying customers

## Messaging and communications
### Messaging scope
- 1:1 threads only
- staff-to-member and member-to-staff only
- parent and child context visible where relevant

### Broadcasts
- owners can send broadcasts in MVP
- broadcasts also support email delivery

### Email at launch
- trial confirmation
- booking confirmation
- class reminders
- failed payment notices
- announcements
- payment method update requests

## Family model
### Included in MVP
- one guardian can manage multiple children
- two guardians can link to one child
- guardian pays by default
- family shares payment method by default
- guardian books for child
- guardian can view child progress

### Child upgrade path
- child account can be upgraded to regular student login on owner approval
- owner can generate signup link for child

## Progress tracking
### Scope
Optional module.

### Supported model
- belts
- stripes
- promotion history

### Stripe logic
- stripes are counted per current belt only

### Visibility
- any gym can disable all progress UI
- product should not expose progress UI when disabled

## Waivers, agreements, and forms
### Required in MVP
- waiver
- membership agreement
- child/guardian waiver
- custom forms uploaded by owner

### Signature model
- owners upload PDFs
- e-sign flow similar to DocuSign
- waiver and membership agreement are separate
- child/guardian waivers are separate

### Versioning
- versioning required
- signed state tied to document version

## Migration
### Included in MVP
- Zen Planner path
- CSV fallback path

### Migration expectation
If Zen Planner exposes it in export and it is relevant to operations, migrate it.

### Data targeted for migration
- members
- guardians/family links
- memberships
- billing status
- next billing date
- punch-card balances/credits
- notes
- staff
- ranks/belts/stripes if used
- lifetime bookings
- lifetime attendance
- no-shows
- historical invoices
- receipts/payment history where available
- schedule/class templates if export allows

### Invoice history behavior
- actionable records shown by default
- toggle for full historical invoices

### Migration UX
- file upload
- field mapping
- validation
- duplicate detection
- missing data warnings
- preview
- dry-run/staging import
- final import
- reconciliation checklist

### Migration principle
Do not promise perfect one-click migration. Provide guided, validated, reviewable migration.

### Legacy completion acknowledgment integrity
Status: accepted on 2026-07-25.

Decision: choose fail-closed repair (option A), not a grandfathered completion exception.

- Owner acknowledgment of the reviewed migration snapshot is required evidence for every migration presented as `COMPLETE` and every workspace admitted to normal operations after migration.
- A legacy row with `stage=COMPLETE` and an `ACTIVE` workspace but no complete owner-acknowledgment actor/timestamp tuple is incoherent. It must not be treated as idempotent success, operationally ready, or equivalent to an acknowledged handoff.
- Do not fabricate, infer, or backdate owner consent from an operational-readiness actor/timestamp, a migration date, import history, or a Flowstate system/operator identity.
- All route, UI, and domain readiness gates must fail closed unless the migration is `COMPLETE`, the workspace is `ACTIVE`, the owner-acknowledgment tuple is complete, and the operational-readiness tuple is complete.
- Detect legacy incoherent rows before normal operation. Local/demo/test rows may be reset and reseeded with a truthful deterministic owner acknowledgment. A shared row may return through the approved locked-snapshot owner acknowledgment and Flowstate-operator activation path only after Database verifies that repair is safe and preserves its audit history.
- If a shared row has already supported normal operations or cannot be safely returned to the pre-operation handoff, stop and escalate the individual case to Jacky. Do not auto-deactivate it, silently backfill consent, or preserve it as a hidden exception.
- Database enforcement should prevent new `COMPLETE` rows without a complete owner-acknowledgment tuple after legacy inventory/repair. Release evidence must include a zero-row legacy preflight or an explicit reviewed repair record for every detected row.

## Reporting
### Included in MVP
- active members count
- trials count
- attendance by class
- failed payments count
- revenue collected summary
- new members count
- cancellations count

### Deferred reporting
- advanced cohort retention
- deep financial analytics
- enterprise dashboards

## Technical architecture
- modular monolith
- Next.js
- Postgres
- Stripe
- web only for MVP
- native mobile later
- optional modules should be cleanly disableable

## MVP boundaries
### Included
- workspace setup
- owner/coach/customer roles
- staff invites
- programs
- rooms
- recurring schedule
- class editing
- substitute coaches
- member profiles
- trial booking
- waivers/forms
- memberships
- drop-ins
- punch cards
- Stripe billing
- grace period config
- failed payment recovery
- credits
- partial refunds
- member portal
- class booking
- waitlist
- attendance
- email reminders
- events
- private lessons
- family support basics
- optional belt/stripe module
- Zen Planner/CSV migration
- migration preview/validation/reconciliation

### Deferred
- native mobile apps
- SMS/push
- multi-location
- POS/retail
- advanced CRM/marketing automation
- advanced BI/reporting
- public API
- website builder
- payroll/commissions

## Summary statement
This product is a one-location gym management platform for Muay Thai gyms and class-based fitness studios that handles scheduling, memberships, billing, attendance, member self-service, forms/signatures, and safe migration from Zen Planner.

