# Feature Decision Sheet

## Include in MVP

### Workspace and roles
- Owner signup and workspace creation
- Gym onboarding flow
- One-location setup
- Multiple room support
- Owner role
- Coach role
- Customer role
- Staff invite flow
- Basic role permissions

### Programs and schedule
- Program creation
- Recurring weekly class templates
- Publish weekly schedule
- Edit single class instance
- Edit recurring series
- Cancel class
- Reschedule class
- Substitute coach assignment
- Capacity limits
- Waitlist support
- Booking cutoff rules
- Cancellation cutoff rules

### Members and accounts
- Manual member creation
- Trial member creation
- Member profiles
- Member status system: Active, Trial, Overdue, Frozen, Cancelled, Waitlisted
- Internal notes
- Tags
- Member search
- Basic guardian/child linking
- Parent pays for child
- Parent books for child
- Waiver tracking

### Booking and attendance
- Trial booking page
- Customer account creation
- Customer booking portal
- Browse schedule
- Book class
- Cancel booking
- Join waitlist
- View upcoming bookings
- Coach class roster
- Mark attendance
- Add walk-in
- Add trial attendee
- Coach notes on students/class
- Attendance history on member profile

### Billing and payments
- Stripe integration
- Recurring monthly memberships
- Drop-ins
- Punch cards
- Membership assignment
- Next billing date
- Grace period configuration
- Failed payment queue
- Retry payment
- Send payment update request
- Partial refunds
- Account credits
- Freeze membership
- Cancel membership
- Cancellation threshold/cutoff rules
- View invoices/receipts
- Update payment method

### Customer self-service
- Full member portal
- View membership details
- View billing history
- Update card
- View attendance history
- Self-serve freeze request if enabled
- Self-serve cancel request if enabled

### Communication
- Email reminders
- Trial confirmation emails
- Class reminder emails
- Failed payment emails
- Booking confirmation emails
- In-app messaging basics
- Owner/admin to member thread
- Coach/admin to member thread
- Customer inbox view
- Broadcast announcements + email delivery

### Events and private lessons
- Create event
- Book event
- Create private lesson slot
- Book private lesson
- Assign coach to event/private lesson

### Progress tracking
- Optional rank tracking module
- Belt field
- Stripe count
- Promotion history
- Coach/admin update progress
- Member view of progress

### Reporting
- Active members count
- Trials count
- Attendance by class
- Failed payments count
- Revenue collected summary
- New members count
- Cancellations count

### Migration
- Migration entry flow
- Zen Planner import path
- CSV fallback import path
- Raw file upload
- Field mapping
- Validation engine
- Duplicate detection
- Missing data warnings
- Import preview
- Dry-run/staging import
- Final import
- Reconciliation report
- Go-live checklist

### Zen Planner data to migrate in MVP
- Members
- Guardians/family links
- Membership plans
- Active memberships
- Billing status
- Next billing date
- Punch-card balances/credits
- Notes
- Staff
- Rank/belt/stripe data
- Lifetime bookings
- Lifetime attendance
- No-shows
- Historical invoices
- Receipts/payment history where available
- Schedule/class templates if export allows

## Include after first paying gym

### Better operations
- Bulk actions on members
- Better no-show workflows
- Coach availability calendar improvements
- Better room conflict detection
- Event waitlists
- More advanced private lesson flows

### Better member experience
- Richer member timeline
- Better booking confirmations
- Self-serve reactivation
- Better family dashboard
- Parent-specific child progress summaries

### Better communication
- Message templates
- Automated trial follow-up sequences
- Renewal reminder automation improvements
- Announcement targeting by segment

### Better reporting
- Trial-to-member conversion report
- Churn trends
- Retention trends
- Coach utilization reporting
- Class fill-rate trends
- Punch-card usage reporting

### Better progress tracking
- Promotion recommendation workflow
- Coach approval flow for promotions
- Better progress history UI

### Better migration
- More robust Zen Planner import presets
- Saved field-mapping templates
- Better reconciliation dashboard
- More historic attendance import depth handling
- More complete invoice/payment history import polish

## Defer

### Platform expansion
- Multi-location support
- Franchising/org hierarchy
- Public API
- Integrations marketplace

### Commerce expansion
- POS/retail inventory
- Merchandise sales
- Gift cards
- Advanced tax/accounting features

### Mobile expansion
- Native iOS app
- Native Android app
- Push notifications

### Communication expansion
- SMS
- WhatsApp
- Group chat
- Live chat
- Read receipts/typing indicators

### CRM / marketing expansion
- Advanced lead pipeline CRM
- Campaign builder
- Referral program
- Win-back automations
- Marketing attribution

### Billing expansion
- Weekly plans
- Complex contract engines
- Deep proration customization
- Full payment-token migration guarantees across processors

### Product complexity
- Advanced rule engine
- Custom automation builder
- Payroll/staff commissions
- Deep BI suite
- Website builder

## MVP priority tiers

### P0 — must exist first
- Auth + roles
- Workspace setup
- Staff invites
- Programs
- Rooms
- Member model
- Schedule + class templates
- Customer statuses
- Stripe connection foundation
- Trial booking
- Class roster + attendance

### P1 — must exist for live operations
- Memberships
- Drop-ins
- Punch cards
- Booking portal
- Waitlist
- Invoices/payment history
- Failed payment queue
- Credits/partial refunds
- Freeze/cancel flows
- Email reminders
- Member portal
- Events
- Private lessons

### P2 — must exist for replacement credibility
- Family support basics
- Belt/stripe tracking
- In-app messaging basics
- Migration pipeline
- Validation preview
- Reconciliation tools

### P3 — polish after first customer
- Better reports
- Better automations
- Better family UX
- Better migration presets
- Better analytics

## MVP simplifications

### Family support
Will support:
- guardian linked to child
- parent payment ownership
- parent booking for child

Will not support:
- highly complex family pricing logic
- large household hierarchies
- advanced family analytics

### Progress tracking
Will support:
- belt
- stripe count
- promotion history

Will not support:
- skill trees
- auto-promotion rules
- advanced grading workflows

### Messaging
Will support:
- basic in-app threads
- system notifications
- email reminders

Will not support:
- real-time chat complexity
- group chat
- rich media messaging

### Migration
Will support:
- Zen Planner export upload
- CSV fallback
- preview + validation + dry run

Will not promise:
- perfect migration of every edge-case invoice
- perfect migration of every old attachment/document
- guaranteed payment token portability in all cases

