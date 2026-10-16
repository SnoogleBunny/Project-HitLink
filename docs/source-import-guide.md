# Import contracts, balances and source evidence

Use **Settings → Import and switch systems**. A migration operator stages and validates UTF-8 CSV files while the workspace remains in setup. Keep the original source IDs. Import dependencies first, review the destination against the final source export, then obtain the owner's exact cutover acknowledgment. Activation is a separate operator action. A successful row import alone does not activate service.

Every row needs `external_id` and the stated source evidence. Fields below are CSV column names. JSON values must be quoted as CSV cells. Dates are `YYYY-MM-DD`; timestamp fields include a timezone. Money is integer minor units with an explicit three-letter currency. Program IDs in accepted terms are deliberately mapped destination IDs in this workspace, never guessed from names.

Import in this order:

1. Members/guardians and family links, plans, schedule templates and drop-in products.
2. Current memberships, packs, source invoices → payments → refunds, and exact consent evidence.
3. Opening allowance usage for every capped current window, including explicit zero.
4. Future reservations, each naming its original funding source.
5. Final reconciliation, current guardian authority and current required-form signatures; owner acknowledgment; operator activation.

## Current memberships

Required columns: `external_id`, `member_external_id`, `membership_plan_external_id`, `status` (`ACTIVE`), `started_on`, `next_billing_date`, `allowance_anchor_date`, `allowance_timezone`, `paid_from`, `paid_through`, `source_system`, `source_account_reference`, `source_contract_reference`, `source_evidence`, `acceptance_evidence`, `payer_authority_evidence`, `accepted_terms`.

`paid_through` is exclusive: a class on that date needs the next reviewed paid source period. The original local anchor survives short months and timezone offsets. Billing remains with the source; no destination customer, subscription or successful charge is invented.

`accepted_terms` is the original accepted snapshot: `version`, `capturedAt`, `monthlyPriceCents`, `currency`, `weeklyClassLimit` (positive integer or null), `monthlyClassLimit` (positive integer or null), `allowanceCountingMode` (`RESERVATION` or `ATTENDANCE`), `lateCancellationConsumesClass`, `noShowConsumesClass`, `programIds`, and the complete accepted `lifecyclePolicy`. Today's catalog is not a substitute for missing acceptance.

An owner can later open **Members → member → Billing → Record the next paid source period**, review the next interval, and attach the original paid PDF receipt. The new interval and receipt are appended; earlier evidence and accepted terms remain intact. Destination billing still requires its own verified authorization and transfer review.

## Source cancellation and freeze receipts

Source billing remains in the original system. An owner reviews a cancellation or finite freeze in the member billing page and attaches the original PDF receipt (up to 5 MB), exact source account/contract, source timestamp, and billing/access attestation. A **configured** receipt can confirm a future scheduled change; it does not claim that billing has already stopped. At the reviewed boundary the maintenance worker applies the access change and requests completed source evidence, even when Stripe is not configured. The worker still requires its configured authenticated schedule.

Confirmed future cancellation releases affected reservations from its effective date. Confirmed freeze releases reservations within the finite freeze interval. Earlier access and independent debt remain governed by the accepted contract. After the intended resume date, source access stays held until the owner records an original-system **completed resumption** receipt. Withdrawal of a future cancellation requires its own receipt. No released class is booked again automatically. These records are owner-reviewed source evidence; HitLink does not call the original billing provider or invent destination processor confirmation.

A legacy contract with no known source account is blocked from source lifecycle changes. **Verify the original source account** appends an exact original receipt/account binding while preserving the existing paid dates and all earlier records. It cannot extend access. Source change receipts and source payment receipts are separate evidence, so a resume receipt cannot extend the paid-through boundary.

## Packs and usage

Pack columns: `external_id`, `member_external_id`, `product_external_id`, `product_name`, `available_punches`, `reserved_punches`, `purchased_on`, `expires_on` (exclusive date or literal `NONE`), `source_evidence`, `acceptance_evidence`, `accepted_terms`.

Pack terms contain `version`, `capturedAt`, `priceCents`, `currency`, `originalPunches`, `restrictionMode` (`GENERAL` or `PROGRAM_RESTRICTED`), `programIds`, `lateCancellationConsumesPunch`, `noShowConsumesPunch`.

The opening ledger is available plus reserved. Importing the named future reservations then reserves those units exactly once: available 3 plus reserved 2 starts at 5 and finishes at available 3. Replaying the original row after cancellation never resets a live balance. Changed source data under an existing ID requires correction review.

