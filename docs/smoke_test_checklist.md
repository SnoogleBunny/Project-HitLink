# Smoke Test Checklist

This checklist covers the product flows built so far.

Use it for:
- post-slice regression checks
- pre-demo validation
- end-to-end sanity checks before major refactors

---

## 1. Auth and onboarding

### Owner signup and login
- [ ] Sign up as a brand new owner
- [ ] Complete workspace creation
- [ ] Confirm primary location is created
- [ ] Confirm workspace settings row is created
- [ ] Land on dashboard successfully
- [ ] Refresh and remain signed in
- [ ] Log out successfully
- [ ] Log back in and redirect correctly

### Onboarding edge cases
- [ ] Attempt onboarding twice and confirm no duplicate workspace is created
- [ ] Simulate inactive singleton `WorkspaceUser` and confirm onboarding blocks with inline error
- [ ] Confirm blocked onboarding logs the server-side warning

### Role protection
- [ ] Owner can access owner pages
- [ ] Coach cannot access owner pages
- [ ] Customer cannot access owner pages
- [ ] Unauthorized route behavior is correct

---

## 2. Programs

- [ ] Create program with minimal fields
- [ ] Create program with optional fields
- [ ] Edit program
- [ ] Archive program
- [ ] Confirm archived program disappears from default list
- [ ] Confirm archived program cannot be selected when creating or editing class templates
- [ ] Attempt to archive a program referenced by an active class template and confirm dependency guard blocks it

---

## 3. Rooms

- [ ] Create room with no capacity
- [ ] Create room with capacity
- [ ] Edit room
- [ ] Toggle room inactive
- [ ] Archive room
- [ ] Confirm archived room disappears from default room list
- [ ] Confirm inactive room cannot be selected for new class template
- [ ] Confirm archived room cannot be selected for new class template
- [ ] Attempt to archive or deactivate room referenced by active class template and confirm dependency guard blocks it

---

## 4. Staff invites

- [ ] Invite coach by email
- [ ] See pending invite in list
- [ ] Resend invite
- [ ] Confirm same invite row is refreshed instead of duplicated
- [ ] Revoke invite
- [ ] Confirm revoked invite leaves pending list
- [ ] Create stale pending invite in test/dev data
- [ ] Confirm lazy expiration logic marks it expired during list or mutate flow

---

## 5. Schedule and class templates

### Create, edit, archive
- [ ] Create class template with program, room, coach, weekday, times, and cutoffs
- [ ] Confirm template appears on weekly schedule board on correct weekday
- [ ] Edit class template
- [ ] Archive class template
- [ ] Confirm archived template disappears from active board and appears in archived section if implemented

### Validation
- [ ] Reject end time earlier than or equal to start time
- [ ] Reject invalid capacity override
- [ ] Reject invalid booking/cancellation cutoff values
- [ ] Reject archived program
- [ ] Reject inactive room
- [ ] Reject archived room
- [ ] Reject invalid coach assignment
- [ ] Reject cross-workspace record references

---

## 6. Members and guardians

### Member basics
- [ ] Create member manually
- [ ] Create member with email only
- [ ] Create member with phone only
- [ ] Update member
- [ ] Add notes
- [ ] Add tags
- [ ] Search by full name
- [ ] Search by email
- [ ] Search by phone

### Guardian flows
- [ ] Add first guardian
- [ ] Add second guardian
- [ ] Attempt third guardian and confirm it is blocked
- [ ] Verify guardian/member relationship appears on member profile
- [ ] Verify cross-workspace guardian linking is blocked

---

## 7. Public trial booking

### Happy path
- [ ] Open public trial page for workspace
- [ ] Verify only eligible templates appear
- [ ] Choose valid upcoming date
- [ ] Submit participant with email
- [ ] Submit participant with phone
- [ ] Submit with optional guardian
- [ ] Verify inline confirmation appears
- [ ] Verify member is created with `TRIAL` status
- [ ] Verify guardian/family link created when applicable
- [ ] Verify canonical booking is created with `bookingType = TRIAL` and `source = PUBLIC_TRIAL`

### Validation
- [ ] Reject invalid email
- [ ] Reject future DOB if DOB validation is enabled
- [ ] Reject missing contact method
- [ ] Reject arbitrary date not offered in the UI
- [ ] Reject archived or ineligible template
- [ ] Reject cross-workspace template

### Admin visibility
- [ ] Confirm trial booking appears on member profile
- [ ] Confirm trial booking appears on dated roster
- [ ] Confirm trial badge appears on roster

---

## 8. Standard bookings

### Admin booking creation
- [ ] Create standard booking for member/template/date
- [ ] Verify booking appears on roster
- [ ] Verify booking appears on member history

### Duplicate handling
- [ ] Attempt duplicate booking for same member/template/date and confirm it is blocked
- [ ] Cancel booking if supported in current flow
- [ ] Recreate same occurrence and confirm cancelled row is restored instead of creating a new row

### Date validation
- [ ] Reject invalid weekday/date mismatch
- [ ] Reject invalid date format
- [ ] Reject cross-workspace member/template linkage

---

## 9. Coach roster

### Coach today view
- [ ] Log in as coach
- [ ] Confirm coach lands in coach/today
- [ ] Verify only assigned templates appear
- [ ] Verify unassigned templates do not appear

### Dated roster
- [ ] Open assigned roster for today
- [ ] Confirm roster shows standard bookings
- [ ] Confirm roster shows trial bookings
- [ ] Confirm guardian context appears where applicable
- [ ] Confirm notes/tags appear where expected
- [ ] Attempt to open unassigned template roster as coach and confirm access is denied

