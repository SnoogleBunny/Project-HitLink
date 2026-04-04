# MVP Ticket Board

## P0 — Foundation and first working demo

### P0-01: Monorepo and app scaffolding
Goal: Create the initial codebase structure.

Includes:
- monorepo setup
- app folders for admin web, member web, API
- shared packages for UI, DB, types, config, auth
- linting, formatting, TypeScript config
- environment variable strategy
- basic CI checks

Done when:
- repo boots locally
- apps run independently
- shared packages resolve cleanly

### P0-02: Auth and session foundation
Goal: Support secure login/session handling for MVP.

Includes:
- email/password auth
- session handling
- password reset
- role-aware session shape
- owner, coach, customer role support

Done when:
- users can sign in/out
- protected routes work
- session exposes role and workspace context

### P0-03: Workspace and gym onboarding
Goal: Let owners create a gym workspace and basic setup.

Includes:
- owner signup
- workspace creation
- gym name, address, timezone, logo, business type
- one-location-only setup
- onboarding checklist scaffold

Done when:
- owner can create workspace and land in admin shell

### P0-04: Role and staff management
Goal: Enable owner to invite and manage staff.

Includes:
- invite coach flow
- resend invite
- deactivate staff
- role assignment
- basic permissions middleware

Done when:
- owner can invite a coach and coach can accept invite

### P0-05: Admin shell and navigation
Goal: Establish the main admin UI shell.

Includes:
- sidebar nav
- top bar
- page layout primitives
- loading, empty, error state patterns

Done when:
- all admin pages can render inside a consistent shell

### P0-06: Domain schema foundation
Goal: Create the minimum DB schema for core entities.

Includes:
- workspaces
- locations
- rooms
- staff
- roles
- workspace settings
- invite model

Done when:
- migrations run cleanly
- schema supports first functional flows

### P0-07: Program management
Goal: Owners can create and manage programs.

Includes:
- program CRUD
- age/level metadata
- enable/disable progress tracking per program
- assign default coaches

Done when:
- owner can create programs and use them in schedule setup

### P0-08: Room management
Goal: Support one location with optional multiple rooms.

Includes:
- room CRUD
- room capacity metadata
- room activation toggle

Done when:
- schedule builder can reference rooms

### P0-09: Schedule templates and weekly schedule
Goal: Build the recurring schedule system.

Includes:
- class template CRUD
- recurring weekly pattern support
- class capacity
- booking cutoff
- cancellation cutoff
- default coach assignment
- room assignment

Done when:
- owner can publish a weekly schedule from templates

### P0-10: Single instance schedule editing
Goal: Support real-world schedule changes.

Includes:
- edit one class instance
- cancel class instance
- reschedule class instance
- edit recurring series

Done when:
- owner can manage day-to-day schedule changes cleanly

### P0-11: Substitute coach workflow
Goal: Handle coach substitutions.

Includes:
- owner reassigns class coach
- coach requests substitute
- class reflects current assigned coach
- optional notification hook placeholder

Done when:
- class ownership can be changed cleanly

### P0-12: Member model and member profile
Goal: Create trusted member records.

Includes:
- member CRUD
- member statuses
- internal notes
- tags
- profile summary screen
- searchable list

Done when:
- owner can create, view, search, and edit member profiles

### P0-13: Guardian/child basics
Goal: Support simple family relationships.

Includes:
- guardian profile
- child profile link
- one child with up to two guardians
- guardian pays by default
- guardian books for child

Done when:
- owner can link guardians and children in member records

### P0-14: Trial booking flow
Goal: Allow prospects to book a trial.

Includes:
- public trial page
- choose program
- choose class
- enter details
- confirmation flow

Done when:
- public user can successfully submit a trial booking

### P0-15: Waiver and form management foundation
Goal: Create the forms framework.

Includes:
- document type model
- waiver, membership agreement, guardian waiver, custom form types
- versioning model
- owner upload flow for PDFs
- signature provider abstraction placeholder

Done when:
- owner can upload versioned forms and assign them to relevant flows

### P0-16: Signature request and signed-document tracking
Goal: Track signatures against form versions.

Includes:
- signature request lifecycle
- signed status
- signed-at metadata
- signer identity linkage
- member/guardian form status UI

Done when:
- product can record whether required forms are signed for a user

### P0-17: Booking portal foundation
Goal: Allow members to browse and book classes.

Includes:
- member login
- responsive member shell
- browse schedule
- filter classes
- book class
- cancel booking
- upcoming bookings list

Done when:
- member can book and cancel a class from the portal

### P0-18: Waitlist support
Goal: Support full classes gracefully.

Includes:
- join waitlist
- waitlist ordering
- promote from waitlist manually or via rule hook
- waitlist status UI

Done when:
- full classes can accept waitlist entries and show correct state

### P0-19: Coach dashboard and roster
Goal: Enable coaches to run classes.

Includes:
- today’s classes
- roster view
- trial badges
- notes visibility
- class detail screen

Done when:
- coach can open a class and see the roster clearly

### P0-20: Attendance workflow
Goal: Let coaches record attendance quickly.

Includes:
- present/late/absent/no-show states
- add walk-in
- add trial attendee
- post-class notes
- attendance history link to member profile

Done when:
- coach can complete class attendance end-to-end

### P0-21: Owner dashboard basics
Goal: Give owners a useful first dashboard.

Includes:
- active members count
- today’s classes
- today’s trials
- failed payment count placeholder
- urgent attention widgets
- quick actions

Done when:
- owner landing page feels operationally useful

## P1 — Live operations, money, and customer self-service

### P1-01: Membership plan model
### P1-02: Drop-in product support
### P1-03: Punch card support
### P1-04: Stripe integration foundation
### P1-05: Billing ledger and actionable billing records
### P1-06: Membership assignment and lifecycle
### P1-07: Freeze workflow
### P1-08: Cancellation workflow
### P1-09: Failed payment recovery queue
### P1-10: Credits and partial refunds
### P1-11: Member billing self-service
### P1-12: Self-serve freeze/cancel request controls
### P1-13: Messaging foundation
### P1-14: Broadcast announcements
### P1-15: Automated email reminders
### P1-16: Events support
### P1-17: Private lessons support
### P1-18: Reporting basics

## P2 — Replacement credibility and migration depth

### P2-01: Belt and stripe module
### P2-02: Child account upgrade workflow
### P2-03: Full invoice history toggle
### P2-04: Raw import pipeline
### P2-05: Field mapping UI
### P2-06: Validation engine
### P2-07: Import preview and dry run
### P2-08: Zen Planner import preset
### P2-09: Historical operations import
### P2-10: Reconciliation and cutover checklist

## Recommended implementation order
1. P0-01 to P0-06
2. P0-07 to P0-11
3. P0-12 to P0-16
4. P0-17 to P0-21
5. P1-01 to P1-10
6. P1-11 to P1-18
7. P2-01 to P2-10