Opening usage columns: `external_id`, `membership_external_id`, `period_kind` (`WEEK` or `BILLING_MONTH`), `period_start`, `period_end` (exclusive), `as_of_date`, `used_count`, `source_evidence`. Match the accepted billing-anchored window exactly. At cutover, each capped window requires an opening as of the go-live date. Used classes remain separate from future reservations. Dual caps therefore have two window records for the same physical usage; source reconciliation must use that same definition.

## Future reservations

Required: `external_id`, `member_external_id`, `class_template_external_id`, `scheduled_for_date`, `funding_type`, `funding_external_id`, `source_evidence`. `funding_type` is `MEMBERSHIP`, `PUNCH_CARD`, `TRIAL`, or `SOURCE_PAYMENT`. Only a trial leaves `funding_external_id` blank. A child additionally needs `guardian_external_id` and current verified booking/signing authority with the exact family link; importing a contact or family link does not grant access.

For `SOURCE_PAYMENT`, also provide `source_system`, `drop_in_product_external_id`, `amount_cents`, `currency`, `source_allocation_reference`. The source payment must be independently reviewed as paid, have matching beneficiary/currency, retain source refund ownership, and have enough unallocated net paid money. The imported price is preserved even if the current drop-in catalog differs. Capacity, date, eligibility, allowance and expiry checks run atomically. A failed row rolls back the whole batch.

## Source invoices, payments and refunds

Choose **Historical billing**. Required columns: `external_id`, `record_kind` (`INVOICE`, `PAYMENT`, `REFUND`), `source_system`, `source_account_reference`, `source_status`, `member_external_id` (beneficiary), `payer_member_external_id`, `source_evidence`, `payer_authority_evidence`, `billing_owner`, `refund_owner`, `amount_cents`, `tax_cents`, `paid_cents`, `refunded_cents`, `currency`, `occurred_at`, `parent_external_id` (blank for invoices; original invoice for a payment; original payment for a refund).

Invoice statuses: `OPEN`, `PAID`, `VOID`, `UNCOLLECTIBLE`. Payment statuses: `SUCCEEDED`, `FAILED`, `PENDING`. A refund receipt must be `SUCCEEDED`. A completed refund uses `paid_cents = amount_cents`, `refunded_cents = 0`, `tax_cents = 0`. Owner values are `SOURCE` or `UNRESOLVED`; unresolved ownership blocks cutover. Every invoice's paid total and payment's refunded total must match its exact source chain. These records remain imported, with no Stripe identifiers or inferred portal/payer permission.

When the gym cancels a source-paid class, its financial review points to the original source payment. The owner refunds through that system and records the completed source refund reference, exact amount/time and original PDF receipt in **Billing → Payment review**. This records owner-reviewed source evidence; it does not submit a new refund. Partial receipts leave the remainder open. Receipts cannot exceed net paid money, conflict with pending entitlement holds, or consume money still funding active classes.

## Original signed consent

Choose **Source consent receipts**. Required: `external_id`, `source_system`, `member_external_id`, `source_evidence`, `form_version_id`, `source_document_sha256`, `signature_receipt_base64`, `signature_receipt_sha256`, `signer_kind` (`MEMBER` or `GUARDIAN`), `signer_name`, `source_signer_reference`, `source_beneficiary_reference`, `signer_authority_evidence`, `signed_at`; guardians also need `guardian_external_id`.

First map the exact original document bytes to the destination form version. The supplied SHA-256 must match those bytes. Supply the original signed PDF receipt, not a recreated signature. Preserve the original source timestamp, signer, beneficiary and reviewed authority. Guardian evidence additionally requires current verified signing access and the exact family link. No destination signing event is fabricated. A current required-form version without a valid applicable signature blocks entitlement cutover.

## Reconciliation and remaining boundaries

Cutover snapshots include exact per-record terms, source intervals, opening usage, live reservations, source money allocations, current guardian access, current form versions/signature evidence, source file hashes and ledger entries. Offsetting errors in aggregate totals do not hide record changes. Any change after owner review requires a new snapshot and acknowledgment.

Business exports preserve reviewed source originals and exact signed, paid-period and refund receipt files with hashes. Individual exports remain separately permission scoped. Source evidence does not authorize destination collection, source billing cessation, automatic refunds, contact-based account linking, or coaching note access.

Unknown current contract statuses, missing accepted terms, ambiguous funding/payer identity, unverified guardian authority, unmatched money chains and missing consent remain quarantined. Historical attendance, rank imports and review-only notes still require their separately defined mapping; do not mark them imported or silently discard essential source obligations. Source contract corrections are reviewed explicitly rather than overwriting a live imported contract.
