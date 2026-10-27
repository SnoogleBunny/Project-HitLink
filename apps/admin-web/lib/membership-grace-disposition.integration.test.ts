import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, type Prisma, createAccessBackedBooking, cancelAccessBackedBooking, joinWaitlist, lockClassSchedule, processMembershipGraceDisposition, processWorkspaceWaitlists, reconcileMembershipInvoice, shouldDeliverNotification, snapshotMembershipTerms, snapshotPunchCardTerms } from "@flowstate/db";
import { settleMembershipAllowance } from "../../../packages/db/src/membership-allowances.js";
import { membershipGraceReceiptId } from "../../../packages/db/src/membership-grace-disposition.js";
import { projectMembershipGraceReceipt } from "../../../packages/db/src/membership-grace-projection.js";
import { buildMemberDataArtifact } from "../../../packages/db/src/member-export-snapshot.js";
import { inspectRetentionInventory, deleteReviewedWorkspaceRecords } from "../../../packages/db/src/retention-inventory.js";
import { beforeGrace, deadline, graceFixture, requireGraceTestDatabase } from "./membership-grace-fixture";
const url = process.env.TEST_DATABASE_URL;
requireGraceTestDatabase(url);
(url ? describe : describe.skip)("MP13 bounded penalty-free membership grace disposition", () => {
  const db = new PrismaClient({ datasourceUrl: url, log: [] });
  const observer = new PrismaClient({ datasourceUrl: url, log: [] });
  const fixtures: Awaited<ReturnType<typeof graceFixture>>[] = [], extraUsers: string[] = [];
  let f: Awaited<ReturnType<typeof graceFixture>>;
  beforeEach(async () => { f = await graceFixture(db); fixtures.push(f); });
  afterEach(async () => {
    // Dispose only this case's fictional workspaces through reviewed inventory.
    // Shift after success so a failed purge remains available for diagnosis.
    while (fixtures.length) {
      await fixtures[0]!.dispose();
      fixtures.shift();
    }
    await db.user.deleteMany({ where: { id: { in: extraUsers } } });
    extraUsers.length = 0;
  });
  afterAll(async () => { await observer.$disconnect(); await db.$disconnect(); });
  const sweep = (afterBookingId?: string, limit = 100, graceClock = () => deadline, client: PrismaClient = db, throughBookingId?: string) => processMembershipGraceDisposition({ workspaceId: f.workspaceId, afterBookingId, throughBookingId, limit, db: client, graceClock });
  const status = async (id: string) => (await db.classBooking.findUniqueOrThrow({ where: { id } })).status;
  async function hold(bookingId: string) {
    const operation = await db.financialOperation.create({ data: { workspaceId: f.workspaceId, operationKey: `fixture-refund-${randomUUID()}`, requestHash: "a".repeat(64), kind: "REFUND", providerIdempotencyKey: randomUUID(), payload: {}, status: "SUBMITTED" } });
    return db.financialEntitlementHold.create({ data: { workspaceId: f.workspaceId, operationId: operation.id, targetKind: "BOOKING", targetId: bookingId } });
  }
  async function person() {
    const user = await db.user.create({ data: { email: `grace-next-${randomUUID()}@example.test`, workspaceUsers: { create: { workspaceId: f.workspaceId, role: "CUSTOMER" } } } }); extraUsers.push(user.id);
    const member = await db.member.create({ data: { workspaceId: f.workspaceId, userId: user.id, fullName: "Next fictional participant", status: "ACTIVE", dateOfBirth: new Date("1990-01-01") } });
    const plan = await db.membershipPlan.create({ data: { workspaceId: f.workspaceId, name: `Unrestricted fictional plan ${user.id}`, monthlyPriceCents: 10000 } });
    const membership = await db.memberMembership.create({ data: { workspaceId: f.workspaceId, memberId: member.id, membershipPlanId: plan.id, status: "ACTIVE", startedAt: beforeGrace, allowanceTimezone: "UTC", allowanceAnchorDate: new Date("2030-01-01"), acceptedTerms: JSON.parse(JSON.stringify(snapshotMembershipTerms(plan))) } });
    return { userId: user.id, memberId: member.id, membershipId: membership.id };
  }
  async function whileBlocked(lock: "schedule" | "invoice", change: (tx: Prisma.TransactionClient) => Promise<unknown>, command: (client: PrismaClient) => Promise<unknown>) {
    let ready!: (pid: number) => void, release!: () => void, waiterReady!: (pid: number) => void;
    const locked = new Promise<number>(resolve => { ready = resolve; }), canCommit = new Promise<void>(resolve => { release = resolve; });
    const waiterStarted = new Promise<number>(resolve => { waiterReady = resolve; });
    const blocker = db.$transaction(async tx => {
      if (lock === "schedule") await lockClassSchedule(tx, f.workspaceId);
      else await tx.$queryRaw`SELECT id FROM invoices WHERE "workspaceId"=${f.workspaceId} FOR UPDATE`;
      const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      ready(rows[0]!.pid); await canCommit; await change(tx);
    }, { timeout: 15000 }).then(() => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error }));
    let outcome: Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }> | undefined;
    let blockerFailed = false, blockerError: unknown;
    try {
      const initial = await Promise.race([
        locked.then(pid => ({ kind: "ready" as const, pid })),
        blocker.then(result => ({ kind: "finished" as const, result })),
      ]);
      if (initial.kind === "finished") {
        if (!initial.result.ok) throw initial.result.error;
        throw Error("The blocker completed without acquiring its expected lock.");
      }
      const blockerPid = initial.pid;
      // Observe the SAME transaction that will request the held schedule/invoice
      // lock. This read does not change the production transaction options.
      const traced = new Proxy(db, { get(target, key) {
        if (key === "$transaction") return <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => target.$transaction(async tx => {
          const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
          waiterReady(rows[0]!.pid);
          return callback(tx);
        }, options);
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      outcome = command(traced).then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
      const started = await Promise.race([
        waiterStarted.then(pid => ({ kind: "started" as const, pid })),
        outcome.then(result => ({ kind: "finished" as const, result })),
      ]);
      if (started.kind === "finished") {
        if (!started.result.ok) throw started.result.error;
        throw Error("The command completed before entering its observed transaction.");
      }
      const waiterPid = started.pid;
      expect(waiterPid).not.toBe(blockerPid);
      let observed: Array<{ pid: number; blockedBy: number[]; locktype: string; query: string }> = [];
      await expect.poll(async () => {
        observed = lock === "schedule"
          ? await observer.$queryRaw`SELECT a.pid, pg_blocking_pids(a.pid) AS "blockedBy", l.locktype, a.query FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.pid=${waiterPid} AND NOT l.granted AND ${blockerPid}=ANY(pg_blocking_pids(a.pid)) AND l.locktype='advisory' AND l.objid=hashtext(${`class-schedule:${f.workspaceId}`})::oid AND a.query LIKE '%pg_advisory_xact_lock%'`
          : await observer.$queryRaw`SELECT a.pid, pg_blocking_pids(a.pid) AS "blockedBy", l.locktype, a.query FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.pid=${waiterPid} AND NOT l.granted AND ${blockerPid}=ANY(pg_blocking_pids(a.pid)) AND l.locktype IN ('transactionid','tuple') AND a.query LIKE '%FROM invoices%' AND a.query LIKE '%FOR SHARE%'`;
        return observed.length;
      }, { timeout: 2000 }).toBeGreaterThan(0);
      console.info("MP13_OBSERVED_WAIT", JSON.stringify({ lock, blockerPid, waiterPid, observed }));
    } finally {
      release();
      const completed = await blocker;
      // Drain an early/failing command too, so no transaction escapes cleanup.
      if (outcome) await outcome;
      if (!completed.ok) { blockerFailed = true; blockerError = completed.error; }
    }
    if (blockerFailed) throw blockerError;
    return outcome!;
  }
  it("legacy failed summary without canonical invoice history restricts without inventing a deadline", async () => {
    const booking = await f.book("2030-01-15");
    await db.membershipBillingState.create({ data: { workspaceId: f.workspaceId, memberId: f.memberId, memberMembershipId: f.membershipId, status: "PAYMENT_FAILED", failedAt: null, gracePeriodEndsAt: null, failureCode: "payment_failure_time_unknown" } });
    expect((await sweep()).cancelled).toBe(1); expect(await status(booking.id)).toBe("CANCELLED");
    expect(await db.invoice.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    const summary = await db.membershipBillingState.findUniqueOrThrow({ where: { memberMembershipId: f.membershipId } });
    expect(summary.failedAt).toBeNull(); expect(summary.gracePeriodEndsAt).toBeNull();
    const receipt = await db.workspaceDataEvent.findUniqueOrThrow({ where: { id: membershipGraceReceiptId(f.workspaceId, booking.id, booking.fundingRevision) } });
    expect(receipt.metadata).toMatchObject({ basis: "UNRESOLVED_FAILURE_TIMING", invoiceId: null, gracePeriodEndsAt: null });
  });
  it.each(["PAID", "VOID"] as const)("canonical %s invoice history suppresses a stale legacy failed summary", async canonicalStatus => {
    const booking = await f.book("2030-01-15");
    const invoice = await db.invoice.create({ data: { workspaceId: f.workspaceId, memberId: f.memberId, memberMembershipId: f.membershipId, status: canonicalStatus, subtotalCents: 10000, totalCents: 10000, amountPaidCents: canonicalStatus === "PAID" ? 10000 : 0, amountDueCents: 0, currency: "cad", ...(canonicalStatus === "PAID" ? { paidAt: beforeGrace } : { voidedAt: beforeGrace }) } });
    await db.membershipBillingState.create({ data: { workspaceId: f.workspaceId, memberId: f.memberId, memberMembershipId: f.membershipId, status: "PAYMENT_FAILED", failedAt: null, gracePeriodEndsAt: null, failureCode: "payment_failure_time_unknown" } });
    expect((await sweep()).cancelled).toBe(0); expect(await status(booking.id)).toBe("BOOKED");
    expect(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toEqual(invoice);
    expect(await db.workspaceDataEvent.count({ where: { workspaceId: f.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED" } })).toBe(0);
    expect(await db.notificationJob.count({ where: { workspaceId: f.workspaceId, dedupeKey: { startsWith: "membership-grace:" } } })).toBe(0);
  });
  it("releasing restored funding revision2 preserves revision1 late-cancel usage and original windows", async () => {
    const originalBooking = await f.book(); await f.reconcile(beforeGrace);
    const cancelled = await cancelAccessBackedBooking({ workspaceId: f.workspaceId, memberId: f.memberId, bookingId: originalBooking.id, timezone: "UTC", db: db as never, now: new Date("2030-01-07T20:00:00Z") });
    expect(cancelled).toMatchObject({ status: "cancelled", lateCancellation: true });
    const firstRevision = await db.membershipAllowanceAllocation.findMany({ where: { bookingId: originalBooking.id, bookingRevision: 1 }, orderBy: { id: "asc" } });
    expect(firstRevision).toHaveLength(2); expect(firstRevision.every(row => row.state === "USED")).toBe(true);
    const restored = await createAccessBackedBooking({ workspaceId: f.workspaceId, memberId: f.memberId, classTemplateId: f.templateId, scheduledForDate: "2030-01-08", timezone: "UTC", source: "ADMIN", db: db as never, now: new Date("2030-01-07T20:01:00Z") });
    expect(restored).toMatchObject({ status: "restored", bookingId: originalBooking.id });
    expect((await db.classBooking.findUniqueOrThrow({ where: { id: originalBooking.id } })).fundingRevision).toBe(2);
    const secondRevision = await db.membershipAllowanceAllocation.findMany({ where: { bookingId: originalBooking.id, bookingRevision: 2 }, orderBy: { id: "asc" } });
    expect(secondRevision).toHaveLength(2); expect(secondRevision.every(row => row.state === "RESERVED")).toBe(true);
    expect((await sweep()).cancelled).toBe(1);
    expect(await db.membershipAllowanceAllocation.findMany({ where: { bookingId: originalBooking.id, bookingRevision: 1 }, orderBy: { id: "asc" } })).toEqual(firstRevision);
    const released = await db.membershipAllowanceAllocation.findMany({ where: { bookingId: originalBooking.id, bookingRevision: 2 }, orderBy: { id: "asc" } });
    expect(released.map(row => [row.id,row.periodStart,row.periodEnd,row.state])).toEqual(secondRevision.map(row => [row.id,row.periodStart,row.periodEnd,"RELEASED"]));
    const receipt = await db.workspaceDataEvent.findUniqueOrThrow({ where: { id: membershipGraceReceiptId(f.workspaceId, originalBooking.id, 2) } });
    expect(receipt.metadata).toMatchObject({ fundingRevision: 2, allowanceAllocationIds: secondRevision.map(row => row.id).sort() });
    expect(await db.workspaceDataEvent.findUnique({ where: { id: membershipGraceReceiptId(f.workspaceId, originalBooking.id, 1) } })).toBeNull();
    expect(await db.membershipAllowanceEntry.count({ where: { workspaceId: f.workspaceId, usedDelta: 1 } })).toBe(2);
    expect(await db.membershipAllowanceEntry.count({ where: { workspaceId: f.workspaceId, usedDelta: -1 } })).toBe(0);
  });
  it("settling one invoice cannot protect a reservation from another expired debt on the same exact membership", async () => {
    const booking = await f.book("2030-01-15"); await f.reconcile(beforeGrace);
    await reconcileMembershipInvoice({ workspaceId: f.workspaceId, evidence: f.evidence({ id: `${f.evidence().id}_second` }), eventId: randomUUID(), db, now: beforeGrace, graceClock: () => beforeGrace });
    await f.reconcile(deadline, true);
    expect(await status(booking.id)).toBe("CANCELLED");
    expect((await db.membershipBillingState.findUniqueOrThrow({ where: { memberMembershipId: f.membershipId } })).status).toBe("PAYMENT_FAILED");
    expect(await db.invoice.count({ where: { workspaceId: f.workspaceId, status: "OPEN", amountDueCents: { gt: 0 } } })).toBe(1);
  });
  it("a separately failed invoice still within its own fixed grace retains the reservation until its own deadline", async () => {
    const booking = await f.book("2030-01-15"); await f.reconcile(beforeGrace);
    const secondFailure = new Date("2030-01-07T12:00:00Z"), secondDeadline = new Date("2030-01-14T12:00:00Z");
    await reconcileMembershipInvoice({ workspaceId: f.workspaceId, evidence: f.evidence({ id: `${f.evidence().id}_second`, firstFailedAt: secondFailure }), eventId: randomUUID(), db, now: secondFailure, graceClock: () => secondFailure });
    await f.reconcile(deadline, true);
    expect(await status(booking.id)).toBe("BOOKED");
    await sweep(undefined, 100, () => new Date(+secondDeadline - 1)); expect(await status(booking.id)).toBe("BOOKED");
    await sweep(undefined, 100, () => secondDeadline); expect(await status(booking.id)).toBe("CANCELLED");
  });
  it("a held first row does not starve later eligible IDs, and a released hold is revisited next sweep", async () => {
    const bookings = [await f.book("2030-01-08"), await f.book("2030-01-15"), await f.book("2030-01-22")].sort((a,b) => a.id.localeCompare(b.id));
    const first = bookings[0]!, held = await hold(first.id);
    await f.reconcile(beforeGrace);
    const one = await sweep(undefined, 1); expect(one.checked).toBe(1); expect(one.cancelled).toBe(0); expect(one.nextBookingId).toBe(first.id);
    const two = await sweep(one.nextBookingId!, 1, () => deadline, db, one.throughBookingId!); expect(two.cancelled).toBe(1); expect(two.nextBookingId).toBe(bookings[1]!.id);
    const three = await sweep(two.nextBookingId!, 1, () => deadline, db, two.throughBookingId!); expect(three.cancelled).toBe(1); expect(three.nextBookingId).toBeNull();
    expect(await status(first.id)).toBe("BOOKED");
    expect(await db.financialReviewCase.count({ where: { workspaceId: f.workspaceId, sourceKey: { startsWith: "membership-grace-held:" } } })).toBe(1);
    await db.financialEntitlementHold.update({ where: { id: held.id }, data: { activeSlot: null, releasedAt: deadline } });
    expect((await sweep(undefined, 1)).cancelled).toBe(1);
    expect(await status(first.id)).toBe("CANCELLED");
  });
  it("a captured end ID bounds the whole pass even when later bookings appear", async () => {
    const firstBooking = await f.book(), secondBooking = await f.book("2030-01-15"); await f.reconcile(beforeGrace);
    const first = await sweep(undefined, 1, () => beforeGrace);
    expect(first.nextBookingId).not.toBeNull(); expect(first.throughBookingId).not.toBeNull();
    // Controlled new legacy reservation exercises SQL/keyset ordering, not a payment/provider path.
    const later = await db.classBooking.create({ data: { id: `zz_new_${randomUUID()}`, workspaceId: f.workspaceId, memberId: f.memberId, classTemplateId: f.templateId, scheduledForDate: new Date("2030-01-22"), bookingType: "MEMBERSHIP", fundingMembershipId: f.membershipId, acceptedPolicy: firstBooking.acceptedPolicy as Prisma.InputJsonValue } });
    const end = await sweep(first.nextBookingId!, 1, () => beforeGrace, db, first.throughBookingId!);
    expect(end.checked).toBe(1); expect(end.nextBookingId).toBeNull();
    expect(await status(later.id)).toBe("BOOKED");
    const nextPass = await sweep(); expect(nextPass.cancelled).toBe(3);
    expect(await status(firstBooking.id)).toBe("CANCELLED"); expect(await status(secondBooking.id)).toBe("CANCELLED"); expect(await status(later.id)).toBe("CANCELLED");
  });
  it("preserves independently funded pack, paid drop-in, and another membership", async () => {
    const affected = await f.book();
    const product = await db.punchCardProduct.create({ data: { workspaceId: f.workspaceId, name: "Independent pack", punchesIncluded: 5, priceCents: 5000 } });
    const card = await db.memberPunchCard.create({ data: { workspaceId: f.workspaceId, memberId: f.memberId, punchCardProductId: product.id, originalPunches: 5, remainingPunches: 5, purchasePriceCents: 5000, acceptedTerms: JSON.parse(JSON.stringify(snapshotPunchCardTerms(product))) } });
    await db.memberMembership.update({ where: { id: f.membershipId }, data: { status: "FROZEN", frozenFrom: new Date("2030-01-01"), frozenUntil: new Date("2030-02-01") } });
    const packed = await f.book("2030-01-15"); expect(packed.bookingType).toBe("PUNCH_CARD");
    const other = await person();
    const otherBooking = await createAccessBackedBooking({ workspaceId: f.workspaceId, memberId: other.memberId, classTemplateId: f.templateId, scheduledForDate: "2030-01-08", timezone: "UTC", source: "ADMIN", db: db as never, now: beforeGrace });
    expect(otherBooking.status).toBe("created");
    if (otherBooking.status === "error") throw Error(otherBooking.message);
    // A preexisting fictional paid reservation is a preservation control; no provider is called.
    const dropIn = await db.classBooking.create({ data: { workspaceId: f.workspaceId, memberId: f.memberId, classTemplateId: f.templateId, scheduledForDate: new Date("2030-01-22"), bookingType: "DROP_IN", status: "BOOKED", dropInPaidAt: beforeGrace, dropInPriceCents: 2000, dropInCurrency: "cad" } });
    await f.reconcile(beforeGrace);
    expect((await sweep()).cancelled).toBe(1);
    expect(await status(affected.id)).toBe("CANCELLED"); expect(await status(packed.id)).toBe("BOOKED"); expect(await status(otherBooking.bookingId!)).toBe("BOOKED"); expect(await status(dropIn.id)).toBe("BOOKED");
    expect((await db.memberPunchCard.findUniqueOrThrow({ where: { id: card.id } })).remainingPunches).toBe(4);
    expect((await db.memberMembership.findUniqueOrThrow({ where: { id: f.membershipId } })).status).toBe("FROZEN");
    await f.reconcile(new Date(+deadline + 60000), true);
    expect((await db.memberMembership.findUniqueOrThrow({ where: { id: f.membershipId } })).status).toBe("FROZEN");
    expect(await status(affected.id)).toBe("CANCELLED"); expect(await status(packed.id)).toBe("BOOKED");
  });
  it("never changes a past occurrence or an attendance-linked reservation and its original allowance", async () => {
    await db.classTemplate.update({ where: { id: f.templateId }, data: { startTimeMinutes: 540, endTimeMinutes: 600 } });
    const past = await f.book();
    const attended = await f.book("2030-01-15");
    await db.attendanceRecord.create({ data: { workspaceId: f.workspaceId, memberId: f.memberId, classTemplateId: f.templateId, scheduledForDate: attended.scheduledForDate, state: "PRESENT" } });
    const allocations = await db.membershipAllowanceAllocation.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } });
    await f.reconcile(beforeGrace);
    expect((await sweep()).cancelled).toBe(0); expect(await status(past.id)).toBe("BOOKED"); expect(await status(attended.id)).toBe("BOOKED");
    expect(await db.membershipAllowanceAllocation.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } })).toEqual(allocations);
    expect(await db.workspaceDataEvent.count({ where: { workspaceId: f.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED" } })).toBe(0);
  });
  it("an unknown first-failure time restricts without inventing a deadline", async () => {
    const booking = await f.book();
    await reconcileMembershipInvoice({ workspaceId: f.workspaceId, evidence: f.evidence({ firstFailedAt: undefined, failureCode: "payment_failure_time_unknown" }), eventId: randomUUID(), db, now: deadline, graceClock: () => deadline });
    expect(await status(booking.id)).toBe("CANCELLED");
    const invoice = await db.invoice.findFirstOrThrow({ where: { workspaceId: f.workspaceId } });
    expect(invoice.firstFailedAt).toBeNull(); expect(invoice.gracePeriodEndsAt).toBeNull();
    const receipt = await db.workspaceDataEvent.findUniqueOrThrow({ where: { id: membershipGraceReceiptId(f.workspaceId, booking.id, booking.fundingRevision) } });
    expect(receipt.metadata).toMatchObject({ basis: "UNRESOLVED_FAILURE_TIMING", gracePeriodEndsAt: null });
  });
  it("rechecks canonical invoice settlement committed during its exact row-lock wait", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace);
    const result = await whileBlocked("invoice", tx => tx.invoice.updateMany({ where: { workspaceId: f.workspaceId }, data: { status: "PAID", amountPaidCents: 10000, amountDueCents: 0, paidAt: deadline } }), client => sweep(undefined, 100, () => deadline, client));
    expect(result.ok).toBe(true); expect(await status(booking.id)).toBe("BOOKED");
    expect(await db.workspaceDataEvent.count({ where: { workspaceId: f.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED" } })).toBe(0);
  });
  it("uses a post-wait clock when grace crosses the deadline while the workspace schedule is held", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace);
    let current = new Date(+deadline - 1);
    const result = await whileBlocked("schedule", async () => { current = deadline; }, client => sweep(undefined, 100, () => current, client));
    expect(result.ok).toBe(true); expect(await status(booking.id)).toBe("CANCELLED");
    const receipt = await db.workspaceDataEvent.findFirstOrThrow({ where: { workspaceId: f.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED" } });
    expect(receipt.metadata).toMatchObject({ restrictedAt: deadline.toISOString() });
  });
  it("a disabled business committed while waiting does not release a seat or enqueue an operational notice", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace);
    const result = await whileBlocked("schedule", tx => tx.workspace.update({ where: { id: f.workspaceId }, data: { status: "DISABLED" } }), client => sweep(undefined, 100, () => deadline, client));
    expect(result.ok).toBe(true); expect(await status(booking.id)).toBe("BOOKED");
    expect(await db.notificationJob.count({ where: { workspaceId: f.workspaceId, dedupeKey: { startsWith: "membership-grace:" } } })).toBe(0);
  });
  it("an outbox failure rolls back cancellation, allowance entry and immutable receipt together", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace);
    const original = await db.membershipAllowanceAllocation.findMany({ where: { bookingId: booking.id }, orderBy: { id: "asc" } });
    const failing = db.$extends({ query: { notificationJob: { async createMany() { throw Error("Injected queue failure"); } } } }) as unknown as PrismaClient;
    await expect(sweep(undefined, 100, () => deadline, failing)).rejects.toThrow("Injected queue failure");
    expect(await status(booking.id)).toBe("BOOKED");
    expect(await db.membershipAllowanceAllocation.findMany({ where: { bookingId: booking.id }, orderBy: { id: "asc" } })).toEqual(original);
    expect(await db.workspaceDataEvent.count({ where: { workspaceId: f.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED" } })).toBe(0);
  });
  it("two concurrent pages release each funding revision and notice once", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace);
    await Promise.all([sweep(), sweep()]);
    expect(await status(booking.id)).toBe("CANCELLED");
    expect(await db.workspaceDataEvent.count({ where: { workspaceId: f.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED" } })).toBe(1);
    expect(await db.notificationJob.count({ where: { workspaceId: f.workspaceId, dedupeKey: { startsWith: "membership-grace:" } } })).toBe(1);
    expect(await db.membershipAllowanceEntry.count({ where: { workspaceId: f.workspaceId, reservedDelta: -1, usedDelta: 0 } })).toBe(2);
  });
  it("promotes only an existing eligible FIFO consent after committed release, without a member session", async () => {
    await db.room.update({ where: { id: f.roomId }, data: { capacity: 1 } });
    const booking = await f.book("2030-01-15"); const earlier = await person(), later = await person();
    for (const [index, participant] of [earlier, later].entries()) await joinWaitlist({ workspaceId: f.workspaceId, memberId: participant.memberId, classTemplateId: f.templateId, scheduledForDate: "2030-01-15", timezone: "UTC", source: "MEMBER_PORTAL", consentUserId: participant.userId, autoPromotionOptIn: true, allowPunchCardFunding: false, db: db as never, now: new Date(+beforeGrace + index) });
    await f.reconcile(beforeGrace); await sweep();
    expect(await status(booking.id)).toBe("CANCELLED");
    expect((await processWorkspaceWaitlists(f.workspaceId, deadline, db)).promoted).toBe(1);
    expect(await db.classBooking.count({ where: { workspaceId: f.workspaceId, memberId: earlier.memberId, classTemplateId: f.templateId, scheduledForDate: new Date("2030-01-15"), status: "BOOKED" } })).toBe(1);
    expect(await db.waitlistEntry.findFirst({ where: { workspaceId: f.workspaceId, memberId: later.memberId, classTemplateId: f.templateId, scheduledForDate: new Date("2030-01-15"), status: "ACTIVE" } })).not.toBeNull();
    expect((await processWorkspaceWaitlists(f.workspaceId, deadline, db)).promoted).toBe(0);
  });
  it("a direct claimant cannot jump the standing eligible FIFO queue while a grace release races", async () => {
    await db.room.update({ where: { id: f.roomId }, data: { capacity: 1 } });
    await f.book("2030-01-15"); const queued = await person(), newcomer = await person();
    await joinWaitlist({ workspaceId: f.workspaceId, memberId: queued.memberId, classTemplateId: f.templateId, scheduledForDate: "2030-01-15", timezone: "UTC", source: "MEMBER_PORTAL", consentUserId: queued.userId, autoPromotionOptIn: true, allowPunchCardFunding: false, db: db as never, now: beforeGrace });
    await f.reconcile(beforeGrace);
    const [, direct] = await Promise.all([sweep(), createAccessBackedBooking({ workspaceId: f.workspaceId, memberId: newcomer.memberId, classTemplateId: f.templateId, scheduledForDate: "2030-01-15", timezone: "UTC", source: "ADMIN", db: db as never, now: deadline })]);
    expect(direct.status).toBe("error");
    await processWorkspaceWaitlists(f.workspaceId, deadline, db);
    const seats = await db.classBooking.findMany({ where: { workspaceId: f.workspaceId, classTemplateId: f.templateId, scheduledForDate: new Date("2030-01-15"), status: "BOOKED" } });
    expect(seats).toHaveLength(1); expect(seats[0]!.memberId).toBe(queued.memberId);
    expect(await db.waitlistEntry.count({ where: { workspaceId: f.workspaceId, memberId: queued.memberId, classTemplateId: f.templateId, scheduledForDate: new Date("2030-01-15"), status: "PROMOTED" } })).toBe(1);
  });
  it("checks the deadline again after an invoice-row wait, rather than caching the earlier selection clock", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace);
    let current = new Date(+deadline - 1);
    const result = await whileBlocked("invoice", async () => { current = deadline; }, client => sweep(undefined, 100, () => current, client));
    expect(result.ok).toBe(true); expect(await status(booking.id)).toBe("CANCELLED");
  });
  it("a class that starts during a row wait is preserved without manufacturing absence/no-show", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace);
    let current = deadline;
    const result = await whileBlocked("invoice", async () => { current = new Date("2030-01-08T18:00:00Z"); }, client => sweep(undefined, 100, () => current, client));
    expect(result.ok).toBe(true); expect(await status(booking.id)).toBe("BOOKED");
    expect(await db.attendanceRecord.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    expect(await db.workspaceDataEvent.count({ where: { workspaceId: f.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED" } })).toBe(0);
  });
  it("actual paid-invoice reconciliation racing the sweep never recreates a cancelled seat", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace);
    await Promise.all([sweep(), f.reconcile(deadline, true)]);
    const state = await status(booking.id);
    expect(["BOOKED", "CANCELLED"]).toContain(state);
    expect(await db.workspaceDataEvent.count({ where: { workspaceId: f.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED" } })).toBe(state === "CANCELLED" ? 1 : 0);
    expect((await db.membershipBillingState.findUniqueOrThrow({ where: { memberMembershipId: f.membershipId } })).status).toBe("ACTIVE");
    await f.reconcile(new Date(+deadline + 60000), true);
    expect(await status(booking.id)).toBe(state);
  });
  it("retains prior verified no-show allowance and accepted penalty policy without extra usage", async () => {
    const historical = await f.book("2030-01-01"), future = await f.book();
    await db.$transaction(async tx => {
      await settleMembershipAllowance({ workspaceId: f.workspaceId, bookingId: historical.id, outcome: "NO_SHOW", db: tx });
      await tx.classBooking.update({ where: { id: historical.id }, data: { status: "NO_SHOW" } });
      await tx.attendanceRecord.create({ data: { workspaceId: f.workspaceId, memberId: f.memberId, classTemplateId: f.templateId, scheduledForDate: historical.scheduledForDate, state: "NO_SHOW" } });
    });
    const original = await db.membershipAllowanceAllocation.findMany({ where: { bookingId: historical.id }, orderBy: { id: "asc" } });
    expect(original.every(row => row.state === "USED")).toBe(true);
    await f.reconcile(beforeGrace); await sweep();
    expect(await status(historical.id)).toBe("NO_SHOW"); expect(await status(future.id)).toBe("CANCELLED");
    expect(await db.membershipAllowanceAllocation.findMany({ where: { bookingId: historical.id }, orderBy: { id: "asc" } })).toEqual(original);
    expect(await db.membershipAllowanceEntry.count({ where: { workspaceId: f.workspaceId, usedDelta: 1 } })).toBe(2);
  });
  it("dispatch revalidates exact cancelled funding revision and current account recipient", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace); await sweep();
    const notice = await db.notificationJob.findFirstOrThrow({ where: { workspaceId: f.workspaceId, dedupeKey: { startsWith: "membership-grace:" } } });
    expect(await shouldDeliverNotification(notice, db, deadline)).toBe(true);
    await db.workspaceUser.updateMany({ where: { workspaceId: f.workspaceId, userId: f.userId }, data: { isActive: false } });
    expect(await shouldDeliverNotification(notice, db, deadline)).toBe(false);
    await db.workspaceUser.updateMany({ where: { workspaceId: f.workspaceId, userId: f.userId }, data: { isActive: true } });
    await db.classBooking.update({ where: { id: booking.id }, data: { fundingRevision: { increment: 1 } } });
    expect(await shouldDeliverNotification(notice, db, deadline)).toBe(false);
  });
  it("SQL rejects fractional revision/invalid time shape and protects receipts from update/delete/retagging", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace); await sweep();
    const receipt = await db.workspaceDataEvent.findUniqueOrThrow({ where: { id: membershipGraceReceiptId(f.workspaceId, booking.id, booking.fundingRevision) } });
    for (const metadata of [{ ...(receipt.metadata as Prisma.JsonObject), fundingRevision: 1.5 }, { ...(receipt.metadata as Prisma.JsonObject), startsAt: new Date(+deadline - 1).toISOString() }, { ...(receipt.metadata as Prisma.JsonObject), basis: "UNRESOLVED_FAILURE_TIMING" }]) {
      const invalidId = `membership-grace:${randomUUID().replaceAll("-", "").padEnd(64, "0")}`;
      await expect(db.$executeRaw`INSERT INTO workspace_data_events (id,"workspaceId",kind,metadata,"createdAt") VALUES (${invalidId},${f.workspaceId},${receipt.kind},${JSON.stringify(metadata)}::jsonb,now())`).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    }
    await expect(db.workspaceDataEvent.update({ where: { id: receipt.id }, data: { kind: "OTHER", metadata: {} } })).rejects.toThrow();
    await expect(db.workspaceDataEvent.delete({ where: { id: receipt.id } })).rejects.toThrow();
  });
  it("member receipt projection and artifact exclude invoice/private fields and other beneficiaries", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace); await sweep();
    const receipt = await db.workspaceDataEvent.findFirstOrThrow({ where: { workspaceId: f.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED" } });
    const projected = projectMembershipGraceReceipt({ ...(receipt.metadata as Prisma.JsonObject), providerSecret: "PRIVATE_SENTINEL", ownerReason: "PRIVATE_SENTINEL", recipientEmail: "private@example.test" }, true);
    expect(projected).not.toHaveProperty("invoiceId"); expect(JSON.stringify(projected)).not.toContain("PRIVATE_SENTINEL"); expect(projected.bookingId).toBe(booking.id);
    const unrelated = await person();
    const artifact = await db.$transaction(tx => buildMemberDataArtifact(tx, { workspaceId: f.workspaceId, targetId: unrelated.memberId, scope: "MEMBER", exportedAt: deadline }));
    const archive = JSON.parse(gunzipSync(artifact.bytes).toString("utf8")) as { tables: Record<string, Array<{ id: string; metadata: Record<string, unknown> }>> };
    expect(archive.tables.WorkspaceDataEvent ?? []).not.toContainEqual(expect.objectContaining({ id: receipt.id }));
    const ownArtifact = await db.$transaction(tx => buildMemberDataArtifact(tx, { workspaceId: f.workspaceId, targetId: f.memberId, scope: "MEMBER", exportedAt: deadline }));
    const ownArchive = JSON.parse(gunzipSync(ownArtifact.bytes).toString("utf8")) as typeof archive;
    const ownReceipt = ownArchive.tables.WorkspaceDataEvent?.find(row => row.id === receipt.id);
    expect(ownReceipt?.metadata.bookingId).toBe(booking.id);
    expect(ownReceipt?.metadata).not.toHaveProperty("invoiceId");
  });
  it("the real reviewed inventory purge deletes protected receipts while preserving another workspace", async () => {
    const booking = await f.book(); await f.reconcile(beforeGrace); await sweep();
    const control = await graceFixture(db); fixtures.push(control);
    await db.$transaction(async tx => { const inventory = await inspectRetentionInventory(tx, f.workspaceId); await deleteReviewedWorkspaceRecords(tx, f.workspaceId, inventory.fingerprint); }, { timeout: 30000 });
    expect(await db.workspaceDataEvent.findUnique({ where: { id: membershipGraceReceiptId(f.workspaceId, booking.id, booking.fundingRevision) } })).toBeNull();
    expect(await db.workspace.findUnique({ where: { id: control.workspaceId } })).not.toBeNull();
    fixtures.splice(fixtures.indexOf(f), 1); await db.user.delete({ where: { id: f.userId } });
  });
});
