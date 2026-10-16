# HitLink Product Workflows and Shipping Specification

Martial arts and adult life coaching

Version 1.3  |  October 16, 2026

Prepared for the founder and product delivery team.

This specification defines the approved product experience, domain workflows and release acceptance for HitLink. It preserves the version 1.2 workflow inventory and incorporates the approved mockup decisions. It is a delivery requirement, not a claim that every requirement is already implemented.

## Approved product experience

This edition replaces version 1.2 and incorporates the approved interactive mockup. The workflow inventory, domain safeguards and release gates below remain required. This section defines the approved navigation, presentation and connected actions. Where an older roadmap or document conflicts, these explicit decisions take precedence. A rendered screen alone is not evidence of a working workflow.

### Delivery scope and source of truth

Implement the experience in the real owner and member web applications using persisted workspace records, protected server operations and the shared domain rules. Preserve the one-location modular monolith, Next.js, Prisma, PostgreSQL, Stripe Connect and email-only launch architecture. The three account roles remain owner, coach and customer; functional reception, guardian, payer and support permissions are grants within that model, not implied access to every record.

The approved scope covers the mockup's owner, gym member, guardian, adult coaching client, coach and public visitor journeys. Existing P0 and enabled P0C requirements are unchanged. Public paid membership signup is now included in this implementation, superseding its former P1 sequencing. Optional appointment and rank modules remain conditional on the service offered. Deferred items in Appendix A remain deferred.

Mockup samples are fixtures only. Do not ship the single-active-booking restriction, fixed October 2026 date range, hardcoded people or balances, browser-memory persistence, simulated payments, simulated notices, scenario controls or reset tools as production behavior. Multiple valid bookings per person must work subject to the accepted capacity, conflict, entitlement and cutoff rules. Use the workspace clock and timezone. Real actions must survive reloads and independent sessions. The compact preview frame is not a fixed production page height; use the actual viewport with stable navigation and scrollable content.

The public product name is HitLink. Technical package identifiers may remain unchanged where renaming would add unrelated risk. Approval of this specification authorizes implementation; it does not certify production activation or waive verification of money, privacy, migration and recovery.

### Navigation and record ownership

Owner primary destinations are Today, Classes, Members, Billing, Plans, Forms, Website and Settings. Detail routes keep their parent selected and provide a clear return path. Retain useful alerts and direct links to exact records rather than embedding every detail workflow in an overview page. Preserve selected class, date and member when navigating or refreshing a valid deep link; invalid or missing drafts return safely to their parent.

Classes owns dated rosters, class creation, one-date edits, future-series edits and coach assignments. Members owns member details, membership changes, family permissions and child rank history. Settings owns program-wide rank rules, Import and switch systems, Records and account closure, and Support and audit. Import review and cutover are stages of the same workflow, retaining separate reconciliation, payer authorization, owner acknowledgment and operator activation gates.

The member portal primary destinations are Classes, Membership, Payments and Account. Classes is the gym member landing page and combines booking discovery with management. There is no additional gym My day, Home or My bookings dashboard. Legacy routes redirect to their current destinations without losing an authorized booking context. Account owns household relationships; Membership links to Agreements and forms, and remains selected on signing routes. Payments is signed-in payer scoped, independent of the person selected for classes.

Coaches start at Clients. A selected client has Plan, Notes and, when the program includes them, Appointments sections. Enrollment and accepted records belong to that client's plan. Pause, replacement and closure are focused program actions. Notes-only programs omit appointment navigation and resolve old appointment links to the program. Coaching clients retain My day for daily notes, My program and, when offered, My appointment. Daily notes and plan approvals are distinct tasks.

### Owner Today and operational cards

Today starts with operational information and a member-portal link, without a duplicate introductory card. Place trial follow-up prominently above lower-priority content. Each metric names its population and destination. Active members uses real active records and opens the complete member directory, clearing any previous family or status filter. Its destination label says View all members. Class bookings names the class, shows booked places against capacity and opens that dated roster. The displayed class and count must refer to the same occurrence.

Payments needing attention opens Billing with its attention filter. Count failed or unresolved payments, pending refund recovery and unresolved dispute cases consistently with the queue and alerts. Assigning a reviewer does not settle a dispute. Only a verified outcome closes a financial obligation. At zero, the card remains readable without an action, chevron, keyboard stop or hover affordance. Peer metric cards share dimensions and aligned content.

### Classes and recurring schedule changes

Owners add classes from Classes and edit from the exact dated roster. A focused form captures title, program or class type, date, local start and end, room, capacity, optional default coach and applicable booking/cancellation settings. Support one date, daily recurrence and selected weekdays. Preview resolved occurrence dates in the workspace timezone, including daylight-saving issues, before saving.

Edits explicitly target this class only or this and future classes. Show the affected dates, bookings and waitlist entries before confirmation. Protect historical and completed attendance, independent date exceptions and stable occurrence IDs. Reject coach or room overlaps, capacity below confirmed bookings, unresolved payment-pending reservations, and removal of booked or waitlisted dates unless the supported cancellation/resolution workflow is used. Revalidate on commit so a stale preview cannot overwrite concurrent bookings or edits.

An occurrence's room appears directly beneath its class title in owner Today, owner Classes and member class listings. Coach identity and Assign coach or Change coach remain together in a separate area. Booking reviews explicitly name class, local date/time, participant, room, current coach, funding source and consequences.

The representative seed timetable repeats daily: HIIT Bootcamp 7:15 am to 8:30 am; HIIT/Hyrox 4:30 pm to 5:30 pm; Beginner Padwork 5:30 pm to 6:30 pm; Beginner Muay Thai 6:30 pm to 7:30 pm; Advanced Muay Thai 6:30 pm to 7:30 pm. The simultaneous classes remain distinct records with separately valid resources. These are demo seeds, not immutable business settings; owners can create their actual timetable.

### Coach assignment by date

A recurring class may have no default coach. Each occurrence independently inherits the default, explicitly assigns a coach or explicitly remains unassigned. A one-date assignment does not create a complete schedule exception: later time, room or capacity changes still apply unless those fields have their own dated exception. Changing the default preserves explicit assigned and unassigned dates. Historical teacher records and recorded attendance are immutable except through an audited correction.

Today, Classes and the selected roster provide a quick Assign coach or Change coach action for the exact date. Owners see Needs coach; members see Coach to be confirmed and may still book when otherwise eligible. Persist the assignment mode as well as the effective coach so changing inheritance without changing the displayed coach is not lost.

Check the effective coach against other classes, enabled coaching appointments, leave and applicable buffers. Unassigned values do not conflict with one another. These checks detect scheduling conflicts; they do not verify qualifications or actual willingness to teach. Staff confirm availability. A changed published coach durably queues notices for affected booked and waitlisted people; changing assignment mode with no published-name change requires no notice. Preserve seats, attendance provenance, money, funding and allowance.

### Unified member Classes

Show the selected day and program filter alongside that member's exact Booked, Pending, Waitlisted and Attended states. A Manage action opens the relevant booking's receipt, move or cancellation controls. Keep compact attendance history available. If the current day or filter hides an active booking, show a named link that selects its date and clears the incompatible filter. Empty states offer direct date selection and booking rather than a dead end.

Booking confirmation, uncertain-result recovery, waitlist promotion and moves return to the matching class/date/person. A move rechecks the target and transfers the original hold atomically before releasing the original seat; failure retains the original. Past and future dates with the same weekday remain distinct. Allow multiple active reservations where policy permits; the mockup's one-reservation simplification is not a business rule.

Use one compact text summary for each finite allowance period: remaining, reserved, used and exact reset date. Show weekly and billing-month limits separately; both constrain the same reservation and must never be added. Do not use a bar, dots or decorative consumption meter. Unlimited plans omit the allowance panel and state Unlimited classes in membership details. For a single finite cap, show only that period. Counting policy remains owner configurable; booking and attendance never count one class twice. Put detailed policy in a disclosure.

Show waiver and unresolved-renewal reminders only when relevant to the selected beneficiary. Verified settlement clears only its resolved warning. Membership contains accepted plan, billing dates, freeze/cancellation status and forms. Omit a punch-card panel when no such entitlement exists.

### Family identity and consent

Use one compact person picker in the member header on Classes, Membership and Forms. Offer selection only when more than one verified authorized person is available. Desktop uses an anchored picker; phone uses an accessible sheet. Preserve the selected person across navigation, reset incompatible filters and show a skeleton while their records load. Avoid repeating a dedicated profile card or name banner on every page.

Changing the beneficiary never changes the signed-in account or payer scope. Keep household/account pages explicitly scoped. Name the participant in consequential booking, payment and signing confirmations. Unverified or revoked links must not appear or succeed through crafted requests. Prevent background switching while a booking/signing dialog is open; an unfinished waiver requires explicit discard before switching. Each person's reservations, consent, quotas and records remain separate.

### Membership policy and billing

Preserve the full billing-cycle allowance, notice, freeze and payment rules in Section 1. Owners configure reservation versus attendance presentation, penalties, weekly/monthly caps, finite freezes and notice policy. The recommended two-calendar-month notice policy is a configurable default, not a mandatory commercial term. Preview final planned renewal, access end, affected bookings, refund/credit consequences and recorded owner exceptions before approval. A settings change cannot rewrite an accepted contract.

Billing offers actionable records first with an explicit history view and an attention filter. Every row identifies the payer, beneficiary or service where permitted, obligation, state, amount, currency, deadline and available action. Keep the currency code and amount in one nonbreaking text run with a narrow space, tabular figures and two decimal places, including zero. CAD is the Canadian demo format; use the actual workspace or accepted transaction currency in live records.

Update card, retry payment, refund, credit, dispute review and service closure are separate operations. Never treat a card update, redirect, button click or local success toast as verified settlement. Unknown outcomes stay pending with a recovery path. Refund review reserves refundable money and affected entitlement; concurrent requests cannot exceed the remaining amount. Dispute reviewer assignment stays open until a verified outcome. Real provider callbacks, persisted operations, reconciliation and durable notices replace all simulated mockup actions.

### Adult coaching programs and notes

Deliver structured adult one-to-one programs with accepted plan versions, milestones, timezone, inclusive delivery dates, note calendar, response terms, coach assignment and upfront payment. Zero-appointment programs are fully usable. Appointments appear only when sold and must use the shared conflict and unit rules. Notes never consume sessions or money. Client journals, interactive check-ins and automated coaching remain deferred.

The coach's Notes area has distinct author-private working notes and daily client notes, with unmistakable audience labels. Saving a draft never publishes it. Publishing previews named client, enrollment, program date and content, then commits a version and queues a minimal secure-link notice. Clients see only published versions and history in My day, with due, scheduled, missed-delivery, amended and withdrawn states. Actual publication time remains distinct from the program date. Stale saves and duplicate requests cannot overwrite newer versions or double-publish.

Only the authorized current author may access private working notes or unpublished drafts. Ownership, reception, payer, former guardian and unrelated staff roles confer no content access. Private working notes are excluded from every product export, including owner, client, handoff, offboarding, incident and reviewed-request export jobs. A formal request requiring exceptional content review uses a separately authorized, time-limited and audited read process; it does not unlock a bulk export path. Published client records may be exported only within the named client's authorized scope. Notifications, logs, analytics and ordinary search omit restricted text.

Finite pause, awaiting replacement, accepted handoff, completion, extension and early closure retain the Section 1 consequences. Revoke the outgoing coach immediately. A new coach receives only client-approved published history and shared plan; private notes never transfer. Service closure, refund settlement and record retrieval have independent status. No action changes a gym membership or recreates old reminders. Mistaken publication uses the restricted incident and withdrawal workflow.

### Public website signup and legal pages

Owner Website contains Pricing and Search and sharing. Persist pricing drafts across navigation. Publish explicitly after validation; ordinary visitors receive the last published version. One visible plan may be highlighted or none; hiding it clears the highlight. Draft previews are labelled and cannot start enrollment. Each published offer must resolve to confirmed operational terms and an exact offer version before accepting payment; marketing copy never silently alters an accepted contract.

Visitors see Memberships and Try a class in a public header without application sidebars, avatars or member tabs. Place the trial entry prominently. Joining continues from the selected plan. Keep trial and paid signup separate and preserve the selected offer and entered participant through account verification, required agreements, hosted payment and inline confirmation. Adult and guardian paths maintain distinct identities and authority. A single trial option is a static summary. Marketing consent is optional and separate.

Provide Member portal, HitLink terms and Privacy links in the footer at phone and desktop sizes. Legal navigation preserves in-progress form details. Terms and Privacy describe the HitLink software service, with clearly marked business-name, contact and operational placeholders until supplied. Placeholder legal text remains visibly draft and cannot be represented as final legal readiness. The custom missing-page route returns a real HTTP 404 and offers useful recovery links.

Public routes have unique titles, descriptions, canonical metadata and share images. Private routes omit personal data from metadata and remain protected by authorization; robots directives are not access control. Draft and preview pages use noindex. Website metadata settings validate allowed public fields and never expose coaching or member records. Gym offers are distinct from HitLink software subscription pricing.

### Visual system and responsive behavior

Use the approved neutral light/dark surfaces and forest-green action accent. Light canvas/navigation/cards are #F3F3F4, #FBFBFB and #FFFFFF; dark equivalents are #2C2D32, #323339 and #36373E. Primary accent is #15392B with a sufficiently contrasting related edge/text treatment in dark mode. Use Barlow Semi Condensed 600/700 for major headings and prominent values and Source Sans 3 for navigation, controls, tables and notes. Do not use Inter. Load paired fonts together with a bounded fallback; font loading must not block the app indefinitely.

Use shared components for cards, buttons, fields, badges, banners, money and skeletons. Short status badges are consistently 24px high. Peer cards align outer dimensions and their decision/action areas; stacked phone cards keep natural content height. Use real useful status and actions rather than filler, repeated content or invented trends. Keep terminal actions at the bottom with at least 16px separation; actions inside records remain with those records.

Apply a 4px spacing scale: 8px for grouped labels/actions, 12px for related content, 16px for card content/forms, 20px card padding and 24px gutters/sections on desktop. Phones use 16px insets and 20px sections. Layout gaps own spacing instead of accumulating child margins. Banners put actions in a separate row 12px below the message. Room text sits under class titles; currency and figures stay together. Use plain task-specific language without slogans or internal implementation explanations.

Buttons have obvious hover fills, contrast and pressed states without moving or resizing. Text links use underlines and color feedback, without filled-button hover effects. Align card/list text links with surrounding text using zero horizontal padding and a compact 28px desktop target; phone/coarse targets remain at least 44px. Icon-only actions retain button feedback. Focus outlines and disabled states remain visible. Dropdowns use consistent 12px text insets, separate arrow space, wrap long selected values and preserve native keyboard behavior and fallbacks.

Every loading destination, person switch and record fetch uses a structure-matched skeleton, with a truthful loading status and stable layout. Do not hide errors behind perpetual skeletons or fake delays. Use immediate committed-state updates or pending indicators for mutations; show success only after the supported server result. A theme toggle follows system preference initially, persists a deliberate choice and changes no route, scroll, draft or loading state.

At 640px and below, use a compact 56px header, persistent common navigation and a scrollable full menu. Owner phone tabs are Today, Classes and Members plus More; member tabs are Classes, Membership and More. Coach Clients uses header/local navigation without a redundant single-tab bar. Reflow tables into labelled records without dropping fields. Use 44px targets and 16px editable text. Seven date choices fit one row from 390px and wrap on narrower phones. Dialog content scrolls while heading and actions remain available. Menus and dialogs isolate and restore focus. Feedback occupies its own space above bottom navigation and cannot cover records or controls.

Use short purposeful route, dialog and action-result motion consistent with the approved mockup. Animate destinations as one surface, not staggered cards or intermediate balances. Controls become usable as soon as loading finishes. Cancel stale callbacks on rapid navigation, overlay replacement and breakpoint changes; pause motion in hidden documents. Reduced motion uses immediate changes with the same text, focus and announcements.

### Acceptance evidence for the approved implementation

Verify connected workflows against persisted data in separate owner, member, guardian, coach and client sessions. Cover owner metric destinations, exact dated rosters, add/edit class scopes, all three coach-assignment modes, unified booking/move/cancel/waitlist/recovery, independent family quotas and signing rights, configurable membership requests, real payment recovery, website draft/publish/signup, notes-only coaching and accepted appointment programs.

Exercise negative paths: stale schedule edits, racing last seat/allowance/unit, duplicate provider events, pending refunds, revoked family links/coaches, wrong client or workspace, publication race, private-note export attempts and unsupported service activation. Demonstrate rollback or reconciliation without deleting accepted history. Existing workflow gates in Sections 3 to 6 remain the release standard; this checklist does not replace them.

Check desktop, tablet and 320px/390px phone layouts in both themes, keyboard-only use, focus restoration, reduced motion, loading/failure states, long labels and real amounts. Confirm no horizontal overflow, hidden controls, mismatched card/badge sizes or currency gaps. Build, typecheck, database migrations and meaningful automated tests must pass. Preserve source-controlled acceptance evidence and distinguish implemented behavior from remaining operational configuration or release gates.


