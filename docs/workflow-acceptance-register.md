# Canonical workflow acceptance evidence

This register preserves all 219 specification inventory outcomes. Rows preserve the actual evidence boundary for this continuation. A named source, applicable meaningful tests and matched runtime/operational evidence are required before changing its state. P1/P2 and conditional services retain their specification gates; unverified is not equivalent to deferred or complete.

The [domain audit](acceptance-domain-audit.md) maps maintained source and tests for identity, scheduling, trials, members, bookings, attendance, products, payments, forms, portals, communications and ranks. The [remaining-group audit](acceptance-remainder-audit.md) maps workspace, migration, reporting, reliability, localization and coaching requirements. The [critical-flow audit](approved-flow-test-audit.md) tracks browser and operational boundaries. New work below is not a whole-release certification.

| ID | Outcome | Gate | Evidence state |
| --- | --- | --- | --- |
| WS-01 | Create business workspace | P0 | New-business path implemented: 10 PostgreSQL + 7 policy checks and focused owner/member regressions; final schema-48 combined browser passed coaching-only verified activation with zero fake imports/classes/rooms/financial records. All three existing migration-onboarding cases also passed after stale heading assertions were corrected; original migration gates retained |
| WS-02 | Configure identity and contact details | P0 | Owner authorization/version/currency-history guards: 14 focused tests passed; UI acceptance pending (`business-settings.*`) |
| WS-03 | Set timezone, currency and locale | P0 | 69 affected owner + 42 member checks and final schema-48 WS03 browser passed; locale consumers/14 coaching display tests pass. Full package/lint/type/build gates passed; actual device acceptance remains separate |
| WS-04 | Create programs and service categories | P0 | Audit pending |
| WS-05 | Create rooms and training areas | P0C | Audit pending |
| WS-06 | Configure booking window and capacity rules | P0 | Partial: owner-previewed immutable class hours/horizon/lead rules apply to staff/member/trial/move/promotion with retained commitments and original queue consent. Explicit named owner late booking is implemented at schema52 with22 database cases and maintained browser proof, including unchecked denial, existing funding and private receipt/member notice boundaries. Schema52 distribution package/lint/type gates and the fresh56-case browser run passed. Room-default review is implemented at schema54:17 PostgreSQL cases,94-case integrated gate, owner browser,20 protected archive/audit cases and fresh59-case full browser/distribution953-admin gates pass. Explicit class overrides retain precedence and waited late/import commands cannot overbook a reduced room. Source58 coaching hours/horizon/lead/buffers and presale/disclosure are adopted; full host1194-admin/types/lint/tooling gates pass. Coaching browser/distribution/populated-upgrade acceptance remains open |
| WS-07 | Configure cancellation, late-cancel and no-show rules | P0 | Audit pending |
| WS-08 | Configure payment grace period | P0 | Audit pending |
| WS-09 | Configure self-service permissions | P0 | Audit pending |
| WS-10 | Configure multiple locations | P2 | Audit pending |
| ID-01 | Create owner account and sign in | P0 | Audit pending |
| ID-02 | Invite staff | P0 | Real queued fragment-link acceptance and immutable create/rotate/revoke/accept implemented; 38 focused invite/outbox/action checks and maintained phone/browser acceptance passed: rotated/reused rejection, exact account acceptance, old-session revocation and attributed immutable history. Actual provider delivery remains pending |
| ID-03 | Assign or change staff roles | P0 | Domain verified: 15 focused tests including last-owner race, session/private-coach revocation, stale edit, immutable audit and reviewed purge; browser acceptance pending |
| ID-04 | Coach access to operational views | P0 | Audit pending |
| ID-05 | Front-desk access | P0C | Audit pending |
| ID-06 | Member authentication | P0 | Audit pending |
| ID-07 | Guardian authentication | P0 | Audit pending |
| ID-08 | Revoke session or access | P0 | Audit pending |
| ID-09 | Enforce tenant and role boundaries | P0 | Audit pending |
| ID-10 | Audit security-sensitive identity changes | P0 | Recovery/session and staff-role audit verified; invitation immutable history/atomic acceptance has real PostgreSQL race/rollback and complete browser proof. Safe scoped owner log also passed its phone browser case |
| SC-01 | Create class template | P0 | Audit pending |
| SC-02 | Create recurring schedule | P0 | Audit pending |
| SC-03 | Generate or resolve class occurrence | P0 | Audit pending |
| SC-04 | Edit one class occurrence | P0 | Audit pending |
| SC-05 | Assign substitute coach | P0 | Audit pending |
| SC-06 | Cancel one class occurrence | P0 | Audit pending |
| SC-07 | Edit or end recurring series | P0 | Audit pending |
| SC-08 | Detect room or coach conflict | P0 | Audit pending |
| SC-09 | Publish schedule to members | P0 | Audit pending |
| SC-10 | Create special event or seminar | P1 | Audit pending |
| SC-11 | Schedule private lesson | P0C | Audit pending |
| SC-12 | Handle daylight-saving/timezone changes | P0 | Audit pending |
| LT-01 | Browse trial-eligible classes | P0 | Audit pending |
| LT-02 | Register prospect | P0 | Audit pending |
| LT-03 | Register minor through guardian | P0 | Audit pending |
| LT-04 | Detect existing person or duplicate lead | P0 | Audit pending |
| LT-05 | Complete required waiver before trial | P0 | Audit pending |
| LT-06 | Book trial class | P0 | Audit pending |
| LT-07 | Book trial administratively | P0 | Audit pending |
| LT-08 | Reschedule or cancel trial | P0 | Audit pending |
| LT-09 | Mark trial attendance or no-show | P0 | Audit pending |
| LT-10 | Manage trial follow-up queue | P0 | Audit pending |
| LT-11 | Convert trial to member | P0 | Audit pending |
| LT-12 | Track acquisition source | P1 | Audit pending |
| MF-01 | Create or edit member profile | P0 | Versioned validated contact/DOB edits and immutable author/history implemented without changing global login identity; full schema-51 package/type/lint gates pass. Maintained stale-edit/identity browser acceptance passed; operational notes/tags and derived status remain separate |
| MF-02 | Link guardian and child | P0 | Audit pending |
| MF-03 | Manage one guardian with multiple children | P0 | Audit pending |
| MF-04 | Manage emergency contacts | P0 | Explicit adult self/verified-minor contact-management bit and exact assigned-coach read-only scope implemented with tenant/member foreign keys and history. Archive creation and download reauthorize the bit. Full schema-51 package/type/lint gates pass; maintained guardian/coach/revocation browser case passed |
| MF-05 | Search and filter members | P0 | Source integrated for schema56: owner-only filters before SQL count/stable fullName/id pagination, current operational tags and filter-bound cursors. Root reviewed/generated the145-model predecessor client/inventory; isolated56 deploy and focused101-case gate pass, including9 directory/6 tag/6 pure cases. Browser/distribution/populated upgrade acceptance remains pending; running checkpoint remains55 |
| MF-06 | Add internal notes and tags | P0 | Implemented at schema 53: attributable immutable NOTE/TAG history, current dated-coach visibility, owner-private scope and explicit owner-only cohort classification. Import and fresh tag reapplication preserve retained seats/funding. Focused 158-case gate, two expanded browser cases, 16 protected archive/retention cases and full 926-admin distribution gate pass. Fresh full 58-case browser run passed; individual/payer archives exclude operational text |
| MF-07 | Archive and reactivate member | P0 | 9 PostgreSQL + 7 validation and affected directory/Today tests pass, including real serialization rollback/retry and non-retryable failure atomicity. Earlier MF07 browser passed fresh balance/unit acknowledgement, archive/reload/reactivation with retained debt/history and no new entitlement; fresh schema-51 MF07 browser case also passed |
| MF-08 | Calculate current member status | P0 | In validation at source56: independent membership/class-pack/coaching facts and page-bounded canonical allowance summaries integrated; no flattened member flag grants service. Independent pack and exact-source funding repairs applied; focused root101-case gate includes7 product/12 funding cases. Mandatory session-backed authority is adopted: root30 authority cases pass within the73-case funding/allowance gate; full uncached source56 package/tooling and package/E2E types pass. Browser/distribution acceptance remains pending |
| MF-09 | Merge duplicate people | P1 | Audit pending |
| MF-10 | Export a member record | P0 | Audit pending |
| BK-01 | Member books class | P0 | Audit pending |
| BK-02 | Guardian books child | P0 | Audit pending |
| BK-03 | Staff books member | P0 | Audit pending |
| BK-04 | Validate membership eligibility | P0 | Audit pending |
| BK-05 | Enforce capacity | P0 | Audit pending |
| BK-06 | Join waitlist | P0 | Audit pending |
| BK-07 | Promote from waitlist | P0 | Audit pending |
| BK-08 | Handle unaccepted waitlist offer | P1 | Audit pending |
| BK-09 | Cancel booking | P0 | Audit pending |
| BK-10 | Apply late-cancel consequence | P0 | Audit pending |
| BK-11 | Apply no-show consequence | P0 | Audit pending |
| BK-12 | Correct booking or consequence | P0 | Audit pending |
| BK-13 | Reschedule across allowance periods | P0 | Audit pending |
| AT-01 | View today’s operational schedule | P0 | Audit pending |
| AT-02 | Open class roster | P0 | Audit pending |
| AT-03 | Check in booked member | P0 | Audit pending |
| AT-04 | Add walk-in attendance | P0 | Audit pending |
| AT-05 | Mark present, late, absent or no-show | P0 | 17 focused attendance/database checks passed; CF04 and AT06 browser proof includes persisted correction and class-end no-show protection |
| AT-06 | Bulk close roster | P0 | Domain and AT06 browser passed: unresolved-only closure after class end, fresh attribution and exact replay cannot penalize newly added rows |
| AT-07 | Correct attendance | P0 | Immutable actor/prior state/reason and original-period reversal have domain proof; CF04 browser correction persisted across reload |
| AT-08 | View member attendance history | P0 | Audit pending |
| AT-09 | Kiosk check-in | P1 | Audit pending |
| MP-01 | Create recurring membership product | P0 | Audit pending |
| MP-02 | Create drop-in product | P0 | Audit pending |
| MP-03 | Create punch-card product | P0 | Audit pending |
| MP-04 | Create prepaid private lesson package | P0C | Audit pending |
| MP-05 | Assign membership to member | P0 | Audit pending |
| MP-06 | Purchase membership through self-service | P0 | Audit pending |
| MP-07 | Schedule future membership start | P0 | Audit pending |
| MP-08 | Request and schedule membership cancellation | P0 | Audit pending |
| MP-09 | Freeze membership | P0 | Audit pending |
| MP-10 | Resume membership | P0 | Audit pending |
| MP-11 | Upgrade or downgrade membership | P1 | Audit pending |
| MP-12 | Apply failed-payment grace state | P0 | Audit pending |
| MP-13 | Restrict access after grace expires | P0 | Domain/system implementation at source59: default penalty-free release of exact membership-funded future reservations, original allowance windows, independent debts/funding, immutable receipt/current-recipient outbox and fixed-high-water maintenance continuation. Meaningful existing-API RED reproduced; all27 new PostgreSQL cases pass and remain covered by the fresh source60 full-host gate with1,452 admin cases,12 package tasks,17 tooling checks, package/E2E types and lint. The adopted owner/member browser case passes on rebuilt production source, including exact receipt visibility and explicit UI rebooking after fictional settlement; it also passes inside the first full69 run. Real maintenance-loop, distribution, populated upgrade and operational acceptance remain pending |
| MP-14 | Restore access after payment | P0 | Audit pending |
| MP-15 | Admin override membership status | P0 | Audit pending |
| MP-16 | View complete membership timeline | P0 | Audit pending |
| MP-17 | Manage billing cycle class allowances | P0 | Audit pending |
| PB-01 | Create payment customer | P0 | Audit pending |
| PB-02 | Collect payment method securely | P0 | Audit pending |
| PB-03 | Create recurring billing agreement | P0 | Audit pending |
| PB-04 | Process one-time charge | P0 | Audit pending |
| PB-05 | Receive and verify webhooks | P0 | Audit pending |
| PB-06 | Process billing events idempotently | P0 | Audit pending |
| PB-07 | Synchronize invoice/payment status | P0 | Audit pending |
| PB-08 | Handle failed payment | P0 | Audit pending |
| PB-09 | Retry or update payment method | P0 | Audit pending |
| PB-10 | Issue full or partial refund | P0 | Audit pending |
| PB-11 | Apply account credit | P0 | Audit pending |
| PB-12 | Prevent duplicate charge | P0 | Audit pending |
| PB-13 | Send receipt or payment confirmation | P0 | Immutable exact-payment confirmation and original notification from all three verified producers; exact payer/owner view and deliberate idempotent copies implemented. Full schema-51 package/type/lint gates pass; maintained exact-payer/copy browser case passed; live email/provider receipt configuration remains unverified |
| PB-14 | Reconcile processor and product state | P0 | Audit pending |
| PB-15 | Record offline/manual payment | P0C | Audit pending |
| PB-16 | Configure taxes | P0C | Audit pending |
| PB-17 | Handle payment dispute or chargeback | P0 | Durable cases, verified account/mode/allocations, composing holds, explicit treatment, exact impact and atomic notices implemented. 65 focused admin + 9 adapter checks and updated exact-impact owner browser passed at schema 48. No live-provider proof |
| WF-01 | Create waiver version | P0 | Audit pending |
| WF-02 | Publish active waiver | P0 | Audit pending |
| WF-03 | Sign waiver publicly | P0 | Audit pending |
| WF-04 | Guardian signs for minor | P0 | Audit pending |
| WF-05 | Member signs through portal or magic link | P0 | Audit pending |
| WF-06 | Store signature evidence | P0 | Audit pending |
| WF-07 | Require re-signing after expiry/version change | P0 | Implemented at the schema55 local functional checkpoint: effective/expiry publication, same-PDF acceptance cycles, notice and explicit booking recovery. All49 forms/archive and14 public-membership PostgreSQL cases pass inside the full host and no-source-mount image gates (1,015 admin cases), including current signing intent, trial service time and money recovery. Nullable-DOB predicate, typed archive/privacy and actual populated54→55 upgrade have proof. Four production builds, exact930-file image match, fresh full60-case browser and51 production route/width checks pass; clean Compose and preserved main upgrade pass. Form checkbox visual polish, live delivery, physical-device and full application acceptance remain separate |
| WF-08 | Staff views waiver status | P0 | Audit pending |
| WF-09 | Export signed waiver | P0 | Audit pending |
| WF-10 | Create operational intake and agreements | P0C | Audit pending |
| PT-01 | Use the role appropriate portal landing page | P0 | 12 portal landing unit/page checks and 3 coaching browser cases passed; canonical effective status controls default coaching destinations and gym/hybrid/payer scopes |
| PT-02 | View eligible class schedule | P0 | Audit pending |
| PT-03 | Book, cancel or join waitlist | P0 | Audit pending |
| PT-04 | View membership and status | P0 | Audit pending |
| PT-05 | View and update payment method | P0 | Audit pending |
| PT-06 | Request freeze or cancellation | P0 | Audit pending |
| PT-07 | View attendance history | P0 | Audit pending |
| PT-08 | View or sign pending waivers | P0 | Audit pending |
| PT-09 | Manage children | P0 | Audit pending |
| PT-10 | Update allowed profile fields | P1 | Audit pending |
| PT-11 | View allowance and booking recovery | P0 | Audit pending |
| CM-01 | Send transactional email reliably | P0 | Audit pending |
| CM-02 | Send trial confirmation and reminder | P0 | Implemented in source60: accurate dated notices, explicit owner reminder timing, current recipient/forms/exact-funding checks and bounded maintenance cursor. Private74 notification +140 adjacent PG cases pass. The six-file legacy-upgrade/exact-owner-retry follow-up is root-adopted after218/218 private PG cases, including46 legacy notices; fresh1,452-admin full-host gates pass. Three rebuilt production browser notice cases pass, including exact current/cancelled worker eligibility, stale draft retention and zero-adapter suppression; all pass inside the first full69 run. Faithful old envelopes are covered; authentic pre60 producer/migration execution and real-delivery acceptance remain pending. |
| CM-03 | Send booking confirmation | P0 | Implemented in source60 after an existing-API RED: normal committed membership/pack/trial and verified paid drop-in confirmations use the durable outbox, stable identity and accurate details. Private74 notification +140 adjacent PG cases pass, including dispatch lock waits and owner retry. Root-adopted legacy and exact-owner-retry follow-up passes218 private PG cases and fresh1,452-admin full-host gates. Three rebuilt production browser notice cases pass and remain green inside the first full69 run. Real provider/delivery acceptance remains pending. Waitlist and owner-exception notices retain separate producers. |
| CM-04 | Send class cancellation/change notice | P0 | Audit pending |
| CM-05 | Send waitlist promotion | P0 | Audit pending |
| CM-06 | Send failed-payment notice | P0 | Audit pending |
| CM-07 | Send freeze/cancellation confirmation | P0 | Audit pending |
| CM-08 | Notify staff of operational exception | P0 | Audit pending |
| CM-09 | Manage email templates | P1 | Audit pending |
| CM-10 | View delivery log and retry | P0 | Owner same-message retry now preserves lifetime attempts/body/provider key with bounded added budget, current-context/version checks and no repeated business effects. Scrubbed/expired/unknown bearers require a fresh dedicated message. Full schema-51 package/type/lint gates pass; owner-retry/payer-copy browser case passed; live provider proof remains separate |
| CM-11 | Send SMS notifications | P2 | Audit pending |
| CM-12 | Send coaching notices | P0C | Audit pending |
| RP-01 | Configure rank system by program | P0C | Audit pending |
| RP-02 | Record promotion | P0C | Audit pending |
| RP-03 | Add or remove stripe | P0C | Audit pending |
| RP-04 | View progression history | P0C | Audit pending |
| RP-05 | Member views current eligible rank | P0C | Audit pending |
| RP-06 | Report promotion candidates | P1 | Audit pending |
| RP-07 | Disable ranks or use skill milestones | P0 | Audit pending |
| RP-08 | Configure and enforce class prerequisites | P0C | Audit pending |
| MG-01 | Run migration intake | P0 | Audit pending |
| MG-02 | Acquire source export safely | P0 | Audit pending |
| MG-03 | Inventory source files and record counts | P0 | Audit pending |
| MG-04 | Map source fields to HitLink | P0 | Source59 gap confirmed: fixed CSV aliases exist; versioned operator mapping and review remain unimplemented. |
| MG-05 | Normalize source data | P0 | Audit pending |
| MG-06 | Detect duplicates and conflicts | P0 | Source59 gap confirmed: exact external-ID replay exists; potential-person matching and recorded deterministic resolution remain unimplemented. |
| MG-07 | Validate required fields and relationships | P0 | Audit pending |
| MG-08 | Import to staging workspace | P0 | Audit pending |
| MG-09 | Produce reconciliation report | P0 | Audit pending |
| MG-10 | Owner reviews and approves mapping | P0 | Audit pending |
| MG-11 | Correct and rerun dry migration | P0 | Audit pending |
| MG-12 | Handle payment-method portability limitations | P0 | Audit pending |
| MG-13 | Run final delta migration | P0 | Audit pending |
| MG-14 | Approve and execute cutover | P0 | Audit pending |
| MG-15 | Validate production after cutover | P0 | Audit pending |
| MG-16 | Rollback or recover failed cutover | P0 | Audit pending |
| MG-17 | Deliver post-migration report | P0 | Audit pending |
| MG-18 | Import coaching records with restricted access | P0C | Audit pending |
| RE-01 | View daily owner operations summary | P0 | Audit pending |
| RE-02 | Report active members by status | P0 | Audit pending |
| RE-03 | Report trial funnel | P0 | Audit pending |
| RE-04 | Report failed payments and grace deadlines | P0 | Audit pending |
| RE-05 | Report attendance and class utilization | P1 | Audit pending |
| RE-06 | Report freezes and cancellations | P1 | Audit pending |
| RE-07 | Export operational data to CSV | P0 | Audit pending |
| RE-08 | View audit log | P0 | Partial: safe owner identity/settings/archive log with scoped pagination and actor/before/after/reason has 3 PostgreSQL checks and phone browser proof at schema 48; transactional domain histories exist. Broad ordinary resource/profile mutation audit and unified source links remain open |
| RE-09 | Generate financial summary | P0 | Separate currency/source summary, complete detail paging, per-payment refund mismatch checks and test/live dispute exposure implemented; 6 PostgreSQL checks, updated dispute phone browser and production Docker responsive smoke passed. Live-provider reconciliation remains pending |
| RE-10 | Export customer data for offboarding | P0 | Audit pending |
| RE-11 | Review coaching operations | P0C | Audit pending |
| SO-01 | Maintain tenant isolation | P0 | Audit pending |
| SO-02 | Manage secrets and environments | P0 | Audit pending |
| SO-03 | Back up production data | P0 | Audit pending |
| SO-04 | Restore from backup | P0 | Small isolated fictional restore verified all 133 tables/142 rows and exact fingerprints; accepted financial/attendance/allowance traffic and production recovery objectives remain unverified |
| SO-05 | Monitor application health | P0 | Audit pending |
| SO-06 | Capture structured operational logs | P0 | Partial: schema53 safe configured Prisma events have8 pure/2 actual-client proof and distribution gates. Source56 handled-Stripe privacy has23 passing root cases and public-registration forms projection18. Exact9-file public-membership/onboarding/migration repair passes payments52 and app/domain92 (21 action/22 actual-PG membership/49 forms), plus focused types/lint. A source-only267-export inventory, full strategy and untested representative boundary/context implementation exist. Native Next raw unexpected exceptions, broader consumed failures, full request/control-flow/concurrency/telemetry and operational acceptance remain open |
| SO-07 | Handle production incident | P0 | Audit pending |
| SO-08 | Verify and rate-limit public endpoints | P0 | Signature/idempotent provider retry and recovery gates retained. Persistent account/network login/signup throttles added with keyed identifiers, trusted-proxy opt-in, TTL cleanup; 11 domain + 31 action/maintenance checks and full schema-48 package/lint/type/build/checks-profile gates pass. Actual deployed edge/proxy configuration remains an operational acceptance gate |
| SO-09 | Export and delete customer data | P0 | Audit pending |
| SO-10 | Support browser and tablet operations | P0 | Audit pending |
| SO-11 | Meet critical performance targets | P0 | Audit pending |
| SO-12 | Provide safe support access | P0 | Audit pending |
| SO-13 | Publish service status and incident updates | P1 | Audit pending |
| SO-14 | Offboard a gym | P0 | Audit pending |
| LA-01 | Render user-facing strings through locale system | P1 | Audit pending |
| LA-02 | Format local date, time and currency | P0 | Locale provider/display helpers, currency precision and actual coaching page consumers tested; 14 coaching page checks preserve canonical ISO inputs/keys. Full supported-device acceptance remains separate |
| LA-03 | Localize transactional emails | P1 | Audit pending |
| LA-04 | Handle translated validation and errors | P1 | Audit pending |
| LA-05 | Support keyboard and screen-reader basics | P0 | Audit pending |
| LA-06 | Support responsive owner/coach interfaces | P0 | Audit pending |
| LC-01 | Enable coaching and assign service access | P0C | Audit pending |
| LC-02 | Configure structured program templates | P0C | Audit pending |
| LC-03 | Register inquiry and book discovery | P0C | Audit pending |
| LC-04 | Record mutual fit decision | P0C | Audit pending |
| LC-05 | Complete intake and coaching agreement | P0C | Audit pending |
| LC-06 | Enroll client and confirm program plan | P0C | Audit pending |
| LC-07 | Purchase structured coaching program | P0C | Audit pending |
| LC-08 | Publish appointment availability | P0C | Partial enabled module: source58 adds owner-confirmed opening hours, horizon, lead and preparation/recovery buffers with retained accepted appointments. Root25 policy PostgreSQL cases and all77 focused policy/payment/archive/leave/retention/export controls pass in the fresh full1194-admin host suite. Full12-package/tooling17,10-package/E2E types and10 lint gates pass. New policy/presale browser, distribution, populated upgrade and actual provider acceptance remain pending |
| LC-09 | Book appointment | P0C | Audit pending |
| LC-10 | Reschedule appointment | P0C | Audit pending |
| LC-11 | Prepare and deliver session | P0C | Audit pending |
| LC-12 | Cancel, record no-show and correct | P0C | Audit pending |
| LC-13 | Agree program milestones and goals | P0C | Audit pending |
| LC-14 | Submit and review client check-in | P2 | Audit pending |
| LC-15 | Record private note and share summary | P0C | Audit pending |
| LC-16 | Pause or resume engagement | P0C | Audit pending |
| LC-17 | Reassign coach and hand over | P0C | Audit pending |
| LC-18 | Close engagement, settle and export | P0C | Audit pending |
| LC-19 | Publish and read daily client notes | P0C | Audit pending |
