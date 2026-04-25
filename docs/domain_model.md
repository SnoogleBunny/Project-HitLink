# Domain Model

Implemented model names are aligned with Prisma where possible; planned concepts are marked planned. This file is a current-plus-roadmap domain reference, while `packages/db/prisma/schema.prisma` remains the source of truth for implemented database structure.

## Implemented

### Workspace and organization
- Workspace
- Location
- Room
- WorkspaceUser
- WorkspaceSetting
- StaffInvite
- AuthSession

### People and relationships
- User
- Member
- Guardian
- FamilyLink

### Programs and scheduling
- Program
- ClassTemplate
- ClassBooking
- WaitlistEntry
- AttendanceRecord

### Commerce and billing
- MembershipPlan
- MembershipPlanProgramRestriction
- MemberMembership
- DropInProduct
- DropInProductProgramRestriction
- PunchCardProduct
- PunchCardProductProgramRestriction
- MemberPunchCard
- WorkspaceStripeSettings
- MembershipBillingState
- BillingRecord
- StripeWebhookEvent

### Forms and agreements
- FormDocument
- FormVersion
- RequiredFormAssignment
- SignatureRequest
- SignedDocument

## Partial / represented differently
- StaffUser is represented by User plus WorkspaceUser.
- RoleAssignment is represented by WorkspaceUser role membership.
- PermissionProfile is not a separate model; role checks are explicit in application code.
- MemberTag, MemberNote, and ContactMethod are represented as fields on Member for the current slices.
- ClassCoachAssignment is represented by ClassTemplate.coachWorkspaceUser.
- ClassInstance is not persisted yet; current occurrences are derived from ClassTemplate and scheduled dates.
- Booking is implemented as ClassBooking.
- Invoice, InvoiceLineItem, Payment, PaymentMethodReference, FailedPaymentCase, and BillingPolicy are represented by Stripe identifiers plus MembershipBillingState and BillingRecord for current billing workflows.

## Planned

### Events and private lessons
- Event
- EventBooking
- PrivateLessonSlot
- PrivateLessonBooking

### Billing depth
- Invoice
- InvoiceLineItem
- Payment
- Refund
- AccountCredit
- CreditRule
- BillingPolicy
- PaymentMethodReference
- FailedPaymentCase

### Messaging and notifications
- ConversationThread
- ConversationParticipant
- Message
- Announcement
- NotificationJob
- EmailTemplate

### Progress tracking
- ProgressModuleSetting
- BeltDefinition
- MemberProgressState
- PromotionRecord

### Migration
- ImportJob
- ImportSourceFile
- ImportFieldMapping
- StagingRecord
- ValidationIssue
- ReconciliationReport

## Core status enums

### UserRole
- OWNER
- COACH
- CUSTOMER

### WorkspaceStatus
- SETUP_INCOMPLETE
- ACTIVE
- DISABLED

### StaffInviteStatus
- PENDING
- ACCEPTED
- EXPIRED
- REVOKED

### MemberStatus
- ACTIVE
- TRIAL
- OVERDUE
- FROZEN
- CANCELLED
- WAITLISTED

### ClassBookingStatus
- PENDING_PAYMENT
- BOOKED
- CANCELLED
- ATTENDED
- ABSENT
- NO_SHOW

### ClassBookingType
- TRIAL
- MEMBERSHIP
- PUNCH_CARD
- DROP_IN

### ClassBookingSource
- ADMIN
- PUBLIC_TRIAL
- MEMBER_PORTAL

### AttendanceState
- PRESENT
- LATE
- ABSENT
- NO_SHOW

### MemberMembershipStatus
- ACTIVE
- PENDING_PAYMENT_METHOD
- PAST_DUE
- FROZEN
- CANCELLED
- ENDED

### StripeConnectionStatus
- NOT_CONNECTED
- PENDING
- ACTIVE
- RESTRICTED
- DISCONNECTED

### BillingStateStatus
- NOT_READY
- ACTIVE
- PENDING_PAYMENT_METHOD
- PAST_DUE
- PAYMENT_FAILED
- ACTION_REQUIRED
- FROZEN
- CANCELLED
- ENDED

### BillingRecordStatus
- INFO
- PENDING
- SUCCEEDED
- FAILED
- ACTION_REQUIRED

### StripeWebhookProcessingStatus
- PROCESSING
- PROCESSED
- ERROR

### AccessRestrictionMode
- GENERAL
- PROGRAM_RESTRICTED

### MemberPunchCardStatus
- ACTIVE
- DEPLETED
- ARCHIVED

### WaitlistEntryStatus
- ACTIVE
- PROMOTED
- CANCELLED

### FormType
- WAIVER
- MEMBERSHIP_AGREEMENT
- CHILD_GUARDIAN_WAIVER
- CUSTOM

### RequirementTarget
- TRIAL
- MEMBER
- GUARDIAN
- MEMBERSHIP_ACTIVATION

### FormSignerKind
- MEMBER
- GUARDIAN

### SignatureRequestStatus
- OPEN
- COMPLETED
- EXPIRED
- CANCELLED

### SignatureAccessMethod
- PORTAL
- MAGIC_LINK

## Early modeling rules
- one workspace maps to one gym business in MVP
- one workspace has one primary location in MVP
- multiple rooms may belong to that one location
- progress-related entities must be hidden/ignored when progress tracking is disabled
- family support is basic: guardian-child relationships, shared payment context, booking on behalf of child
- billing records must distinguish actionable current-state records from historical display records
- migration should write into staging models before production entities