### Scope of this edition

This edition defines the first release for Muay Thai, jiu jitsu and taekwondo gyms, including children and families, a separate member portal and memberships with weekly or monthly class limits. Adult one-to-one life coaching begins with structured programs and daily client notes.

Allowance periods follow the membership billing cycle. Owners configure how reservations and attendance count, membership notice and billing rules, and program rank requirements. The rules below resolve how these choices affect bookings, payments, privacy and recovery. This specification describes target behavior and acceptance evidence; it is not an implementation certificate.

## 0 How to use this specification

**Definition of shipping** Shipping means enabling a paying pilot business to operate its agreed services with founder-led onboarding and support. Every enabled workflow must have verified permissions, consistent state transitions, auditable history and a tested recovery path. A working demo or a completed table of requirements is not release evidence.

### Release gates

| Gate | Meaning | Decision rule |
| --- | --- | --- |
| P0 | Shared paid pilot baseline | Required for every live pilot: identity, isolation, applicable payment safety, consent, audit, recovery, support and export. |
| P0C | Conditional paid pilot requirement | Required before an optional service or dependency is enabled for live use; otherwise it must be hidden and disabled. |
| P1 | Public V1 | Required before the relevant service can be onboarded repeatedly without intensive founder supervision. |
| P2 | Later expansion | Not required to prove the first supported business model. |

### How release scope is applied

Record the workspace mode, enabled services, products and workflow IDs before sign-off. The first martial arts release includes family and guardian workflows, weekly and monthly allowances, and the separate member portal as P0. Rank prerequisites become P0C dependencies when enabled by the owner. Adult coaching programs use the shared foundation; discovery and appointment workflows apply only when offered. Coaching-only workspaces do not need class, rank or youth workflows.

A limitation cannot waive tenant isolation, required signing authority, prevention of duplicate charges or recovery of accepted transactions. Disabled modules reject ordinary service operations server-side as well as hiding their screens; explicitly authorized wind-down, settlement and retained-record paths remain available until obligations are resolved. Gate labels express release requirements, not completion status.

### Recommended reading order

Use Section 1 for product boundaries, actor permissions and shared workflow rules.

Use Section 2 as the canonical workflow inventory. Preserve IDs in tickets and acceptance evidence.

Use Section 3 to implement and test the connected workflows that make the pilot believable and safe.

Use Sections 4 to 6 for state models, operational requirements and release evidence.

## 1 Product definition scope and actors

One operating platform for martial arts services and adult life coaching with service-specific records and permissions

### Product promise

HitLink helps independent martial arts gyms and adult life-coaching businesses manage people, appointments or classes, payments, agreements and customer service. Hybrid businesses use a shared identity and billing foundation while keeping service entitlements and private coaching content separate.

### Target customer

Initial customers are independent Muay Thai, jiu jitsu and taekwondo gyms, including gyms teaching several disciplines. Each business has its own workspace; unrelated businesses do not share people or billing merely because an individual uses both.

Plan first for one location and approximately 75 to 300 active members, with the owner involved in operations. This is a sizing assumption for acceptance tests, not a product capacity limit. Children and family accounts are part of the first gym release.

Existing businesses may migrate from Zen Planner or another system. New businesses can complete verified setup without fabricating an import or legacy records.

Support martial-arts-only, life-coaching-only and hybrid workspaces. Adult one-to-one coaching may be in person or virtual; coaching-only setup does not require a mat room, belt system, class schedule or martial arts membership.

### Core actors

| Actor | Responsibilities and boundaries |
| --- | --- |
| Business owner | Configures services, staff capabilities, commercial policies and release approvals. Ownership alone does not grant routine access to private coaching content. |
| Martial arts coach | Runs assigned classes, records attendance and authorized skill or rank progress. This role does not automatically grant life-coaching access. |
| Front desk or administrator | A functional actor with explicitly granted lookup, booking and check-in permissions. A dedicated role is conditional on staffing needs; owner credentials must never be shared as a substitute. |
| Member or coaching client | Uses their own services and portal. One person can hold separate martial arts memberships and coaching engagements without duplicate identity or cross-service access. |
| Guardian | Acts only for verified linked children and granted booking, signing or billing rights. An emergency contact or payer is not automatically a guardian. Youth life coaching is outside the initial coaching release. |
| Prospect / trial participant | Registers, signs required forms, books a trial and can convert into a member. |
| Founder / migration operator | Performs white-glove migration, onboarding, reconciliation and pilot support. |
| Support / engineering | Diagnoses incidents and data problems using least privilege and an auditable process. |
| Payment and communication providers | External systems whose events must be verified, idempotent and reconciled. |
| Life coach | Delivers accepted structured adult programs, milestones, daily client notes and included appointments when offered. Private notes require author and current assignment checks; client check-ins are later scope. |
| Payer | Pays for a beneficiary through an explicit billing relationship. Payment authority does not grant access to the beneficiary's coaching content or unrelated household records. |

### Product principles

Reliability and convenience: Members manage their own bookings in a separate portal. Staff see the same committed booking state. Measure completion without staff help, clarity of allowance balances, corrections and recovery from uncertain outcomes during the pilot.

Server-side authority: Permissions, eligibility, capacity, billing transitions and consequences must not rely on client-only checks.

Auditable history: Financial, signature, attendance and migration corrections preserve prior events or create reversing entries. Audit records describe actor, action and reason without copying private coaching note bodies into general logs.

Human-verified migration: Agentic automation may accelerate migration, but owner approval and reconciliation remain mandatory.

Usable exports: Businesses and individuals can obtain the records within their authorized scope through a documented export and offboarding process.

Founder-supported first, repeatable second: The first pilot can use hands-on delivery; public V1 must convert that learning into repeatable product and operations.

### Commercial product models in scope

Recurring monthly memberships with unlimited access, a weekly class limit, a monthly class limit, or both. Allowances are anchored to the membership billing cycle; a weekly usage limit does not imply weekly payment collection. Weekly recurring billing remains later scope.

Drop-in purchases.

Non-expiring, non-shareable punch cards for the initial release.

Prepaid private martial arts lessons when enabled. Adult coaching begins with a fixed-price structured program paid upfront: an agreed delivery window, milestones, daily client notes and zero or more included one-to-one appointments. Optional discovery is free. Standalone coaching sessions, subscriptions and installment plans are later scope.

Account credits and full/partial refunds.

Failed-payment grace periods, followed by policy-driven access restriction.

Membership cancellation has a versioned notice policy, effective end date and visible billing schedule. Owners may grant documented exceptions. Appointment cancellation, program closure and membership termination remain separate actions; no action silently ends another service.

### Shared workflow rules

These rules govern the inventory and critical flows. Owner settings must be versioned, previewed and enforced by the server. The initial defaults in this edition are product recommendations; each business confirms its commercial settings before activation. Changes apply prospectively and do not rewrite accepted purchases or requests.

#### Shared identity and service scope

Use one person identity with workspace-scoped relationships, separate martial arts memberships and coaching engagements. A shared email, surname, payer or household is not proof that two people are the same. Public duplicate detection must not reveal an existing person's record. Link existing accounts only after verification. New-business setup has a verified activation path without an import.

#### Adult coaching boundary

Initial life coaching covers adult personal development through structured one-to-one programs and daily coach-authored notes for the client. Appointments are optional components; a program may have none. Intake explains delivery days, response expectations and scope. Youth/group coaching, client journals and interactive check-ins, subscriptions, recordings, clinical treatment and emergency monitoring are deferred.

#### Permissions and client privacy

Check permissions per workspace, service, accepted assignment and record class. Owner and reception roles see permitted scheduling/commercial metadata, not private content. Before detailed intake, the client accepts a named provisional reviewer; activation and any replacement require a client-visible assignment and history-sharing scope. An owner who also coaches must meet the same checks. Removing a coach revokes access immediately. Formal record requests use the exceptional-access process, not routine portal rules.

#### Policies and accepted terms

Snapshot price, currency, tax, service eligibility, allowance rules and applicable cancellation/refund policy at sale; each booking records its governing version and funding source. Later catalog edits do not replace accepted terms. A reschedule is evaluated against the current confirmed start time immediately before the change, with earlier versions retained. Lock currency after financial activity. Timezone changes require preview and effective date; preserve historical instants. Resolve ambiguous or nonexistent daylight-saving times before publishing recurrences.

#### Scheduling and availability

Dated classes and appointments need stable identities. Conflict checks include coach availability, room use, leave and appointment buffers across every enabled service. Virtual appointments require a delivery link but no fictional physical room. A life coach cannot overlap a one-to-one appointment with any other assigned service or buffer; this has no override. Separately permitted room-sharing exceptions record the actor and reason. Reducing capacity below current bookings blocks new seats and requires a resolution plan; it never silently removes bookings.

#### Schedule changes and cancellation

A changed class or appointment retains its history. A provider-initiated change gives affected customers a penalty-free cancellation or rebooking path. A provider cancellation restores the applicable session units and suppresses client late-cancel and no-show consequences. Ending a series must explicitly preserve or cancel each existing future reservation. Never delete booked occurrences as a shortcut.

#### Waitlist baseline

Use disclosed opt-in automatic promotion in server FIFO order. Recheck eligibility, conflicts, service-date allowance and available units while claiming the seat atomically. A queue entry holds no allowance or unit. An eligible queued person has priority over a new direct booking for a released seat. Stop promotion before the earlier of the booking cutoff and the cancellation cutoff; never auto-promote directly into a penalty window. If no queued person qualifies, record the skip reason and reopen the seat. Accept-an-offer mode remains P1 with holds, expiry and recovery required together.

#### Session units and monetary credit

Reserve one eligible unit for a unit-funded booking; settle that reservation once on delivery or an accepted penalty. Timely/provider cancellation and excused absence release it. A correction reverses the original event, never creates a second refund of units. Period allowances use a separate ledger described below; unlimited memberships make neither entry. Free discovery reserves time only. Prefer eligible membership allowance over paid punches; fallback to a paid pack requires an explicit customer choice or an accepted standing preference. Store the selected source. Packs use oldest eligible units first. Service units, period allowance and monetary credit never share a balance.

#### Membership requests and access

Contract, debt, freeze, cancellation request and archive state are independent. Requests retain receipt time, accepted policy and approval history. Compute the end date from receipt, notice duration and alignment; owner review delay cannot add a renewal. Confirm a finite freeze and its billing/access preview before scheduling. Cancellation takes precedence when effective. Changes resolve affected future bookings in the same supported workflow. Provider failures remain unresolved until reconciliation and any compensation are complete; an owner task alone is not success.

#### Payment recovery and refunds

A card update is not payment. Each invoice has one retry controller and a stable first-failure grace deadline. Verified settlement resolves only its obligation and recomputes access. Unknown provider outcomes remain pending; look up or reconcile before retrying with the same operation identity. Pending refunds reserve refundable money and affected entitlement; concurrent requests cannot over-refund. Record paid component allocations where needed for automatic refunds. Success retires refunded entitlement; failure unlocks it but does not silently recreate cancelled bookings. Program-fee refunds follow the accepted policy, independently of appointment-unit settlement. Goodwill grants require their own authorization.

#### Guardian and payer authority

Families are required for the first gym release. Verify booking, signing and billing grants separately for each child; payment or a shared email grants none by itself. Quotas and bookings belong to the named child, never the household. Show the selected child throughout booking and confirmation. Revocation removes access on the next protected request while preserving signature provenance. Disputed relationships go to a restricted review and confer no new rights while unresolved. At the configured age transition, review grants and establish independent account control; adult coaching requires a private verified contact/login, adult acceptance and no inherited guardian access.

#### Attendance and consent

Check current forms at attendance as well as booking. Version publication has an effective date, affected-person preview and advance notice; provider-introduced requirements that strand a paid booking offer penalty-free rebooking or refund review. No ordinary staff warning bypasses a required signature. Present/late settle one use; excused absence releases it; no-show applies only to unresolved confirmed participants after cutoff. Waitlisted people never become no-shows. Slow connections display pending until the server commits and recover through idempotent retry.

#### Communication and audit

A committed business action creates a durable notification job through an outbox or equivalent. Email retries do not repeat bookings, charges or credits. Use stable message IDs, retryable and terminal failure states, and recovery of abandoned jobs; suppress superseded reminders. Delivery may be retried, so do not promise exactly-once external delivery. Coaching notifications contain minimum operational details and a secure portal link, without private goal, intake or note text.

#### Migration and billing ownership

Staging cannot send live messages or initiate charges. Reconcile people, relationships, consent, money, units, billing boundaries, future bookings and current allowance periods with used/reserved balances. Every source record is imported, excluded with accepted reason or quarantined. Use zero unexplained differences for money, entitlement, charge ownership and future bookings; missing required authority or consent blocks the affected activation. Named nonessential history exclusions may be accepted. Assign exactly one billing system per customer/renewal cycle; verify source stop or transfer before destination renewal. Unsupported payment-method transfer requires reauthorization.

#### Cutover recovery and offboarding

Record an owner-approved go-live snapshot and operator activation separately. Before external effects, a restore may be sufficient. After live charges, signatures, notifications or customer edits, freeze further side effects, capture the delta and reconcile or compensate; restoring a database does not undo them. Offboarding must separately resolve the business's HitLink subscription and its customer subscriptions. Export receipt, renewal handover, access removal, retained records and deletion schedules need explicit owners and dates.

#### Archive and export scope

Archiving previews contracts, future bookings and remaining entitlement; it cannot hide debt or cancel subscriptions implicitly. Reactivation recalculates access. Individual, payer, business and reviewed-request exports have separate permissions. Provide a manifest and data dictionary with record IDs, relationships, units, dates and file checksums; verify representative household, booking, payment and exact signed-document chains are readable. General exports exclude restricted coaching content. Private working notes are excluded from every product export, including reviewed requests; exceptional read access remains a separate authorized process. Retention schedules cover database, files, temporary sources and backups with named custodians and reviewed exceptions.

### Coaching record permissions

| Record | Owner or reception | Assigned life coach | Client | Other staff or support |
| --- | --- | --- | --- | --- |
| Appointment and billing metadata | Authorized operational scope | Assigned service scope | Own record; payer scope distinct | Minimum granted support scope |
| Inquiry purpose intake and goals | Contact/status only by default | Accepted provisional reviewer or assigned coach | Own submitted and agreed/shared records | No ordinary access |
| Private coach note | No ordinary access | Author only while assignment permits | Excluded from every product export | No ordinary access |
| Published session summary | No access merely by role | Assigned coach and approved handoff | Own published summary | No ordinary access |
| Audit record | Authorized event metadata | Relevant event metadata | Relevant client history | Named and audited support scope |
| Daily client note | Delivery status only | Assigned author; accepted handoff scope for published history | Own published/amended note; never drafts | No ordinary access |

Private working notes, daily client notes and optional shared session summaries are distinct records. Each publication previews the named client and content. Private material never enters general search, roster notes, operational exports or notification bodies. Assign a records reviewer and an escalation contact before collecting private content; exceptional access requires a documented purpose, specific records, authorizer, expiry and audit. Sole-owner unavailability must have an agreed support escalation; ownership alone does not authorize content inspection.

### Membership allowances and owner settings

Each plan defines eligible programs, weekly and/or monthly cap, billing anchor and timezone, counting basis, late-cancel/no-show treatment and any owner-approved adjustments. One allowance pool covers the product's eligible programs for one membership beneficiary; distinct memberships are not pooled. Initial defaults are no carryover, no shared family allowance and one use per attended class. Owners choose reservation-based or attendance-based counting; a confirmed booking holds one place in the allowance in either mode, so future bookings cannot exceed the cap.

A monthly allowance covers the membership billing cycle, from the inclusive start to the exclusive next start. A weekly cap uses seven local calendar days from that cycle start, not fixed 168-hour intervals across daylight-saving changes; the final window ends at renewal. Initial default: the last short window receives the full weekly cap, disclosed in the plan preview; an optional monthly total cap bounds the whole cycle. Both caps apply together. New contracts begin with a full cycle; imported mid-cycle contracts retain existing use. Future cycles may be projected for booking, subject to renewal grace/restriction. Freeze, retries and delayed webhooks create no extra resets.

Example: a monthly cycle from October 9 to November 9 has weekly windows starting October 9, 16, 23, 30 and November 6. A two-class weekly plan permits two in each window, including November 6 to 9; an additional eight-class monthly cap limits the full cycle to eight. The portal shows exact reset dates before booking. An owner who needs another boundary rule must use a supported, versioned policy with a preview, never an ad hoc ledger reset.

Allocate against the class start date in the gym timezone, not the date of booking or payment. Available equals the applicable cap plus authorized adjustments minus held and consumed uses. Booking reserves one use in each applicable limit; attendance settles those same holds. Reservation-based counting displays held plus consumed as counted; attendance-based counting displays attendance used and held separately. Neither counts booking and attendance twice. A timely cancellation or excused absence releases the hold; late-cancel/no-show counting is a separate owner setting, defaulting to one use. A provider cancellation always restores use.

