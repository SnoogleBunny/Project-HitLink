# Domain Model

## Workspace and organization
- Workspace
- Location
- Room
- StaffUser
- RoleAssignment
- PermissionProfile
- WorkspaceSetting
- StaffInvite

## People and relationships
- Member
- Guardian
- FamilyLink
- MemberTag
- MemberNote
- ContactMethod

## Programs and scheduling
- Program
- ClassTemplate
- ClassInstance
- ClassCoachAssignment
- Booking
- WaitlistEntry
- AttendanceRecord
- Event
- EventBooking
- PrivateLessonSlot
- PrivateLessonBooking

## Commerce and billing
- MembershipPlan
- MemberMembership
- DropInProduct
- PunchCardProduct
- MemberPunchCard
- Invoice
- InvoiceLineItem
- Payment
- Refund
- AccountCredit
- CreditRule
- BillingPolicy
- PaymentMethodReference
- FailedPaymentCase

## Forms and agreements
- FormDocument
- FormVersion
- SignatureRequest
- SignedDocument
- RequiredFormAssignment

## Messaging and notifications
- ConversationThread
- ConversationParticipant
- Message
- Announcement
- NotificationJob
- EmailTemplate

## Progress tracking
- ProgressModuleSetting
- BeltDefinition
- MemberProgressState
- PromotionRecord

## Migration
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

### MemberStatus
- ACTIVE
- TRIAL
- OVERDUE
- FROZEN
- CANCELLED
- WAITLISTED

### InviteStatus
- PENDING
- ACCEPTED
- EXPIRED
- REVOKED

### WorkspaceStatus
- ACTIVE
- SETUP_INCOMPLETE
- DISABLED

### AttendanceState
- PRESENT
- LATE
- ABSENT
- NO_SHOW

### BookingState
- BOOKED
- CANCELLED
- WAITLISTED
- ATTENDED
- NO_SHOW

## Early modeling rules
- one workspace maps to one gym business in MVP
- one workspace has one primary location in MVP
- multiple rooms may belong to that one location
- progress-related entities must be hidden/ignored when progress tracking is disabled
- family support is basic: guardian-child relationships, shared payment context, booking on behalf of child
- billing records must distinguish actionable current-state records from historical display records
- migration should write into staging models before production entities