### Owner roster
- [ ] Log in as owner
- [ ] Confirm owner can open all workspace rosters

---

## 10. Attendance

### Attendance recording
- [ ] Mark booked member present
- [ ] Mark another member late
- [ ] Mark another member absent
- [ ] Mark another member no-show

### Upsert behavior
- [ ] Change present to late and confirm attendance record updates instead of duplicating

### Booking status sync
- [ ] `PRESENT` updates booking to attended
- [ ] `LATE` updates booking to attended
- [ ] `ABSENT` updates booking to absent
- [ ] `NO_SHOW` updates booking to no-show

### Restrictions
- [ ] Attempt attendance for future occurrence and confirm it is blocked
- [ ] Attempt cross-workspace attendance write and confirm it is blocked

### Member profile
- [ ] Confirm attendance history appears on member profile
- [ ] Confirm recent booking and attendance history are coherent together

---

## 11. Membership plans

### Plan creation
- [ ] Create recurring monthly plan
- [ ] Create plan with optional description
- [ ] Create plan with restrictions if implemented
- [ ] Verify archived plans disappear from active selection lists

### Validation
- [ ] Reject zero or negative price
- [ ] Reject invalid currency
- [ ] Reject archived plan assignment later
- [ ] If Stripe price has synced, verify price/currency edits are blocked as intended

---

## 12. Member memberships

### Assignment
- [ ] Assign membership plan to member
- [ ] Verify only one current membership is allowed
- [ ] Attempt second current membership and confirm it is blocked

### Lifecycle
- [ ] Cancel at period end
- [ ] Verify membership remains current until end-of-cycle logic applies
- [ ] Freeze immediately
- [ ] Schedule freeze
- [ ] Clear scheduled freeze
- [ ] Verify lifecycle fields update correctly

### Separation of concerns
- [ ] Verify member profile status does not get silently overwritten unexpectedly
- [ ] Verify membership status and billing state remain distinct

---

## 13. Stripe Connect

### Connection setup
- [ ] Open billing settings
- [ ] Start Stripe onboarding
- [ ] Return from onboarding
- [ ] Refresh account state
- [ ] Verify account id is stored
- [ ] Verify connection status updates correctly
- [ ] Verify charges enabled / payouts enabled / details submitted fields update correctly

### Grace period
- [ ] Update failed payment grace period
- [ ] Verify saved value is used in billing state calculations

---

## 14. Billing state and failed payments

### Assignment path
- [ ] Assign membership where payment method is missing or unusable
- [ ] Verify local state becomes `PENDING_PAYMENT_METHOD`
- [ ] Verify membership and billing state are still created correctly

### Failed payment queue
- [ ] Create or simulate failed payment webhook/event
- [ ] Verify row appears in failed payment queue
- [ ] Verify member billing page shows failure
- [ ] Verify optional member profile badge appears if implemented

### Retry now
- [ ] Trigger retry when open invoice exists
- [ ] Verify app-side record is written
- [ ] Verify invalid retry preconditions are blocked

### Payment update requested
- [ ] Mark payment update requested
- [ ] Verify timestamp or record is saved

---

## 15. Webhooks

### Idempotency
- [ ] Deliver the same Stripe event twice
- [ ] Verify the second delivery is a no-op

### Processing paths
- [ ] `invoice.paid` updates billing state correctly
- [ ] `invoice.payment_failed` updates billing state correctly
- [ ] `customer.subscription.deleted` updates membership/billing state correctly
- [ ] Failed webhook processing marks error state
- [ ] Retry processing works for stale/error cases if implemented

### Persistence
- [ ] Verify `StripeWebhookEvent` row is created
- [ ] Verify webhook event status transitions correctly through processing lifecycle

---

## 16. End-to-end smoke scenarios

### Scenario 1 — Owner setup
- [ ] Sign up owner
- [ ] Create workspace
- [ ] Create program
- [ ] Create room
- [ ] Invite coach
- [ ] Create class template
- [ ] See it on weekly board

### Scenario 2 — Trial intake to attendance
- [ ] Public user books trial
- [ ] Trial booking appears on roster
- [ ] Coach sees it in today view
- [ ] Coach marks attendance
- [ ] Member profile shows trial booking and attendance

### Scenario 3 — Standard member booking
- [ ] Owner creates member
- [ ] Owner creates standard booking for valid date
- [ ] Roster shows member
- [ ] Coach marks no-show
- [ ] Member history reflects it

### Scenario 4 — Membership billing
- [ ] Owner connects Stripe
- [ ] Owner creates membership plan
- [ ] Assigns plan to member
- [ ] Verify billing state path (`PENDING_PAYMENT_METHOD` or live subscription state)
- [ ] Simulate failed invoice
- [ ] Verify queue and member billing page
- [ ] Retry now if possible

### Scenario 5 — Permission safety
- [ ] Coach tries owner pages and is blocked
- [ ] Owner accesses expected admin pages successfully
- [ ] Cross-workspace lookups are blocked where applicable

---

## Minimum must-pass list before demos
- [ ] Owner onboarding
- [ ] Program, room, and template creation
- [ ] Trial booking
- [ ] Roster visibility
- [ ] Attendance recording
- [ ] Member profile history
- [ ] Membership assignment
- [ ] Stripe connect path
- [ ] Failed payment queue
- [ ] Role protection