A timely reschedule atomically transfers the old allocation to the replacement seat and service-date windows. Reuse any unchanged monthly/weekly hold and test only the net extra allocation in changed windows; never require a second full monthly allowance for a move. Failure preserves the original. A late move first previews the accepted old-booking consequence and any new allocation: if the old use is consumed, a separate available use is needed unless an authorized waiver applies. Commit both or neither. Correct history in its original period; old reversals never refill the current one. Cap reductions preview affected bookings and apply prospectively or resolve exceptions explicitly; no silent paid-punch fallback.

### Membership cancellation settings

The owner configures notice length in days, calendar months or billing cycles; effective-date alignment; approval; notice billing; and old-debt collection. Preserve the receipt timestamp, but day/month notice uses its gym-local calendar date. Add the configured calendar interval; clamp an unavailable day to month end. A renewal on the resulting date qualifies regardless of receipt time that day. Billing-cycle notice counts the configured number of renewal boundaries strictly after receipt. Exact-date termination ends at local midnight starting the calculated date; cycle alignment uses the provider's verified boundary. Show the exclusive end instant and last usable date before acceptance.

Recommended starting policy based on the founder's gym: two calendar months of notice, termination at the first renewal boundary on or after the notice end, and normal accepted renewals during the notice period. Example: an October 9 request on a 9th-of-month cycle ends December 9; the November 9 renewal is the last and no December 9 renewal is created. A request on October 10 ends January 9 under this alignment. Show these consequences before submission; the owner may configure exact-date termination only when the billing preview supports it.

Owner discretion means a recorded exception with an amount/date preview and reason: shorten notice, waive remaining renewal invoices or agree a specific supported settlement. Waiving billing must state whether access continues through the agreed end. Refund already collected money through PB-10. A policy edit or delayed review cannot retroactively increase an accepted obligation. An increase or extension requires a newly accepted agreement. Default: automatic collection of old debt stops at termination and a review task remains; a disclosed policy may continue existing-invoice retries without issuing new renewals or restoring membership.

Withdrawal before the effective end is a new request: preview renewed billing, obtain required acceptance and verify provider restoration before clearing the scheduled stop. Previously cancelled reservations are offered for fresh booking, never recreated automatically. A failed withdrawal leaves the accepted end date in place. After the end, use deliberate re-enrollment. Any billing-anchor change must reconcile future allowance windows and reservations once while preserving historical periods; unsupported changes are blocked.

Booking dispositions below apply only to reservations funded by or dependent on the changed membership. Independently valid products, other services and other household beneficiaries remain unaffected. Transfer to another funding source requires explicit accepted authorization and an atomic allocation change.

| Access change | Future booking outcome |
| --- | --- |
| Scheduled membership end | On approval, resolve reservations at or after the end date: cancel and release without penalty, or explicitly re-fund with another accepted eligible product. Earlier valid bookings remain. |
| Approved finite freeze | Cancel and release reservations inside the frozen interval without penalty; show the affected list before approval. Keep eligible bookings outside it. Resume does not recreate cancelled seats or mint a new allowance. |
| Debt grace then restriction | Keep existing bookings during grace with warnings. Default restriction at the fixed deadline blocks new bookings/check-in and cancels future reservations without no-show penalty. Owner settings may retain flagged reservations for a disclosed bounded review window, then release them. Paying later offers rebooking subject to current capacity. |
| Provider fails to stop renewal | Preserve the accepted end date and block new HitLink renewal attempts. Reconcile conflicting provider invoices: void unpaid erroneous renewals or refund settled erroneous renewals to their original source. Keep the case open until verified; old legitimate debt is handled separately. |

### Rank settings and family booking

Per program, the owner selects ranks off, history only, or booking prerequisites. The owner defines ranks/stripes and class minimum rank, age or cohort rules where needed; there is no universal belt system. Recheck prerequisites at booking, waitlist promotion and attendance. Show a member or guardian the reason a class is unavailable and the current eligible rank when that rule is enabled. Staff exceptions need a granted capability and reason; required signing authority cannot be overridden. Promotions are manual decisions with history. Grading events, curriculum authoring and automatic promotions are later scope.

### Structured coaching programs and daily notes

A versioned program template defines duration, phases/milestones, goals, note delivery days, response window, coach, optional appointments, price and refund/exit terms. Enrollment copies the agreed version with inclusive local start/end dates in its named timezone: the final date includes that day's promised note, and end review starts at local midnight afterward. The client accepts the plan and material revisions. Daily notes are coach-authored updates for that client, not client journals. Client note access is read-only; interactive check-ins are deferred.

One daily-note record belongs to one enrollment and local date, with draft, published, amended or withdrawn status. The coach previews the client and publishes explicitly; edits create revisions with concurrency checks. Empty templates are not delivered notes. A past-dated note displays program date and actual publication time. Only the currently assigned author can read an unpublished draft; private working notes never automatically copy into it. Publication, reading or a missed note consumes no appointment and creates no charge. Daily means all or selected delivery days as agreed in the calendar.

A program can include zero appointments. Verified upfront payment funds the enrollment once; a future-start enrollment remains scheduled until its accepted start. Delivery starts only when date, agreement and assignment checks pass. Included appointment units are non-shareable and usable for eligible service dates; they are independent of daily notes. Show realistic appointment availability before sale; displayed slots are not held. Unavailable delivery has a named owner and published response window for a booking/extension or refund review. Automatic refund calculation needs sold component allocations; otherwise an owner reviews a documented amount within the net paid balance. Delivered notes are service evidence, not per-note billable units.

At the planned end, stop future daily-note obligations and prompts and open an end review. Preserve delivered notes and unused appointment obligations; do not silently forfeit them. Agree completion, a dated extension or settlement under the accepted terms. A pause has finite dates and explicitly states whether the program end moves; default is to extend by the paused delivery days, with appointment and reminder changes previewed. Closure can stop service immediately while a separate settlement or export job remains pending. Reopening requires a new explicit plan and never revives old reminders automatically.

### Commercial and privacy recovery

An adult client accepts the service and any third-party payer relationship; the payer separately authorizes payment. The payer sees their own invoices, payments and refunds, not attendance, goals or notes, and cannot direct the client's appointments or export. Return refunds to the original payment source through the approved payment workflow. The business is the seller and uses its verified payment account; HitLink platform fees are separate. Marketplace payouts, payroll and commission splitting are outside this release.

The owner names an operational case owner and a published response window for unavailable service, disputed delivery and pending money. Disputed appointment units remain held pending review; a provisional goodwill unit, if granted, is a distinct reversible entry. Review attendance/connection metadata and volunteered statements without blanket private-note access. Coach departure immediately revokes access, marks the program awaiting replacement, suppresses unsupported delivery prompts and resolves imminent appointments. A replacement gains only the history the client accepts sharing; author-private notes remain excluded.

Mistaken publication opens a restricted incident: withdraw content, revoke future reads/download links, suppress queued messages, preserve access metadata and assign the records reviewer to containment, recipient communication and retention decisions. Already viewed copies cannot be recalled. Service closure keeps authorized read-only record and billing access during the disclosed retrieval window; failed exports have a named restricted-access resolver. Workspace offboarding checks outstanding export obligations before access removal.

### Initial operating configuration

Before a pilot activates, record the legal business/payment account, supported region/currency/language, actual staff and member devices, trial offer and repeat-trial limit, commercial settings above, operational and records-review contacts, response/retrieval windows, retention schedule, and measured performance/recovery targets. Recommended trial default is one free trial per person per program with reasoned staff exceptions; paid or multi-visit trials require their declared payment/allowance dependencies. Unsupported configuration choices stay disabled. These are deployment settings and acceptance evidence, not unresolved product flows.

## 2 Canonical workflow inventory

Every row is a user or operational outcome that should be represented in the recovery matrix and Kanban backlog.

**Ticketing rule** One workflow can produce multiple implementation tickets, but no ticket should claim completion until the workflow’s ship definition of done is demonstrated. Reuse the workflow IDs in ticket titles and acceptance criteria.

### Workspace setup and configuration

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| WS-01 | Create business workspace | Owner, system | P0 | Owner creates an isolated workspace for martial arts, adult life coaching or both; first-owner authority and verified setup do not depend on a legacy import. |
| WS-02 | Configure identity and contact details | Owner | P0 | Business identity and contact details appear on the correct service surfaces; a virtual coaching business is not required to publish a gym address. |
| WS-03 | Set timezone, currency and locale | Owner, system | P0 | Workspace timezone, currency and locale are explicit. Preserve historical instants, preview timezone changes, and prevent silent currency changes after financial activity. |
| WS-04 | Create programs and service categories | Owner | P0 | Owner creates Muay Thai, jiu jitsu, taekwondo or other named programs and optionally structured adult coaching. Discipline, age/cohort, progression and coaching templates are distinct. |
| WS-05 | Create rooms and training areas | Owner | P0C | Physical services use configured rooms and capacities. Virtual coaching needs no room. Cross-service room conflicts and any permitted overrides are explicit. |
| WS-06 | Configure booking window and capacity rules | Owner | P0 | Booking horizons, cutoffs, capacity, coach buffers and eligibility are enforced server-side for staff and self-service; overrides need separate authority and reason. |
| WS-07 | Configure cancellation, late-cancel and no-show rules | Owner | P0 | Owner versions appointment/class penalty rules and separate membership notice length, date alignment, notice billing, approval and old-debt collection rules. Preview affected renewals/bookings and record accepted exceptions. |
| WS-08 | Configure payment grace period | Owner | P0 | Owner sets the failed-payment grace period that determines warnings and access restriction. |
| WS-09 | Configure self-service permissions | Owner | P0 | Members have a separate portal for their own bookings. Owner settings govern cancellation/freeze request and profile options, without weakening server permissions or hiding an already accepted request. |
| WS-10 | Configure multiple locations | Owner | P2 | A company can operate multiple locations with shared or location-specific staff, rooms, schedules and reporting. |

### Identity authentication and permissions

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| ID-01 | Create owner account and sign in | Owner | P0 | Owner can securely authenticate, recover access and reach only authorized workspaces. |
| ID-02 | Invite staff | Owner, staff | P0 | Owner sends a time-limited invite; accepting it creates the intended role in the correct workspace. |
| ID-03 | Assign or change staff roles | Owner | P0 | Role and service-assignment changes revoke obsolete access immediately, are audited and cannot remove the last owner. A coach handoff does not delay revocation. |
| ID-04 | Coach access to operational views | Coach | P0 | Martial arts coaches access assigned operations only; life coaches access assigned adult clients. Neither inherits the other service's sensitive records. |
| ID-05 | Front-desk access | Front desk | P0C | Where reception staff are used, minimum lookup, booking and check-in capabilities are explicitly assigned before live use; owner credentials are not shared. Advanced custom roles remain P1. |
| ID-06 | Member authentication | Member | P0 | Member signs in through a secure supported method and sees only their own account and eligible actions. |
| ID-07 | Guardian authentication | Guardian | P0 | Verified guardian links grant separate booking, signing and billing permissions for named children. Revocation and age-transition review remove obsolete access. |
| ID-08 | Revoke session or access | Owner, user | P0 | Password reset and sign-out-all revoke existing sessions; staff/service removal takes effect on the next protected request. Tests reject stale tokens and stale role assignments. |
| ID-09 | Enforce tenant and role boundaries | System | P0 | Server-side checks and tests prevent cross-workspace and unauthorized role access even with crafted requests. |
| ID-10 | Audit security-sensitive identity changes | Owner, support | P0 | Invites, role changes, login resets and access revocations appear in an immutable audit trail. |

### Scheduling and class operations

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| SC-01 | Create class template | Owner | P0 | Owner defines name, program, duration, capacity, room and an optional default coach; dated assignments remain independent of schedule exceptions. |
| SC-02 | Create recurring schedule | Owner | P0 | A recurrence produces predictable class occurrences across the selected date range and timezone. |
| SC-03 | Generate or resolve class occurrence | System | P0 | Each dated class has a stable identity that can hold bookings, attendance, substitutions and exceptions. |
| SC-04 | Edit one class occurrence | Owner | P0 | Owner changes one stable dated occurrence, preserving booking/history links, rechecking conflicts and offering affected customers a clear rebooking or penalty-free cancellation path. |
| SC-05 | Assign substitute coach | Owner | P0 | Each occurrence inherits the optional default coach, explicitly assigns a substitute, or explicitly remains unassigned. Changes preserve other schedule inheritance, reservations and attendance history and notify affected customers when the published coach changes. |
| SC-06 | Cancel one class occurrence | Owner | P0 | Provider cancellation resolves all bookings and waitlist entries, restores affected units, suppresses client penalties and queues notices without changing other dates. |
| SC-07 | Edit or end recurring series | Owner | P0 | Series edits preserve history and explicitly retain or cancel existing future occurrences and reservations; capacity reductions cannot silently remove people. |
| SC-08 | Detect room or coach conflict | Owner, system | P0 | Conflicts include classes, private lessons, coaching appointments, leave and buffers. A life coach cannot overlap a one-to-one appointment with any assigned service; no override applies. Permitted room-sharing exceptions are separate and audited. |
| SC-09 | Publish schedule to members | Owner | P0 | Only published, eligible classes appear in public or member schedules with correct availability. |
| SC-10 | Create special event or seminar | Owner | P1 | One-off events support capacity, pricing or eligibility distinct from recurring classes. |
| SC-11 | Schedule private lesson | Owner, coach | P0C | When private lessons are enabled, a stable appointment reserves eligible coach/resource time and prepaid credit using the shared appointment, cancellation and reconciliation rules. |
| SC-12 | Handle daylight-saving/timezone changes | System | P0 | Recurring local times remain stable; ambiguous or nonexistent DST times require explicit resolution. Virtual clients see local and business timezone labels. |

### Leads trials and conversion

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| LT-01 | Browse trial-eligible classes | Prospect | P0 | Prospect sees accurate, bookable trial options without access to staff-only information. |
| LT-02 | Register prospect | Prospect | P0 | Contact details and consent are validated and stored without creating unnecessary duplicate records. |
| LT-03 | Register minor through guardian | Guardian | P0 | Guardian identity, child identity, relationship and emergency information are captured correctly. |
| LT-04 | Detect existing person or duplicate lead | System, staff | P0 | Matching protects distinct people who share email or household details. Public lookup reveals no account information; verified linking or a supported staff resolution prevents unsafe duplicates. |
| LT-05 | Complete required waiver before trial | Prospect, guardian | P0 | Booking may show pending forms, but required current versions must be signed by an authorized adult before attendance. Historical evidence is preserved after version changes. |
| LT-06 | Book trial class | Prospect, guardian | P0 | Eligibility and capacity are checked; booking is confirmed and visible on the roster. |
| LT-07 | Book trial administratively | Owner, staff | P0 | Staff can book a prospect while preserving consent and waiver requirements. |
| LT-08 | Reschedule or cancel trial | Prospect, staff | P0 | The original booking is updated or cancelled without losing the lead history. |
| LT-09 | Mark trial attendance or no-show | Coach, staff | P0 | Trial outcome appears in the lead timeline and drives the correct follow-up state. |
| LT-10 | Manage trial follow-up queue | Owner, staff | P0 | Attended, missed and unconverted trials are surfaced with due dates and outcomes. |
| LT-11 | Convert trial to member | Owner, staff | P0 | Convert the verified existing identity while preserving history. Direct enrollment and repeated trials remain valid; conversion does not automatically grant unpaid access. |
| LT-12 | Track acquisition source | Prospect, staff | P1 | Lead source is captured and reportable through conversion. |

### Members guardians and households

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| MF-01 | Create or edit member profile | Owner, staff | P0 | Required identity, contact, emergency and status fields validate and persist with an audit history. |
| MF-02 | Link guardian and child | Owner, staff | P0 | Verified grants identify child, adult, booking/signing/billing scope and history. Disputed relationships give no new rights; revocation and age transition remove obsolete access without altering evidence. |
| MF-03 | Manage one guardian with multiple children | Guardian, staff | P0 | Guardian selects one child throughout booking, forms and confirmation. Each child has separate membership periods, held/used allowance and history; shared payer identity never pools entitlement. |
| MF-04 | Manage emergency contacts | Guardian, member, staff | P0 | Current emergency information is visible to authorized operational staff. |
| MF-05 | Search and filter members | Owner, staff | P0 | Users can find members by name, contact, status, program, tag and relevant operational condition. |
| MF-06 | Add internal notes and tags | Owner, staff, coach | P0 | Operational notes and tags have author, time and explicit visibility. Private coaching notes, intake and goals use restricted records and cannot appear on general class rosters. |
| MF-07 | Archive and reactivate member | Owner, staff | P0 | Archive previews active subscriptions, debt, future bookings and units; each has an explicit disposition. Reactivation recomputes eligibility and preserves history. |
| MF-08 | Calculate current member status | System | P0 | Display service eligibility derived from independent contract, debt, freeze, cancellation and archive facts. One payment cannot unfreeze, reactivate or clear unrelated obligations. |
| MF-09 | Merge duplicate people | Owner, support | P1 | A controlled merge preserves history, financial links, guardianship and auditability. |
| MF-10 | Export a member record | Owner, member | P0 | An authorized individual export contains permitted profile, service, attendance and signed-form records; it excludes unrelated household data and follows the coaching record-access rules. |

