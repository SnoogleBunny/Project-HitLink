# Open Product Questions

This file tracks non-test product and design questions extracted from the smoke-test checklist.

## 1. Product scope questions

### Solo private-lesson operators vs gyms
- Question: Should MVP support solo private-lesson operators as a first-class target, or stay focused on class-based gyms and studios?
- Recommended current answer: Keep the MVP optimized for one-location Muay Thai gyms and Hyrox/HIIT-style class studios. Solo private-lesson operators may fit later, but they should not drive onboarding, schedule, or billing decisions in the current product.
- Suggested action: keep

### Dedicated emergency contact field
- Question: Do member profiles need a dedicated emergency contact field?
- Recommended current answer: Not in the current MVP. The model supports guardians plus internal notes today, but there is no dedicated emergency-contact field.
- Suggested action: keep

## 2. Operational policy questions

### Re-inviting revoked or declined coaches
- Question: Can a coach who was revoked, or who later declines an invite, be invited again?
- Recommended current answer: Yes. Revoked invites should be re-invitable via a new invite row. Decline handling is not implemented yet, but it should follow the same rule so prior invite history is preserved.
- Suggested action: decide now

### `ABSENT` vs `NO_SHOW`
- Question: What is the functional difference between `ABSENT` and `NO_SHOW`?
- Recommended current answer: Use `ABSENT` for excused or notified misses, and `NO_SHOW` for unexcused misses. Keep both as distinct states even if downstream penalties and reporting stay lightweight for now.
- Suggested action: decide now

### Make-up class support
- Question: If a student misses class, do we support make-up classes in the product?
- Recommended current answer: Not as a dedicated MVP workflow. Handle make-up exceptions manually outside the standard system flow, or through owner-managed credits or punch cards if needed.
- Suggested action: decide now

### Membership upgrades and proration
- Question: If a member upgrades mid-cycle, do we block the change, delay it until renewal, or prorate and credit automatically?
- Recommended current answer: Do not auto-prorate in MVP. The current system allows only one current membership at a time, and deep proration customization is already deferred. Treat upgrades as owner-managed end-of-cycle changes unless a manual exception is handled outside the standard flow.
- Suggested action: decide now

## 3. Future feature candidates

### Resume onboarding after interruption
- Question: If onboarding is interrupted, or an error happens before data is persisted, should the owner be able to resume instead of starting over?
- Recommended current answer: Not currently. Onboarding is a single transaction today; if it succeeds the owner continues to the dashboard, and if it fails before the membership row exists they start again.
- Suggested action: defer

### Save-progress class template drafts
- Question: Should owners or coaches be able to save a partially completed class template and finish it later?
- Recommended current answer: Not currently. Class templates are create-or-save, not draft-based.
- Suggested action: defer
