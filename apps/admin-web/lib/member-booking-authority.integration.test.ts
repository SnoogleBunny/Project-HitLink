import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient, MemberCommandActor } from "@flowstate/db";
import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import { inspectRetentionInventory, deleteReviewedWorkspaceRecords } from "../../../packages/db/src/retention-inventory.js";

const url = process.env.TEST_DATABASE_URL;
if (url && (!/test|e2e/i.test(new URL(url).pathname) || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))) throw new Error("Member authority tests require a dedicated loopback test database.");
const operations = ["direct", "join", "leave", "cancel", "move", "move-replay"] as const;
type Operation = typeof operations[number];

(url ? describe : describe.skip)("current member booking authority across real PostgreSQL waits", () => {
  let db: PrismaClient, observer: PrismaClient, api: typeof import("@flowstate/db"), auth: typeof import("@flowstate/auth"), change: typeof import("./family-portal-access")["changeFamilyPortalAccess"];
  const workspaces: string[] = [], users: string[] = [];
  const now = new Date("2030-01-01T12:00:00Z");
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    api = await import("@flowstate/db");
    auth = await import("@flowstate/auth");
    change = (await import("./family-portal-access")).changeFamilyPortalAccess;
    db = api.prisma;
    const observerUrl = new URL(url!);
    observerUrl.searchParams.set("connection_limit", "1");
    observer = new api.PrismaClient({ datasourceUrl: observerUrl.toString() });
  });

  async function fixture() {
    const ownerUserId = `authority-owner-${randomUUID()}`, actorUserId = `authority-actor-${randomUUID()}`;
    users.push(ownerUserId, actorUserId);
    await db.user.createMany({ data: [ownerUserId, actorUserId].map(id => ({ id, email: `${id}@example.test` })) });
    const workspace = await db.workspace.create({ data: {
      name: "Fictional current booking authority", status: "ACTIVE",
      workspaceUsers: { create: [{ userId: ownerUserId, role: "OWNER" }, { userId: actorUserId, role: "CUSTOMER" }] },
      location: { create: { name: "Gym", timezone: "UTC", rooms: { create: { name: "Mat", capacity: 1 } } } },
      migration: { create: { stage: "COMPLETE", nextOwnerAction: "None", flowstateResponsibility: "Fictional complete", ownerReviewAcknowledgedAt: now, ownerReviewAcknowledgedByUserId: ownerUserId, operationallyReadyAt: now, operationallyReadyByUserId: ownerUserId } },
    }, include: { workspaceUsers: true, location: { include: { rooms: true } } } });
    const workspaceId = workspace.id;
    workspaces.push(workspaceId);
    await createFixtureClassSchedulingPolicy(db, workspaceId, ownerUserId);
    const account = await db.member.create({ data: { workspaceId, userId: actorUserId, fullName: "Verified account", dateOfBirth: new Date("1990-01-01Z") } });
    const child = await db.member.create({ data: { workspaceId, fullName: "Named participant", dateOfBirth: new Date("2020-01-01Z"), status: "ACTIVE" } });
    const sibling = await db.member.create({ data: { workspaceId, fullName: "Other participant", dateOfBirth: new Date("2021-01-01Z"), status: "ACTIVE" } });
    const guardian = await db.guardian.create({ data: { workspaceId, fullName: "Verified guardian" } });
    const link = await db.familyLink.create({ data: { workspaceId, guardianId: guardian.id, childMemberId: child.id } });
    const owner = workspace.workspaceUsers.find(row => row.userId === ownerUserId)!;
    const grant = await db.memberPortalGrant.create({ data: { workspaceId, userId: actorUserId, memberId: child.id, guardianId: guardian.id, verifiedByWorkspaceUserId: owner.id, verificationNote: "Fictional verified identity and authority", canBook: true, canSign: false, canPay: false } });
    const bearer = randomUUID(), session = await db.authSession.create({ data: { userId: actorUserId, tokenHash: createHash("sha256").update(bearer).digest("hex"), expiresAt: new Date("2035-01-01Z") } });
    const resolved = await auth.getSessionWithReference({ cookieStore: { get: () => ({ value: bearer }), set: () => {} }, cookieName: auth.MEMBER_SESSION_COOKIE_NAME });
    expect(resolved!.currentSession.id).toBe(session.id);
    const actor: MemberCommandActor = { userId: resolved!.session.userId, sessionId: resolved!.currentSession.id };
    const program = await db.program.create({ data: { workspaceId, name: "Training" } });
    const template = await db.classTemplate.create({ data: { workspaceId, programId: program.id, roomId: workspace.location!.rooms[0]!.id, weekday: "MONDAY", startTimeMinutes: 1080, endTimeMinutes: 1140, bookingCutoffMinutes: 0, cancellationCutoffMinutes: 120 } });
    const product = await db.punchCardProduct.create({ data: { workspaceId, name: "Paid class pack", punchesIncluded: 5, priceCents: 5000, currency: "cad" } });
    const pack = await db.memberPunchCard.create({ data: { workspaceId, memberId: child.id, punchCardProductId: product.id, originalPunches: 5, remainingPunches: 5, purchasePriceCents: 5000, purchaseCurrency: "cad", acceptedTerms: JSON.parse(JSON.stringify(api.snapshotPunchCardTerms(product, now))) } });
    const common = { workspaceId, memberId: child.id, actor, classTemplateId: template.id, scheduledForDate: "2030-01-07", timezone: "UTC", source: "MEMBER_PORTAL" as const, db: db as never, now, authorizationClock: () => now };
    const review = async () => {
      const access = await api.resolveBookingAccessForProgram({ ...common, programId: program.id, occurrenceStartsAt: new Date("2030-01-07T18:00:00Z"), allowDropIn: false, includeDirectBookingFunding: true });
      if (!access.directBookingFunding) throw new Error("Fictional paid pack unavailable");
      return api.buildDirectBookingFundingReview({ workspaceId, memberId: child.id, classTemplateId: template.id, scheduledForDate: common.scheduledForDate,
        occurrence: { programId: program.id, startsAt: "2030-01-07T18:00:00.000Z", endsAt: "2030-01-07T19:00:00.000Z", timezone: "UTC", cancellationCutoffMinutes: 120 }, funding: access.directBookingFunding.funding });
    };
    const state = async () => ({
      bookings: await db.classBooking.findMany({ where: { workspaceId }, orderBy: { id: "asc" }, select: { id: true, status: true, classTemplateId: true, memberId: true, scheduledForDate: true, fundingRevision: true, memberPunchCardId: true, consumedPunchCount: true, pendingPaymentExpiresAt: true } }),
      packs: await db.memberPunchCard.findMany({ where: { workspaceId }, orderBy: { id: "asc" }, select: { id: true, remainingPunches: true, status: true } }),
      ledger: await db.punchCardEntry.count({ where: { workspaceId } }), allowance: await db.membershipAllowanceAllocation.count({ where: { workspaceId } }),
      queue: await db.waitlistEntry.findMany({ where: { workspaceId }, orderBy: { id: "asc" }, select: { id: true, status: true, promotedBookingId: true, autoPromotionConsentUserId: true } }),
      moves: await db.classBookingMove.count({ where: { workspaceId } }), receipts: await db.workspaceDataEvent.count({ where: { workspaceId } }),
      operations: await db.financialOperation.count({ where: { workspaceId } }), payments: await db.payment.count({ where: { workspaceId } }), notices: await db.notificationJob.count({ where: { workspaceId } }),
    });
    const revokeInput = { workspaceId, actorWorkspaceUserId: owner.id, memberId: child.id, userId: actorUserId, guardianId: guardian.id, expectedVersion: grant.version, reason: "Fictional guardian requested current access revocation", revoke: true, canBook: true, canSign: false, canPay: false, identityAndAuthorityVerified: true };
    return { workspaceId, actorUserId, ownerUserId, owner, account, child, sibling, guardian, link, grant, session, actor, template, pack, product, program, common, review, state, revokeInput };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function prepare(f: Fixture, operation: Operation) {
    const reviewedFunding = await f.review();
    if (operation === "direct") return () => api.createReviewedDirectClassBooking({ ...f.common, reviewedFunding });
    if (operation === "join" || operation === "leave") {
      const occupying = await api.createAccessBackedBooking({ ...f.common, memberId: f.sibling.id, source: "ADMIN", trial: true });
      expect(occupying.status).toBe("created");
      if (operation === "join") return () => api.joinMemberClassWaitlist({ ...f.common, autoPromotionOptIn: true, allowPunchCardFunding: true });
      const queued = await api.joinMemberClassWaitlist({ ...f.common, autoPromotionOptIn: true, allowPunchCardFunding: true });
      if (queued.status === "error") throw new Error(queued.message);
      return () => api.leaveMemberClassWaitlist({ ...f.common, waitlistEntryId: queued.waitlistEntryId });
    }
    const original = await api.createAccessBackedBooking(f.common);
    if (original.status !== "created" && original.status !== "restored") throw new Error("Fictional original booking unavailable");
    if (operation === "cancel") return () => api.cancelMemberClassBooking({ ...f.common, bookingId: original.bookingId });
    const args = { ...f.common, bookingId: original.bookingId, targetClassTemplateId: f.template.id, targetDate: "2030-01-14", mutationId: randomUUID() };
    if (operation === "move-replay") expect((await api.moveMemberClassBooking(args)).status).toBe("moved");
    return () => api.moveMemberClassBooking(args);
  }

  async function waitForPid(blockingPid: number, scheduleWorkspace?: string, rowTable: "member_portal_grants" | "auth_sessions" | "members" = "member_portal_grants") {
    const until = Date.now() + 2500;
    while (Date.now() < until) {
      const rows = scheduleWorkspace
        ? await observer.$queryRaw<Array<{ pid: number }>>`SELECT l.pid FROM pg_locks l WHERE l.locktype='advisory' AND NOT l.granted AND l.objsubid=1 AND l.objid::bigint=(hashtext(${`class-schedule:${scheduleWorkspace}`})::bigint & 4294967295) AND ${blockingPid}=ANY(pg_blocking_pids(l.pid))`
        : await observer.$queryRaw<Array<{ pid: number }>>`SELECT pid FROM pg_stat_activity WHERE ${blockingPid}=ANY(pg_blocking_pids(pid)) AND query ILIKE ${`%${rowTable}%`}`;
      if (rows.length === 1) return rows[0]!.pid;
      await delay(10);
    }
    throw new Error("The exact expected PostgreSQL blocking relationship was not observed");
  }

  /** The actual grant writer holds schedule while its UPDATE waits on a real row lock. */
  async function canonicalRevokeWhileWaiting<T>(f: Fixture, command: () => Promise<T>, permissionOnly = false) {
    let release!: () => void, announce!: (pid: number) => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<number>(resolve => { announce = resolve; });
    const blocker = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM member_portal_grants WHERE id=${f.grant.id} FOR UPDATE`;
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      announce(row!.pid);
      await hold;
    }, { timeout: 10000 });
    const blockerPid = await ready;
    let changeOutcome: ReturnType<typeof change> | undefined;
    let outcome: Promise<T> | undefined;
    try {
      changeOutcome = change(permissionOnly ? { ...f.revokeInput, revoke: false, canBook: false } : f.revokeInput);
      const ownerPid = await waitForPid(blockerPid);
      outcome = command();
      await waitForPid(ownerPid, f.workspaceId);
    } finally { release(); await blocker; }
    expect((await changeOutcome!).error).toBeNull();
    return outcome!;
  }

  it.each(operations)("denies %s after canonical guardian revocation wins its schedule wait", async operation => {
    const f = await fixture(), command = await prepare(f, operation), before = await f.state();
    expect.soft(await canonicalRevokeWhileWaiting(f, async () => command())).toMatchObject({ status: "error", message: expect.stringContaining("booking access changed") });
    expect(await f.state()).toEqual(before);
    expect((await db.memberPortalGrant.findUniqueOrThrow({ where: { id: f.grant.id } })).revokedAt).not.toBeNull();
    expect(await db.portalAccessChange.count({ where: { grantId: f.grant.id } })).toBe(1);
  }, 30000);

  it("denies a still-active guardian whose canBook bit was removed during the schedule wait", async () => {
    const f = await fixture(), command = await prepare(f, "direct"), before = await f.state();
    expect(await canonicalRevokeWhileWaiting(f, async () => command(), true)).toMatchObject({ status: "error" });
    expect(await f.state()).toEqual(before);
    expect((await db.workspaceUser.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.actorUserId } } })).isActive).toBe(true);
  }, 30000);

  it.each(operations)("denies %s after real sign-out-all deletes the authentic session during a schedule wait", async operation => {
    const f = await fixture(), command = await prepare(f, operation), before = await f.state();
    let release!: () => void, announce!: (pid: number) => void;
    const hold = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<number>(resolve => { announce = resolve; });
    const blocker = db.$transaction(async tx => {
      await api.lockClassSchedule(tx, f.workspaceId);
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      announce(row!.pid); await hold;
    }, { timeout: 10000 });
    let outcome: ReturnType<typeof command> | undefined;
    try {
      const pid = await ready; outcome = command(); await waitForPid(pid, f.workspaceId);
      expect((await auth.revokeAllAccountSessions({ userId: f.actorUserId, portal: "member", db })).revokedSessionCount).toBe(1);
    } finally { release(); await blocker; }
    expect.soft(await outcome!).toMatchObject({ status: "error", message: expect.stringContaining("booking access changed") });
    expect(await f.state()).toEqual(before);
  }, 30000);

  it("evaluates expiry after the final grant-row wait instead of at request or transaction start", async () => {
    const f = await fixture(), reviewedFunding = await f.review(), before = await f.state();
    let clock = now, release!: () => void, announce!: (pid: number) => void;
    await db.authSession.update({ where: { id: f.session.id }, data: { expiresAt: new Date(+now + 60000) } });
    const hold = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<number>(resolve => { announce = resolve; });
    const blocker = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM member_portal_grants WHERE id=${f.grant.id} FOR UPDATE`;
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      announce(row!.pid); await hold;
    }, { timeout: 10000 });
    let outcome: ReturnType<typeof api.createReviewedDirectClassBooking> | undefined;
    try {
      const pid = await ready;
      outcome = api.createReviewedDirectClassBooking({ ...f.common, reviewedFunding, authorizationClock: () => clock });
      await waitForPid(pid);
      clock = new Date(+now + 120000);
    } finally { release(); await blocker; }
    expect(await outcome!).toMatchObject({ status: "error" });
    expect(await f.state()).toEqual(before);
  }, 30000);

  it.each(["auth_sessions", "members"] as const)("denies after an exact %s row wait then committed identity revocation", async table => {
    const f = await fixture(), reviewedFunding = await f.review(), before = await f.state();
    let release!: () => void, announce!: (pid: number) => void;
    const hold = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<number>(resolve => { announce = resolve; });
    const blocker = db.$transaction(async tx => {
      if (table === "auth_sessions") await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${f.session.id} AND "userId"=${f.actorUserId} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM members WHERE id=${f.account.id} AND "workspaceId"=${f.workspaceId} FOR UPDATE`;
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      announce(row!.pid); await hold;
      if (table === "auth_sessions") await tx.authSession.delete({ where: { id: f.session.id } });
      else await tx.member.update({ where: { id: f.account.id }, data: { userId: f.ownerUserId } });
    }, { timeout: 10000 });
    let outcome: ReturnType<typeof api.createReviewedDirectClassBooking> | undefined;
    try {
      const pid = await ready;
      outcome = api.createReviewedDirectClassBooking({ ...f.common, reviewedFunding });
      await waitForPid(pid, undefined, table);
    } finally { release(); await blocker; }
    expect.soft(await outcome!).toMatchObject({ status: "error", code: "NO_ACCESS", message: expect.stringContaining("booking access changed") });
    expect(await f.state()).toEqual(before);
    expect((await db.workspaceUser.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.actorUserId } } })).isActive).toBe(true);
    if (table === "auth_sessions") expect(await db.authSession.findUnique({ where: { id: f.session.id } })).toBeNull();
    else {
      expect(await db.member.findUniqueOrThrow({ where: { id: f.account.id } })).toMatchObject({ userId: f.ownerUserId });
      expect(await db.authSession.findUniqueOrThrow({ where: { id: f.session.id } })).toMatchObject({ userId: f.actorUserId });
    }
  }, 30000);

  it.each(["grant", "relationship", "role", "workspace", "foreign-session", "nonexistent-session", "missing-session", "expired-session", "other-child"])("fails closed for current %s and preserves funding", async kind => {
    const f = await fixture(), reviewedFunding = await f.review();
    if (kind === "grant") await db.memberPortalGrant.update({ where: { id: f.grant.id }, data: { canBook: false } });
    if (kind === "relationship") await db.familyLink.delete({ where: { id: f.link.id } });
    if (kind === "role") await db.workspaceUser.update({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.actorUserId } }, data: { isActive: false } });
    if (kind === "workspace") await db.workspace.update({ where: { id: f.workspaceId }, data: { status: "DISABLED" } });
    let sessionId = f.actor.sessionId;
    if (kind === "foreign-session") sessionId = (await db.authSession.create({ data: { userId: f.ownerUserId, tokenHash: createHash("sha256").update(randomUUID()).digest("hex"), expiresAt: new Date("2035-01-01Z") } })).id;
    if (kind === "nonexistent-session") sessionId = randomUUID();
    if (kind === "missing-session") sessionId = "";
    if (kind === "expired-session") await db.authSession.update({ where: { id: f.session.id }, data: { expiresAt: new Date(+now - 1) } });
    const before = await f.state();
    const result = await api.createReviewedDirectClassBooking({ ...f.common, reviewedFunding,
      actor: { ...f.actor, sessionId },
      ...(kind === "other-child" ? { memberId: f.sibling.id, reviewedFunding: api.buildDirectBookingFundingReview({ ...reviewedFunding, memberId: f.sibling.id }) } : {}) });
    expect(result).toMatchObject({ status: "error", code: "NO_ACCESS" }); expect(await f.state()).toEqual(before);
  });

  it("keeps two persisted child grants separate when one can book and the other can only pay", async () => {
    const f = await fixture(), childReview = await f.review();
    await db.familyLink.create({ data: { workspaceId: f.workspaceId, guardianId: f.guardian.id, childMemberId: f.sibling.id } });
    await db.memberPortalGrant.create({ data: { workspaceId: f.workspaceId, userId: f.actorUserId, memberId: f.sibling.id, guardianId: f.guardian.id, verifiedByWorkspaceUserId: f.owner.id, verificationNote: "Fictional independently verified payer-only permission", canBook: false, canSign: false, canPay: true } });
    const siblingPack = await db.memberPunchCard.create({ data: { workspaceId: f.workspaceId, memberId: f.sibling.id, punchCardProductId: f.product.id, originalPunches: 5, remainingPunches: 5, purchasePriceCents: 5000, purchaseCurrency: "cad", acceptedTerms: JSON.parse(JSON.stringify(api.snapshotPunchCardTerms(f.product, now))) } });
    const childBooking = await api.createReviewedDirectClassBooking({ ...f.common, reviewedFunding: childReview });
    if (childBooking.status !== "created") throw new Error("The first child's actual booking grant must authorize its reviewed paid pack");
    expect(await db.classBooking.findUniqueOrThrow({ where: { id: childBooking.bookingId } })).toMatchObject({ memberId: f.child.id, guardianId: f.guardian.id, memberPunchCardId: f.pack.id });
    const siblingAccess = await api.resolveBookingAccessForProgram({ ...f.common, memberId: f.sibling.id, programId: f.program.id, occurrenceStartsAt: new Date("2030-01-07T18:00:00Z"), includeDirectBookingFunding: true, allowDropIn: false });
    if (!siblingAccess.directBookingFunding) throw new Error("The other child's own reviewed paid pack is required for this authority control");
    const siblingReview = api.buildDirectBookingFundingReview({ ...childReview, memberId: f.sibling.id, funding: siblingAccess.directBookingFunding.funding });
    const before = await f.state();
    expect(await api.createReviewedDirectClassBooking({ ...f.common, memberId: f.sibling.id, reviewedFunding: siblingReview })).toMatchObject({ status: "error", code: "NO_ACCESS", message: expect.stringContaining("booking access changed") });
    expect(await f.state()).toEqual(before);
    expect((await db.memberPunchCard.findUniqueOrThrow({ where: { id: siblingPack.id } })).remainingPunches).toBe(5);
    const payerScope = await db.$transaction(tx => api.requireCurrentMemberBookingAuthorityTx(tx, { workspaceId: f.workspaceId, memberId: f.sibling.id, actor: f.actor, permission: "pay", authorizationClock: () => now }));
    expect(payerScope).toMatchObject({ memberId: f.sibling.id, guardianId: f.guardian.id, canBook: false, canPay: true });
  });

  it("uses current guardian attribution and one paid unit without inferring canPay", async () => {
    const f = await fixture(), reviewedFunding = await f.review();
    const result = await api.createReviewedDirectClassBooking({ ...f.common, reviewedFunding, guardianId: "ignored-stale-guardian", allowDropIn: true });
    if (result.status !== "created") throw new Error("Current booking-only guardian should reserve its reviewed pack");
    expect(await db.classBooking.findUniqueOrThrow({ where: { id: result.bookingId } })).toMatchObject({ guardianId: f.guardian.id, memberPunchCardId: f.pack.id, consumedPunchCount: 1 });
    expect((await db.memberPunchCard.findUniqueOrThrow({ where: { id: f.pack.id } })).remainingPunches).toBe(4);
    expect(await db.financialOperation.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
  });

  it("requires current canPay separately before a new drop-in claim and permits a current self booking", async () => {
    const f = await fixture();
    await db.memberPunchCard.update({ where: { id: f.pack.id }, data: { status: "ARCHIVED" } });
    const product = await db.dropInProduct.create({ data: { workspaceId: f.workspaceId, name: "Separate one-time class", priceCents: 2500, currency: "cad" } });
    const access = await api.resolveBookingAccessForProgram({ ...f.common, programId: f.program.id, occurrenceStartsAt: new Date("2030-01-07T18:00:00Z"), includeDirectBookingFunding: true, allowDropIn: true });
    if (!access.directBookingFunding || access.directBookingFunding.funding.kind !== "DROP_IN") throw new Error("Fictional drop-in required");
    const reviewedFunding = api.buildDirectBookingFundingReview({ workspaceId: f.workspaceId, memberId: f.child.id, classTemplateId: f.template.id, scheduledForDate: f.common.scheduledForDate,
      occurrence: { programId: f.program.id, startsAt: "2030-01-07T18:00:00.000Z", endsAt: "2030-01-07T19:00:00.000Z", timezone: "UTC", cancellationCutoffMinutes: 120 }, funding: access.directBookingFunding.funding });
    const before = await f.state();
    expect(await api.createReviewedDirectClassBooking({ ...f.common, reviewedFunding })).toMatchObject({ status: "error", code: "NO_ACCESS" });
    expect(await f.state()).toEqual(before);
    await db.memberPortalGrant.update({ where: { id: f.grant.id }, data: { canPay: true } });
    const paidClaim = await api.createReviewedDirectClassBooking({ ...f.common, reviewedFunding });
    expect(paidClaim).toMatchObject({ status: "payment_required", dropInProductId: product.id, priceCents: 2500, currency: "cad" });
    expect(await db.financialOperation.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    expect(await db.payment.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    // A pay-only grant never gains booking permission from its payment bit.
    await db.memberPortalGrant.update({ where: { id: f.grant.id }, data: { canBook: false } });
    expect(await api.cancelMemberClassBooking({ ...f.common, bookingId: "unreadable-booking" })).toMatchObject({ status: "error", message: expect.stringContaining("booking access changed") });
    // Self scope uses the authentic account binding, without requiring a child grant.
    const ownPack = await db.memberPunchCard.create({ data: { workspaceId: f.workspaceId, memberId: f.account.id, punchCardProductId: f.product.id, originalPunches: 5, remainingPunches: 5, purchasePriceCents: 5000, purchaseCurrency: "cad", acceptedTerms: JSON.parse(JSON.stringify(api.snapshotPunchCardTerms(f.product, now))) } });
    const ownAccess = await api.resolveBookingAccessForProgram({ ...f.common, memberId: f.account.id, programId: f.program.id, scheduledForDate: "2030-01-14", occurrenceStartsAt: new Date("2030-01-14T18:00:00Z"), includeDirectBookingFunding: true, allowDropIn: false });
    if (!ownAccess.directBookingFunding) throw new Error("Fictional self pack required");
    const ownReview = api.buildDirectBookingFundingReview({ ...reviewedFunding, memberId: f.account.id, scheduledForDate: "2030-01-14", occurrence: { ...reviewedFunding.occurrence, startsAt: "2030-01-14T18:00:00.000Z", endsAt: "2030-01-14T19:00:00.000Z" }, funding: ownAccess.directBookingFunding.funding });
    const own = await api.createReviewedDirectClassBooking({ ...f.common, memberId: f.account.id, scheduledForDate: "2030-01-14", reviewedFunding: ownReview });
    if (own.status !== "created") throw new Error("Current own-account booking must succeed");
    expect(await db.classBooking.findUniqueOrThrow({ where: { id: own.bookingId } })).toMatchObject({ guardianId: null, memberId: f.account.id, memberPunchCardId: ownPack.id });
  });

  it("keeps accepted waitlist standing consent valid after sign-out while the exact grant remains active", async () => {
    const f = await fixture();
    const occupied = await api.createAccessBackedBooking({ ...f.common, memberId: f.sibling.id, source: "ADMIN", trial: true });
    if (occupied.status !== "created") throw new Error("Fictional full class required");
    const queue = await api.joinMemberClassWaitlist({ ...f.common, autoPromotionOptIn: true, allowPunchCardFunding: true });
    expect(queue.status).toBe("joined");
    await auth.revokeAllAccountSessions({ userId: f.actorUserId, portal: "member", db });
    expect((await api.cancelAccessBackedBooking({ ...f.common, memberId: f.sibling.id, bookingId: occupied.bookingId })).status).toBe("cancelled");
    expect(await db.classBooking.findFirst({ where: { workspaceId: f.workspaceId, memberId: f.child.id, status: "BOOKED" } })).toMatchObject({ memberPunchCardId: f.pack.id, consumedPunchCount: 1 });
    const stored = await db.waitlistEntry.findFirstOrThrow({ where: { workspaceId: f.workspaceId } });
    expect(JSON.stringify(stored)).not.toContain(f.session.id);
  });

  it("suppresses standing promotion after the guardian grant is revoked, independent of session expiry", async () => {
    const f = await fixture();
    const occupied = await api.createAccessBackedBooking({ ...f.common, memberId: f.sibling.id, source: "ADMIN", trial: true });
    if (occupied.status !== "created") throw new Error("Fictional full class required");
    expect((await api.joinMemberClassWaitlist({ ...f.common, autoPromotionOptIn: true, allowPunchCardFunding: true })).status).toBe("joined");
    await change(f.revokeInput);
    const beforeUnits = (await db.memberPunchCard.findUniqueOrThrow({ where: { id: f.pack.id } })).remainingPunches;
    await api.cancelAccessBackedBooking({ ...f.common, memberId: f.sibling.id, bookingId: occupied.bookingId });
    expect(await db.classBooking.count({ where: { workspaceId: f.workspaceId, memberId: f.child.id, status: "BOOKED" } })).toBe(0);
    expect((await db.memberPunchCard.findUniqueOrThrow({ where: { id: f.pack.id } })).remainingPunches).toBe(beforeUnits);
    expect(await db.waitlistEntry.findFirstOrThrow({ where: { workspaceId: f.workspaceId } })).toMatchObject({ status: "ACTIVE", lastSkipReason: expect.stringContaining("no longer has verified booking authority") });
  });

  afterAll(async () => {
    if (!db) return;
    for (const workspaceId of workspaces) await db.$transaction(async tx => {
      await api.lockClassSchedule(tx, workspaceId);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial:${workspaceId}`}))::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`retention:${workspaceId}`}))::text`;
      const inventory = await inspectRetentionInventory(tx, workspaceId);
      await deleteReviewedWorkspaceRecords(tx, workspaceId, inventory.fingerprint);
    }, { isolationLevel: "Serializable", timeout: 120000 });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await observer.$disconnect();
  }, 120000);
});