### Booking capacity and waitlists

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| BK-01 | Member books class | Member | P0 | A separate member portal confirms an eligible dated seat only after atomic capacity, duplicate, conflict and service-date allowance/unit checks; uncertain requests recover without duplicate booking. |
| BK-02 | Guardian books child | Guardian | P0 | Guardian selects an eligible child and the booking is attributed to that child. |
| BK-03 | Staff books member | Owner, staff | P0 | Staff can book with clear warnings and audited overrides where allowed. |
| BK-04 | Validate membership eligibility | System | P0 | Evaluate beneficiary, program/rank/age prerequisites when enabled, contract/debt/freeze status and service-date allowance or selected units. All staff and portal paths use the same rules. |
| BK-05 | Enforce capacity | System | P0 | Concurrent requests cannot overbook beyond configured capacity. |
| BK-06 | Join waitlist | Member, guardian, staff | P0 | Eligible user joins a deterministic queue and sees their state. |
| BK-07 | Promote from waitlist | System, member | P0 | A released seat prioritizes the earliest eligible opted-in entry in FIFO order. Claim seat and applicable allowance/unit atomically. Stop before booking or cancellation cutoff; no queue-only hold or automatic penalty-window promotion. |
| BK-08 | Handle unaccepted waitlist offer | System | P1 | Accept-an-offer mode requires expiring seat holds, expiry/reallocation and recovery together. These become P0C if that mode is enabled for a pilot. |
| BK-09 | Cancel booking | Member, guardian, staff | P0 | Cancellation timing is evaluated and capacity or waitlist state updates atomically. |
| BK-10 | Apply late-cancel consequence | System | P0 | Apply the accepted late-cancel rule to the original funding source. Owner-configured period-use consequence or unit consumption happens once; attendance cannot count it again. No added automatic cash penalty. |
| BK-11 | Apply no-show consequence | System, staff | P0 | After cutoff, only an unresolved confirmed participant can become no-show. Apply the accepted allowance/unit consequence once; waitlist, provider cancellation and restriction-cancelled bookings incur none. |
| BK-12 | Correct booking or consequence | Owner, staff | P0 | Correction records actor/reason and reverses the original period or unit entry once. Past-period reversals do not refill the current allowance; funded source and attendance history remain traceable. |
| BK-13 | Reschedule across allowance periods | Member, guardian, staff | P0 | Transfer atomically using net allocation and reusing holds for unchanged windows. A late move previews old-use settlement plus any new use; commit both or neither. Failure preserves the original. Retain prior time/policy/source; paid-punch fallback needs consent. |

### Attendance and check in

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| AT-01 | View today’s operational schedule | Coach, staff | P0 | Authorized staff see current classes, substitutions, room and roster status in local time. |
| AT-02 | Open class roster | Coach, staff | P0 | Roster includes confirmed, waitlisted and relevant trial participants with warnings. |
| AT-03 | Check in booked member | Coach, staff | P0 | Check-in records timestamp and actor and prevents accidental duplicate attendance. |
| AT-04 | Add walk-in attendance | Coach, staff | P0 | Walk-ins still satisfy capacity, service eligibility and required forms. Any permitted capacity override is explicit; required signatures cannot be bypassed by ordinary staff. |
| AT-05 | Mark present, late, absent or no-show | Coach, staff | P0 | Present/late settle the booking allocation once; excused absence releases it; no-show follows the accepted setting after cutoff. Reservation and attendance are never two uses of one class. |
| AT-06 | Bulk close roster | Coach, staff | P0 | Roster closure changes only eligible unresolved records after the cutoff and never overwrites explicit attendance or penalizes future arrivals. |
| AT-07 | Correct attendance | Owner, staff | P0 | Correction records actor, prior state and reason. Reverse against the original allowance period or unit reservation once; changing no-show to present yields no windfall. Money uses a separate refund/credit workflow. |
| AT-08 | View member attendance history | Owner, coach, member | P0 | Authorized users see accurate attendance with role-appropriate details. |
| AT-09 | Kiosk check-in | Member, front desk | P1 | A limited kiosk flow checks in eligible people without exposing private member data. |

### Products memberships and access

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| MP-01 | Create recurring membership product | Owner | P0 | Define monthly price, programs, billing anchor/timezone, unlimited/weekly/monthly caps, reservation or attendance counting, penalties and versioned terms. Display any short weekly window and combined monthly limit. |
| MP-02 | Create drop-in product | Owner | P0 | One-time class access can be sold and consumed according to configuration. |
| MP-03 | Create punch-card product | Owner | P0 | Non-expiring, non-shareable units identify eligible services and accepted policy. Reserve at confirmed booking, consume once, and use reversing ledger entries for corrections. |
| MP-04 | Create prepaid private lesson package | Owner | P0C | When private martial arts lessons are enabled, define eligible service, non-shareable units, total price and refund allocation. Adult coaching uses structured programs with optional included appointments. |
| MP-05 | Assign membership to member | Owner, staff | P0 | Assign the correct beneficiary, payer, accepted product/policy version, billing anchor and start date. Initialize projected periods and entitlement exactly once after permitted activation. |
| MP-06 | Purchase membership through self-service | Member, guardian | P0 | Eligible customer accepts terms, provides payment method and receives the correct membership state. |
| MP-07 | Schedule future membership start | Owner, staff | P0 | Access and billing begin on the intended date without premature charges. |
| MP-08 | Request and schedule membership cancellation | Owner, member | P0 | Capture receipt time, compute notice end/alignment, preview renewals/access/bookings, and confirm provider stop. Owner exceptions have reason and amount/date; review delay cannot add renewals. Compensate an erroneous renewal. |
| MP-09 | Freeze membership | Owner, member | P0 | Approve a finite freeze with billing/access preview and explicit allowance-anchor treatment. Cancel/release bookings in the interval without penalty. Unsupported dates or open-ended freezes remain disabled. |
| MP-10 | Resume membership | Owner, member, system | P0 | Resume rechecks contract, debt and cancellation state; it cannot recreate ended billing or override a cancellation effective date. Provider failures remain actionable. |
| MP-11 | Upgrade or downgrade membership | Owner, member | P1 | Effective date, proration policy and future billing are explicit and auditable. |
| MP-12 | Apply failed-payment grace state | System | P0 | Each failed invoice has a stable first-failure grace deadline and one retry controller. Replayed failures do not extend grace or duplicate notices. |
| MP-13 | Restrict access after grace expires | System | P0 | At the fixed grace deadline, apply the disclosed setting to access and future reservations. Default cancels/releases affected future bookings; optional retained reservations have a bounded review deadline. Never create no-show penalties for restriction. |
| MP-14 | Restore access after payment | System, staff | P0 | Verified settlement resolves its obligation and recomputes access. Cancelled seats are not recreated; offer eligible rebooking. Freeze, cancellation, archive and other debts remain independent. |
| MP-15 | Admin override membership status | Owner | P0 | Override requires reason, is auditable and does not silently corrupt billing state. |
| MP-16 | View complete membership timeline | Owner, member | P0 | Assignments, freezes, cancellations, failures, recoveries and overrides appear chronologically. |
| MP-17 | Manage billing cycle class allowances | Owner, system | P0 | Persist per-beneficiary periods and immutable holds, settlements, releases and reasoned adjustments. Enforce weekly and monthly caps together; use class date, no carryover by default and no double reset from payment retries. |

### Billing payments and reconciliation

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| PB-01 | Create payment customer | System | P0 | One workspace-scoped processor customer represents the verified payer; contracts and entitlements identify their beneficiaries separately, including children. |
| PB-02 | Collect payment method securely | Member, guardian | P0 | Processor-hosted collection succeeds without HitLink storing raw card data. |
| PB-03 | Create recurring billing agreement | Owner, system | P0 | Subscription terms match the assigned membership and intended billing boundary. |
| PB-04 | Process one-time charge | Owner, member | P0 | Verified hosted payment funds the purchased drop-in, pack or program once. Future-start entitlements remain scheduled until eligible start; issue only sold appointment units. Pending authentication, abandonment and unknown outcomes remain recoverable. |
| PB-05 | Receive and verify webhooks | Processor, system | P0 | Signatures are verified and unsupported or duplicate events are handled safely. |
| PB-06 | Process billing events idempotently | System | P0 | Replayed events cannot duplicate charges, credits, membership transitions or messages. |
| PB-07 | Synchronize invoice/payment status | System | P0 | Invoice, attempt, refund and subscription states reconcile separately. Out-of-order events cannot regress settled state; discrepancies have a named resolution queue. |
| PB-08 | Handle failed payment | System, member, staff | P0 | Failure creates a recoverable state, notification, retry path and membership grace outcome. |
| PB-09 | Retry or update payment method | Member, staff | P0 | Recovery can be initiated safely and successful payment resolves the correct balance. |
| PB-10 | Issue full or partial refund | Owner | P0 | Reserve net refundable money including pending amounts. Lock affected entitlement and resolve future bookings explicitly. Success retires refunded entitlement; failure unlocks it without recreating seats. Program refunds follow accepted terms and recorded allocations or reasoned owner review; no concurrent over-refund. |
| PB-11 | Apply account credit | Owner | P0 | Monetary credit has currency, source, remaining balance and allowed uses; it is separate from session-unit credit. Initial credits do not silently expire. |
| PB-12 | Prevent duplicate charge | System | P0 | Idempotency keys, state guards and reconciliation protect against double billing. |
| PB-13 | Send receipt or payment confirmation | System | P0 | Customer receives accurate transaction details and staff can resend when appropriate. |
| PB-14 | Reconcile processor and product state | Owner, support, system | P0 | Reconcile provider customers, invoices, attempts, refunds/disputes and tax with memberships, allowance windows/held/consumed balances, program enrollment and delivery entitlement including zero-appointment programs, bookings and service units. Assign and resolve differences. |
| PB-15 | Record offline/manual payment | Owner, staff | P0C | Required before a pilot accepts offline payment. Record the method and evidence honestly, authorize entitlement issuance, and reconcile without claiming an online processor transaction. |
| PB-16 | Configure taxes | Owner | P0C | Validate the enabled pilot's tax treatment and invoice totals before charging. Broader configurable tax tooling can follow at P1; unsupported tax scenarios cannot be sold. |
| PB-17 | Handle payment dispute or chargeback | Owner, system | P0 | Create a scoped review case and record pending entitlement/booking treatment. Verified final provider outcome resolves holds and affected delivery/bookings and reconciles refundable money. Preserve delivered history; unrelated contracts and beneficiaries remain unchanged. |

### Waivers forms and consent

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| WF-01 | Create waiver version | Owner | P0 | New text creates a distinct immutable version rather than changing prior signatures. |
| WF-02 | Publish active waiver | Owner | P0 | Requirements select an active version per form and service; multiple documents may be required. Publication never relabels signatures against old versions. |
| WF-03 | Sign waiver publicly | Prospect | P0 | A public signer reads and accepts an exact version through an authorized link. Capture separate required service consent and optional marketing choice before attendance requirements are satisfied. |
| WF-04 | Guardian signs for minor | Guardian | P0 | Signer relationship and child identity are explicit and preserved. |
| WF-05 | Member signs through portal or magic link | Member | P0 | Authorized signer can complete a pending form without staff impersonation. |
| WF-06 | Store signature evidence | System | P0 | Signed version, signer, timestamp and required metadata are durable and exportable. |
| WF-07 | Require re-signing after expiry/version change | System, member | P0 | Publish effective date and affected people, preserve old signatures, notify in advance and recheck requirements at attendance. Provider-introduced changes that strand a booking get penalty-free rebooking/refund review, not an automatic no-show. |
| WF-08 | Staff views waiver status | Owner, coach, staff | P0 | Authorized staff can verify current and historical status from roster and member profile. |
| WF-09 | Export signed waiver | Owner, member | P0 | A readable copy contains the exact accepted content and evidence. |
| WF-10 | Create operational intake and agreements | Owner | P0C | Coaching requires versioned intake and a coaching agreement before paid service; these are distinct from an injury waiver. Staff cannot accept on behalf of the client. |

### Member and guardian portal

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| PT-01 | Use the role appropriate portal landing page | Member, guardian | P0 | A separate responsive portal opens gym members and guardians on Classes with unified booking management and a compact authorized-person header picker. Coaching clients use My day for published daily notes. Hybrid users retain separate memberships and coaching programs. |
| PT-02 | View eligible class schedule | Member, guardian | P0 | Show eligible classes, capacity, windows, child selection, rank/cohort reasons when enabled and the allowance period for each class; no staff-only data is exposed. |
| PT-03 | Book, cancel or join waitlist | Member, guardian | P0 | Portal actions invoke the same policy engine as staff workflows. |
| PT-04 | View membership and status | Member, guardian | P0 | Show accepted product and policy, exact reset/end dates, used/held/remaining allowances, selected funding source, freeze/cancellation progress and payment warnings. |
| PT-05 | View and update payment method | Member, guardian | P0 | Hosted payment access follows the verified payer relationship; booking or guardian authority alone does not expose another person's billing details. |
| PT-06 | Request freeze or cancellation | Member, guardian | P0 | A permitted request records receipt immediately and shows notice calculation, final planned renewal, access end and affected bookings. Approval task and provider reconciliation remain visible until resolved. |
| PT-07 | View attendance history | Member, guardian | P0 | User sees role-appropriate attendance and no-show history. |
| PT-08 | View or sign pending waivers | Member, guardian | P0 | Pending requirements are clear and signing updates eligibility immediately. |
| PT-09 | Manage children | Guardian | P0 | Guardian switches dependants safely and sees each child’s relevant membership, bookings and forms. |
| PT-10 | Update allowed profile fields | Member, guardian | P1 | Owner-configured fields can be edited with validation and audit history. |
| PT-11 | View allowance and booking recovery | Member, guardian | P0 | See exact period boundaries, caps, held/used/remaining values and understandable rejection reasons. Recover pending requests by stable operation ID; see a confirmed server outcome before retrying or choosing paid fallback. |

### Communication and notifications

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| CM-01 | Send transactional email reliably | System | P0 | Committed actions durably enqueue messages. Stable identities, retryable/terminal failures and abandoned-job recovery prevent lost jobs without replaying business effects. |
| CM-02 | Send trial confirmation and reminder | System, prospect | P0 | Message includes correct class, time, location, waiver status and cancellation path. |
| CM-03 | Send booking confirmation | System, member | P0 | Booking details and relevant policy are accurate and deduplicated. |
| CM-04 | Send class cancellation/change notice | System, owner | P0 | Durable notices cover affected bookings and waitlists, identify the latest change and suppress obsolete reminders. Retrying delivery never repeats a business action. |
| CM-05 | Send waitlist promotion | System, member | P0 | The message states an actual automatic promotion under the initial policy. Offer language appears only when expiring offers are enabled and fully supported. |
| CM-06 | Send failed-payment notice | System, member | P0 | Notice contains balance, grace deadline and secure recovery path. |
| CM-07 | Send freeze/cancellation confirmation | System, member | P0 | Confirmation shows request receipt, approved terms, notice/alignment, final planned renewal, end/resume date and all affected bookings. Failed provider reconciliation stays visible; retrying a notice never changes accepted dates. |
| CM-08 | Notify staff of operational exception | System, owner, staff | P0 | Failed migrations, unresolved payments or scheduling conflicts surface to the responsible role. |
| CM-09 | Manage email templates | Owner | P1 | Owner can safely customize permitted content while required legal/transactional details remain. |
| CM-10 | View delivery log and retry | Owner, support | P0 | Authorized users inspect and retry failed delivery with stable message identity and stale-event checks. No duplicated charge, booking or private coaching text appears. |
| CM-11 | Send SMS notifications | System | P2 | Opt-in, cost control, localization and delivery state are implemented. |
| CM-12 | Send coaching notices | System, client, life coach | P0C | Program start/end, published-note notices, optional appointment reminders and handoffs use minimum details and a secure portal link. No note/goal/intake text appears in notification bodies; pause/closure suppress obsolete prompts. |

### Rank belt and progression

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| RP-01 | Configure rank system by program | Owner | P0C | Owner chooses ranks off, history only or prerequisites per program and defines ordered ranks/optional stripes. No mandatory belt model applies to Muay Thai or all jiu jitsu schools. |
| RP-02 | Record promotion | Owner, authorized coach | P0C | New rank, effective date, awarding coach and notes are preserved in history. |
| RP-03 | Add or remove stripe | Authorized coach | P0C | Stripe change respects program rules and remains auditable. |
| RP-04 | View progression history | Owner, coach | P0C | Authorized staff see chronological promotion and stripe history. |
| RP-05 | Member views current eligible rank | Member, guardian | P0C | When rank prerequisites are enabled, portal shows current eligible rank and approved history/rejection reason; internal notes remain private. This is required before rank-restricted self-booking. |
| RP-06 | Report promotion candidates | Owner, coach | P1 | Attendance/time-based indicators support coaching decisions without auto-promoting members. |
| RP-07 | Disable ranks or use skill milestones | Owner | P0 | Each program can omit ranks and all rank UI from initial setup. Optional Muay Thai skills and coaching goals remain distinct from belts; advanced custom progression is P1. |
| RP-08 | Configure and enforce class prerequisites | Owner, coach, system | P0C | Owner sets rank/stripe, age or cohort conditions, including unranked handling. Recheck booking, promotion and attendance. Before a rule change, resolve newly ineligible bookings by a reasoned permitted exception or penalty-free rebooking/cancellation, restoring funding without no-show. |

