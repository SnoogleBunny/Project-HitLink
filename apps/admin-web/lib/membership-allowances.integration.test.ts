import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, snapshotMembershipTerms, snapshotPunchCardTerms, membershipAllowanceWindows, createAccessBackedBooking, cancelAccessBackedBooking, moveAccessBackedBooking, getMembershipAllowanceSummary, settleMembershipAllowance, lockClassSchedule, finalizeDropInBookingPayment, finalizePunchCardCheckoutPurchase, adjustMembershipAllowance, adjustPunchCardUnits, cancelMembershipFundedBookingsTx, shouldDeliverNotification } from "@flowstate/db";

describe("billing-anchored allowance windows", () => {
  it("gives the final short week its full cap and resets exactly at renewal", () => {
    expect(membershipAllowanceWindows({ anchorDate: "2026-10-09", scheduledForDate: "2026-11-08", weeklyClassLimit: 2, monthlyClassLimit: 8 })).toEqual([
      { kind: "BILLING_MONTH", startsOn: "2026-10-09", endsOn: "2026-11-09", limit: 8 },
      { kind: "WEEK", startsOn: "2026-11-06", endsOn: "2026-11-09", limit: 2 },
    ]);
    expect(membershipAllowanceWindows({ anchorDate: "2026-10-09", scheduledForDate: "2026-11-09", weeklyClassLimit: 2, monthlyClassLimit: null })[0]?.startsOn).toBe("2026-11-09");
  });
  it("keeps the original month-end anchor across February and leap years", () => {
    const windows = (date: string) => membershipAllowanceWindows({ anchorDate: "2028-01-31", scheduledForDate: date, weeklyClassLimit: null, monthlyClassLimit: 8 });
    expect(windows("2028-02-29")[0]).toMatchObject({ startsOn: "2028-02-29", endsOn: "2028-03-31" });
    expect(windows("2029-03-01")[0]).toMatchObject({ startsOn: "2029-02-28", endsOn: "2029-03-31" });
  });
});
const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)("atomic membership booking and payment funding", () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const workspaces: string[] = [];
  const users: string[] = [];
  const now = new Date("2030-01-01T12:00:00Z");
  let workspaceId: string, memberId: string, membershipId: string, planId: string, firstId: string, secondId: string;
  beforeEach(async () => {
    workspaceId = (await db.workspace.create({ data: { name: `allowance-test-${randomUUID()}` } })).id; workspaces.push(workspaceId);
    await createFixtureClassSchedulingPolicy(db, workspaceId);
    const location = await db.location.create({ data: { workspaceId, name: "Gym", timezone: "UTC" } });
    const program = await db.program.create({ data: { workspaceId, name: "Muay Thai" } });
    const room = await db.room.create({ data: { locationId: location.id, name: "Mat", capacity: 10 } });
    const template = { workspaceId, programId: program.id, roomId: room.id, weekday: "MONDAY" as const, startTimeMinutes: 1080, endTimeMinutes: 1140, capacityOverride: 10, bookingCutoffMinutes: 0, cancellationCutoffMinutes: 120 };
    firstId = (await db.classTemplate.create({ data: template })).id;
    secondId = (await db.classTemplate.create({ data: { ...template, startTimeMinutes: 1200, endTimeMinutes: 1260 } })).id;
    memberId = (await db.member.create({ data: { workspaceId, fullName: "Member" } })).id;
    const plan = await db.membershipPlan.create({ data: { workspaceId, name: "Limited", monthlyPriceCents: 15000, weeklyClassLimit: 1, monthlyClassLimit: 2 } }); planId = plan.id;
    membershipId = (await db.memberMembership.create({ data: { workspaceId, memberId, membershipPlanId: plan.id, status: "ACTIVE", startedAt: new Date("2029-12-01"), allowanceAnchorDate: new Date("2030-01-01"), allowanceTimezone: "UTC", acceptedTerms: JSON.parse(JSON.stringify(snapshotMembershipTerms(plan))) } })).id;
  });
  afterAll(async () => {
    for (const id of workspaces) {
      await db.financialEntitlementHold.deleteMany({ where: { workspaceId: id } });
      await db.financialOperation.deleteMany({ where: { workspaceId: id } });
      await db.classBookingMove.deleteMany({ where: { workspaceId: id } });
      await db.attendanceRecord.deleteMany({ where: { workspaceId: id } });
      await db.classBooking.deleteMany({ where: { workspaceId: id } });
      await db.memberMembership.deleteMany({ where: { workspaceId: id } });
      await db.classTemplate.deleteMany({ where: { workspaceId: id } });
      await db.workspace.delete({ where: { id } });
    }
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });
  const book = (classTemplateId = firstId, date = "2030-01-07", id = memberId) => createAccessBackedBooking({ workspaceId, memberId: id, classTemplateId, scheduledForDate: date, timezone: "UTC", source: "MEMBER_PORTAL", db: db as never, now });
  const summary = () => getMembershipAllowanceSummary({ workspaceId, memberId, scheduledForDate: "2030-01-07", timezone: "UTC", db });
  async function bookingId() { const result = await book(); expect(result.status).toBe("created"); if (result.status === "error") throw new Error(result.message); return result.bookingId; }
  it("blocks unpaid memberships and expired grace but honors a verified finite freeze boundary", async () => {
    await db.memberMembership.update({ where: { id: membershipId }, data: { status: "PENDING_PAYMENT_METHOD" } });
    expect((await book()).status).toBe("error");
    await db.memberMembership.update({ where: { id: membershipId }, data: { status: "PAST_DUE" } });
    await db.membershipBillingState.create({ data: { workspaceId, memberId, memberMembershipId: membershipId, status: "PAYMENT_FAILED", gracePeriodEndsAt: new Date("2029-12-31") } });
    expect((await book()).status).toBe("error");
    await db.membershipBillingState.update({ where: { memberMembershipId: membershipId }, data: { gracePeriodEndsAt: new Date("2030-01-02") } });
    expect((await book()).status).toBe("created");
    await db.memberMembership.update({ where: { id: membershipId }, data: { status: "FROZEN", frozenFrom: new Date("2030-01-08"), frozenUntil: new Date("2030-01-21"), cancelAtPeriodEnd: true, nextBillingDate: new Date("2030-01-02"), endedAt: new Date("2030-02-01") } });
    await db.membershipBillingState.update({ where: { memberMembershipId: membershipId }, data: { status: "FROZEN", gracePeriodEndsAt: null } });
    expect((await book(firstId, "2030-01-14")).status).toBe("error");
    expect((await book(firstId, "2030-01-21")).status).toBe("created");
    expect((await book(firstId, "2030-02-04")).status).toBe("error");
  });

  it("serializes different-class requests against the same last weekly class", async () => {
    const result = await Promise.all([book(firstId), book(secondId)]);
    expect(result.filter((r) => r.status === "created")).toHaveLength(1);
    expect(result.filter((r) => r.status === "error")).toHaveLength(1);
    expect((await summary())?.windows.find((w) => w.kind === "WEEK")).toMatchObject({ reserved: 1, used: 0, remaining: 0 });
    expect(await db.membershipAllowanceAllocation.count({ where: { workspaceId } })).toBe(2);
  });
  it("settles once, corrects attendance in original periods and releases timely cancellation", async () => {
    const id = await bookingId();
    await db.$transaction(async (tx) => {
      await lockClassSchedule(tx, workspaceId);
      await settleMembershipAllowance({ workspaceId, bookingId: id, outcome: "ATTENDED", db: tx });
      await settleMembershipAllowance({ workspaceId, bookingId: id, outcome: "ATTENDED", db: tx });
    });
    expect((await summary())?.windows[0]).toMatchObject({ used: 1, reserved: 0 });
    expect(await db.membershipAllowanceEntry.count({ where: { workspaceId } })).toBe(4);
    await db.$transaction((tx) => settleMembershipAllowance({ workspaceId, bookingId: id, outcome: "EXCUSED", db: tx }));
    expect((await summary())?.windows[0]).toMatchObject({ used: 0, reserved: 0 });
    await cancelAccessBackedBooking({ workspaceId, memberId, bookingId: id, timezone: "UTC", db: db as never, now });
    expect((await summary())?.windows[0]).toMatchObject({ used: 0, reserved: 0 });
  });
  it("moves at a full allowance using the net hold and replays idempotently", async () => {
    const id = await bookingId(); const mutationId = randomUUID();
    const args = { workspaceId, memberId, bookingId: id, targetClassTemplateId: secondId, targetDate: "2030-01-07", timezone: "UTC", mutationId, db: db as never, now };
    const moved = await moveAccessBackedBooking(args); expect(moved.status).toBe("moved"); expect(await moveAccessBackedBooking(args)).toEqual(moved);
    expect((await db.classBooking.findUnique({ where: { id } }))?.status).toBe("CANCELLED");
    expect((await summary())?.windows[0]).toMatchObject({ reserved: 1, used: 0 });
    expect(await db.classBookingMove.count({ where: { workspaceId } })).toBe(1);
  });
  it("keeps original reservation and allowance when target fills or late penalty exhausts allowance", async () => {
    const id = await bookingId();
    await db.classTemplate.update({ where: { id: secondId }, data: { capacityOverride: 1 } });
    const other = await db.member.create({ data: { workspaceId, fullName: "Other" } });
    await db.classBooking.create({ data: { workspaceId, memberId: other.id, classTemplateId: secondId, scheduledForDate: new Date("2030-01-07") } });
    const args = { workspaceId, memberId, bookingId: id, targetClassTemplateId: secondId, targetDate: "2030-01-07", timezone: "UTC", db: db as never, now };
    expect((await moveAccessBackedBooking(args)).status).toBe("error");
    expect((await db.classBooking.findUnique({ where: { id } }))?.status).toBe("BOOKED");
    expect((await summary())?.windows[0]).toMatchObject({ reserved: 1, used: 0 });
    await db.classBooking.deleteMany({ where: { memberId: other.id } });
    expect((await moveAccessBackedBooking({ ...args, now: new Date("2030-01-07T17:00:00Z") })).status).toBe("error");
    expect((await db.classBooking.findUnique({ where: { id } }))?.status).toBe("BOOKED");
    expect((await summary())?.windows[0]).toMatchObject({ reserved: 1, used: 0 });
  });
  it("uses accepted limits despite catalog changes and keeps beneficiaries separate", async () => {
    await db.membershipPlan.update({ where: { id: planId }, data: { weeklyClassLimit: 10, monthlyClassLimit: 10 } });
    await bookingId(); expect((await book(secondId)).status).toBe("error");
    const family = await db.member.create({ data: { workspaceId, fullName: "Family" } });
    const original = await db.memberMembership.findUniqueOrThrow({ where: { id: membershipId } });
    await db.memberMembership.create({ data: { workspaceId, memberId: family.id, membershipPlanId: planId, status: "ACTIVE", startedAt: original.startedAt, allowanceAnchorDate: original.allowanceAnchorDate, allowanceTimezone: "UTC", acceptedTerms: original.acceptedTerms! } });
    expect((await book(secondId, "2030-01-07", family.id)).status).toBe("created");
  });
  it("applies monthly limit across billing weeks and restores it after cancellation", async () => {
    const id = await bookingId(); expect((await book(firstId, "2030-01-14")).status).toBe("created"); expect((await book(firstId, "2030-01-21")).status).toBe("error");
    await cancelAccessBackedBooking({ workspaceId, memberId, bookingId: id, timezone: "UTC", db: db as never, now });
    expect((await book(firstId, "2030-01-21")).status).toBe("created");
  });
  it("issues a purchased pack once under concurrent delivery and rejects changed replay", async () => {
    const product = await db.punchCardProduct.create({ data: { workspaceId, name: "Pack", punchesIncluded: 5, priceCents: 5000 } });
    const args = { workspaceId, memberId, punchCardProductId: product.id, originalPunches: 5, priceCents: 5000, currency: "usd", checkoutSessionId: `cs_${randomUUID()}`, acceptedTerms: snapshotPunchCardTerms(product), db: db as never, now };
    const results = await Promise.all([finalizePunchCardCheckoutPurchase(args), finalizePunchCardCheckoutPurchase(args)]);
    expect(results.map((r) => r.status).sort()).toEqual(["already_exists", "created"]);
    expect((await finalizePunchCardCheckoutPurchase({ ...args, priceCents: 1 })).status).toBe("review_required");
    expect(await db.memberPunchCard.count({ where: { workspaceId } })).toBe(1);
  });
  it("does not resurrect cancelled or expired drop-ins and rejects mismatched sessions", async () => {
    const product = await db.dropInProduct.create({ data: { workspaceId, name: "Drop in", priceCents: 2500 } });
    const booking = await db.classBooking.create({ data: { workspaceId, memberId, classTemplateId: firstId, scheduledForDate: new Date("2030-01-07"), bookingType: "DROP_IN", status: "CANCELLED", dropInProductId: product.id, dropInPriceCents: 2500, dropInCurrency: "usd", dropInCheckoutSessionId: "cs_old", pendingPaymentExpiresAt: new Date("2030-01-01T12:30:00Z") } });
    const args = { workspaceId, bookingId: booking.id, checkoutSessionId: "cs_old", amountCents: 2500, currency: "usd", db: db as never, now };
    expect(await finalizeDropInBookingPayment(args)).toBe("review_required");
    await db.classBooking.update({ where: { id: booking.id }, data: { status: "PENDING_PAYMENT" } });
    expect(await finalizeDropInBookingPayment({ ...args, checkoutSessionId: "cs_other" })).toBe("review_required");
    expect(await finalizeDropInBookingPayment({ ...args, now: new Date("2030-01-01T13:00:00Z") })).toBe("review_required");
    expect(await finalizeDropInBookingPayment(args)).toBe("booked");
    expect(await finalizeDropInBookingPayment(args)).toBe("already_booked");
  });
  it("preserves a previous late-cancel penalty when the same occurrence is rebooked", async () => {
    const plan = await db.membershipPlan.findUniqueOrThrow({ where: { id: planId } });
    await db.memberMembership.update({ where: { id: membershipId }, data: { acceptedTerms: JSON.parse(JSON.stringify(snapshotMembershipTerms({ ...plan, weeklyClassLimit: 3, monthlyClassLimit: 4 }))) } });
    const id = await bookingId();
    await cancelAccessBackedBooking({ workspaceId, memberId, bookingId: id, timezone: "UTC", db: db as never, now: new Date("2030-01-07T17:00:00Z") });
    expect((await book()).status).toBe("restored");
    expect((await summary())?.windows[0]).toMatchObject({ used: 1, reserved: 1 });
    await cancelAccessBackedBooking({ workspaceId, memberId, bookingId: id, timezone: "UTC", db: db as never, now });
    expect((await summary())?.windows[0]).toMatchObject({ used: 1, reserved: 0 });
    expect((await db.classBooking.findUnique({ where: { id } }))?.fundingRevision).toBe(2);
  });
  it("keeps pack terms and reconciles unit ledger through cancellation, rebooking and corrections", async () => {
    await db.memberMembership.update({ where: { id: membershipId }, data: { status: "ENDED", currentMembershipSlot: null } });
    const product = await db.punchCardProduct.create({ data: { workspaceId, name: "Policy pack", punchesIncluded: 3, priceCents: 6000, noShowConsumesPunch: false } });
    const terms = snapshotPunchCardTerms(product);
    const purchase = await finalizePunchCardCheckoutPurchase({ workspaceId, memberId, punchCardProductId: product.id, originalPunches: 3, priceCents: 6000, currency: "usd", acceptedTerms: terms, checkoutSessionId: `cs_${randomUUID()}`, db: db as never, now });
    expect(purchase.status).toBe("created");
    await db.punchCardProduct.update({ where: { id: product.id }, data: { restrictionMode: "PROGRAM_RESTRICTED", noShowConsumesPunch: true } });
    const id = await bookingId();
    const { settlePunchCardBooking } = await import("@flowstate/db");
    await db.$transaction(async (tx) => { await lockClassSchedule(tx, workspaceId); await settlePunchCardBooking({ workspaceId, bookingId: id, outcome: "NO_SHOW", db: tx }); await settlePunchCardBooking({ workspaceId, bookingId: id, outcome: "NO_SHOW", db: tx }); });
    expect((await db.memberPunchCard.findUnique({ where: { id: purchase.memberPunchCardId! } }))?.remainingPunches).toBe(3);
    await db.$transaction(async (tx) => { await lockClassSchedule(tx, workspaceId); await settlePunchCardBooking({ workspaceId, bookingId: id, outcome: "ATTENDED", db: tx }); });
    await cancelAccessBackedBooking({ workspaceId, memberId, bookingId: id, timezone: "UTC", db: db as never, now });
    expect((await book()).status).toBe("restored");
    const ledger = await db.punchCardEntry.aggregate({ where: { workspaceId }, _sum: { delta: true } });
    const card = await db.memberPunchCard.findUnique({ where: { id: purchase.memberPunchCardId! } });
    expect(ledger._sum.delta).toBe(card?.remainingPunches); expect(card?.remainingPunches).toBe(2);
    expect(await db.punchCardEntry.count({ where: { workspaceId, reason: "Class booking reserved" } })).toBe(2);
  });
  it("moves a paid drop-in while keeping original checkout ownership", async () => {
    const product = await db.dropInProduct.create({ data: { workspaceId, name: "Paid class", priceCents: 2500 } });
    const original = await db.classBooking.create({ data: { workspaceId, memberId, classTemplateId: firstId, scheduledForDate: new Date("2030-01-07"), bookingType: "DROP_IN", status: "BOOKED", dropInProductId: product.id, dropInPriceCents: 2500, dropInCurrency: "usd", dropInCheckoutSessionId: `cs_${randomUUID()}`, dropInPaidAt: now } });
    const moved = await moveAccessBackedBooking({ workspaceId, memberId, bookingId: original.id, targetClassTemplateId: secondId, targetDate: "2030-01-07", timezone: "UTC", db: db as never, now });
    expect(moved.status).toBe("moved"); if (moved.status !== "moved") throw new Error(moved.message);
    const target = await db.classBooking.findUniqueOrThrow({ where: { id: moved.bookingId } });
    expect(target).toMatchObject({ status: "BOOKED", fundedByBookingId: original.id, dropInCheckoutSessionId: null, dropInPaidAt: null });
    expect((await db.classBooking.findUnique({ where: { id: original.id } }))?.dropInCheckoutSessionId).toBe(original.dropInCheckoutSessionId);
    expect(await finalizeDropInBookingPayment({ workspaceId, bookingId: original.id, checkoutSessionId: original.dropInCheckoutSessionId!, amountCents: 2500, currency: "usd", db: db as never, now })).toBe("already_booked");
  });

  it("requires owner authority for reasoned allowance adjustments and never removes used capacity", async () => {
    const user = await db.user.create({ data: { email: `${randomUUID()}@adjust.test`, fullName: "Owner" } }); users.push(user.id);
    const staff = await db.workspaceUser.create({ data: { workspaceId, userId: user.id, role: "COACH" } });
    const args = { workspaceId, memberId, membershipId, workspaceUserId: staff.id, scheduledForDate: "2030-01-07", timezone: "UTC", kind: "WEEK" as const, delta: 1, reason: "Replacement for closure", mutationId: randomUUID(), db };
    expect((await adjustMembershipAllowance(args)).ok).toBe(false);
    await db.workspaceUser.update({ where: { id: staff.id }, data: { role: "OWNER" } });
    expect(await adjustMembershipAllowance(args)).toEqual({ ok: true }); expect(await adjustMembershipAllowance(args)).toEqual({ ok: true });
    expect((await summary())?.windows.find((w) => w.kind === "WEEK")?.limit).toBe(2);
    await bookingId();
    expect((await adjustMembershipAllowance({ ...args, mutationId: randomUUID(), delta: -2 })).ok).toBe(false);
    expect(await db.membershipAllowanceAdjustment.count({ where: { workspaceId } })).toBe(1);
  });
  it("blocks funded changes while refund is uncertain and permits only its own verified unit retirement", async () => {
    await db.memberMembership.update({ where: { id: membershipId }, data: { currentMembershipSlot: null, status: "ENDED" } });
    const product = await db.punchCardProduct.create({ data: { workspaceId, name: "Held pack", punchesIncluded: 3, priceCents: 6000 } });
    const card = await db.memberPunchCard.create({ data: { workspaceId, memberId, punchCardProductId: product.id, originalPunches: 3, remainingPunches: 3, purchasePriceCents: 6000, acceptedTerms: JSON.parse(JSON.stringify(snapshotPunchCardTerms(product))) } });
    const op = await db.financialOperation.create({ data: { workspaceId, kind: "REFUND", targetId: card.id, operationKey: randomUUID(), requestHash: "hold-test", providerIdempotencyKey: randomUUID(), payload: {}, status: "SUBMITTED" } });
    await db.financialEntitlementHold.create({ data: { workspaceId, operationId: op.id, targetKind: "PUNCH_CARD", targetId: card.id, units: 1 } });
    const result = await book(); expect(result).toMatchObject({ status: "error", message: expect.stringContaining("refund") });
    const adjust = { workspaceId, memberId, cardId: card.id, delta: -1, operationKey: `refund:${op.id}`, reason: "Verified unused-unit refund" };
    expect(await db.$transaction(async (tx) => { await lockClassSchedule(tx, workspaceId); return adjustPunchCardUnits({ ...adjust, db: tx }); })).toMatchObject({ ok: false });
    expect(await db.$transaction(async (tx) => { await lockClassSchedule(tx, workspaceId); return adjustPunchCardUnits({ ...adjust, financialOperationId: op.id, db: tx }); })).toEqual({ ok: true });
    expect(await db.$transaction(async (tx) => { await lockClassSchedule(tx, workspaceId); return adjustPunchCardUnits({ ...adjust, financialOperationId: op.id, db: tx }); })).toEqual({ ok: true });
    expect((await db.memberPunchCard.findUnique({ where: { id: card.id } }))?.remainingPunches).toBe(2);
  });
  it("cancels only the affected membership-funded date range, restoring units once", async () => {
    const account = await db.user.create({data:{email:`${randomUUID()}@cancel.test`,workspaceUsers:{create:{workspaceId,role:"CUSTOMER"}}}}); users.push(account.id);
    await db.member.update({ where: { id: memberId }, data: { userId:account.id,email: "unverified-source@example.test" } });
    const first = await bookingId(); const second = await book(firstId, "2030-01-14"); expect(second.status).toBe("created");
    const cancel = () => db.$transaction(async (tx) => { await lockClassSchedule(tx, workspaceId); return cancelMembershipFundedBookingsTx({ workspaceId, membershipId, fromDate: "2030-01-07", toDate: "2030-01-08", reason: "Membership paused", db: tx }); });
    expect(await cancel()).toEqual({ cancelled: 1 }); expect(await cancel()).toEqual({ cancelled: 0 });
    expect((await db.classBooking.findUnique({ where: { id: first } }))?.status).toBe("CANCELLED");
    expect(await db.classBooking.count({ where: { workspaceId, status: "BOOKED" } })).toBe(1);
    const notice = await db.notificationJob.findFirstOrThrow({where:{workspaceId}});
    expect(notice).toMatchObject({recipientEmail:account.email,context:{kind:"MEMBER_ACCESS",memberId}});
    expect(await shouldDeliverNotification(notice,db,now)).toBe(true);
    await db.workspaceUser.updateMany({where:{workspaceId,userId:account.id},data:{isActive:false}});
    expect(await shouldDeliverNotification(notice,db,now)).toBe(false);
    expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(1);
    expect((await summary())?.windows[0]).toMatchObject({ reserved: 1, used: 0 });
  });

});
