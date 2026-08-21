(() => {
  "use strict";

  const DEMO = Object.freeze({
    gym: "North Harbour Muay Thai & Conditioning",
    timezone: "America/Los_Angeles (PDT)",
    date: "Thursday, August 20, 2026",
    isoDate: "2026-08-20",
    nextDate: "2026-08-21",
    className: "Today Fundamentals",
    classTime: "6:00 PM–7:00 PM",
    room: "Main mat",
    coach: "Coach Maya Chen",
    member: "Avery Hernandez-Lawson",
    longMember: "Aleksandra-María Fernández de la Cruz-Watanabe",
    email: "operations+founding-gym-migration-review@northharbourmuaythai.example",
    templateId: "tmpl_nhmt_fundamentals_thursday_1800_2026",
    providerId: "acct_flowstate_prototype_01J9NORTHHARBOURMUAYTHAI",
    importId: "import_zenplanner_memberships_2026-08-18_batch-0001847",
  });

  const SURFACES = ["foundation", "dashboard", "operations", "member", "forms", "migration", "billing", "landing"];
  const SURFACE_LABELS = { foundation: "Shared foundation", dashboard: "Owner shell + dashboard", operations: "Schedule + roster + attendance", member: "Member schedule", forms: "Forms + owner setup routes", migration: "Migration", billing: "Billing + provider", landing: "Landing refinement" };
  const STATES = ["default", "loading", "empty", "working", "success", "validation", "unavailable", "stale", "permission", "provider-missing", "outage", "planned", "readonly", "waiting", "confirmation", "long"];
  const OWNER_ROUTES = [
    { id: "dashboard", label: "Dashboard", group: "Today", surface: "dashboard" },
    { id: "schedule", label: "Schedule", group: "Today", surface: "operations" },
    { id: "bookings", label: "Bookings", group: "Today", surface: "operations" },
    { id: "roster", label: "Roster & attendance", group: "Today", surface: "operations" },
    { id: "members", label: "Members", group: "People", surface: "forms" },
    { id: "staff-invites", label: "Staff invites", group: "People", surface: "forms" },
    { id: "billing", label: "Billing", group: "Revenue", surface: "billing" },
    { id: "membership-plans", label: "Membership plans", group: "Revenue", surface: "billing" },
    { id: "access-products", label: "Access products", group: "Revenue", surface: "billing" },
    { id: "billing-settings", label: "Billing settings", group: "Revenue", surface: "billing" },
    { id: "programs", label: "Programs", group: "Gym setup", surface: "forms" },
    { id: "rooms", label: "Rooms", group: "Gym setup", surface: "forms" },
    { id: "forms", label: "Forms", group: "Gym setup", surface: "forms" },
    { id: "migration", label: "Migration", group: "Launch", surface: "migration" },
  ];
  const DEFAULT_ROUTE = { foundation: "foundation", dashboard: "dashboard", operations: "schedule", member: "member-schedule", forms: "forms", migration: "migration", billing: "billing", landing: "landing" };
  const CLASSES = [
    { id: "engine", date: DEMO.isoDate, startTimeMinutes: 360, day: "Thursday · Aug 20", program: "Conditioning", time: "6:00 AM", title: "Hyrox Engine", meta: "Conditioning floor · Coach Luis · recurring template", capacity: "10 / 14", action: "roster" },
    { id: "fundamentals", date: DEMO.isoDate, startTimeMinutes: 1080, day: "Thursday · Aug 20", program: "Muay Thai", time: "6:00 PM", title: DEMO.className, meta: `${DEMO.room} · ${DEMO.coach} · recurring template`, capacity: "9 / 12", action: "book" },
    { id: "pads", date: DEMO.isoDate, startTimeMinutes: 1155, day: "Thursday · Aug 20", program: "Muay Thai", time: "7:15 PM", title: "Advanced Pads", meta: "Main mat · Coach Maya · recurring template", capacity: "12 / 12", action: "booked" },
    { id: "night-engine", date: DEMO.isoDate, startTimeMinutes: 1170, day: "Thursday · Aug 20", program: "Conditioning", time: "7:30 PM", title: "Hyrox Night Engine", meta: "Conditioning floor · Coach Luis", capacity: "12 / 12", action: "waitlist" },
    { id: "open-mat", date: DEMO.isoDate, startTimeMinutes: 1215, day: "Thursday · Aug 20", program: "Muay Thai", time: "8:15 PM", title: "Open Mat", meta: "Main mat · punch card eligible", capacity: "6 / 12", action: "punch" },
    { id: "drop-in", date: DEMO.isoDate, startTimeMinutes: 1035, day: "Thursday · Aug 20", program: "Conditioning", time: "5:15 PM", title: "Hyrox Drop-in", meta: "Conditioning floor · $28.00 drop-in", capacity: "11 / 14", action: "drop-in" },
    { id: "friday-conditioning", date: DEMO.nextDate, startTimeMinutes: 390, day: "Friday · Aug 21", program: "Conditioning", time: "6:30 AM", title: "Friday Engine", meta: "Conditioning floor · Coach Luis · recurring template", capacity: "8 / 14", action: "book" },
  ];

  const app = document.querySelector("#prototype-main");
  const surfaceSelect = document.querySelector("#surface-select");
  const stateSelect = document.querySelector("#state-select");
  const menu = document.querySelector("#prototype-menu");
  const galleryControlsDisclosure = document.querySelector(".gallery-controls-disclosure");
  const simulationBoundary = document.querySelector(".simulation-boundary");
  const galleryMenuOpener = document.querySelector('.gallery-header [data-action="menu-open"]');
  const announcer = document.querySelector("#live-announcer");
  let lastMenuOpener = galleryMenuOpener;
  let localActionCounter = 0;

  const runtime = {
    world: "a",
    surface: "foundation",
    route: "foundation",
    state: "default",
    view: "schedule",
    selectedClass: "",
    rosterOrigin: "",
    memberContext: "",
    formContext: "",
    role: "owner",
    attendance: { avery: "PRESENT", jordan: "", sam: "ERROR", priya: "STALE" },
    memberActions: { fundamentals: "available", pads: "booked", "night-engine": "full", "open-mat": "punch", "drop-in": "drop-in" },
    filters: { program: "All programs", date: DEMO.isoDate },
    formReview: false,
    formResult: false,
    migrationResult: false,
    landingSubmitted: false,
  };

  function safeChoice(value, values, fallback) { return values.includes(value) ? value : fallback; }
  function escapeSelector(value) { return window.CSS?.escape ? CSS.escape(value) : value.replace(/[^a-z0-9_-]/gi, ""); }
  function status(label, tone = "neutral") { return `<span class="status-stamp status-${tone}">${label}</span>`; }
  function announce(message) {
    announcer.textContent = "";
    window.setTimeout(() => { announcer.textContent = message; }, 10);
  }
  function focusTarget(selector) {
    const target = app.querySelector(selector) || document.querySelector(selector);
    target?.focus({ preventScroll: true });
  }

  function displayNameForSlug(slug) {
    return { "avery-hernandez-lawson": DEMO.member, "micah-thompson": "Micah Thompson", "sam-rivera": "Sam Rivera" }[slug] || slug.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function showResettableAction(button, message) {
    const key = `local-action-${++localActionCounter}`;
    button.dataset.localActionTrigger = key;
    button.disabled = true;
    button.setAttribute("aria-describedby", `${key}-message`);
    button.insertAdjacentHTML("afterend", `<div class="local-action-result" data-local-action-result="${key}"><p id="${key}-message" class="inline-result" role="status">${message}</p><button type="button" class="secondary-action" data-action="local-action-reset" data-local-action-key="${key}">Dismiss and reset</button></div>`);
    announce(message);
  }

  function prototypeBanner(persona, outcome) {
    return `<div class="prototype-strip" role="note">${status("Prototype", "info")}<p><strong>${persona} outcome:</strong> ${outcome}</p></div>`;
  }

  const STATE_COPY = {
    loading: ["Loading current information", "The affected region is replaced until current information arrives. Zero values are not presented as facts."],
    empty: ["No matching records", "The request completed with no records. Clear filters or use the safe next step."],
    working: ["Action pending", "The local prototype action is in progress. Its duplicate control is disabled and no success is implied."],
    success: ["Prototype result", "The local prototype result is shown below. Nothing was saved or sent."],
    validation: ["Review the linked fields", "Values remain available for correction and focus moves to the associated error summary."],
    unavailable: ["Action unavailable", "This action is not available yet. Flowstate must finish reviewing it with the gym owner before it can be used."],
    stale: ["Current information changed", "Fresh information is shown for review before another local action."],
    permission: ["This role cannot view this area", "Restricted record details and owner actions are absent. Return to the role-safe Today view."],
    "provider-missing": ["Stripe setup missing", "Online billing is not connected. The owner completes setup next; no Stripe call occurred."],
    outage: ["Stripe status unavailable", "Availability could not be verified. Do not retry a money action until status is known."],
    planned: ["Planned", "This capability is not implemented and has no interactive production control."],
    readonly: ["Read-only evidence", "Current evidence is visible, while all mutation controls are removed."],
    waiting: ["Waiting for the next role", "The prior step is complete. The affected controls stay disabled until the named role responds."],
    confirmation: ["Review before confirming", "Review loss, legal, money, or snapshot consequences before choosing the local-only confirmation."],
    long: ["Long-content stress", "Human labels stay primary. Full prototype references are available only in collapsed Technical reference sections."],
  };

  const STATE_RECOVERY = Object.freeze({
    dashboard: {
      unavailable: { object: "avery-billing", action: `Review ${DEMO.member} billing`, reason: "Stripe setup is missing, so the payment recovery action cannot run.", nextRole: "Owner completes Stripe setup, then reviews the current local billing evidence.", recovery: "Review current dashboard" },
      stale: { object: "avery-billing-queue", label: `${DEMO.member} billing queue item`, prior: "$145.00 payment failed; grace period ended Aug 22", current: "$145.00 payment failed; grace period ends Aug 23 as of 2:18 PM PDT", nextRole: "Owner may review the current billing information now.", recovery: "Review current dashboard" },
    },
    operations: {
      unavailable: { object: "marcel-waitlist-promotion", action: "Promote Marcel Dubois", reason: "Assigned-coach authority and the current access recheck are not confirmed in this prototype.", nextRole: "Owner reviews the assigned coach and current access evidence.", recovery: "Review current schedule" },
      stale: { object: "priya-attendance", label: "Today Fundamentals attendance for Priya Nanduri", prior: "Not recorded", current: "Late; changed by Coach Maya at 2:12 PM PDT", nextRole: "Owner or assigned coach may review the current row now.", recovery: "Review current attendance information" },
    },
    member: {
      unavailable: { object: "fundamentals-booking", action: "Book Today Fundamentals", reason: "The booking cutoff has passed for this dated class.", nextRole: "Member chooses another currently available dated class.", recovery: "Review current class schedule" },
      stale: { object: "night-engine-capacity", label: "Hyrox Night Engine capacity", prior: "11 / 12; one seat available", current: "12 / 12; Waitlist available as of 2:18 PM PDT", nextRole: "Member may review the current class information now.", recovery: "Review current class schedule" },
    },
    forms: {
      unavailable: { object: "sam-replacement-request", action: "Create a replacement signing request", reason: "Sam Rivera already has an open signing request that expires Aug 27, 2026, 11:59 PM PDT.", nextRole: "Owner reviews the existing request; no new request or email is created here.", recovery: "Review current form library" },
      stale: { object: "sam-guardian-waiver", label: "Sam Rivera Guardian waiver", prior: "No current signing-request evidence shown", current: "Open signing request via Magic link; expires Aug 27, 2026, 11:59 PM PDT", nextRole: "Owner may review the current request now.", recovery: "Review current form information" },
    },
    migration: {
      unavailable: { object: "migration-acknowledgment", action: "Confirm migration acknowledgment", reason: "The completed migration snapshot is read-only and already has recorded owner and Flowstate reviews.", nextRole: "Daily operations team reviews the completed evidence.", recovery: "Review current migration evidence" },
      stale: { object: "completed-migration-snapshot", label: "Completed migration snapshot", prior: "183 members added; 12 guardian links updated", current: "184 members added; 12 guardian links updated as of 2:18 PM PDT", nextRole: "Owner and daily operations team may review the current snapshot now.", recovery: "Review current migration evidence" },
    },
    billing: {
      unavailable: { object: "avery-payment-retry", action: `Retry ${DEMO.member} payment`, reason: "Stripe setup is missing, so no provider retry can be attempted.", nextRole: "Owner completes Stripe setup and then reviews provider availability.", recovery: "Review current billing evidence" },
      stale: { object: "avery-local-billing", label: `${DEMO.member} local billing record`, prior: "Grace period ends Aug 22", current: "Grace period ends Aug 23 as of 2:18 PM PDT; Stripe remains unconnected", nextRole: "Owner may review the current local evidence now.", recovery: "Review current billing evidence" },
    },
    landing: {
      unavailable: { object: "founding-interest-request", action: "Send a Founding Gym interest request", reason: "This local prototype stores and sends nothing.", nextRole: "Prospective owner reviews the current unresolved Founding Gym terms.", recovery: "Review current Founding Gym information" },
      stale: { object: "landing-product-preview", label: "Today Fundamentals product preview", prior: "8 / 12 booked", current: "9 / 12 booked as of 2:18 PM PDT", nextRole: "Prospective owner may review the current fictional preview now.", recovery: "Review current product preview" },
    },
    foundation: {
      unavailable: { object: "foundation-comparison", action: "Choose a production visual direction", reason: "This artifact compares two approved prototype worlds but cannot approve production use.", nextRole: "Jacky reviews the current decision evidence.", recovery: "Review current comparison" },
      stale: { object: "foundation-comparison", label: "Visual comparison evidence", prior: "Earlier hierarchy evidence", current: "Pass-2 hierarchy evidence as of 2:18 PM PDT", nextRole: "Design reviewer may review the current comparison now.", recovery: "Review current comparison" },
    },
  });

  function stateHeading() {
    if (runtime.state === "default" || runtime.state === "long") return "";
    let [label, copy] = STATE_COPY[runtime.state];
    if (runtime.state === "unavailable") {
      const recovery = STATE_RECOVERY[runtime.surface].unavailable;
      label = `${recovery.action} unavailable`;
      copy = `Reason: ${recovery.reason} Next responsible actor: ${recovery.nextRole}`;
    } else if (runtime.state === "stale") {
      const recovery = STATE_RECOVERY[runtime.surface].stale;
      label = `${recovery.label} changed`;
      copy = `Prior value: ${recovery.prior}. Current value: ${recovery.current}. ${recovery.nextRole}`;
    }
    const tone = ["validation", "stale", "outage"].includes(runtime.state) ? "critical" : runtime.state === "success" ? "positive" : ["loading", "working", "provider-missing", "confirmation", "waiting"].includes(runtime.state) ? "caution" : "info";
    const statusLabel = runtime.state === "unavailable" ? "Action unavailable" : runtime.state === "stale" ? "Information changed" : label;
    return `<section class="state-lens state-${runtime.state}" aria-labelledby="state-lens-title"><div aria-hidden="true" class="state-glyph">${runtime.state === "success" ? "✓" : runtime.state === "loading" || runtime.state === "working" || runtime.state === "waiting" ? "…" : ["validation", "stale", "outage"].includes(runtime.state) ? "!" : "i"}</div><div><p class="micro-label">Selected state lens</p><h2 id="state-lens-title" tabindex="-1">${label}</h2><p>${copy}</p></div>${status(statusLabel, tone)}</section>`;
  }

  function loadingRegion(surface) {
    const counts = { foundation: 9, dashboard: 12, operations: 15, member: 10, forms: 16, migration: 11, billing: 13, landing: 8 };
    return `<section class="loading-region skeleton-${surface}" data-skeleton="${surface}" aria-busy="true" aria-labelledby="loading-${surface}"><p id="loading-${surface}" class="loading-status" role="status" aria-live="polite">Loading ${surface === "foundation" ? "design foundation" : surface} current information…</p><div class="surface-skeleton" aria-hidden="true">${Array.from({ length: counts[surface] }, (_, index) => `<span class="bone bone-${index + 1}"></span>`).join("")}</div></section>`;
  }

  function genericStateRegion(surface) {
    if (runtime.state === "loading") return loadingRegion(surface);
    if (runtime.state === "empty") return `<section class="state-replacement empty-replacement"><h2 tabindex="-1">Nothing here yet</h2><p>No ${surface} records match this lens. The previous loaded records and their actions are not rendered.</p><button type="button" data-action="clear-state">Return to default</button></section>`;
    if (runtime.state === "working") return `<section class="state-replacement" aria-busy="true"><h2 tabindex="-1">Local action pending</h2><p>The affected control stays unavailable while this prototype request is pending.</p><button type="button" disabled aria-describedby="working-reason">Working…</button><p id="working-reason">Disabled to prevent a duplicate local action.</p></section>`;
    if (runtime.state === "success") return `<section class="state-replacement success-replacement"><h2 tabindex="-1">Local prototype result</h2><p>Nothing was saved, sent, charged, booked, signed, or changed outside this tab.</p><button type="button" data-action="clear-state">Reset this result</button></section>`;
    if (runtime.state === "validation") return `<section class="state-replacement validation-replacement"><div class="error-summary" id="state-errors" role="alert" tabindex="-1"><strong>Review one required choice</strong><a href="#state-recovery">Choose a safe recovery route.</a></div><label for="state-recovery">Recovery route <span>Required</span></label><select id="state-recovery" aria-invalid="true" aria-describedby="state-recovery-error"><option value="">Choose one</option><option>Return to current information</option></select><p id="state-recovery-error">Choose a route before continuing.</p><button type="button" data-action="clear-state">Reset validation</button></section>`;
    if (runtime.state === "unavailable") {
      const recovery = STATE_RECOVERY[surface].unavailable;
      return `<section class="state-replacement unavailable-replacement" data-state-object="${recovery.object}" data-current-value="unavailable" data-next-role="${recovery.nextRole}"><h2 tabindex="-1">${recovery.action} unavailable</h2><p><strong>Reason:</strong> ${recovery.reason}</p><p><strong>Next responsible actor:</strong> ${recovery.nextRole}</p><button type="button" data-action="clear-state">${recovery.recovery}</button><details><summary>Technical reference</summary><p>The blocked action is absent. This safe recovery only returns to current fictional information.</p></details></section>`;
    }
    if (runtime.state === "stale") {
      const recovery = STATE_RECOVERY[surface].stale;
      return `<section class="state-replacement stale-replacement" data-state-object="${recovery.object}" data-prior-value="${recovery.prior}" data-current-value="${recovery.current}" data-next-role="${recovery.nextRole}"><h2 tabindex="-1">${recovery.label} changed</h2><p><strong>Prior value:</strong> ${recovery.prior}</p><p><strong>Current value:</strong> ${recovery.current}</p><p><strong>Permitted actor and time:</strong> ${recovery.nextRole}</p><button type="button" data-action="clear-state">${recovery.recovery}</button></section>`;
    }
    if (runtime.state === "permission") return `<section class="state-replacement permission-replacement"><h2 tabindex="-1">Safe recovery for this role</h2><p>Owner-only routes, member names, amounts, and record details are absent from this region.</p><button type="button" data-action="coach-today">Open Coach Today</button></section>`;
    if (runtime.state === "provider-missing") return `<section class="state-replacement"><h2 tabindex="-1">Stripe setup missing</h2><p>No connected account is configured. The owner completes setup next; readable local records are not treated as Stripe evidence.</p><button type="button" disabled aria-describedby="provider-setup-reason">Continue with Stripe</button><p id="provider-setup-reason">Disabled in this local prototype. No external call can be made.</p></section>`;
    if (runtime.state === "outage") return `<section class="state-replacement"><h2 tabindex="-1">Stripe status unavailable</h2><p>This lens proves only that availability could not be verified. It does not claim an outage or a successful money action.</p><button type="button" disabled aria-describedby="provider-status-reason">Retry money action</button><p id="provider-status-reason">Disabled until Stripe status is known.</p></section>`;
    if (runtime.state === "planned") return `<section class="state-replacement planned-replacement"><h2 tabindex="-1">Planned direction only</h2><p>No active control, route promise, saved record, or production availability is represented.</p></section>`;
    if (runtime.state === "readonly") return `<section class="state-replacement"><h2 tabindex="-1">Read-only evidence</h2><p>The current evidence can be reviewed. Mutation controls are intentionally absent.</p><button type="button" data-action="clear-state">Return to interactive prototype</button></section>`;
    if (runtime.state === "waiting") return `<section class="state-replacement"><h2 tabindex="-1">Waiting on Flowstate review</h2><p>The owner step is complete. Flowstate is the next role; duplicate controls are disabled.</p><button type="button" disabled aria-describedby="waiting-reason">Waiting</button><p id="waiting-reason">No owner action is available while review is pending.</p></section>`;
    if (runtime.state === "confirmation") return `<section class="state-replacement confirmation-panel"><h2 tabindex="-1">Review before confirming</h2><p>This comparison state does not perform a production action. Review the affected scope before continuing.</p><button type="button" data-action="prototype-message" data-message="Local prototype confirmation shown. Nothing was saved.">Confirm local result</button><button type="button" class="secondary-action" data-action="clear-state">Cancel</button></section>`;
    return "";
  }

  function surfaceFrame({ surface, eyebrow, title, description, content, persona, outcome, aside = "" }) {
    const replacement = runtime.state !== "default" && runtime.state !== "long" ? genericStateRegion(surface) : content;
    const renderedAside = runtime.state === "loading" ? "" : aside;
    return `<article class="surface ${surface}-surface">${prototypeBanner(persona, outcome)}<header class="surface-title"><div><p class="micro-label">${eyebrow}</p><h1 id="context-heading" tabindex="-1">${title}</h1><p>${description}</p></div>${renderedAside}</header>${stateHeading()}${replacement}</article>`;
  }

  function ownerRail() {
    const groups = [...new Set(OWNER_ROUTES.map((route) => route.group))];
    return `<nav class="owner-rail" aria-label="Owner prototype navigation"><div class="rail-identity"><span>NH</span><div><strong>${DEMO.gym}</strong><small>One location · Owner</small></div></div>${groups.map((group) => `<div class="nav-group"><p>${group}</p>${OWNER_ROUTES.filter((route) => route.group === group).map((route) => `<a href="?surface=${route.surface}&route=${route.id}" data-route-link="${route.id}" data-route-surface="${route.surface}" ${route.id === runtime.route ? 'aria-current="page"' : ""}>${route.label}</a>`).join("")}</div>`).join("")}<div class="rail-utility"><span>Signed-in owner</span><button type="button" data-action="prototype-message" data-message="Local prototype only: no session ended.">Log out</button></div></nav>`;
  }

  function ownerShell(content) {
    return `<div class="owner-shell">${ownerRail()}<div class="owner-workspace"><header class="workspace-header"><button class="shell-menu" type="button" data-action="menu-open" aria-controls="prototype-menu" aria-expanded="false">Menu</button><div><span>${DEMO.date}</span><strong>${DEMO.timezone}</strong></div>${status("Owner", "info")}</header>${content}</div></div>`;
  }

  function coachShell(framedContent = "") {
    const coachContent = framedContent || surfaceFrame({
      surface: "operations",
      eyebrow: "Coach Today · assigned work only",
      title: "Coach Today",
      description: `${DEMO.date} · assigned classes · owner routes absent`,
      persona: "Assigned coach",
      outcome: "open today’s assigned roster without seeing owner-only routes",
      aside: status("Coach", "info"),
      content: `<section class="coach-today-card"><h2>Today’s assigned class</h2><p><strong>${DEMO.className}</strong> · ${DEMO.classTime} · ${DEMO.room}</p><button id="coach-roster-fundamentals" type="button" data-action="open-roster" data-class="fundamentals" data-origin-key="coach-roster-fundamentals" data-origin-context="coach">Open ${DEMO.className} roster</button><button type="button" class="secondary-action" data-action="owner-demo">Return to owner prototype</button></section>`,
    });
    return `<div class="coach-shell"><header class="coach-header"><strong>Flowstate · Coach Today</strong><nav aria-label="Coach navigation"><a href="?surface=operations&role=coach" aria-current="page">Today</a></nav></header>${coachContent}</div>`;
  }

  function foundationSurface() {
    const stateRows = [
      ["Loading", "…", "Surface-specific static geometry replaces loaded facts."], ["Empty", "○", "A successful zero removes prior records."], ["Working", "↻", "Affected action is disabled while pending."], ["Success", "✓", "Local result; nothing saved."],
      ["Validation", "!", "Focused summary and associated fields."], ["Action unavailable", "⊘", "Cause and next role are explicit."], ["Stale", "↯", "Fresh information must be reviewed."], ["Permission", "◇", "Restricted details and routes are absent."],
      ["Setup missing", "□", "Owner acts next; no Stripe call."], ["Status unavailable", "△", "Availability unknown; no outage claim."], ["Planned", "·", "Non-interactive direction."], ["Review", "!", "Consequences precede confirmation."],
    ];
    const content = `<section class="world-theses" aria-labelledby="world-theses-title"><h2 id="world-theses-title">Visual-world contract</h2><div class="thesis-grid"><article><span class="world-letter">A</span><p class="micro-label">Field Ledger · recommended compact base</p><h3>Ringside operations, without theater.</h3><p>Mineral, graphite, cobalt, vermilion, teal, rectangular geometry, hairlines, compact owner rows, and roomier member actions.</p></article><article><span class="world-letter">B</span><p class="micro-label">Training Signal · contrast world</p><h3>Time, capacity, next action.</h3><p>Midnight, ice, sky, lime, and coral. Fewer grouped signal panels retain its athletic thesis without excessive card repetition.</p></article><aside><p class="micro-label">Documented fallback</p><h3>C · Paper Workshop</h3><p>Retained as documentation only; this bounded decision compares A and B.</p></aside></div></section><section class="semantic-section" aria-labelledby="semantic-title"><div class="section-heading"><div><p class="micro-label">Shared semantics</p><h2 id="semantic-title">Every state changes the affected surface.</h2></div><p>Labels, shape, explanation, disabled controls, and safe recovery work without color alone.</p></div><ul class="state-grid">${stateRows.map(([label, icon, copy], index) => `<li><span class="state-icon" aria-hidden="true">${icon}</span><div><strong>${label}</strong><p>${copy}</p></div>${status(index % 3 === 0 ? "Evidence" : index % 3 === 1 ? "Reason" : "Recovery", index % 4 === 0 ? "positive" : index % 4 === 1 ? "caution" : index % 4 === 2 ? "critical" : "info")}</li>`).join("")}</ul></section><section class="type-specimen"><div><p class="micro-label">Typography + exact values</p><h2>The class starts at <span>6:00 PM</span>.</h2><p>${DEMO.className} · ${DEMO.room} · 9 booked / 12 capacity · ${DEMO.timezone}</p></div><dl><div><dt>Operating unit</dt><dd>Recurring template + gym-local date</dd></div><div><dt>Roles</dt><dd>Owner · Coach · Member</dd></div></dl><details><summary>Technical reference</summary><p>${runtime.state === "long" ? DEMO.templateId : "Full template reference hidden in normal reading order."}</p></details></section>`;
    return surfaceFrame({ surface: "foundation", eyebrow: "01 · Shared foundation gallery", title: "Same truth. Two operating tempos.", description: "A Field Ledger compresses evidence into aligned rows. B Training Signal concentrates time and next action in fewer signal groups.", persona: "Design reviewers", outcome: "compare two distinct systems against one truthful contract", content });
  }

  function readinessTuple() {
    return `<section class="operational-gate" role="note"><p><span class="micro-label">Operational gate</span><strong>Ready for daily operations</strong> · 3 follow-ups still need attention.</p>${status("Gate ready", "positive")}</section>`;
  }

  function readinessDetails() {
    return `<details class="readiness-details"><summary>View full readiness evidence</summary><div class="readiness-tuple"><dl><div><dt>Gym status</dt><dd>Ready for daily operations</dd></div><div><dt>Migration</dt><dd>Complete</dd></div><div><dt>Owner review</dt><dd>Recorded · Jordan Lee · Aug 19, 4:08 PM PDT</dd></div><div><dt>Flowstate readiness review</dt><dd>Recorded · Aug 19, 4:22 PM PDT</dd></div></dl><details><summary>Technical reference</summary><p>Workspace ACTIVE · MigrationStage COMPLETE · owner-review tuple persisted · operational-readiness tuple persisted · derived gate READY.</p></details></div></details>`;
  }

  function dashboardSurface() {
    const content = `${readinessTuple()}<div class="dashboard-grid"><section class="action-queue"><div class="section-heading compact"><div><p class="micro-label">Risk ordered</p><h2>Needs action</h2></div><span>3 items</span></div><ol><li class="severity-critical"><span class="queue-index">01</span><div><strong>Payment failed · ${DEMO.member}</strong><p>$145.00 USD · failed 9:14 AM · grace period ends Aug 23</p></div>${status("Payment failed", "critical")}<a href="?surface=billing&route=billing&member=avery-hernandez-lawson" data-route-link="billing" data-route-surface="billing" data-member-context="avery-hernandez-lawson">Review ${DEMO.member} billing</a></li><li class="severity-caution"><span class="queue-index">02</span><div><strong>Attendance not recorded · ${DEMO.className}</strong><p>${DEMO.classTime} · class ended 7:00 PM</p></div>${status("Attendance gap", "caution")}<a href="?surface=operations&route=roster&view=roster&class=fundamentals&date=${DEMO.isoDate}" data-route-link="roster" data-route-surface="operations" data-view="roster" data-class-context="fundamentals">Open ${DEMO.className} roster for Aug 20</a></li><li><span class="queue-index">03</span><div><strong>Guardian waiver needs a current signature</strong><p>Sam Rivera · current guardian requirement</p></div>${status("Signature needed", "info")}<a href="?surface=forms&route=forms&form=guardian-waiver&member=sam-rivera" data-route-link="forms" data-route-surface="forms" data-form-context="guardian-waiver" data-member-context="sam-rivera">Review Sam Rivera current guardian requirement</a></li></ol></section><section class="today-list"><div class="section-heading compact"><div><p class="micro-label">Chronological</p><h2>Today’s classes</h2></div><span>3 scheduled classes</span></div><ol><li><time>6:00 AM</time><div><strong>Hyrox Engine</strong><p>Coach Luis · Conditioning floor</p></div><span>10 / 14</span>${status("Attendance recorded", "positive")}</li><li class="current"><time>6:00 PM</time><div><strong>${DEMO.className}</strong><p>${DEMO.coach} · ${DEMO.room}</p></div><span>9 / 12</span>${status("Attendance gap", "caution")}</li><li><time>7:30 PM</time><div><strong>Hyrox Night Engine</strong><p>Coach Luis · Conditioning floor</p></div><span>12 / 12</span>${status("Full", "caution")}</li></ol></section>${readinessDetails()}<details class="setup-evidence"><summary>First-run setup evidence · Complete</summary><div class="setup-evidence-body"><div class="section-heading compact"><div><p class="micro-label">First-run lens</p><h2>Setup evidence</h2></div>${status("Complete", "positive")}</div><dl><div><dt>Primary location</dt><dd>North Harbour · one location</dd></div><div><dt>Rooms</dt><dd>Main mat · Conditioning floor</dd></div><div><dt>Programs</dt><dd>Muay Thai · Conditioning · Youth</dd></div><div><dt>Staff</dt><dd>Owner + 3 coaches</dd></div></dl><button type="button" data-action="coach-today">Preview permission-safe Coach Today</button></div></details></div>`;
    return ownerShell(surfaceFrame({ surface: "dashboard", eyebrow: "02 · Returning dashboard", title: "Today at North Harbour", description: `${DEMO.date} · ${DEMO.timezone}`, persona: "Owner", outcome: "see current risk and open the exact next task", content }));
  }

  function filterClasses() {
    return CLASSES.filter((item) => item.date === runtime.filters.date && (runtime.filters.program === "All programs" || item.program === runtime.filters.program)).sort((a, b) => a.startTimeMinutes - b.startTimeMinutes || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }

  function filterBar() {
    return `<div class="filter-bar"><label>Date<input type="date" value="${runtime.filters.date}" data-action="date-filter"></label><label>Program<select data-action="program-filter"><option ${runtime.filters.program === "All programs" ? "selected" : ""}>All programs</option><option ${runtime.filters.program === "Muay Thai" ? "selected" : ""}>Muay Thai</option><option ${runtime.filters.program === "Conditioning" ? "selected" : ""}>Conditioning</option></select></label><button type="button" data-action="clear-filters">Clear filters</button></div>`;
  }

  function scheduleView() {
    const classes = filterClasses();
    const dateLabel = runtime.filters.date === DEMO.isoDate ? "Thursday, August 20" : runtime.filters.date === DEMO.nextDate ? "Friday, August 21" : runtime.filters.date;
    return `<section class="schedule-board" aria-labelledby="schedule-heading"><div class="section-heading"><div><p class="micro-label">Template-derived dated view</p><h2 id="schedule-heading" tabindex="-1">${dateLabel} schedule</h2></div><p>${runtime.filters.program} · ${classes.length} ${classes.length === 1 ? "class" : "classes"}</p></div>${filterBar()}${classes.length ? `<ol class="class-list">${classes.map((item) => `<li id="class-row-${item.id}" data-start-minutes="${item.startTimeMinutes}" class="${item.id === "fundamentals" ? "featured" : ""}"><time>${item.time}</time><div><strong>${item.title}</strong><p>${item.meta}</p>${item.id === "fundamentals" ? '<span class="current-label">Current class</span>' : ""}</div><span>${item.capacity}</span>${status(item.capacity === "12 / 12" ? "Full" : "Open", item.capacity === "12 / 12" ? "caution" : "positive")}<button id="roster-origin-${item.id}" type="button" class="${item.id === "fundamentals" ? "primary-action" : "secondary-action"}" data-action="open-roster" data-class="${item.id}" data-origin-key="roster-origin-${item.id}" aria-label="Open ${item.title} roster for ${dateLabel}">Open roster</button></li>`).join("")}</ol>` : `<div class="empty-day" role="status"><strong>No classes match</strong><span>${runtime.filters.program} on ${dateLabel}. Clear filters to return to Aug 20.</span></div>`}</section>`;
  }

  function attendanceRow(id, name, meta, current) {
    const states = [["PRESENT", "Present"], ["LATE", "Late"], ["ABSENT", "Absent"], ["NO_SHOW", "No-show"]];
    const plain = { PRESENT: "Present", LATE: "Late", ABSENT: "Absent", NO_SHOW: "No-show" };
    const rowState = current === "ERROR" ? `${status("Preview error", "critical")}<p>The local preview failed. Selection is preserved; nothing was saved.</p><button type="button" data-action="attendance-retry" data-member="${id}">Retry ${name} preview</button>` : current === "STALE" ? `${status("Current information changed", "caution")}<p>Coach Maya changed this record at 2:12 PM. Review the fresh value before another local preview.</p><button type="button" data-action="attendance-latest" data-member="${id}">Load ${name} current attendance</button>` : current ? `${status("Preview only", "info")}<p>${plain[current]} · not saved</p>` : `${status("Not recorded", "neutral")}<p>Choose one preview state. No bulk action.</p>`;
    return `<li class="attendance-row" data-attendance-row="${id}" tabindex="-1"><div class="attendee"><strong>${name}</strong><p>${meta}</p></div><div class="attendance-options" role="group" aria-label="Attendance for ${name}">${states.map(([value, label]) => `<button type="button" data-action="attendance" data-member="${id}" data-value="${value}" aria-pressed="${current === value}">${label}</button>`).join("")}</div><div class="row-state" id="${id}-state">${rowState}</div></li>`;
  }

  function rosterView() {
    const selected = CLASSES.find((item) => item.id === runtime.selectedClass) || CLASSES[1];
    const backLabel = { dashboard: "Back to Today", schedule: "Back to Schedule", coach: "Back to Coach Today" }[runtime.rosterOrigin] || "Back to Schedule";
    return `<section class="roster-view" aria-labelledby="roster-heading"><button type="button" class="back-action" data-action="history-back">← ${backLabel}</button><header class="roster-header"><div><p class="micro-label">Exact roster context</p><h2 id="roster-heading" tabindex="-1">${selected.title}</h2><p>${runtime.filters.date === DEMO.isoDate ? DEMO.date : "Friday, August 21, 2026"} · ${selected.time} · ${DEMO.timezone}</p></div><dl><div><dt>Booked</dt><dd>9 / 12</dd></div><div><dt>Trials</dt><dd>1</dd></div><div><dt>Waiting</dt><dd>2</dd></div></dl></header><div class="roster-warning" role="note"><strong>Preview only.</strong><span>Selections update this browser tab only and are never saved. Choose one state per row; no bulk action.</span><details><summary>Technical reference</summary><p>Production B6 requires one atomic AttendanceRecord + booking projection write with stale-conflict rejection.</p></details></div><ul class="attendance-list">${attendanceRow("avery", DEMO.member, "Membership · booked · no safety notes", runtime.attendance.avery)}${attendanceRow("jordan", "Jordan Okafor", "Punch card · booked · asthma inhaler noted", runtime.attendance.jordan)}${attendanceRow("sam", "Sam Rivera", "Trial · guardian Elena Rivera · signature needed", runtime.attendance.sam)}${attendanceRow("priya", "Priya Nanduri", "Membership · booked · coach note available", runtime.attendance.priya)}</ul><details class="waitlist-disclosure" open><summary>Waitlist · 2 people in FIFO order</summary><ol><li><div><strong>1 · Marcel Dubois</strong><p>Monthly membership access · promotion creates one confirmed class booking and consumes no punch.</p></div><button type="button" data-action="waitlist-promote">Review Marcel Dubois promotion</button></li><li><div><strong>2 · Hana Petrovic</strong><p>Access review required if next; do not silently skip.</p></div>${status("Access review required if next", "caution")}</li></ol><p><strong>Assignment check:</strong> Before promotion, Flowstate must confirm the coach is still assigned.</p><details><summary>Technical reference</summary><p>Production B3 requires a server-side assigned-coach recheck before producing raw BOOKED state.</p></details><div id="promotion-receipt" role="status"></div></details>`;
  }

  function operationsSurface() {
    const content = runtime.view === "roster" ? rosterView() : scheduleView();
    const framed = surfaceFrame({ surface: "operations", eyebrow: "03 · Connected operational context", title: "Schedule, roster & attendance", description: `${DEMO.gym} · one location · date and program context preserved`, persona: runtime.role === "coach" ? "Assigned coach" : "Owner or assigned coach", outcome: "move from a filtered date into the exact roster and return with context intact", aside: status(runtime.view === "roster" ? "Roster view" : "Schedule view", "info"), content });
    if (runtime.state === "permission") return coachShell();
    if (runtime.role === "coach") {
      if (runtime.view !== "roster") return coachShell();
      const coachRoster = surfaceFrame({ surface: "operations", eyebrow: "Assigned work · exact class context", title: "Assigned class roster", description: `${DEMO.gym} · ${DEMO.date} · assigned class`, persona: "Assigned coach", outcome: "review the exact assigned roster and preview attendance without owner-only routes", aside: status("Roster view", "info"), content });
      return coachShell(coachRoster);
    }
    return ownerShell(framed);
  }

  function ownerBookingsSurface() {
    const content = `<section class="owner-bookings" aria-labelledby="owner-bookings-heading"><div class="section-heading"><div><p class="micro-label">Owner booking context · today</p><h2 id="owner-bookings-heading">Class booking records</h2></div><span>3 classes</span></div><ol><li><time>6:00 PM</time><div><strong>${DEMO.className}</strong><p>${DEMO.member} · membership · booked</p></div>${status("9 / 12", "positive")}</li><li><time>7:30 PM</time><div><strong>Hyrox Night Engine</strong><p>12 booked · 2 waiting</p></div>${status("Full", "caution")}</li><li><time>8:15 PM</time><div><strong>Open Mat</strong><p>Punch-card and drop-in access remain distinct.</p></div>${status("6 / 12", "positive")}</li></ol></section>`;
    return ownerShell(surfaceFrame({ surface: "operations", eyebrow: "Owner · Bookings", title: "Class bookings", description: `${DEMO.date} · one-location owner booking context`, persona: "Owner", outcome: "review class booking records without entering the member portal", aside: status("Owner view", "info"), content }));
  }

  function memberAccess(item) {
    const state = runtime.memberActions[item.id] || item.action;
    if (["booked", "punch-booked"].includes(state)) return `<span data-dominant-member-state>${status("Booked", "positive")}</span>`;
    if (state === "waitlisted") return `<span data-dominant-member-state>${status("Waitlisted", "caution")}</span>`;
    if (state === "full") return `<span data-dominant-member-state>${status("Waitlist available", "caution")}</span>`;
    if (item.id === "open-mat") return `<span data-dominant-member-state>${status(`Use 1 punch · Punch card · ${state === "punch-late" ? 4 : 5} remaining`, "positive")}</span>`;
    if (item.id === "drop-in") return `<span data-dominant-member-state>${status(state === "dropin-pending" ? "$28 drop-in · payment pending" : "$28 drop-in · payment required", state === "dropin-pending" ? "caution" : "info")}</span>`;
    return `<span data-dominant-member-state>${status("Available with membership", "positive")}</span>`;
  }

  function memberAction(item) {
    const state = runtime.memberActions[item.id] || item.action;
    if (state === "available" || state === "book") return `<button type="button" class="${item.id === "fundamentals" ? "primary-action" : "secondary-action"}" data-action="member-book" data-key="${item.id}">Book ${item.title}</button><p class="action-reason">Eligible monthly membership · local prototype only.</p>`;
    if (state === "booked") return `<button type="button" class="secondary-action" data-action="member-book" data-key="${item.id}">Booked · reset ${item.title}</button><p class="action-reason">Local result only; no production booking changed.</p>`;
    if (state === "full") return `<button type="button" class="secondary-action" data-action="member-waitlist" data-key="${item.id}">Join ${item.title} simulated waitlist</button><p class="action-reason">Monthly membership access · no durable enrollment.</p>`;
    if (state === "waitlisted") return `<button type="button" class="secondary-action" data-action="member-waitlist" data-key="${item.id}">Waitlisted · reset ${item.title}</button><p class="action-reason">Local result only; no position or notice exists.</p>`;
    if (state === "punch") return `<button type="button" class="secondary-action" data-action="member-punch" data-key="${item.id}">Use one punch for ${item.title}</button><p class="action-reason">Punch card · 5 remaining. Local prototype only.</p>`;
    if (state === "punch-booked") return `<div class="booking-result" data-booking-type="PUNCH_CARD" data-booking-status="BOOKED"><strong>Booked</strong><p>Booking type · Punch card · Balance · 4. No payment or provider state exists.</p><div class="compact-actions"><button type="button" class="secondary-action" data-action="member-punch-timely" data-key="${item.id}">Timely cancel example</button><button type="button" class="secondary-action" data-action="member-punch-late" data-key="${item.id}">Late cancel example</button><button type="button" class="secondary-action" data-action="member-action-reset" data-key="${item.id}" data-reset-state="punch">Reset</button></div></div>`;
    if (state === "punch-timely") return `<div class="booking-result" data-booking-type="PUNCH_CARD" data-booking-status="AVAILABLE"><strong>Available</strong><p>Timely cancel · punch returned · Balance · 5.</p><button type="button" class="secondary-action" data-action="member-action-reset" data-key="${item.id}" data-reset-state="punch">Reset</button></div>`;
    if (state === "punch-late") return `<div class="booking-result" data-booking-type="PUNCH_CARD" data-booking-status="CANCELLED"><strong>Cancelled</strong><p>Late cancel · punch remains used · Balance · 4.</p><button type="button" class="secondary-action" data-action="member-action-reset" data-key="${item.id}" data-reset-state="punch">Reset</button></div>`;
    if (state === "drop-in") return `<button type="button" class="secondary-action" data-action="member-drop-in" data-key="${item.id}">Hold seat for $28 drop-in</button><p class="action-reason">Priced drop-in · payment completion is not simulated.</p>`;
    if (state === "dropin-pending") return `<div class="booking-result" data-booking-type="DROP_IN" data-booking-status="PENDING_PAYMENT"><strong>Payment pending</strong><p>Booking type · Drop-in. Seat temporarily held until Aug 20, 5:25 PM PDT. Provider completion is unknown. This is not Booked.</p><div class="compact-actions"><button type="button" class="secondary-action" data-action="member-drop-in-expire" data-key="${item.id}">Expire local hold</button><button type="button" class="secondary-action" data-action="member-action-reset" data-key="${item.id}" data-reset-state="drop-in">Cancel hold</button></div></div>`;
    if (state === "dropin-expired") return `<div class="booking-result" data-booking-type="DROP_IN" data-booking-status="AVAILABLE"><strong>Seat available</strong><p>The local payment hold expired and cleared. No provider result exists.</p><button type="button" class="secondary-action" data-action="member-action-reset" data-key="${item.id}" data-reset-state="drop-in">Reset</button></div>`;
    return `<button type="button" disabled aria-describedby="${item.id}-disabled">Booking unavailable</button><p class="action-reason" id="${item.id}-disabled">Cutoff passed. Choose another date.</p>`;
  }

  function memberSurface() {
    const classes = filterClasses().filter((item) => item.action !== "roster");
    const dateLabel = runtime.filters.date === DEMO.isoDate ? "Thursday · Aug 20" : runtime.filters.date === DEMO.nextDate ? "Friday · Aug 21" : runtime.filters.date;
    const content = `<div class="member-page">${filterBar()}<section aria-labelledby="member-date"><div class="section-heading"><h2 id="member-date" tabindex="-1">${dateLabel}</h2><p>${runtime.filters.program} · ${classes.length} results</p></div>${classes.length ? `<ol class="member-class-list">${classes.map((item) => { const state = runtime.memberActions[item.id] || item.action; return `<li class="member-class ${item.id === "fundamentals" ? "featured" : ""}" data-member-class="${item.id}" data-member-state="${state}" data-start-minutes="${item.startTimeMinutes}"><time>${item.time}</time><div class="member-class-info"><strong>${item.title}</strong><p>${item.meta}</p>${item.id === "fundamentals" ? '<span class="current-label">Current class</span>' : ""}<p class="capacity-context">Capacity · ${item.capacity}</p></div><div class="member-access">${memberAccess(item)}</div><div class="member-action">${memberAction(item)}</div></li>`; }).join("")}</ol>` : `<div class="empty-day" role="status"><strong>No classes match</strong><span>${runtime.filters.program} on ${dateLabel}. Clear filters to reset.</span></div>`}</section><aside class="guardian-boundary"><strong>Guardian boundary</strong><p>Guardian/child records and relevant signing context are supported. No guardian portal, child switcher, or booking/payment-on-behalf action exists here.</p></aside></div>`;
    const page = surfaceFrame({ surface: "member", eyebrow: "04 · Compressed member schedule", title: "Find your next class", description: `${runtime.memberContext ? `Named Member context · ${displayNameForSlug(runtime.memberContext)} · ` : ""}${DEMO.date} · gym time`, persona: "Member", outcome: "filter real dated classes, understand access, and take one bounded next action", aside: '<button type="button" class="secondary-action" data-action="member-reset">Reset class states</button>', content });
    return `<article class="surface member-surface"><header class="member-header"><div class="member-brand">Flowstate <span>for members</span></div><nav aria-label="Member navigation"><a href="?surface=member" aria-current="page">Schedule</a><a href="?surface=member">Bookings</a><details><summary>More</summary><div><a href="?surface=forms">Forms</a><a href="?surface=billing">Billing</a><button type="button" data-action="prototype-message" data-message="Local prototype only: no session ended.">Log out</button></div></details></nav></header>${page.replace(/^<article[^>]*>|<\/article>$/g, "")}</article>`;
  }

  const FORM_ROWS = [
    { document: "Participant waiver", currentVersion: "3", compliance: "SIGNED", requestStatus: "COMPLETED", current: "Version 3 · current", assigned: "Members and trials", evidence: "Signed · 18 current signatures", tone: "positive" },
    { document: "Guardian waiver", currentVersion: "2", compliance: "PENDING", requestStatus: "OPEN", current: "Version 2 · current", assigned: "Guardian", evidence: "Signature needed · Sam Rivera’s signing request is open", tone: "caution" },
    { document: "Membership agreement", currentVersion: "4", compliance: "SUPERSEDED MISSING", requestStatus: "EXPIRED CANCELLED", current: "Version 4 · current", assigned: "Membership activation", evidence: "New signing request needed · previous links expired or were cancelled", tone: "info" },
  ];

  function formsTable() {
    const attributes = (row) => `data-form-record data-current-version="${row.currentVersion}" data-compliance="${row.compliance}" data-request-status="${row.requestStatus}"`;
    return `<table class="form-table"><thead><tr><th>Document</th><th>Current</th><th>Assigned to</th><th>Evidence</th></tr></thead><tbody>${FORM_ROWS.map((row) => `<tr ${attributes(row)} ${row.document === "Guardian waiver" ? 'data-matching-form tabindex="-1"' : ""}><th>${row.document}</th><td>${row.current}</td><td>${row.assigned}</td><td>${status(row.evidence, row.tone)}</td></tr>`).join("")}</tbody></table><div class="form-record-cards">${FORM_ROWS.map((row) => `<article ${attributes(row)} ${row.document === "Guardian waiver" ? 'data-matching-form tabindex="-1"' : ""}><dl><div><dt>Document</dt><dd><h3>${row.document}</h3></dd></div><div><dt>Current</dt><dd>${row.current}</dd></div><div><dt>Assigned</dt><dd>${row.assigned}</dd></div><div><dt>Evidence</dt><dd>${row.evidence}</dd></div></dl></article>`).join("")}</div>`;
  }

  function formVersionReview() {
    if (runtime.formResult) return `<section class="form-version-result" role="status" tabindex="-1" data-current-version="3" data-cancelled-open-requests="3" data-current-requests-created="0" data-compliance-outcomes="SUPERSEDED MISSING"><h2>Local prototype result</h2><p>Guardian waiver Version 3 is current in this prototype. Three obsolete open signing requests were cancelled. Prior signatures become previous-version evidence. No current signing requests were created, and no email was sent.</p><p>Requirements remain superseded or missing until a current-version signing request or signature exists. Nothing was saved.</p><details><summary>Technical reference</summary><p>FormVersion current=3 · cancelled SignatureRequest OPEN count=3 · created current SignatureRequest count=0 · derived compliance outcomes SUPERSEDED or MISSING.</p></details><button type="button" data-action="form-version-reset">Reset version result</button></section>`;
    if (!runtime.formReview) return "";
    return `<section class="form-version-review" role="dialog" aria-modal="false" aria-labelledby="form-version-title"><p class="micro-label">Pre-action review</p><h2 id="form-version-title" tabindex="-1">Review new Guardian waiver version</h2><dl><div><dt>Affected requirements</dt><dd>14 guardian requirements</dd></div><div><dt>Current version change</dt><dd>Version 2 → Version 3</dd></div><div><dt>Signing requirement</dt><dd>Prior signatures become previous-version evidence; requirements remain superseded or missing until current-version requests or signatures exist</dd></div><div><dt>Obsolete signing links</dt><dd>3 open links are cancelled</dd></div><div><dt>Prior signed history</dt><dd>Preserved and reachable</dd></div><div><dt>New signing requests</dt><dd>None are created</dd></div><div><dt>Email</dt><dd>No email is sent</dd></div></dl><details><summary>Technical reference</summary><p>Publishing sets FormVersion v3 current, cancels 3 obsolete SignatureRequest OPEN rows, creates 0 current requests, and leaves derived compliance SUPERSEDED or MISSING.</p></details><p>Prototype-only. This review changes no production record.</p><button type="button" data-action="form-version-confirm">Show local result</button><button type="button" class="secondary-action" data-action="form-version-cancel">Cancel</button></section>`;
  }

  function roomForm(forceValidation = false) {
    return `<section class="prototype-form route-preview" aria-labelledby="form-title"><p class="micro-label">Route preview · not part of the Forms task</p><h2 id="form-title">Add a room</h2><div class="error-summary" id="form-errors" role="alert" tabindex="-1" ${forceValidation ? "" : "hidden"}><strong>Review 2 fields</strong><a href="#room-name">Enter a room name.</a><a href="#room-capacity">Capacity must be a whole number above 0.</a></div><form data-prototype-form novalidate><label for="room-name">Room name <span>Required</span></label><input id="room-name" name="roomName" autocomplete="off" aria-describedby="room-name-help${forceValidation ? " room-name-error" : ""}" ${forceValidation ? 'aria-invalid="true"' : ""}><small id="room-name-help">Inside ${DEMO.gym}; not another location.</small><span id="room-name-error" class="field-error" ${forceValidation ? "" : "hidden"}>Enter a room name.</span><label for="room-capacity">Capacity <span>Required</span></label><input id="room-capacity" name="capacity" inputmode="numeric" aria-describedby="room-capacity-help${forceValidation ? " room-capacity-error" : ""}" ${forceValidation ? 'aria-invalid="true"' : ""}><small id="room-capacity-help">Whole number above 0.</small><span id="room-capacity-error" class="field-error" ${forceValidation ? "" : "hidden"}>Enter a whole number above 0.</span><button type="submit">Validate local form</button><button type="button" class="secondary-action" data-action="form-reset">Reset form</button></form></section>`;
  }

  function settingsPreview() {
    return `<section class="settings-list route-preview"><p class="micro-label">Route preview · not part of the Forms task</p><h2>Gym setup</h2><dl><div><dt>Primary location</dt><dd>North Harbour · one location</dd></div><div><dt>Programs</dt><dd>Muay Thai · Hyrox Conditioning · Youth Fundamentals</dd></div><div><dt>Rooms</dt><dd>Main mat · Conditioning floor</dd></div></dl><div class="planned-note">${status("Planned", "neutral")}<p>Events, private lessons, messaging, progress, and automation remain non-interactive.</p></div></section>`;
  }

  function formsContent(forceValidation = false) {
    const focusedTask = runtime.formContext && runtime.memberContext ? `<section class="focused-task focused-form-task" aria-labelledby="focused-form-title" data-request-status="OPEN"><p class="micro-label">Current task · opened from dashboard</p><div><h2 id="focused-form-title">Sam Rivera</h2>${status("Signature needed", "caution")}</div><dl><div><dt>Document</dt><dd>Guardian waiver Version 2 · current</dd></div><div><dt>Participant</dt><dd>Sam Rivera</dd></div><div><dt>Guardian signer</dt><dd>Elena Rivera</dd></div><div><dt>Signer kind</dt><dd>Guardian</dd></div><div><dt>Compliance</dt><dd>Signature needed</dd></div><div><dt>Current request</dt><dd>Open signing request</dd></div><div><dt>Access method</dt><dd>Magic link</dd></div><div><dt>Expires</dt><dd>Aug 27, 2026, 11:59 PM PDT</dd></div><div><dt>Supported next step</dt><dd>Review the existing request. No new request, version, or email is created by this prototype.</dd></div></dl><button type="button" data-action="view-matching-form">View matching form record</button></section>` : "";
    return `${focusedTask}<section class="form-library"><div class="section-heading compact"><div><p class="micro-label">Forms task · full-width library</p><h2>Form library</h2></div><button id="new-form-action" type="button" class="${runtime.formContext ? "secondary-action" : ""}" data-action="form-version-open">New form version</button></div>${formsTable()}<details><summary>Technical reference</summary><p>Participant waiver: FormVersion v3 current · compliance SIGNED · SignatureRequest COMPLETED. Guardian waiver: FormVersion v2 current · compliance PENDING · SignatureRequest OPEN. Membership agreement: FormVersion v4 current · compliance SUPERSEDED or MISSING · prior SignatureRequest EXPIRED or CANCELLED · no current request.</p></details></section>${formVersionReview()}`;
  }

  function formsSurface() {
    const route = OWNER_ROUTES.find((item) => item.id === runtime.route);
    const routeNote = route?.id === "forms" ? "Review the form library and open a focused new-version flow." : route?.id === "rooms" ? "Add one room inside the existing gym location." : route?.id === "programs" ? "Review the one-location gym setup." : `${route?.label || "Owner"} retains its own owner-route context.`;
    let content = route?.id === "rooms" ? roomForm(false) : route?.id === "programs" ? settingsPreview() : route?.id === "forms" ? formsContent(false) : `<section class="route-task"><h2>${route?.label || "Owner route"}</h2><p>This bounded route keeps its owner identity without mixing Forms, Rooms, or Programs tasks.</p></section>`;
    let heading = stateHeading();
    if (runtime.state === "validation" && route?.id === "rooms") {
      content = roomForm(true);
      heading = stateHeading();
    } else if (runtime.state !== "default" && runtime.state !== "long") {
      content = genericStateRegion("forms");
    }
    const article = `<article class="surface forms-surface">${prototypeBanner("Owner", "complete one focused owner task without mixed route previews")}<header class="surface-title"><div><p class="micro-label">05 · Owner task route</p><h1 id="context-heading" tabindex="-1">${route?.label || "Forms"}</h1><p>${routeNote}</p></div>${runtime.state === "loading" ? "" : status("One location", "info")}</header>${heading}${content}</article>`;
    return ownerShell(article);
  }

  function migrationReadiness() {
    return `<details class="migration-readiness"><summary>Readiness review evidence · complete</summary><div class="migration-readiness-body"><div class="section-heading"><div><p class="micro-label">Completed read-only evidence</p><h2>Operational readiness record</h2></div>${status("Derived gate · READY", "positive")}</div><dl><div><dt>Workspace status</dt><dd>ACTIVE</dd></div><div><dt>Persisted MigrationStage</dt><dd>COMPLETE</dd></div><div><dt>Owner-review tuple</dt><dd>Jordan Lee · Aug 19, 4:08 PM PDT</dd></div><div><dt>Operational-readiness tuple</dt><dd>Flowstate operator · Aug 19, 4:22 PM PDT</dd></div><div><dt>Derived gate</dt><dd>Ready for daily operations</dd></div></dl><p>Eligible fictional completed scenario: no unknown statuses are present.</p></div></details>`;
  }

  function migrationConfirmation() {
    return `<section class="prelaunch-scenario"><p class="micro-label">Explicitly separate nonconcurrent pre-launch scenario</p><h2 id="migration-confirm-title" tabindex="-1">Review owner acknowledgment before launch</h2>${status("Daily operations · BLOCKED", "critical")}<p>This separate scenario is not concurrent with the completed default dataset. Persisted MigrationStage is GO_LIVE_SCHEDULED; owner review is an audit step, not a persisted Owner review stage.</p><dl><div><dt>Workspace status</dt><dd>SETUP_INCOMPLETE</dd></div><div><dt>Persisted MigrationStage</dt><dd>GO_LIVE_SCHEDULED</dd></div><div><dt>Owner-review tuple</dt><dd>Not recorded</dd></div><div><dt>Operational-readiness tuple</dt><dd>Not recorded</dd></div><div><dt>Derived gate</dt><dd>BLOCKED</dd></div></dl><p>Acknowledgment locks the reviewed snapshot; it does not activate daily operations.</p><button type="button" data-action="migration-confirm">Confirm local acknowledgment</button><button type="button" class="secondary-action" data-action="clear-state">Cancel</button></section>`;
  }

  function migrationSurface() {
    const defaultContent = `<section class="migration-hero"><div><p class="micro-label">Persisted stage</p><h2>COMPLETE</h2><p>Completed handoff evidence is read-only in this default scenario.</p></div><div class="next-actor"><span>Next role</span><strong>Daily operations team</strong><p>The readiness gate is already complete.</p></div><span class="read-only-label">Read-only record</span></section>${migrationReadiness()}<details class="migration-stage-details"><summary>6 of 6 complete · view stage evidence</summary><ol class="migration-timeline"><li class="done"><span>01</span><div><strong>Intake received</strong><p>One-location scope recorded.</p></div></li><li class="done"><span>02</span><div><strong>Exports reviewed</strong><p>Source files reviewed.</p></div></li><li class="done"><span>03</span><div><strong>Validation complete</strong><p>No unknown statuses are present in this eligible fictional scenario.</p></div></li><li class="done"><span>04</span><div><strong>Reconciled</strong><p>Added, updated, and excluded rows remain distinct.</p></div></li><li class="done"><span>05</span><div><strong>Owner acknowledgment recorded</strong><p>Audit tuple complete.</p></div></li><li class="done"><span>06</span><div><strong>Operational readiness recorded</strong><p>Flowstate audit tuple complete.</p></div></li></ol></details><section class="migration-results"><section><p class="micro-label">Reviewed result</p><h2>Snapshot evidence</h2><dl><div><dt>Added</dt><dd>184 members · 167 memberships</dd></div><div><dt>Updated</dt><dd>12 guardian links</dd></div><div><dt>Not imported</dt><dd>3 billing-history rows · review only</dd></div></dl><details><summary>Technical reference</summary><p>${runtime.state === "long" ? DEMO.importId : "Full import reference available in this collapsed section."}</p></details></section><section><p class="micro-label">Future import safeguard</p><h2>For future imports</h2><p>This fictional completed snapshot contains no unrecognized statuses. For future imports, Flowstate must stop and request review whenever it encounters a status it does not recognize.</p><button type="button" data-action="local-email-explainer">Explain future email action</button><div id="email-explainer" role="status"></div></section></section><details class="migration-technical"><summary><span>Prior incomplete attempts</span><span aria-hidden="true">＋</span></summary><p>Two earlier staging attempts are excluded from reviewed totals. Full technical values remain collapsed.</p></details>`;
    let content = defaultContent;
    if (runtime.state === "confirmation") content = migrationConfirmation();
    else if (runtime.state !== "default" && runtime.state !== "long" && runtime.state !== "readonly") content = genericStateRegion("migration");
    const article = `<article class="surface migration-surface">${prototypeBanner("Owner", "review exact completed readiness evidence or a clearly separate pre-launch scenario")}<header class="surface-title"><div><p class="micro-label">06 · Guided migration handoff</p><h1 id="context-heading" tabindex="-1">Migration readiness</h1><p>${DEMO.gym} · fictional target date Aug 24, 2026 · ${DEMO.timezone}</p></div>${status(runtime.state === "confirmation" ? "Separate scenario · BLOCKED" : "Default · COMPLETE", runtime.state === "confirmation" ? "critical" : "positive")}</header>${stateHeading()}${content}</article>`;
    return ownerShell(article);
  }

  function migrationSurfacePlain() {
    const defaultContent = `<section class="migration-hero"><div><p class="micro-label">Migration handoff</p><h2>Ready for daily operations</h2><p>Migration complete · reviewed snapshot ready for the daily operations team.</p></div><div class="next-actor"><span>Next role</span><strong>Daily operations team</strong><p>The gym is ready for daily operations.</p></div><span class="read-only-label">Read-only record</span></section><details class="migration-readiness"><summary>Readiness review evidence · complete</summary><div class="migration-readiness-body"><div class="section-heading"><div><p class="micro-label">Completed readiness review</p><h2>Gym status: Ready for daily operations</h2><p>Migration: Complete · Owner review: Recorded · Flowstate readiness review: Recorded.</p></div><strong class="readiness-answer">Ready</strong></div><dl><div><dt>Gym status</dt><dd>Ready for daily operations</dd></div><div><dt>Migration</dt><dd>Complete</dd></div><div><dt>Owner review</dt><dd>Recorded · Jordan Lee · Aug 19, 4:08 PM PDT</dd></div><div><dt>Flowstate readiness review</dt><dd>Recorded · Aug 19, 4:22 PM PDT</dd></div></dl></div></details><details class="migration-stage-details"><summary>6 of 6 complete · view stage evidence</summary><ol class="migration-timeline"><li class="done"><span>01</span><div><strong>Intake received</strong><p>One-location scope recorded.</p></div></li><li class="done"><span>02</span><div><strong>Exports reviewed</strong><p>Source files reviewed.</p></div></li><li class="done"><span>03</span><div><strong>Validation complete</strong><p>No unknown statuses appear in this eligible fictional scenario.</p></div></li><li class="done"><span>04</span><div><strong>Reconciled</strong><p>Added, updated, and excluded rows remain distinct.</p></div></li><li class="done"><span>05</span><div><strong>Owner review recorded</strong><p>The reviewed snapshot is retained.</p></div></li><li class="done"><span>06</span><div><strong>Flowstate readiness review recorded</strong><p>Daily operations may begin.</p></div></li></ol></details><section class="migration-results"><section><p class="micro-label">Reviewed result</p><h2>Snapshot evidence</h2><dl><div><dt>Added</dt><dd>184 members · 167 memberships</dd></div><div><dt>Updated</dt><dd>12 guardian links</dd></div><div><dt>Not imported</dt><dd>3 billing-history rows · review only</dd></div></dl></section><section><p class="micro-label">Future import safeguard</p><h2>For future imports</h2><p>This fictional completed snapshot contains no unrecognized statuses. For future imports, Flowstate must stop and request review whenever it encounters a status it does not recognize.</p><button type="button" data-action="local-email-explainer">Explain future owner email locally</button><div id="email-explainer" role="status"></div></section></section><details class="migration-technical"><summary>Technical reference</summary><p>Workspace ACTIVE · persisted MigrationStage COMPLETE · owner-review tuple persisted · operational-readiness tuple persisted · derived gate READY · nonconcurrent with the pre-launch scenario.</p></details>`;
    const confirmationContent = `<section class="prelaunch-scenario"><p class="micro-label">Separate pre-launch scenario</p><h2 id="migration-confirm-title" tabindex="-1">Pre-launch setup · daily operations blocked</h2>${status("Daily operations blocked", "critical")}<p>This scenario is separate from the completed default dataset.</p><dl><div><dt>Gym status</dt><dd>Pre-launch setup · daily operations blocked</dd></div><div><dt>Migration</dt><dd>Migration scheduled for launch</dd></div><div><dt>Owner review</dt><dd>Owner review not recorded</dd></div><div><dt>Flowstate readiness review</dt><dd>Not recorded</dd></div></dl><p>Acknowledgment locks the reviewed snapshot; it does not activate daily operations.</p><details><summary>Technical reference</summary><p>Workspace SETUP_INCOMPLETE · persisted MigrationStage GO_LIVE_SCHEDULED · owner-review tuple absent · operational-readiness tuple absent · derived gate BLOCKED · nonconcurrent scenario.</p></details><button type="button" data-action="migration-confirm">Confirm local acknowledgment</button><button type="button" class="secondary-action" data-action="clear-state">Cancel</button></section>`;
    let content = runtime.state === "confirmation" ? confirmationContent : defaultContent;
    if (runtime.state !== "default" && runtime.state !== "long" && runtime.state !== "readonly" && runtime.state !== "confirmation") content = genericStateRegion("migration");
    const aside = runtime.state === "loading" ? "" : status(runtime.state === "confirmation" ? "Pre-launch blocked" : "Migration complete", runtime.state === "confirmation" ? "critical" : "positive");
    const article = `<article class="surface migration-surface">${prototypeBanner("Owner", "review exact completed readiness evidence or a clearly separate pre-launch scenario")}<header class="surface-title"><div><p class="micro-label">06 · Guided migration handoff</p><h1 id="context-heading" tabindex="-1">Migration readiness</h1><p>${DEMO.gym} · fictional target date Aug 24, 2026 · ${DEMO.timezone}</p></div>${aside}</header>${stateHeading()}${content}</article>`;
    return ownerShell(article);
  }

  function billingSurface() {
    const namedContext = runtime.memberContext === "avery-hernandez-lawson" ? `<section class="focused-task focused-billing-task" aria-labelledby="focused-billing-title"><p class="micro-label">Named Member billing context · current task</p><div><h2 id="focused-billing-title">${DEMO.member}</h2>${status("Payment failed", "critical")}</div><dl><div><dt>Amount</dt><dd>$145.00 USD</dd></div><div><dt>Failed</dt><dd>Aug 20 · 9:14 AM PDT</dd></div><div><dt>Grace ends</dt><dd>Aug 23</dd></div><div><dt>Known evidence</dt><dd>Local payment-failed record · latest invoice present · Stripe provider not connected</dd></div><div><dt>Next actor</dt><dd>Owner completes Stripe setup. Retry is unavailable because Stripe setup is missing; no charge or account change was attempted.</dd></div></dl></section>` : runtime.memberContext ? `<section class="focused-task focused-billing-task"><p class="micro-label">Named Member billing context · current task</p><h2>${displayNameForSlug(runtime.memberContext)}</h2><p>$92.00 USD · invoice unavailable · review the named member record. No Stripe retry is available.</p></section>` : "";
    const content = `${namedContext}<section class="provider-banner"><div class="provider-signal" aria-hidden="true">×</div><div><p class="micro-label">Stripe boundary</p><h2>Stripe setup missing</h2><p>Readable local records remain separate from Stripe-confirmed evidence. The owner completes setup next; no charge or account change was attempted.</p><details><summary>Technical reference</summary><p>${runtime.state === "long" ? DEMO.providerId : "Full provider reference hidden in normal reading order."}</p></details></div><div><button type="button" disabled aria-describedby="connect-reason">Connect Stripe</button><p id="connect-reason">Disabled in this local prototype. No external call can be made.</p></div></section><section class="billing-queue"><div class="section-heading"><div><p class="micro-label">Risk and age ordered</p><h2>Failed payment queue</h2></div><span>2 local records</span></div><ol><li><div class="amount"><strong>$145.00</strong><span>USD</span></div><div><strong>${runtime.state === "long" ? DEMO.longMember : DEMO.member}</strong><p>Monthly unlimited · failed Aug 20, 9:14 AM PDT</p></div>${status("Payment failed", "critical")}<div><button type="button" disabled aria-describedby="retry-avery" aria-label="Retry ${DEMO.member} $145 payment">Retry payment</button><p id="retry-avery">Action unavailable: Stripe setup is missing. Owner completes setup next.</p></div></li><li><div class="amount"><strong>$92.00</strong><span>USD</span></div><div><strong>Micah Thompson</strong><p>Youth membership · invoice unavailable</p></div>${status("Action required", "caution")}<div><button type="button" disabled aria-describedby="retry-micah" aria-label="Retry Micah Thompson $92 payment">Retry payment</button><p id="retry-micah">Action unavailable: no invoice exists. Review the named Member record.</p><a href="?surface=billing&route=billing&member=micah-thompson" data-route-link="billing" data-route-surface="billing" data-member-context="micah-thompson">Open Micah Thompson billing context</a></div></li></ol></section><div class="billing-facts"><section><p class="micro-label">Local Flowstate state</p><h2>Membership record</h2><dl><div><dt>Status</dt><dd>Past due</dd></div><div><dt>Grace end</dt><dd>Aug 23, 2026 · gym date</dd></div></dl></section><section><p class="micro-label">Stripe-confirmed state</p><h2>Stripe evidence</h2><dl><div><dt>Connection</dt><dd>Not connected</dd></div><div><dt>Charges</dt><dd>Not verified</dd></div></dl></section><section class="danger-zone"><p class="micro-label">Review before confirming</p><h2>Consequential actions</h2><p>Refund, credit, invoice, and cancellation controls remain absent.</p></section></div>`;
    return ownerShell(surfaceFrame({ surface: "billing", eyebrow: "07 · Billing and Stripe states", title: "Revenue exceptions", description: "Exact values, ordered work, and separate local versus Stripe evidence.", persona: "Owner", outcome: "recover a named Member’s billing context without implying a Stripe result", aside: status(runtime.state === "outage" ? "Stripe status unavailable" : "Stripe setup missing", "caution"), content }));
  }

  function landingSurface() {
    if (runtime.state !== "default" && runtime.state !== "long") {
      return `<article class="surface landing-surface">${prototypeBanner("Prospective one-location gym owner", "recognize fit without sending anything")}<header class="landing-nav"><a href="#landing-title">Flowstate</a><nav aria-label="Landing navigation"><a href="#landing-title">Overview</a></nav><a href="#landing-title">Explore fit</a></header><section class="landing-state-title"><p class="micro-label">08 · Landing refinement</p><h1 id="context-heading" tabindex="-1">Tomorrow’s gym, already in rhythm.</h1><p>One-location gym operations · web only.</p></section>${stateHeading()}${genericStateRegion("landing")}</article>`;
    }
    return `<article class="surface landing-surface">${prototypeBanner("Prospective one-location gym owner", "recognize fit and understand a local-only interest request")}<header class="landing-nav"><a href="#landing-hero">Flowstate</a><nav aria-label="Landing navigation"><a href="#landing-proof">Daily loop</a><a href="#landing-founding">Founding Gym</a><a href="#landing-interest">Interest request</a></nav><a href="#landing-interest">Explore fit</a></header><section class="landing-hero" id="landing-hero"><div class="landing-copy"><p class="micro-label">One-location gym operations · web</p><h1 id="context-heading" tabindex="-1">Tomorrow’s gym, already in rhythm.</h1><p>Recurring scheduling, attendance, Member booking, and billing state for one-location Muay Thai gyms and Hyrox/HIIT studios.</p><div><a class="landing-primary" href="#landing-interest">Explore Founding Gym fit</a><button type="button" class="landing-secondary" data-action="local-email-explainer">How future email requests work</button></div><div id="email-explainer" role="status"></div></div><div class="product-preview"><p class="micro-label">Product preview · <span data-world-name>Field Ledger</span></p><div class="preview-top"><strong>Today · 6:00 PM</strong>${status("3 spots", "positive")}</div><h2>${DEMO.className}</h2><p>${DEMO.room} · 9 / 12 booked</p><ol><li><span>01</span> Attendance gap <strong>Review</strong></li><li><span>02</span> Payment failed <strong>$145.00</strong></li></ol></div></section><section class="landing-proof" id="landing-proof"><div><p class="micro-label">Controlled product story</p><h2>Booking becomes the roster. The roster becomes attendance.</h2></div><ol><li><span>01</span><strong>Member chooses a dated class</strong><p>Eligibility and capacity stay beside the action.</p></li><li><span>02</span><strong>Owner or assigned coach sees the roster</strong><p>Member, trial, guardian, and access context remain distinct.</p></li><li><span>03</span><strong>Attendance records one row at a time</strong><p>No bulk promise; stale and failed states stay visible.</p></li></ol></section><section class="landing-founding" id="landing-founding"><div><p class="micro-label">Approved concept · incomplete terms</p><h2>Founding Gym direction</h2></div><p>Qualifying gyms that join the founding waitlist and onboard during the founding window receive <strong>15% off monthly software pricing</strong>, grandfathered after launch. Base price, eligibility dates/window, taxes, and cancellation/reactivation terms remain unresolved.</p><p class="offer-boundary">This local form stores or sends nothing. It does not enroll a gym, confer eligibility, schedule follow-up, or send email.</p></section><section class="landing-interest" id="landing-interest"><div><p class="micro-label">Local-only interest request</p><h2>What should Flowstate solve first?</h2><p>Try validation and a local result. No values leave this tab.</p></div><form data-landing-form novalidate><div class="error-summary" id="landing-errors" role="alert" tabindex="-1" hidden><strong>Review the interest request</strong><a href="#interest-name">Enter your name.</a><a href="#interest-email">Enter a valid email.</a></div><label for="interest-name">Your name <span>Required</span></label><input id="interest-name" name="name" autocomplete="name"><label for="interest-gym">Gym name</label><input id="interest-gym" name="gym" autocomplete="organization"><label for="interest-email">Email <span>Required</span></label><input id="interest-email" name="email" type="email" autocomplete="email"><label for="interest-note">What should Flowstate solve first?</label><textarea id="interest-note" name="note" maxlength="500" rows="3"></textarea><p class="form-boundary">Nothing stored · nothing sent · no email · no enrollment.</p><button type="submit">Show local prototype result</button><button type="button" class="secondary-action" data-action="landing-reset">Reset form</button><div class="prototype-result" role="status" ${runtime.landingSubmitted ? "" : "hidden"}><strong>Local prototype result.</strong> Nothing was stored or sent; no email, enrollment, eligibility, or follow-up is confirmed.</div></form></section></article>`;
  }

  const renderers = { foundation: foundationSurface, dashboard: dashboardSurface, operations: operationsSurface, member: memberSurface, forms: formsSurface, migration: migrationSurfacePlain, billing: billingSurface, landing: landingSurface };

  function applyWorld() {
    document.body.dataset.world = runtime.world;
    document.querySelectorAll('[data-action="world"]').forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.worldValue === runtime.world)));
    document.querySelectorAll("[data-world-name]").forEach((node) => { node.textContent = runtime.world === "a" ? "Field Ledger" : "Training Signal"; });
    const summary = document.querySelector(".gallery-current-summary");
    if (summary) summary.textContent = `${runtime.world === "a" ? "Field Ledger" : "Training Signal"} · ${SURFACE_LABELS[runtime.surface]}`;
  }

  function contextParams() {
    return { world: runtime.world, surface: runtime.surface, route: runtime.route, state: runtime.state, date: runtime.filters.date, program: runtime.filters.program, view: runtime.view, class: runtime.selectedClass, member: runtime.memberContext, form: runtime.formContext, role: runtime.role, origin: runtime.rosterOrigin };
  }

  function syncUrl(mode = "replace", stateExtras = {}) {
    const url = new URL(window.location.href);
    Object.entries(contextParams()).forEach(([key, value]) => {
      if (!value || (key === "state" && value === "default") || (key === "program" && value === "All programs") || (key === "view" && value === "schedule") || (key === "role" && value === "owner")) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    });
    history[mode === "push" ? "pushState" : "replaceState"]({ ...contextParams(), ...stateExtras }, "", url);
  }

  function hydrateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    runtime.world = safeChoice(params.get("world"), ["a", "b"], "a");
    runtime.surface = safeChoice(params.get("surface"), SURFACES, "foundation");
    runtime.route = params.get("route") || DEFAULT_ROUTE[runtime.surface];
    runtime.state = safeChoice(params.get("state"), STATES, "default");
    runtime.filters.date = params.get("date") || DEMO.isoDate;
    runtime.filters.program = safeChoice(params.get("program"), ["All programs", "Muay Thai", "Conditioning"], "All programs");
    runtime.view = safeChoice(params.get("view"), ["schedule", "roster"], "schedule");
    runtime.selectedClass = params.get("class") || "";
    runtime.rosterOrigin = safeChoice(params.get("origin"), ["dashboard", "schedule", "coach"], "");
    runtime.memberContext = params.get("member") || "";
    runtime.formContext = params.get("form") || "";
    const fallbackRole = runtime.surface === "member" && !params.has("route") ? "member" : "owner";
    runtime.role = safeChoice(params.get("role"), ["owner", "coach", "member"], fallbackRole);
  }

  function applyRenderedRosterContext() {
    const dashboardOrigin = app.querySelector('.dashboard-surface [data-view="roster"][data-class-context="fundamentals"]');
    if (dashboardOrigin) {
      dashboardOrigin.id = "dashboard-roster-fundamentals";
      dashboardOrigin.dataset.originKey = dashboardOrigin.id;
      dashboardOrigin.dataset.originContext = "dashboard";
      const href = new URL(dashboardOrigin.getAttribute("href"), window.location.href);
      href.searchParams.set("origin", "dashboard");
      dashboardOrigin.setAttribute("href", `${href.pathname}${href.search}`);
    }
    const coachOrigin = app.querySelector('.coach-shell [data-action="open-roster"]');
    if (coachOrigin) {
      coachOrigin.id = "coach-roster-fundamentals";
      coachOrigin.dataset.originKey = coachOrigin.id;
      coachOrigin.dataset.originContext = "coach";
    }
    const roster = app.querySelector(".roster-view");
    if (!roster) return;
    const labels = { dashboard: "← Back to Today", schedule: "← Back to Schedule", coach: "← Back to Coach Today" };
    const back = roster.querySelector('[data-action="history-back"]');
    if (back) back.textContent = labels[runtime.rosterOrigin] || labels.schedule;
    const headerCopy = roster.querySelector(".roster-header > div");
    if (headerCopy && !headerCopy.querySelector(".roster-actor")) headerCopy.insertAdjacentHTML("beforeend", `<p class="roster-actor"><strong>Actor context</strong> · ${runtime.role === "coach" ? "Assigned coach · Coach Maya Chen" : "Owner"}</p>`);
    const warning = roster.querySelector(".roster-warning");
    if (warning) {
      warning.querySelector("strong").textContent = "Preview only.";
      warning.querySelector(":scope > span").textContent = "Selections update this browser tab only and are never saved. Choose one state per row; no bulk action.";
    }
    const hana = roster.querySelector(".waitlist-disclosure li:nth-child(2)");
    if (hana) {
      hana.querySelector("p").textContent = "Access review required if next; do not silently skip.";
      const stamp = hana.querySelector(".status-stamp");
      if (stamp) {
        stamp.textContent = "Access review required if next";
        stamp.className = "status-stamp status-caution";
      }
    }
  }

  function render({ focus = "" } = {}) {
    document.body.dataset.surface = runtime.surface;
    document.body.dataset.route = runtime.route;
    document.body.dataset.role = runtime.role;
    const renderer = runtime.route === "bookings" && runtime.role === "owner" ? ownerBookingsSurface : renderers[runtime.surface];
    app.innerHTML = renderer();
    applyRenderedRosterContext();
    surfaceSelect.value = runtime.surface;
    stateSelect.value = runtime.state;
    applyWorld();
    if (focus) focusTarget(focus);
  }

  function setRoute(route, surface, options = {}) {
    runtime.route = route;
    runtime.surface = surface;
    runtime.state = options.state || "default";
    runtime.view = options.view || "schedule";
    runtime.selectedClass = options.selectedClass || "";
    runtime.memberContext = options.memberContext || "";
    runtime.formContext = options.formContext || "";
    runtime.rosterOrigin = options.rosterOrigin || "";
    runtime.role = options.role || (surface === "member" && route === "member-schedule" ? "member" : "owner");
    syncUrl(options.replace ? "replace" : "push");
    render({ focus: options.focus || "#context-heading" });
    announce(`${route.replaceAll("-", " ")} route opened with context preserved.`);
  }

  function clearInvalid(form) {
    form?.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute("aria-invalid"));
    form?.querySelectorAll("[aria-describedby]").forEach((field) => {
      const retained = (field.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && !form.querySelector(`#${escapeSelector(id)}.field-error`));
      if (retained.length) field.setAttribute("aria-describedby", retained.join(" ")); else field.removeAttribute("aria-describedby");
    });
    form?.querySelectorAll(".field-error").forEach((error) => { error.hidden = true; });
  }

  function closeMenu({ returnFocus = true } = {}) {
    menu.hidden = true;
    document.querySelectorAll('[data-action="menu-open"]').forEach((button) => button.setAttribute("aria-expanded", "false"));
    if (returnFocus) lastMenuOpener?.focus();
  }

  function openMenu(source) {
    lastMenuOpener = source || galleryMenuOpener;
    menu.hidden = false;
    source?.setAttribute("aria-expanded", "true");
    menu.querySelector('[data-action="menu-close"]')?.focus();
  }

  document.addEventListener("click", (event) => {
    const surfaceLink = event.target.closest("[data-surface-link]");
    if (surfaceLink) {
      event.preventDefault();
      const fromMenu = menu.contains(surfaceLink);
      setRoute(DEFAULT_ROUTE[surfaceLink.dataset.surfaceLink], surfaceLink.dataset.surfaceLink);
      if (fromMenu) closeMenu({ returnFocus: false });
      return;
    }
    const routeLink = event.target.closest("[data-route-link]");
    if (routeLink) {
      event.preventDefault();
      const rosterOrigin = routeLink.dataset.view === "roster" ? (routeLink.dataset.originContext || "schedule") : "";
      if (rosterOrigin && routeLink.dataset.originKey) syncUrl("replace", { originKey: routeLink.dataset.originKey });
      setRoute(routeLink.dataset.routeLink, routeLink.dataset.routeSurface, { view: routeLink.dataset.view || "schedule", selectedClass: routeLink.dataset.classContext || "", memberContext: routeLink.dataset.memberContext || "", formContext: routeLink.dataset.formContext || "", rosterOrigin, focus: routeLink.dataset.view === "roster" ? "#roster-heading" : "#context-heading" });
      return;
    }
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === "world") {
      runtime.world = button.dataset.worldValue;
      applyWorld();
      syncUrl("replace");
      announce(`${runtime.world === "a" ? "Field Ledger" : "Training Signal"} selected. Content is unchanged.`);
    } else if (action === "menu-open") openMenu(button);
    else if (action === "menu-close") closeMenu();
    else if (action === "clear-state") { runtime.state = "default"; syncUrl("replace"); render({ focus: "#context-heading" }); announce("Default interactive state restored."); }
    else if (action === "clear-filters") { runtime.filters = { program: "All programs", date: DEMO.isoDate }; syncUrl("replace"); render({ focus: runtime.surface === "operations" ? "#schedule-heading" : "#member-date" }); announce("Filters cleared. Showing all programs for August 20, 2026."); }
    else if (action === "open-roster") {
      const originKey = button.dataset.originKey || "";
      if (originKey) syncUrl("replace", { originKey });
      runtime.rosterOrigin = button.dataset.originContext || (runtime.role === "coach" ? "coach" : "schedule"); runtime.surface = "operations"; runtime.route = runtime.role === "coach" ? "coach-today" : "roster"; runtime.view = "roster"; runtime.selectedClass = button.dataset.class; syncUrl("push"); render({ focus: "#roster-heading" }); announce(`${CLASSES.find((item) => item.id === runtime.selectedClass)?.title || DEMO.className} roster opened.`);
    } else if (action === "history-back") history.back();
    else if (action === "attendance") {
      const id = button.dataset.member; runtime.attendance[id] = runtime.attendance[id] === button.dataset.value ? "" : button.dataset.value; render({ focus: `[data-attendance-row="${escapeSelector(id)}"]` }); announce(`${button.textContent.trim()} selected for ${button.closest("[data-attendance-row]")?.querySelector(".attendee strong")?.textContent}. Preview only; not saved.`);
    } else if (action === "attendance-retry") { runtime.attendance[button.dataset.member] = "PRESENT"; render({ focus: `[data-attendance-row="${escapeSelector(button.dataset.member)}"]` }); announce("Local preview shown. Nothing was saved."); }
    else if (action === "attendance-latest") { runtime.attendance[button.dataset.member] = "LATE"; render({ focus: `[data-attendance-row="${escapeSelector(button.dataset.member)}"]` }); announce("Current attendance loaded: Late. Review before another change."); }
    else if (action === "waitlist-promote") { const receipt = app.querySelector("#promotion-receipt"); receipt.innerHTML = '<p class="inline-result"><strong>Local promotion receipt:</strong> Marcel Dubois · monthly membership access · one confirmed booking · no punch consumed · nothing saved.</p>'; receipt.focus?.(); announce("Local waitlist promotion receipt shown. Nothing saved."); }
    else if (action === "member-book") { const key = button.dataset.key; runtime.memberActions[key] = runtime.memberActions[key] === "booked" ? "available" : "booked"; render({ focus: `[data-member-class="${escapeSelector(key)}"] button` }); announce("Local booking state changed. Nothing saved."); }
    else if (action === "member-waitlist") { const key = button.dataset.key; runtime.memberActions[key] = runtime.memberActions[key] === "waitlisted" ? "full" : "waitlisted"; render({ focus: `[data-member-class="${escapeSelector(key)}"] button` }); announce("Local waitlist state changed. Nothing saved."); }
    else if (action === "member-punch") { const key = button.dataset.key; runtime.memberActions[key] = "punch-booked"; render({ focus: `[data-member-class="${escapeSelector(key)}"] [data-action="member-punch-timely"]` }); announce("Open Mat booked locally with punch-card access. Balance is 4. Nothing saved."); }
    else if (action === "member-punch-timely") { const key = button.dataset.key; runtime.memberActions[key] = "punch-timely"; render({ focus: `[data-member-class="${escapeSelector(key)}"] [data-action="member-action-reset"]` }); announce("Timely cancel example shown. The punch balance returned to 5."); }
    else if (action === "member-punch-late") { const key = button.dataset.key; runtime.memberActions[key] = "punch-late"; render({ focus: `[data-member-class="${escapeSelector(key)}"] [data-action="member-action-reset"]` }); announce("Late cancel example shown. The punch balance remains 4."); }
    else if (action === "member-drop-in") { const key = button.dataset.key; runtime.memberActions[key] = "dropin-pending"; render({ focus: `[data-member-class="${escapeSelector(key)}"] [data-action="member-drop-in-expire"]` }); announce("Drop-in payment pending. The local seat hold expires at 5:25 PM PDT; provider completion is unknown."); }
    else if (action === "member-drop-in-expire") { const key = button.dataset.key; runtime.memberActions[key] = "dropin-expired"; render({ focus: `[data-member-class="${escapeSelector(key)}"] [data-action="member-action-reset"]` }); announce("The local drop-in hold expired and the seat returned to available."); }
    else if (action === "member-action-reset") { const key = button.dataset.key; runtime.memberActions[key] = button.dataset.resetState; render({ focus: `[data-member-class="${escapeSelector(key)}"] button` }); announce("Local class example reset."); }
    else if (action === "member-reset") { runtime.memberActions = { fundamentals: "available", pads: "booked", "night-engine": "full", "open-mat": "punch", "drop-in": "drop-in" }; render({ focus: '[data-action="member-reset"]' }); announce("Member class states reset."); }
    else if (action === "form-reset") { const form = app.querySelector("[data-prototype-form]"); form?.reset(); clearInvalid(form); const summary = app.querySelector("#form-errors"); if (summary) summary.hidden = true; button.focus(); announce("Form and validation state reset."); }
    else if (action === "view-matching-form") { const matching = [...app.querySelectorAll("[data-matching-form]")].find((node) => node.getClientRects().length); matching?.focus(); matching?.scrollIntoView({ block: "center" }); announce("Matching Guardian waiver record focused."); }
    else if (action === "form-version-open") { runtime.formReview = true; runtime.formResult = false; render({ focus: "#form-version-title" }); announce("New form version consequences opened for review."); }
    else if (action === "form-version-cancel") { runtime.formReview = false; render({ focus: "#new-form-action" }); announce("New form version review closed. Nothing saved."); }
    else if (action === "form-version-confirm") { runtime.formReview = false; runtime.formResult = true; render({ focus: ".form-version-result" }); announce("Local form version result shown. Nothing saved and no email sent."); }
    else if (action === "form-version-reset") { runtime.formResult = false; render({ focus: "#new-form-action" }); announce("Form version result reset."); }
    else if (action === "migration-confirm") { runtime.migrationResult = true; runtime.state = "success"; syncUrl("replace"); render({ focus: "#state-lens-title" }); announce("Local owner acknowledgment result shown. Daily operations were not activated."); }
    else if (action === "coach-today") { runtime.role = "coach"; runtime.surface = "operations"; runtime.route = "coach-today"; runtime.view = "schedule"; runtime.state = "default"; syncUrl("push"); render({ focus: "#context-heading" }); announce("Coach Today opened. Owner routes are absent."); }
    else if (action === "owner-demo") { setRoute("dashboard", "dashboard"); }
    else if (action === "local-email-explainer") showResettableAction(button, "Future email action: a production version may open an approved email workflow. This local button opened no external app and sent nothing.");
    else if (action === "landing-reset") { runtime.landingSubmitted = false; render({ focus: "#landing-interest" }); announce("Interest form reset. Nothing stored or sent."); }
    else if (action === "prototype-message") showResettableAction(button, button.dataset.message || "Local prototype result. Nothing saved.");
    else if (action === "local-action-reset") { const key = button.dataset.localActionKey; const trigger = document.querySelector(`[data-local-action-trigger="${escapeSelector(key)}"]`); document.querySelector(`[data-local-action-result="${escapeSelector(key)}"]`)?.remove(); if (trigger) { trigger.disabled = false; trigger.removeAttribute("aria-describedby"); trigger.removeAttribute("data-local-action-trigger"); trigger.focus(); } announce("Local explanation dismissed and its action reset."); }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.matches("[data-prototype-form]")) {
      event.preventDefault();
      const name = event.target.elements.roomName;
      const capacity = event.target.elements.capacity;
      clearInvalid(event.target);
      const nameInvalid = !name.value.trim();
      const capacityInvalid = !/^\d+$/.test(capacity.value) || Number(capacity.value) <= 0;
      const summary = app.querySelector("#form-errors");
      if (nameInvalid || capacityInvalid) {
        summary.hidden = false;
        if (nameInvalid) { name.setAttribute("aria-invalid", "true"); name.setAttribute("aria-describedby", "room-name-help room-name-error"); } else name.removeAttribute("aria-invalid");
        if (capacityInvalid) { capacity.setAttribute("aria-invalid", "true"); capacity.setAttribute("aria-describedby", "room-capacity-help room-capacity-error"); } else capacity.removeAttribute("aria-invalid");
        app.querySelector("#room-name-error").hidden = !nameInvalid;
        app.querySelector("#room-capacity-error").hidden = !capacityInvalid;
        summary.focus();
        announce("Room preview validation failed. Review linked fields.");
      } else {
        summary.hidden = true;
        clearInvalid(event.target);
        event.target.querySelector(".inline-result")?.remove();
        event.target.insertAdjacentHTML("beforeend", '<p class="inline-result" role="status">Local prototype result. Nothing was saved; no room or location was created.</p>');
        event.target.querySelector("button[type=submit]").focus();
        announce("Room preview validated locally. Nothing saved.");
      }
    }
    if (event.target.matches("[data-landing-form]")) {
      event.preventDefault();
      const name = event.target.elements.name;
      const email = event.target.elements.email;
      clearInvalid(event.target);
      const nameInvalid = !name.value.trim();
      const emailInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value);
      const summary = app.querySelector("#landing-errors");
      if (nameInvalid || emailInvalid) {
        summary.hidden = false;
        if (nameInvalid) name.setAttribute("aria-invalid", "true"); else name.removeAttribute("aria-invalid");
        if (emailInvalid) email.setAttribute("aria-invalid", "true"); else email.removeAttribute("aria-invalid");
        summary.focus();
        announce("Interest request validation failed. Nothing stored or sent.");
      } else {
        clearInvalid(event.target);
        runtime.landingSubmitted = true;
        render({ focus: ".prototype-result" });
        announce("Local prototype result shown. Nothing stored or sent.");
      }
    }
  });

  surfaceSelect.addEventListener("change", () => setRoute(DEFAULT_ROUTE[surfaceSelect.value], surfaceSelect.value));
  stateSelect.addEventListener("change", () => {
    runtime.state = safeChoice(stateSelect.value, STATES, "default");
    runtime.formReview = false;
    runtime.formResult = false;
    syncUrl("replace");
    render({ focus: runtime.state === "validation" && runtime.surface === "forms" ? "#form-errors" : runtime.state === "default" ? "#context-heading" : "#state-lens-title" });
    announce(`${stateSelect.options[stateSelect.selectedIndex].text} selected.`);
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches('[data-action="date-filter"]')) { runtime.filters.date = event.target.value; syncUrl("replace"); render({ focus: runtime.surface === "operations" ? "#schedule-heading" : "#member-date" }); announce(`Date filter set to ${event.target.value}.`); }
    if (event.target.matches('[data-action="program-filter"]')) { runtime.filters.program = event.target.value; syncUrl("replace"); render({ focus: runtime.surface === "operations" ? "#schedule-heading" : "#member-date" }); announce(`Program filter set to ${event.target.value}.`); }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) { event.preventDefault(); closeMenu(); }
    else if (event.key === "Escape" && runtime.formReview) { event.preventDefault(); runtime.formReview = false; render({ focus: "#new-form-action" }); announce("New form version review closed. Nothing saved."); }
    if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && document.activeElement?.matches('[data-action="world"]')) {
      event.preventDefault();
      const button = document.querySelector(`[data-world-value="${runtime.world === "a" ? "b" : "a"}"]`);
      button.focus(); button.click();
    }
    if (event.key === "Tab" && !menu.hidden) {
      const focusable = [...menu.querySelectorAll('a[href], button:not([disabled])')];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  window.addEventListener("popstate", (event) => {
    hydrateFromUrl();
    const originFocus = event.state?.originKey ? `#${escapeSelector(event.state.originKey)}` : "";
    render({ focus: originFocus || (runtime.view === "roster" ? "#roster-heading" : "#context-heading") });
    if (originFocus) (app.querySelector(originFocus) || document.querySelector(originFocus))?.setAttribute("data-returned-focus", "");
    announce("Browser history restored the prior prototype context.");
  });

  hydrateFromUrl();
  if (window.matchMedia("(max-width: 640px)").matches) {
    galleryControlsDisclosure.open = false;
    simulationBoundary.open = false;
  }
  render();
  syncUrl("replace");
})();