### Migration and customer onboarding

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| MG-01 | Run migration intake | Founder, gym owner | P0 | Source system, data scope, billing constraints, timing and owner approvals are documented. |
| MG-02 | Acquire source export safely | Founder, owner | P0 | Files are transferred through an approved method and access is limited and logged. |
| MG-03 | Inventory source files and record counts | Migration operator | P0 | Every file, format, date and expected record category is catalogued. |
| MG-04 | Map source fields to HitLink | Migration operator, system | P0 | Mapping is versioned, reviewable and identifies unsupported or ambiguous fields. |
| MG-05 | Normalize source data | System, operator | P0 | Dates, phones, emails, statuses and identifiers normalize without losing raw source values. |
| MG-06 | Detect duplicates and conflicts | System, operator | P0 | Potential matches and conflicting records are surfaced for deterministic resolution. |
| MG-07 | Validate required fields and relationships | System | P0 | Missing members, guardians, products, billing links and references are reported before import. |
| MG-08 | Import to staging workspace | Operator, system | P0 | Staging isolates records and credentials and cannot initiate real charges, subscriptions or customer messages. Repeated dry runs preserve source traceability. |
| MG-09 | Produce reconciliation report | System, owner, operator | P0 | Reconcile amounts, unit credits, used/reserved allowance by period, relationships, renewal ownership, future bookings and exact consent evidence. Zero unexplained differences in these categories; nonessential exclusions need named approval. |
| MG-10 | Owner reviews and approves mapping | Gym owner | P0 | Owner approves a specific reviewed snapshot with actor/time and accepted noncritical exceptions. Changed import evidence requires a new review; critical errors block activation. |
| MG-11 | Correct and rerun dry migration | Operator | P0 | Migration can be repeated without duplicate target records. |
| MG-12 | Handle payment-method portability limitations | Owner, operator, processor | P0 | Document provider-supported portability or verified customer reauthorization, payer/beneficiary links and exactly one billing system for each renewal cycle. |
| MG-13 | Run final delta migration | Operator, system | P0 | Changes after dry-run are captured without re-importing duplicates. |
| MG-14 | Approve and execute cutover | Owner, founder | P0 | Lock the reviewed final snapshot, record owner acknowledgment and separate operator activation, and verify source-to-target charging ownership before live operation. |
| MG-15 | Validate production after cutover | Founder, owner | P0 | Members, products, billing boundaries, bookings, waivers and staff access pass agreed checks. |
| MG-16 | Rollback or recover failed cutover | Founder, owner | P0 | Before live effects use the rehearsed restore path; afterward freeze new effects, capture changes and reconcile/replay/compensate so no charge or accepted booking is lost. |
| MG-17 | Deliver post-migration report | Founder, owner | P0 | Owner receives final counts, exceptions, limitations and support actions. |
| MG-18 | Import coaching records with restricted access | Owner, operator, life coach | P0C | Import restricted coaching content only if explicitly inventoried and a named reviewer is authorized to inspect/classify it. Mixed notes or missing authors are quarantined. Owner sees metadata/counts; restricted archives and temporary copies have custodians and disposal dates. |

### Reporting audit and exports

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| RE-01 | View daily owner operations summary | Owner | P0 | Today’s classes, trials, attendance exceptions, failed payments and pending actions are accurate. |
| RE-02 | Report active members by status | Owner | P0 | Counts reconcile to member and membership records with clear status definitions. |
| RE-03 | Report trial funnel | Owner | P0 | Registered, booked, attended, no-show and converted stages can be inspected. |
| RE-04 | Report failed payments and grace deadlines | Owner | P0 | Actionable balances, attempts, deadlines and account state are visible. |
| RE-05 | Report attendance and class utilization | Owner | P1 | Attendance and capacity are aggregated without double counting. |
| RE-06 | Report freezes and cancellations | Owner | P1 | Effective dates, reasons and trend counts are available. |
| RE-07 | Export operational data to CSV | Owner | P0 | Scoped exports use stable IDs and documented relationships, units and dates with safe spreadsheet encoding. General operational exports omit private coaching content. |
| RE-08 | View audit log | Owner, support | P0 | Sensitive changes include actor, timestamp, object, before/after context and reason where required. |
| RE-09 | Generate financial summary | Owner | P0 | Basic collected payments, refunds, credits, tax and unsettled amounts reconcile before pilot charging. Advanced trends and analytical reports remain P1. |
| RE-10 | Export customer data for offboarding | Owner | P0 | Gym can retrieve its data in usable formats before service termination. |
| RE-11 | Review coaching operations | Owner, authorized life coach | P0C | Authorized operations views show enrollment stage, planned end, note-delivery status, appointment balance and unresolved delivery/payment cases. Exclude note, intake and goal text from business analytics. |

### Reliability security and support operations

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| SO-01 | Maintain tenant isolation | System | P0 | Every data access path is workspace-scoped and covered by automated authorization tests. |
| SO-02 | Manage secrets and environments | Engineering | P0 | Secrets are not committed, environments are separated and privileged access is controlled. |
| SO-03 | Back up production data | System, engineering | P0 | Automated backups run on schedule, are encrypted and have monitored success/failure. |
| SO-04 | Restore from backup | Engineering | P0 | Restore rehearsals prove recovery of critical accepted charges, signatures, bookings, attendance and entitlement events through the backup gap. State which failure windows are covered and verify agreed recovery-time targets; backup frequency alone is not a zero-loss guarantee. |
| SO-05 | Monitor application health | Engineering | P0 | Availability, errors, jobs, webhooks and database health generate actionable alerts. |
| SO-06 | Capture structured operational logs | Engineering, support | P0 | Logs support diagnosis without leaking card data, secrets or excessive personal information. |
| SO-07 | Handle production incident | Founder, engineering | P0 | Severity, ownership, communication, containment, recovery and follow-up are documented. |
| SO-08 | Verify and rate-limit public endpoints | System | P0 | Protect public authentication and inquiry routes from abuse. Verify webhooks, durably accept valid events and use safe retry/backpressure instead of silently dropping provider events. |
| SO-09 | Export and delete customer data | Owner, support | P0 | Authorized export and deletion requests have distinct scopes, record-class permissions and documented retention across records, files and backups; routine export exclusions do not replace formal request review. |
| SO-10 | Support browser and tablet operations | Staff, engineering | P0 | Critical owner and coach workflows function on supported desktop and iPad-sized browsers. |
| SO-11 | Meet critical performance targets | System | P0 | Record representative dataset, supported device/network and measured p95 targets for search, roster and booking. Measure member self-service completion, staff intervention and transaction recovery alongside speed. |
| SO-12 | Provide safe support access | Support, owner | P0 | Named, authorized, time-limited and audited support access is required even for founder support. An advanced support console can follow at P1. |
| SO-13 | Publish service status and incident updates | Founder | P1 | Customers have a consistent place for meaningful outage communication. |
| SO-14 | Offboard a gym | Owner, founder | P0 | Separately resolve HitLink fees, customer renewals and outstanding payments; verify export receipt, then revoke access on agreed dates and apply documented retention/deletion. |

### Localization accessibility and device readiness

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| LA-01 | Render user-facing strings through locale system | Engineering | P1 | Critical interfaces do not rely on scattered hardcoded strings. |
| LA-02 | Format local date, time and currency | System | P0 | All operational and customer-facing values respect workspace settings. |
| LA-03 | Localize transactional emails | System | P1 | Templates select the intended locale with an English fallback. |
| LA-04 | Handle translated validation and errors | System | P1 | Users receive useful localized messages rather than raw system errors. |
| LA-05 | Support keyboard and screen-reader basics | Engineering, QA | P0 | Critical signup, forms, bookings and staff tasks support keyboard focus, labels, screen-reader status and non-colour-only feedback. Broader accessibility hardening remains P1. |
| LA-06 | Support responsive owner/coach interfaces | Engineering, QA | P0 | Critical owner, coach and client tasks work on supported desktop, iPad and mobile browsers with usable focus order, targets and unhidden actions. |

### Adult life coaching

Structured program enrollment, payment, goals, daily notes, privacy, pause and closure form the coaching baseline. Discovery and appointment dependencies apply only when offered. LC-14 client check-ins remain P2. All enabled coaching requirements must pass before sale; coaching does not block a martial-arts-only pilot.

| ID | Workflow | Primary actors | Gate | Ship definition of done |
| --- | --- | --- | --- | --- |
| LC-01 | Enable coaching and assign service access | Owner | P0C | Enable structured adult coaching with accepted coach assignments and restricted records. Coaching-only setup needs no classes, ranks or gym membership. Discovery and appointment modules are dependencies only when offered. |
| LC-02 | Configure structured program templates | Owner | P0C | Version a program template with duration, phases/milestones, goals, daily-note calendar, response window, coach, zero or more included appointments, upfront price and refund/exit terms. Enrollment snapshots the template. |
| LC-03 | Register inquiry and book discovery | Prospect, client, staff | P0C | Capture minimum contact/status, verify adult scope and safely link identity. Before sensitive free text or intake, client accepts a named provisional reviewer. Optional free discovery reserves coach time only; purpose/fit notes remain restricted. |
| LC-04 | Record mutual fit decision | Life coach, client | P0C | Coach and client record fit, further discussion, declined or no-show outcomes. Unsuitable inquiries can close without a purchase or diagnosis; minimal internal reasons are recorded and any referral shares no client information automatically. |
| LC-05 | Complete intake and coaching agreement | Client, life coach | P0C | Adult client uses independently verified contact/login and accepts exact intake, program plan and agreement. Disclose note delivery days, access/privacy, response and commercial terms. Staff or inherited guardians cannot accept for the client. |
| LC-06 | Enroll client and confirm program plan | Owner, life coach, client | P0C | Create enrollment from the accepted program version, with start/end, timezone, assigned coach and client-approved history scope. Record payment, service and settlement states separately. No gym access is implied. |
| LC-07 | Purchase structured coaching program | Client, payer, owner | P0C | Verified upfront payment funds one accepted enrollment and only its included units, if any. Future-start programs remain scheduled until the start and prerequisites pass. Zero-appointment programs work; payer sees commercial records only. Refund terms remain recorded. |
| LC-08 | Publish appointment availability | Life coach, owner | P0C | When appointments/discovery are offered, enforce hours, leave, buffers, horizon and lead time across all HitLink services. Show realistic availability before purchase; unavailable delivery has a named resolution owner and response window. |
| LC-09 | Book appointment | Client, authorized staff | P0C | For included appointments, atomically reserve coach/resource time and one program unit. Paid scheduled or active enrollment may book eligible dates within its accepted delivery window/extension. Validate agreement and adult control; daily notes consume no units. |
| LC-10 | Reschedule appointment | Client, authorized staff | P0C | Timely rescheduling atomically moves the existing credit reservation to the replacement slot. Late changes settle the old unit and require a separate available unit unless authorized reversal applies. Failure preserves the original appointment and reservation. |
| LC-11 | Prepare and deliver session | Life coach, client | P0C | Participants retrieve authorized location or virtual-link details, complete the session and record its outcome. Coach absence, technical failure and disputed attendance enter a recovery queue rather than automatically becoming a client no-show or charge. |
| LC-12 | Cancel, record no-show and correct | Client, life coach, authorized staff | P0C | Timely/provider cancellation releases the unit; accepted late/no-show rules settle once. Disputed delivery holds the unit for a named commercial reviewer using permitted evidence. Refund and unit decisions remain distinct; no automatic cash penalty. |
| LC-13 | Agree program milestones and goals | Client, life coach | P0C | Coach and client agree program phases, milestones, goals and actions with dates and measures. Material revisions require client acceptance and retain prior versions. Progress never derives automatically from payment, class attendance or rank. |
| LC-14 | Submit and review client check-in | Client, life coach | P2 | Later client-authored check-ins need agreed prompts, editing/review history, response windows and absence handling. They are not required for the initial coach-authored daily-note program and remain disabled until separately accepted. |
| LC-15 | Record private note and share summary | Life coach, client | P0C | Keep author-private working notes separate from client daily notes and optional session summaries. Publish only after audience preview. Mistaken sharing triggers withdrawal, restricted incident review, access containment and corrected republication; every product export and routine logs omit private text. |
| LC-16 | Pause or resume engagement | Client, life coach, owner | P0C | Pause has finite dates and previews delivery days, program-end adjustment, appointment units and reminders. Resume rechecks accepted coach/plan and outstanding settlement; it changes no gym membership. End review resolves unused obligations without silent forfeiture. |
| LC-17 | Reassign coach and hand over | Owner, outgoing and incoming coach, client | P0C | Revoke outgoing access promptly and mark awaiting replacement. Operations handles metadata-only continuity tasks; resolve imminent appointments and suspend unsupported notes/prompts. Client accepts replacement/history scope before access. Private author notes never transfer automatically. |
| LC-18 | Close engagement, settle and export | Client, owner, life coach | P0C | At planned end or early exit, stop delivery and prompts, resolve appointment obligations and track settlement/export separately. Client retains scoped read-only access for the disclosed retrieval window. Extension/reopening is explicit; other services remain active. |
| LC-19 | Publish and read daily client notes | Life coach, client | P0C | One dated record per enrollment/day supports draft, published, amended and withdrawn versions. Named client sees only published notes in the separate portal. Program date and actual publication time remain visible; reads and publication never charge or consume appointment units. |

## 3 Critical end to end workflow specifications

These connected workflows determine whether the product is demo-ready, pilot-safe and commercially credible.

### CF 01 Trial to paid member

**Outcome** Turn a prospect into a correctly enrolled member without duplicate identity or missing consent.

**Actors** Prospect/guardian, staff, coach, system

**Preconditions** Configured trial offer and repeat limit; published eligible class; guardian authority for a child; active required forms; capacity or waitlist.

**Core path** Prospect registers or verifies an existing identity -> duplicate-safe linking -> dated trial booked with visible form requirements -> correct signer accepts required versions -> attendance checks consent and eligibility -> coach records outcome -> optional conversion attaches a membership and verified payment to the same person -> confirmation is queued.

**Required exceptions** Shared household email; minor needs verified guardian; direct enrollment without trial; repeat trial; full class; pending/version-changed form; no-show; incomplete conversion; payment pending/failed. Do not disclose account matches publicly.

**Data/events** Person/household, TrialBooking, WaiverSignature, Booking, Attendance, Membership, PaymentCustomer, audit events.

**Ship acceptance** A guardian selects the right child throughout; identity, signing authority and trial allowance remain distinct. Conversion retains attendance/signatures and starts the accepted beneficiary membership and allowance only once. Direct enrollment is supported.

**Dependencies** Scheduling, waivers, identity, membership product, payment collection, email.

### CF 02 Recurring class with one off exception

**Outcome** Allow a gym to operate a recurring class while safely changing one occurrence.

**Actors** Owner, coach, members, system

**Preconditions** Program and required room exist; recurring series is published. Default coach is optional, with effective dated assignments checked for conflicts.

**Core path** Create published series -> resolve stable occurrences -> accept bookings with their service-date funding -> change one occurrence -> preview coach/room and allowance-period conflicts -> preserve history -> resolve each affected booking through agreed rebooking, reasoned allowance adjustment or penalty-free cancellation -> notify.

**Required exceptions** DST ambiguity; unavailable substitute; capacity below existing bookings; new rank/age requirement; move across allowance periods; series ending; provider cancellation. A changed policy/time cannot silently evict a participant or debit a paid pack.

**Data/events** ClassTemplate/Series, ClassOccurrence, exception record, Booking, Notification, audit event.

**Ship acceptance** Historical occurrences do not change; one-off modification has stable identity; bookings and attendance remain attached; conflicts and affected-user messaging are handled.

**Dependencies** Workspace timezone, rooms, staff roles, booking, communications.

### CF 03 Capacity and waitlist promotion

**Outcome** Fill a class opening without overbooking or unfair queue handling.

**Actors** Member/guardian, staff, system

**Preconditions** Published occurrence; capacity and cutoff configured; disclosed opt-in automatic-promotion policy.

**Core path** A seat opens -> prioritize the earliest eligible opted-in FIFO entry -> recheck beneficiary, rank/access, conflict and service-date allowance -> atomically claim seat and applicable allowance or unit -> mark promoted -> queue notice. Unlimited products make no allowance/unit entry.

**Required exceptions** Simultaneous direct booking; no available allowance/unit; booking or cancellation cutoff passed; cancelled class; duplicate reservation; newly ineligible user. Promotion stops before a penalty window. An ineligible entry is skipped with reason; only then may a direct booking claim the seat.

**Data/events** Booking, waitlist position/status, capacity transaction, membership eligibility, notification.

**Ship acceptance** Queue priority, seat and funding claim are atomic and idempotent. Waitlisting alone reserves no allowance. One person cannot be both booked and queued; a promotion cannot create an immediate late-cancel penalty.

**Dependencies** Class occurrence, membership policy, communications.

### CF 04 Roster check in and correction

**Outcome** Record class attendance quickly while preserving accountability.

**Actors** Coach, staff, owner, system

**Preconditions** Class occurrence exists; roster is accessible; coach has permission.

**Core path** Open authorized roster -> check current consent and eligibility -> record present/late or excused absence -> settle or release the booking allocation once -> after cutoff resolve remaining confirmed participants -> correct with reason and a net reversing event against the original period/source.

**Required exceptions** Unsigned required form blocks attendance; capacity/eligibility failure; duplicate tap; slow connection; late arrival after closure; wrong class; prior financial adjustment. Never display uncommitted offline success.

**Data/events** Attendance history, Booking, Membership, AllowanceWindow/Ledger, SessionUnitLedger and audit event.

**Ship acceptance** Duplicate taps cannot double-count. Present/late consumes once; excused releases. No-show to present causes no extra credit when both count; historical corrections cannot refill today's allowance. Required forms and beneficiary checks still apply.

**Dependencies** Scheduling, booking, membership access, audit log.

### CF 05 Membership assignment and first payment

**Outcome** Give a member access based on a valid paid product.

**Actors** Staff, member/guardian, processor, system

**Preconditions** Member exists; product configured; processor integration available.

**Core path** Select beneficiary and verified payer -> select versioned product, start date and billing anchor -> preview weekly/monthly allowance windows, counting/penalty rules, price/tax and cancellation terms -> collect securely with stable provider operation -> verify settlement -> activate permitted entitlement and period projections once -> notify.

**Required exceptions** Future start; delayed or unknown provider response; webhook replay/out-of-order; failed or disputed payment; household payer; separate paid services; no payment method. Updating a card does not itself clear debt.

**Data/events** Membership, accepted Product/AllowancePolicy, beneficiary/payer links, AllowanceWindow/Ledger, Subscription/Invoice, webhook ledger and derived access.

**Ship acceptance** No duplicate contract, charge or allowance issuance. Future service uses its own projected period. Child and sibling balances/debt remain separate. Card updates do not settle invoices; payment replays do not reset quota.

**Dependencies** Identity, products, payments, webhooks, communications.

### CF 06 Membership notice cancellation and billing stop

**Outcome** Honor the accepted notice and billing terms, including owner exceptions, while resolving future bookings and erroneous renewals.

**Actors** Member, owner/staff, system, processor

**Preconditions** Active recurring contract with versioned notice length/unit, alignment, notice-billing, approval and old-debt collection settings.

**Core path** Record receipt -> compute notice end and final boundary from accepted terms -> preview renewals, access and affected bookings -> accept or review a reasoned exception without shifting receipt -> resolve bookings at/after end -> confirm provider stop -> end service -> reconcile old debt and any erroneous renewal separately.

**Required exceptions** Calendar-month end; request just after renewal; withdrawal before effect; freeze overlap; owner waiver; settlement changes; provider stop failure. Void an unpaid erroneous renewal or refund a settled one; keep recovery open until verified. New adverse terms require acceptance.

**Data/events** CancellationRequest, PolicyVersion, receipt/notice/end dates, renewal preview, booking/funding disposition, provider-stop operation, compensation and audit events.

**Ship acceptance** No new renewal obligation or renewal charge after the accepted boundary. Earlier debt follows its disclosed collection policy without restoring access. Two calendar months and two billing cycles test differently. Owner delay, late payment and resume cannot extend the accepted contract.

**Dependencies** Payment processor, policy configuration, communications.

### CF 07 Membership freeze and resume

**Outcome** Pause membership according to gym policy while keeping billing and access coherent.

**Actors** Member, owner/staff, system, processor

**Preconditions** Active membership; freeze policy and permission configured.

**Core path** Request finite freeze -> preview billing, access, allowance anchor and affected bookings -> approve -> cancel/release interval reservations without penalty -> apply verified effects -> notify -> at resume recheck debt/cancellation and surviving allowance windows -> resume without recreating seats or duplicate quota.

**Required exceptions** Early resume; unsupported proration/anchor change; cancellation during pause; debt; provider failure. Default supports cycle-boundary freezes with no automatic quota carryover; other dates require a complete billing and quota preview.

**Data/events** Freeze record, membership timeline, processor schedule, access state, audit event.

**Ship acceptance** Finite dates and billing/allowance consequences are visible. Historical windows remain fixed. Resume cannot issue a fresh quota into an existing period or recreate ended billing; overlapping changes have one explicit outcome.

**Dependencies** Membership, payments, policy engine, communications.

### CF 08 Failed payment grace and recovery

**Outcome** Recover revenue without hiding account status or double charging.

**Actors** Processor, system, member, staff

**Preconditions** Recurring invoice or charge; grace period configured.

**Core path** First invoice failure -> create fixed grace deadline -> notify and show affected future bookings -> one controller retries same obligation -> at restriction apply the accepted cancel/release or bounded-review setting -> verified settlement resolves only that invoice -> recompute access and offer rebooking under current capacity.

**Required exceptions** Repeated/out-of-order events; multiple invoices/children; partial payment; refund; owner exception; grace expiry; old debt after cancellation. Restriction-caused cancellations are non-punitive; no booking is silently resurrected.

**Data/events** Invoice/payment attempt, membership status, grace deadline, communication log, webhook ledger.

**Ship acceptance** Grace cannot extend on replay. Payment does not reset quota, clear unrelated family debt, undo a freeze or revive cancellation. Default cancellation releases future seats/allowance exactly once and member portal shows the resolution.

**Dependencies** Payments, membership state machine, email, operational dashboard.

### CF 09 Punch card consumption and reversal

**Outcome** Use credits correctly for attendance, late-cancel and no-show policies.

**Actors** Member, staff, system

**Preconditions** Active non-shareable punch card; eligible class; policy configured.

**Core path** Confirmed booking reserves one eligible unit atomically -> attendance or disclosed late-cancel/no-show consumes that reservation once -> timely/provider cancellation releases it -> correction appends a reversal against the original event.

**Required exceptions** Last unit concurrently claimed; eligible capped membership available first; explicit paid-punch fallback; walk-in; multiple packs; provider cancellation; excused absence; correction. Never silently switch funding sources.

**Data/events** PunchPack, CreditLedger, Booking, Attendance, policy decision.

**Ship acceptance** Available/reserved/consumed units reconcile without duplication or negative balance. Unit ledger is separate from period allowance and monetary credit. Waitlisting creates no hold; no-show-to-present correction cannot restore an extra unit.

**Dependencies** Booking, attendance, products, audit.

### CF 10 Refund and account credit

**Outcome** Correct a charge while preserving financial and entitlement history.

**Actors** Owner, processor, system

**Preconditions** Successful charge exists; owner authorized.

**Core path** Select original payment -> preview net refundable amount including pending allocations and affected program/membership/units -> reserve money and entitlement -> explicitly resolve bookings/delivery -> submit idempotent refund -> pending retains holds; success retires refunded entitlement; failure unlocks without restoring lost seats -> reconcile and notify.

**Required exceptions** Concurrent requests; program with zero appointments; partial delivery; stored discount/component allocation; owner-reviewed refund amount; provider uncertainty; dispute; failed refund after a cancelled booking. Money, units and seat recovery each receive their own recorded resolution.

**Data/events** Payment, Refund, CreditLedger, membership/product entitlement, audit event.

**Ship acceptance** Amount cannot exceed refundable balance; processor/local state reconcile; retries are idempotent; prior transaction remains visible.

**Dependencies** Payments, reporting, communications.

### CF 11 Versioned guardian waiver

**Outcome** Prove what a guardian signed for a child and when.

**Actors** Owner, guardian, staff, system

**Preconditions** Child/guardian relationship exists; active waiver version is published.

**Core path** Guardian opens secure link/portal → selects child → reads exact version → confirms/signs → evidence is stored → roster/member status updates.

**Required exceptions** Multiple children; revoked relationship; payer without signing grant; current version changes mid-signing; expired link; age transition; re-sign requirement. Retain exact old evidence and separately request any new requirement.

**Data/events** WaiverVersion, SignatureEvidence, PersonRelationship, eligibility status.

**Ship acceptance** Historical signatures never change when waiver text changes; signer and child are explicit; exact content is exportable; authorization is enforced.

**Dependencies** Identity, member households, waiver publishing.

### CF 12 Zen Planner dry migration and reconciliation

**Outcome** Prove source data can be moved before touching live operations.

**Actors** Founder/migration operator, gym owner, system

**Preconditions** Migration intake complete; exports received; staging workspace available.

**Core path** Inventory source records and visibility -> isolate staging with live effects disabled -> map/normalize -> quarantine ambiguous records -> import idempotently -> reconcile counts, money, units, relationships and consent -> owner reviews snapshot -> correct and rerun with new evidence.

**Required exceptions** Malformed source; shared email; missing guardian authority; unknown status; unsupported history; private coaching records; signature evidence missing. No silent active defaults or broad internal-note import.

**Data/events** MigrationJob, source snapshot metadata, field map version, staged records, reconciliation results, exception decisions.

**Ship acceptance** Reruns do not duplicate data; every source category has count/result; unresolved exceptions are explicit; owner approval is recorded.

**Dependencies** Import tools, staging isolation, data model, audit/report export.

### CF 13 Final cutover and rollback

**Outcome** Move one real gym without losing operating continuity.

**Actors** Founder, gym owner, staff, system

**Preconditions** Approved dry run; cutover window; backups; support coverage; rollback procedure.

**Core path** Agree freeze/cutover and billing owner per renewal -> capture final delta and backup -> import -> reconcile operations, financial balances and source renewal stop -> lock reviewed snapshot -> owner acknowledges -> operator activates -> monitor and reconcile.

**Required exceptions** Validation failure; source still charging; provider ambiguity; missing upcoming booking; access failure; post-activation customer edits. Before external effects restore as rehearsed; afterward freeze, capture deltas and compensate/reconcile rather than blindly restore.

**Data/events** MigrationJob, backup references, final reconciliation, go/no-go checklist, incident log.

**Ship acceptance** Distinct owner acknowledgment and operator activation are recorded; one system owns each charge cycle; recovery preserves every accepted operation and reconciles external effects before reopening.

**Dependencies** Backups, monitoring, migration, identity, payments, support process.

### CF 14 Gym offboarding and data export

**Outcome** Let a business leave with usable records and an explicit disposition for both platform and customer billing.

**Actors** Gym owner, founder/support, system

**Preconditions** Authorized owner request; final billing state known.

**Core path** Verify owner request -> inventory future services and all billing relationships -> produce scoped relational/files export -> verify receipt -> stop HitLink fees on agreed date -> hand over or explicitly stop customer renewals -> settle exceptions -> revoke access -> apply retention/deletion schedule -> confirm.

**Required exceptions** Export failure; pending dispute/refund; customer subscriptions still active; other owners disagree; retention hold; coaching content requiring restricted export review. Do not equate service termination with immediate destruction.

**Data/events** Export job, service subscription, access status, retention schedule, audit event.

**Ship acceptance** Export is usable; no future platform charge; access changes on stated date; deletion/retention is explicit and logged.

**Dependencies** Reporting/export, identity, billing, support policy.

### CF 15 Production incident response

**Outcome** Protect gym operations when a critical workflow fails.

**Actors** Founder, engineering, support, gym owner

**Preconditions** Monitoring and contact paths configured.

**Core path** Alert or report received → severity assigned → owner identified → contain impact → communicate workaround/status → recover service/data → verify affected workflows → record post-incident actions.

**Required exceptions** Data integrity issue; payment duplication risk; security suspicion; third-party processor outage; partial region outage.

**Data/events** Incident record, logs, audit events, customer communications, remediation tickets.

**Ship acceptance** Critical incidents have an owner and timeline; payment/data risks trigger immediate containment; customers receive meaningful updates; corrective work is tracked.

**Dependencies** Monitoring, backups, logs, status communication.

### CF 16 Coaching inquiry to active engagement

**Outcome** An adult enrolls in a structured program with daily client notes and optional appointments, without a gym membership.

**Actors** Prospect/client, life coach, owner, system.

**Preconditions** Versioned program, eligible coach, note calendar, response/refund terms and intake/agreement configured. Client has independent verified login/contact and meets the adult threshold. Appointment availability is required only if appointments are sold.

**Core path** Minimal inquiry or existing identity -> client accepts provisional reviewer before sensitive intake -> optional free discovery -> agree program version, coach, dates/timezone, milestones and note calendar -> adult accepts intake/agreement and payer relationship if any -> hosted upfront payment -> verified settlement funds enrollment once -> schedule or activate when accepted start and prerequisites permit -> show next action.

**Required exceptions** Existing family identity; unverified adult control; declined fit; zero appointments; incomplete intake; unavailable coach; changed terms; pending/failed payment; third-party payer. Settlement after a planned start requires an agreed revised window or remedy for missed delivery, never fabricated past notes. Unusable paid delivery becomes a named recovery case.

**Data and events** Person, restricted Inquiry, ProgramTemplateVersion, ProgramEnrollment, accepted plan, CoachAssignment, intake/agreement evidence, payer/payment, optional appointment units and audit.

**Ship acceptance** A zero-appointment program can be purchased and delivered through daily notes. Activation occurs once without class access. Terms and client-approved assignment remain traceable; unrelated staff/payer/guardian cannot read intake or notes.

**Dependencies** LC-01–07, LC-13, LC-15 and LC-19; identity, forms, hosted payment, separate client portal and privacy. Discovery/scheduling applies only when offered.

### CF 17 Paid booking through delivered session

**Outcome** Client and coach meet at a confirmed time and exactly one entitled session is accounted for.

**Actors** Client, life coach, authorized scheduler, system.

**Preconditions** Appointment-enabled program with paid scheduled or active enrollment, accepted agreement, available included unit and eligible coach. Service date is within the delivery window or an approved extension; adult account control remains verified.

**Core path** Choose an included appointment -> view timezone-labelled slots -> server validates all coach/resource reservations/buffers -> atomically reserve appointment and one program unit -> confirm/remind -> retrieve protected delivery details -> record completion -> settle same unit -> optionally publish a separate summary or that day's note.

**Required exceptions** Simultaneous bookings; one credit used from two tabs; overlapping martial-arts class; stale availability; room conflict; daylight-saving ambiguity; changed or missing link; failed reminder; connection failure; duplicate completion request. Initial virtual sessions use a staff-supplied link; external calendars are not assumed synchronized.

**Data and events** Appointment with stable ID, UTC instant and IANA timezone; Availability/TimeOff; resource reservation; SessionCreditLedger; session outcome; DeliveryLog; published SharedSummary.

**Ship acceptance** One conflicting reservation succeeds; seat/time and unit commit together. Appointment completion consumes once; writing/reading the daily note consumes nothing. Provider failure enters recovery. A coach overlap cannot be overridden. Zero-appointment programs never require this flow.

**Dependencies** LC-08–11 only when appointments are included; resource scheduling, units, reconciliation, notifications and authorization.

### CF 18 Appointment changes no show and financial recovery

**Outcome** A change produces a disclosed, reversible and financially consistent result.

**Actors** Client, life coach, authorized scheduler, owner, system.

**Preconditions** Confirmed appointment, reserved credit and accepted policy version; cancellation cutoff and no-show grace interval configured.

**Core path** Preview policy against the current confirmed start instant, retaining prior times. Timely cancellation releases the unit; accepted late cancellation or verified no-show consumes it; provider cancellation releases it. Timely rescheduling transfers the original hold atomically. A late move settles the original and requires another available unit unless an authorized waiver applies; failure preserves the old slot/unit. Record ledger and notice. Coach verifies no-show after grace; elapsed time alone is insufficient.

**Required exceptions** Late reschedule; program end/pause; program-fee refund with reserved appointments; payment reversal; racing completion/cancellation; disputed delivery; coach absence. Hold disputed units for the named reviewer, with optional separate audited goodwill. Returning a unit does not resolve a program refund request.

**Data and events** Appointment transitions, PolicyVersion, credit reservation/consumption/reversal, paid-value allocation, Payment/Refund and attributable correction reason.

**Ship acceptance** Preview unit and program-money consequences separately. Timely last-unit rescheduling is atomic; failure preserves old slot/unit. Refunds cannot exceed net paid or pending allocation; accepted component allocations or reasoned owner review govern amount. Daily notes do not become refunded session units. Preserve delivery history.

**Dependencies** Appointment-enabled LC-02/07/09/10/12; transactional scheduling, unit ledger, PB-10, reconciliation and audit.

### CF 19 Structured plan and daily client notes

**Outcome** Client follows an agreed structured program and receives dated coach notes with clear publication and privacy boundaries.

**Actors** Client, accepted assigned life coach, system; records reviewer only for authorized exceptions.

**Preconditions** Active enrollment with accepted plan, program timezone, delivery days and response window. Private working notes and publishable client notes are separate record types.

**Core path** Agree milestones/goals -> coach drafts the day's client note -> preview enrollment, named client, local program date and content -> publish -> queue minimal secure-link notice -> client reads published note in portal -> coach amends through a new version when needed -> review progress and obtain acceptance for material plan changes.

**Required exceptions** Missed delivery day; backdated publication; wrong client/date; duplicate save; coach absence; pause/end; withdrawn note; wrong audience. Missed notes create a delivery exception, not automatic financial penalties. Mistaken publication triggers restricted incident containment and communication review; viewed copies cannot be recalled.

**Data and events** Accepted ProgramPlanVersion, milestone/goal/action history, DailyClientNote with enrollment/local date, draft/publication/amendment/withdrawal history, separate PrivateCoachNote, assignment and audit metadata.

**Ship acceptance** The intended client and accepted coach/handoff scope can read published versions. Draft/private text stays excluded from owner, reception, payer, guardian, unrelated coach, ordinary search/export and notifications. Publication and reading change no money/unit balance. Zero-appointment programs work. Client check-ins/journals are deferred.

**Dependencies** LC-13, LC-15 and LC-19; separate client portal, scoped authorization, versioning, notifications, records review and retention.

### CF 20 Pause coach departure and reassignment

**Outcome** Continuity is deliberate and outgoing coach access ends promptly.

**Actors** Client, owner, outgoing/incoming coach, system.

**Preconditions** Program with explicit delivery window, note calendar, assigned coach and any future appointments/units; a named operations contact owns continuity.

**Core path** Request finite pause or detect departure -> preview end-date, notes/prompts and appointment effects -> revoke departing coach immediately -> mark paused/awaiting replacement -> agree revised plan or accepted replacement/history scope -> resolve bookings/units -> activate new assignment only after acceptance -> resume with explicit dates and no automatic old reminders.

**Required exceptions** No replacement; client declines; outgoing coach unavailable; appointment tomorrow; already published notes; refund pending; return after planned end. The metadata-only operations owner handles continuity, and notes requiring an unavailable coach are paused. Default pause extends by paused delivery days unless accepted terms specify otherwise.

**Data and events** ProgramEnrollment state and dated delivery-plan changes, accepted CoachAssignment history, access revocation, approved published handoff, appointment/unit/refund events and minimal client notices.

**Ship acceptance** Former coach access ends on time; private notes do not transfer. Approved published history and shared plan are scoped to the accepted replacement. Unused obligations, new end date and delivery calendar reconcile; no effect on gym membership. Unsupported ongoing service enters settlement review.

**Dependencies** LC-16–17; identity/session revocation, scheduling, client communication, package eligibility, payments and audit.

### CF 21 Coaching closure settlement and export

**Outcome** Client can finish or leave with an agreed plan, permitted records and settled obligations.

**Actors** Client, life coach, owner, authorized support, system.

**Preconditions** Planned end or authenticated early-exit request; program terms, appointment obligations, refund policy and retrieval window are known.

**Core path** At end stop scheduled notes/prompts -> review milestones and optional final note -> resolve future appointments and unused obligations -> agree completion, extension or early closure -> create settlement/export jobs -> close service on the agreed date independently of pending money -> retain scoped read-only portal access for the disclosed retrieval period -> complete retention/access tasks.

**Required exceptions** Zero-appointment program; unused included units; incomplete promised notes; refund/dispute/export pending; other active services; extension; reopened program; formal additional-record request. End date never silently confiscates unused appointment obligations. Workspace exit checks outstanding record retrieval before revocation.

**Data and events** Closure record, final shared plan, resolved appointments, entitlement ledger, refunds, ExportJob, access changes and retention/deletion audit events.

**Ship acceptance** No unintended delivery prompts or appointments remain. Export contains accepted program versions, submitted intake, agreements, milestones/actions, published daily notes/summaries and authorized transaction history, with relationships intact. A named resolver handles failed exports. Private working notes remain excluded from every product export; exceptional read access requires a separate authorized review. Other services continue.

**Dependencies** LC-16–19 except deferred LC-14; portal, scoped export, settlement/reconciliation, retention, identity, notifications and CF-14.

### CF 22 Member portal booking with a class allowance

**Outcome** A member or guardian books and manages classes independently while the gym's billing-cycle limits remain accurate.

**Actors** Member/guardian, authorized staff, system.

**Preconditions** Published class; named beneficiary; accepted capped membership with billing anchor, eligible programs, counting and consequence settings; separate portal and current form status.

**Core path** Select self/child -> see service-date weekly/monthly windows and held/used/remaining values -> select class -> atomically validate eligibility, seat and every applicable cap -> reserve one allocation -> show confirmed result -> attendance settles that same allocation, or cancellation releases/settles it under accepted terms.

**Required exceptions** Last allowance requested from two tabs or by staff; projected future cycle; short final week; DST; rank rule; sibling profile; exhausted cap with paid punch available; cross-period move; failed renewal; late cancellation; provider change; historical correction.

**Data and events** Membership/AllowancePolicyVersion, billing-cycle window and weekly subwindow, Booking, original funding source, allowance ledger events, Attendance, operation ID and audit metadata.

**Ship acceptance** Dual weekly/monthly caps pass together. One racing final allocation succeeds; attendance never decrements twice. A timely move reuses unchanged holds, including a full monthly cap when moving weeks. Failed moves preserve the original. Late moves apply disclosed net consequences. Cycle resets ignore payment replay. Sibling balances stay separate; pending requests recover once; no silent paid fallback.

**Dependencies** MP-01/05/17, BK-01–07/09–13, AT-03–07, PT-01–04/09/11, identity, policy snapshots and notifications.

## 4 State data and integration requirements

These are not independent features; they are the foundation that prevents workflows from contradicting one another.

### Required state machines

| State domain | Minimum model | Non-negotiable property |
| --- | --- | --- |
| Person and acquisition | Stable identity; inquiry/trial/conversion events; archived flag | Trials may repeat or be skipped; a person can use both service categories. Archive is not a payment cancellation. |
| Membership contract | Pending activation, scheduled, active, ended | Contract lifecycle is separate from debt, freeze and cancellation records. |
| Payment health and access | Current, grace, restricted debt, unresolved reconciliation | Derive each entitlement from current obligations and policy; settlement cannot undo other service states. |
| Freeze and cancellation request | Requested, approved/rejected/withdrawn, scheduled, effective, completed | Accepted dates and policy version are stable; cancellation after its effective date prevents resume. |
| Class booking and attendance | Booking confirmed/cancelled; attendance unresolved/present/late/excused absent/no-show | Track related but distinct states; historical correction is an event, not deletion. No double unit consequence. |
| Waitlist | Queued, promoted, skipped or removed; offered/expired only in offer mode | Promotion and optional offers hold capacity atomically; expiry exists before offer mode goes live. |
| Invoice and payment attempt | Invoice balance/status; attempt pending, payer action, processing, succeeded, failed, cancelled | Separate records and provider IDs; replay and late events cannot duplicate or regress results. |
| Refund and monetary credit | Refund pending/succeeded/failed; credit issued/applied/reversed | Allocate pending refunds; monetary balances have currency and never masquerade as session units. |
| Service unit ledger | Issued, available, reserved, consumed, released or reversed | Balance is derived from immutable transactions; each reservation settles once against its original service. |
| Migration job and activation | Intake, mapped, validated, staged, reconciled, snapshot reviewed, owner acknowledged, operator activated | Errors and reruns have explicit history; activation is separate from import completion and irreversible effects. |
| Agreement and signature | Version draft/published/retired; acceptance attached to exact version; current requirements evaluated separately | Historic evidence does not change when a new version is published. |
| Coaching program enrollment | Onboarding, scheduled, active, paused, awaiting replacement, end review, service closed; separate settlement/export status | Program dates, payment and client-approved assignment are independent. Closure stops service while money/export may still be pending. |
| Appointment | Optional expiring hold, confirmed, completed, cancelled, late-cancelled or no-show | Stable appointment identity and atomic resource/unit reservation; corrections retain prior event. |
| Program plan and progress | Versioned template/enrollment; milestones/actions agreed, active, paused, completed or retired | Material changes require client acceptance. Client-authored check-ins remain P2 and are not a daily-note dependency. |
| Private and client notes | Private authored revisions; daily client note draft, published, amended, withdrawn; optional shared summary | One enrollment/local date with publication history; separate private record; publication/reading never consumes a session or money. |
| Membership period allowance | Versioned policy; stable cycle/subwindow; projected/eligible window; held, consumed, released, reversed and adjusted events | One beneficiary and service-date allocation; no double count, replay reset, sibling leakage or current-period windfall from old corrections. |
| Service deactivation | Sales disabled, delivery/settlement in resolution, operationally disabled, retained history | Disable new sales first; resolve programs, future bookings, money and exports before withdrawing service access. UI hiding alone is not deactivation. |

### Minimum core entities

Workspace, physical Location/Room when needed, Category, martial arts Program, CoachingProgramTemplateVersion, versioned Policy and enabled modules.

Stable Person plus workspace-scoped Member/Client, Staff, Guardian and Payer relationships with independent grants.

Class template/series plus a stable dated ClassOccurrence or equivalent exception-safe model.

Booking, WaitlistEntry and Attendance with history and idempotent consequences.

ProductVersion, MembershipContract, AllowancePolicyVersion, billing-cycle AllowanceWindow and weekly subwindow, immutable AllowanceLedger; CoachingProgramEnrollment/PlanVersion; dated Freeze/CancellationRequest and derived service access.

Payer PaymentCustomer, beneficiary-attributed Subscription/Invoice, PaymentAttempt, Refund, monetary CreditLedger and separate SessionUnitLedger with provider, source and reservation IDs. A shared payer does not merge children's obligations.

Form/AgreementVersion, AcceptanceEvidence, IntakeVersion/Response and record-class visibility.

Optional per-program RankSystem, ClassPrerequisite, Promotion/stripe history; separate coaching Milestone/Goal/Action. Client CheckIn is deferred.

MigrationJob, SourceSnapshot, FieldMappingVersion, ImportException and ReconciliationResult.

AuditEvent and DeliveryLog for sensitive operations and communications.

Appointment, Availability/TimeOff, accepted CoachAssignment history, resource reservation, PrivateCoachNote, DailyClientNote with program date/publication history, optional SharedSessionSummary and operational RecoveryCase.

### External integrations

Payment processor: Hosted payment-method collection, customers, subscriptions/invoices, one-time charges, refunds and signed webhooks. Raw card data must never be stored in HitLink.

Email provider: Durable delivery jobs with bounded retries, stale-message suppression and visible terminal failures. Private coaching text stays in the protected portal. Email retries never repeat business actions.

Object/file storage: Migration exports and signed-document files require limited access, encryption and lifecycle/retention controls.

Monitoring/logging: Application errors, job failures, webhooks, migration failures and database health require actionable alerts.

Identity provider or auth stack: Secure account recovery, invite expiry, role enforcement and session revocation.

Virtual delivery: Start with a manually entered, access-controlled meeting link. A video-provider or calendar integration is optional later work; the pilot must still support link changes, timezone clarity and technical-failure recovery.

### Scheduling architecture decision

Every dated class and appointment must preserve identity, exceptions, reservations and history. Existing classTemplateId plus date code and the schema's ClassInstance/PrivateLesson models must be reconciled with actual routes and tests before activation. A table alone is not a delivered feature. Shared coach/resource conflict checks must cover both classes and appointments with their buffers.

## 5 Non functional and operational requirements

A gym will forgive an unfinished report. It will not forgive lost attendance, double billing or a broken check-in screen during class.

| Requirement | Pilot-safe expectation |
| --- | --- |
| Authorization | All sensitive actions are validated server-side. Automated tests cover cross-workspace access, role escalation and guardian/child boundaries. |
| Data integrity | Unique constraints, transactions, idempotency and ledgers prevent duplicate bookings, charges, credits and migration imports. |
| Availability | Critical owner, roster, booking and payment-recovery workflows have monitoring and a documented incident path. |
| Recovery | Set and prove recovery targets per critical record class. Rehearse accepted-event recovery across the backup gap and after external effects; a backup interval alone cannot prove no loss of accepted bookings or signatures. |
| Performance and convenience | Name dataset/device/network, measured p95 targets and supported launch profile. Measure self-service booking/cancellation success, staff intervention and recovery of uncertain outcomes; record targets before live sign-off. |
| Privacy | Enforce the coaching record matrix on read/write, search, email, logs, downloads and exports. Routine support and operational roles do not inherit private content. |
| Auditability | Role changes, membership overrides, attendance corrections, refunds, credits, waiver signatures and migration approvals are attributable. |
| Accessibility | Public registration, signing and critical staff forms are keyboard usable, labelled and understandable; colour is not the only status signal. |
| Localization readiness | All time, date and currency behaviour is workspace-aware. Full translation may be P1, but architecture must not make it prohibitively expensive. |
| Supportability | Known errors produce useful identifiers and context; support can diagnose without direct database improvisation or unsafe impersonation. |

### Minimum test layers

Unit tests for billing anchors, calendar-month notice, short weekly windows, DST boundaries, dual caps, policy precedence, rank eligibility and net correction rules.

Integration tests for authorization, immediate session revocation, payment state/replay, retryable email jobs, data constraints and migration reruns.

End-to-end tests for every enabled critical workflow in Section 3, including coaching-only and hybrid journeys when life coaching is enabled.

Concurrency tests for last seat and last allowance, coach/resource overlap, last unit, cross-period rescheduling, provider replay, refund allocation and correction/reversal.

Manual keyboard, screen-reader status and responsive acceptance for critical owner, coach, member and client tasks on supported desktop, iPad and mobile browsers.

Restore and cutover rehearsals using a staging copy before real customer migration.

Negative coaching tests cover provisional and replacement assignments, revoked/former coaches, owner self-assignment, reception, payer, former guardian, other client and cross-workspace access on every read/write/search/export path. Published client notes never reveal drafts/private notes.

## 6 Shipping gates and release checklist

A release requires evidence for the agreed service scope and its dependencies

### Gate A Demo ready

For the first gym release, demonstrate families, capped memberships, separate member portal and CF-22 alongside the gym flows. Rank prerequisites require their own enabled-policy tests. Coaching demonstrates structured programs and daily notes; discovery/appointments apply only when offered.

☐ A realistic demo workspace can be reset and seeded reliably.

☐ Trial registration, waiver, booking, attendance and conversion run as one connected story.

☐ A recurring class can be edited for one occurrence and shown correctly to owner, coach and member.

☐ A member and a guardian independently book/cancel from the separate portal, see exact held/used/remaining allowance and recover a pending request; staff see the same committed state.

☐ Weekly/monthly billing-anchored limits, configurable penalties, two-month notice, owner exceptions, finite freeze and failed-payment booking outcomes are understandable in test mode.

☐ A migration dry run produces a reconciliation report from representative Zen Planner-style data.

☐ The design system and navigation are consistent enough that owners can understand the product without narration for every control.

### Gate B Paid pilot safe

☐ Tenant, role and family tests cover two children, distinct payer/signing/booking grants, revoked relationships, age transition and adult coaching account control.

☐ Production build and migrations are reproducible; fictional demo/reset tooling is isolated from production and never used as a live setup step.

☐ Payment method collection, webhooks, idempotency, failed payment, refund and reconciliation have test evidence.

☐ Backups are running and at least one restore rehearsal has succeeded.

☐ Every enabled critical flow, including CF-22, and every required P0C dependency has a named owner, meaningful automated coverage and a completed manual acceptance script. LC-14 remains deferred.

☐ Existing-business migration has an approved snapshot, charge ownership and rehearsed recovery plan; new businesses pass verified setup without fictitious imports.

☐ Owner, coach and front-line staff receive onboarding and can complete their daily workflows.

☐ Monitoring, logs, incident contacts and customer communication templates are active.

☐ The gym can export its data and has documented offboarding terms.

☐ Pilot configuration records supported region/currency/language, devices, trial policy, cancellation/allowance settings, named support/records owners, response/retrieval windows and measured recovery/performance targets. Missing critical configuration blocks activation.

### Coaching activation evidence

☐ Demonstrate adult coaching-only and hybrid journeys with one identity and separate entitlements.

☐ Enroll and deliver a structured program with zero appointments using goals/milestones and daily client notes; also test included appointments if offered. Adult agreement, payer consent and accepted coach assignment are verified.

☐ Program payment replay, zero-session entitlement, program-end/extension/refund settlement and, where offered, last-slot/last-unit concurrency and reschedule rollback pass.

☐ When appointments are offered, timely/late cancellation, no-show, coach absence and technical failure have tested outcomes without duplicate unit consumption. Zero-appointment programs demonstrate unavailable-delivery and refund recovery instead.

☐ Private-note isolation, daily-note draft/publication/amendment/withdrawal, date/timezone handling and mistaken-disclosure incident recovery pass across portal, search, notifications and exports.

☐ Finite pause, awaiting replacement, client-approved history sharing, end review, unused obligation settlement and retained record retrieval work without changing another active service.

☐ Program delivery days and response windows, restricted-record reviewers/escalation, commercial case owner, retrieval/retention settings and allowed limitations are configured before sale.

### Gate C Public V1

☐ A second business within each advertised service category can be configured and, where needed, migrated without customer-specific code changes.

☐ Onboarding, training, migration mapping and reconciliation are documented and repeatable.

☐ Advanced staff configuration, reporting, email template customization and localization are repeatable; P0 permission and accessibility safeguards remain mandatory.

☐ Support access is auditable and does not depend on direct production database manipulation.

☐ Public pricing, plan limits, repeatable HitLink billing and support expectations are defined; initial paid-pilot terms already exist.

☐ At least one pilot has retained, paid and provided evidence that the product improves a meaningful workflow.

### Launch acceptance sign off

| Area | Required owner | Evidence / decision |
| --- | --- | --- |
| Product workflows | CEO + BA/Workflow | Critical workflow matrix approved; P0 limitations accepted. |
| Engineering | Backend + Frontend + DB | Build, migrations, integration and data constraints pass. |
| Quality | QA + UX | Critical E2E/manual acceptance passes on supported devices. |
| Payments and migration | CEO + Backend + Migration operator | Reconciliation, cutover and rollback evidence accepted. |
| Operations | CEO + Support/Engineering | Monitoring, backup, incident and customer communication readiness accepted. |
| Life coaching when enabled | Product owner and coaching workflow reviewer | Structured program CF-16/19–21 and LC-19 pass; discovery and appointment CF-17–18 pass when offered. Confirm privacy, money, daily-note and end-review evidence. |

## 7 Recommended delivery sequence and ticket epics

Finish connected foundations and workflows before adding breadth.

### Epic 0 Recovery and reproducibility

Reconcile the repository and specification, reproduce build/test/migration paths and separate demonstrated behavior from planned requirements. Include all real tests in the gates; repair session-reset revocation, migration environment propagation and failed-notification retry behavior before relying on them.

### Epic 1 Identity tenancy and audit

Verify workspace/service boundaries, session revocation, actor capabilities, payer/guardian relationships and sensitive-action auditing; implement restricted coaching record classes before adding private content.

### Epic 2 Scheduling occurrence model

Resolve dated class and appointment identity, one-off changes, cross-service coach/resource conflicts, buffers and DST before building appointment or recurring-class mutations.

### Epic 3 Trial to member vertical slice

Build one family-aware member journey early: registration, guardian authority, versioned waiver, trial, minimum product/payment and allowance setup, portal booking, attendance and conversion. Pull required foundations into this slice; later epic numbering must not postpone self-service.

### Epic 4 Booking waitlist and attendance

Ship the separate member portal together with eligibility, weekly/monthly caps, queue priority, roster, check-in, accepted consequences and original-period corrections. Complete CF-22 with staff and family views before expanding scope.

### Epic 5 Products and membership state

Implement billing-cycle policies and allowance ledgers, independent contract/debt/access states, finite freeze and notice-cancellation settings, supported owner exceptions and future-booking dispositions. Keep unit and money ledgers separate.

### Epic 6 Payments and financial safety

Implement hosted payment, payer/beneficiary links, verified results, idempotent retries, pending refunds, disputes and basic financial/unit reconciliation.

### Epic 6A Adult coaching service

Implement structured coaching templates/enrollment, upfront program payment, accepted assignment/intake, milestones and daily notes first. Add appointment dependencies only for offers that include them, then finite pause/replacement/end review/export. LC-14 interactive check-ins remain P2. Required coaching evidence follows the enabled program, not an assumed appointment package.

### Epic 7 Member guardian portal and communications

Deliver the separate member/guardian portal as part of the first booking slice and the coaching client portal with program enrollment. This epic completes broader polish and communications; it is not permission to postpone P0 self-service.

### Epic 8 Migration cutover and export

Implement isolated staging, allowance/unit/money/consent reconciliation, owner acknowledgment, activation, charge handover and recovery. Classify duplicates through a restricted, evidence-based recovery procedure until merge tooling exists; preserve transaction/signature provenance. Restricted coaching imports require explicit source scope and reviewers.

### Epic 9 Pilot operations

Add monitoring, backups, restore drill, incident runbook, training materials, support boundaries and pilot sign-off.

### Epic 10 Public V1 hardening

Build advanced front-desk configuration, reporting, localization, template customization and repeatable commercial onboarding. Baseline permission, accessibility and support safety cannot wait for this epic.

### Delivery coordination

Keep implementation work within one connected milestone where practical. Separate nonconflicting changes and review their combined behavior before declaring the milestone complete. Any P0 integrity, authorization, payment, privacy or migration failure blocks the affected release. These are team delivery requirements, not evidence that automated work has been authorized or completed.

## A Deferred features and explicit non goals

These may be valuable, but they should not delay the first paid pilot unless a committed customer makes them essential.

| Deferred item | Reason / initial approach |
| --- | --- |
| Native iOS/Android apps | Use responsive web/PWA-style experiences first. |
| SMS and omnichannel marketing automation | Transactional email is sufficient for the first pilot. |
| Advanced sales CRM and automated nurture campaigns | A practical trial follow-up queue is enough initially. |
| Multi-location enterprise controls | Prove one-location operations first. |
| Payroll, coach compensation and accounting replacement | Integrate or export later rather than expanding into a full ERP. |
| AI-generated training plans or coaching decisions | Not part of the operational wedge. |
| Automatic rank promotion | Software may report indicators; coaches decide promotions. |
| Custom branded member mobile apps | High-cost expansion after retention is proven. |
| Complex weekly or usage-based recurring billing | Recurring gym payments remain monthly. Weekly and monthly class usage limits are required now and are separate from payment frequency. Coaching starts with a fixed upfront program fee; installments and subscriptions are later scope. |
| Social feed or community network | The gym’s operational system is the priority. |
| Fully autonomous migration with no human verification | The migration promise is white-glove, agent-assisted and reconciled—not unattended. |
| Replacing payment processors or storing card data | Use established processors and hosted collection. |
| Youth and group life coaching | Initial coaching scope is adult one-to-one. Youth consent/access and group confidentiality need separate reviewed workflows. |
| Recurring coaching subscriptions and automatic recurring appointments | Start with structured programs, daily client notes and optional included appointments. Recurring coaching billing, installments, standalone session sales and automatic recurring appointment series need separate reviewed flows. |
| Clinical treatment records and emergency monitoring | Outside the non-clinical coaching service defined here; no clinical or emergency-response claims. |
| Session recording and AI coaching decisions | No recording, transcription or automated recommendation workflow in the initial service. |
| Calendar and video-provider synchronization | Use an explicit protected meeting link initially. Later integrations must reconcile external changes and conflicts. |
| Open-ended membership freezes | Initial freezes have a finite end date and resume plan. Later support needs review dates and explicit billing recovery. |
| Client journals and interactive coaching check-ins | Daily coach-authored client notes are initial scope. Client submissions, comments and check-in collaboration can expand later through LC-14. |
| Advanced grading events and curriculum authoring | Owner-configured ranks, history and booking prerequisites are supported first. Grading-event administration and detailed curricula are later scope. |
| Shared family allowance and complex carryover | Initial family accounts have separate beneficiary caps. No automatic carryover or pooled household entitlement; later products need explicit accounting and consent rules. |

### Final product test

Can a Muay Thai, jiu jitsu or taekwondo gym run family and member self-service bookings with accurate billing-cycle limits, reliable attendance and flexible accepted cancellation terms? Can a coaching client buy a structured program, read daily notes, resolve a pause/change and leave with records and settlement? Every enabled service must protect restricted data, recover accepted actions and export usable records through supported workflows. Improvised production database edits do not count as a shipped flow.

## B Implementation verification record

### Status on October 16 2026

This record supplements the requirements without removing acceptance criteria or certifying production activation. Persisted scheduling, family access, allowances, membership lifecycle, coaching, website publication, public enrollment, payment reconciliation, scoped exports, retention and temporary support access have implementation and isolated verification. Browser checks cover the actual owner and member pages at desktop and phone sizes in light and dark themes. Live Stripe settlement, outbound email and production deployment remain separate checks. No live payment, email or production deletion was performed for this verification.

### Membership enrollment and payment review

Owners share current published offers. The adult payer or verified guardian completes account and email verification, current forms, accepted terms and hosted payment. The old owner action that directly created and charged a subscription has been retired. Assigning a plan does not authorize a charge. Existing contract, allowance and accepted cancellation or freeze workflows remain available.

Activation requires the canonical paid first invoice and matching active subscription, payer, beneficiary and accepted terms. Money can be recorded while access remains under review. Restored family permission or completed forms do not clear an unresolved review automatically. Reviewed checkouts withhold payable links. An unknown processor outcome beyond the safe idempotency window requires reconciliation before another checkout.

Accepted cancellation terms preserve the original notice receipt and policy. The default stops automatic collection of old debt at termination; owners can explicitly offer a different policy, and existing accepted terms remain unchanged. Future notice periods do not stop collection early. At the effective boundary, a separate durable operation verifies the processor's invoice collection flags. Remaining debt enters review; an uncertain stop is not reported complete.

### Staff availability

Owners record leave in the gym timezone, with ambiguous daylight-saving times rejected. Before saving, HitLink checks dated class assignments, private lessons, published events, coaching appointments and published appointment availability, including buffers. Owners must resolve those conflicts first; recording leave cannot silently remove services, seats or funding. Date-specific substitutes and unassigned dates are respected. Future recurring edits and assignments check every affected leave date, including ongoing series. Publishing, booking and moving appointments recheck leave under the shared schedule lock; a failed move retains the original appointment and held unit. Withdrawing leave preserves its audit history and opens time for new assignments without restoring cancelled services.

### Coaching delivery and records

Adult clients accept a named coach and a versioned plan from their own account. Accepted-plan snapshots retain agreement, date and intake-version evidence. Daily private notes remain author-only in ordinary use. The client sees published revisions and withdrawal notices. A corrected publication cannot restore withdrawn text or its old revisions. Owners can contain a publication after closure or a coach's departure without reading its content; queued notices and prepared archives are invalidated, and a named reviewer records recipient follow-up.

Exceptional private-note review is a separate path: exact note IDs, a named reviewer, a stated purpose, owner approval, explicit client and author consent, and an expiry of at most one hour. Every authorized read is audited. Revocation or lost account authority takes effect on the next request. This permission never enables a product export of private text.

Appointments capture the accepted cancellation deadline and no-show grace. A timely move transfers the reserved unit. A late move consumes the old unit and reserves another atomically; a failed replacement retains the original booking. Owners may record a reasoned waiver. Immutable events retain the earlier time and unit outcome. A coach confirms no-show only after the accepted grace period; elapsed time alone does not consume a unit. Provider cancellation returns it. Inactive-coach recovery returns future holds, queues an owner review and requires client acceptance of a replacement. Missing promised notes enter a named delivery-review queue. Revised plans preserve earlier accepted delivery dates for settlement.

An optional adult third-party payer receives only the client's name and the agreed amount and terms. The client consents, the payer verifies their own account contact and explicitly accepts the terms, and dispatch rechecks current authority. Payment permission never grants intake, goals, appointments or notes. A payment received after revocation or service change is recorded without automatic activation and stays in review.

Closure stops delivery independently of money and record retrieval. The owner proposes a settlement against a fresh snapshot of unused units and undelivered notes; the client accepts it. Final settlement requires resolved delivery/record cases and exact verified refund or credit evidence when money is owed. A note saying that a refund was agreed is insufficient. Settled programs cannot silently reopen or reuse refunded funding.

### Scoped archives and receipts

The owner archive contains reviewed relational records, CSV copies, a data dictionary and exact form/source files with checksums. Separate MEMBER and PAYER archives enforce the requesting account's current authority. Member records include exact signed-form versions and imported signature receipts; payer records include only the account's transactions and their beneficiary links. CSV values resist spreadsheet formula interpretation; JSON retains source values. New database fields are not exported automatically.

Every product export excludes private coaching notes and unpublished drafts. General gym, member and payer archives also omit coaching intake and client-note content. The named adult client's separate program archive contains accepted plan versions, submitted intake/history, agreement evidence, milestones, published note revisions or withdrawal tombstones, appointment history, settlement and that program's transactions. It excludes other people's financial details. Older records without captured acceptance snapshots are identified as legacy evidence; missing historical agreements are not invented.

Prepared archives expire after 24 hours and maintenance removes their bytes. Downloads recheck identity, current permission and checksum. Receipt requires the recipient to confirm the downloaded checksum or archive explicitly; an HTTP download alone is insufficient. Failed, oversized or withdrawn archives remain visible to a named records reviewer and are not marked received.

### Billing handover and account closure

Access revocation checks every active owner's agreement, unresolved money, future services, coaching retrieval windows, fresh billing evidence and export freshness. Changed records require a fresh archive and review. Revocation retains history and cancels pending workspace notices.

Customer renewal stops are verified against the connected processor after accepted lifecycle actions. Billing handover either stops old renewals and requires separate payer authorization at the new provider, or retains the gym's existing connected processor with exact account, subscription, customer, payer and accepted-authority bindings. A named existing receiver accepts the immutable handover snapshot. Changed contracts, packs, balances or source evidence invalidate it and clear prior approvals. Remaining packs and credits retain their balances while an explicit agreement transfers responsibility. Copying records does not move cards or authorize a new charge. Actual external-system transfers and business agreements remain outside HitLink.

HitLink platform billing is checked independently against a subscription bound to the gym. An absent platform subscription, including an unspecified free-pilot arrangement, remains review-required. No fee-free business policy has been invented.

### Retention and restricted support

Termination does not itself delete records. A separate versioned retention case names custodians, purpose, scope, due date, retrieval requirements and holds. Every active owner approves its current scope. The designated account can use the restricted post-exit route after ordinary workspace access ends. Execution rechecks permissions, inventory, schema, foreign-key boundaries, retrieval and financial blockers under locks. Authorized database records and stored file bytes are removed transactionally, with an aggregate durable receipt and safe replay. Shared global user identities and authentication sessions are intentionally retained.

Current application file bytes are stored in the database. If an inventory names external storage, exact external deletion receipts are required; no unconfigured storage adapter is presented as automated. Backup handling remains a separate custodian/provider attestation with its own evidence. A database purge does not prove backup deletion, and a scheduled review is not proof that anything was deleted. Verification used fictional isolated fixtures only.

Owners can grant an existing named account read-only diagnostics for up to 24 hours and revoke it immediately. Each read logs access and rechecks expiry, revocation and owner authority. Support sees aggregate status and counts, without impersonation, mutations, exports, coaching content, form contents or payment details. Exceptional private-content review has the separate consent path described above.

### Import boundaries and operating configuration

Source imports preserve immutable accepted contracts, bounded paid-through evidence, original-system financial receipt chains, opening packs and allowance usage, explicitly funded future bookings, and exact current consent documents with original signed receipts. Owner acknowledgment and activation recheck funding, dates, forms, payer/guardian authority and the complete reviewed snapshot. Source financial rows remain labelled imported and do not acquire fabricated Stripe identifiers. A recorded source-system receipt is external evidence, not a Stripe-confirmed action. Unknown contract states, missing terms and ambiguous funding stay quarantined. Historical attendance, rank-history and private-note migrations are not automatic imports.

Source-billed cancellation and freeze use owner-recorded original PDF receipts, exact file bytes and checksums, matching source account and contract, and the original confirmation time. The owner attests to evidence against the immutable accepted policy and reviewed change. A configured future change applies the agreed access dates and booking consequences; at its boundary, it still requires evidence of completion rather than claiming that billing stopped. Completed receipts confirm the external action. A frozen contract blocks bookings after its proposed resume date until a supported resume receipt is recorded, and access still requires paid-through coverage. Withdrawal before cancellation and resumption use the same evidence path. A missing legacy account binding requires explicit owner evidence without rewriting the existing paid interval. These actions make no Stripe calls, create no Stripe identifiers and never restore cancelled seats. Business archives retain the source receipts and checksums.

The isolated demo seed contains the five approved daily classes: HIIT Bootcamp 7:15–8:30 a.m.; HIIT/Hyrox 4:30–5:30 p.m.; Beginner Padwork 5:30–6:30 p.m.; Beginner Muay Thai and Advanced Muay Thai 6:30–7:30 p.m. The simultaneous classes use separate rooms. Coaches may remain unassigned. The recurring demo membership remains pending payment; the usable class pack is an explicit fictional demo grant with an opening ledger. The seed has no fixed production date horizon or simulated provider payment, and it was checked for repeatability in a separate disposable database.

Before a live pilot, verify actual Stripe accounts, webhook signatures, hosted-return origins, the email provider, scheduled maintenance and backups. Suppress expired or superseded identity challenges and withdrawn publications. Complete the legal business and contact placeholders in Terms and Privacy. Configure and test the selected processor, retention and handover policies with the gym. Provider-dependent and review-required states remain visible until actual evidence resolves them.
