import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  createAccessBackedBooking,
  lockClassSchedule,
  pickOldestEligiblePunchCard,
  resolveBookingAccessForProgram,
  snapshotMembershipTerms,
  snapshotPunchCardTerms,
} from "@flowstate/db";
import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import { inspectRetentionInventory, deleteReviewedWorkspaceRecords } from "../../../packages/db/src/retention-inventory.js";

const url = process.env.TEST_DATABASE_URL;
if (url && (!/test|e2e/i.test(new URL(url).pathname) || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))) {
  throw new Error("Held-pack reason tests require a dedicated loopback test database.");
}

(url ? describe : describe.skip)("held-pack denial reasons and independent funding in PostgreSQL", () => {
  const db = new PrismaClient({ datasourceUrl: url, log: [{ emit: "event", level: "query" }] });
  const workspaces: string[] = [];
  const now = new Date("2030-01-01T12:00:00Z");
  const refundMessage = "A refund is being processed for this access. Wait for its result before changing classes or units.";
  const disputeMessage = "A payment dispute is under owner review for this access. Existing reservations remain recorded; changes and unit use are held pending its outcome.";
  const privateReason = "fictional private owner/provider reason must never be shown";
  let holdQueries: string[] = [];
  db.$on("query", event => {
    if (event.query.includes('"financial_entitlement_holds"')) holdQueries.push(event.query);
  });

  async function fixture() {
    const workspace = await db.workspace.create({ data: {
      name: `Fictional held-pack reason ${randomUUID()}`, status: "ACTIVE",
      location: { create: { name: "Gym", timezone: "UTC", rooms: { create: { name: "Mat", capacity: 10 } } } },
    }, include: { location: { include: { rooms: true } } } });
    const workspaceId = workspace.id;
    workspaces.push(workspaceId);
    await createFixtureClassSchedulingPolicy(db, workspaceId);
    const member = await db.member.create({ data: { workspaceId, fullName: "Fictional participant", status: "ACTIVE" } });
    const program = await db.program.create({ data: { workspaceId, name: "Training" } });
    const template = await db.classTemplate.create({ data: { workspaceId, programId: program.id, roomId: workspace.location!.rooms[0]!.id,
      weekday: "MONDAY", startTimeMinutes: 1080, endTimeMinutes: 1140, bookingCutoffMinutes: 0, cancellationCutoffMinutes: 120 } });
    const product = await db.punchCardProduct.create({ data: { workspaceId, name: "Purchased pack", punchesIncluded: 3, priceCents: 3000, currency: "cad" } });
    const makeCard = (purchasedAt = "2029-11-01T12:00:00Z") => db.memberPunchCard.create({ data: {
      workspaceId, memberId: member.id, punchCardProductId: product.id, originalPunches: 3, remainingPunches: 3,
      purchasePriceCents: 3000, purchaseCurrency: "cad", purchasedAt: new Date(purchasedAt),
      acceptedTerms: JSON.parse(JSON.stringify(snapshotPunchCardTerms(product, now))),
    } });
    const card = await makeCard();
    const hold = async (kind: "refund" | "dispute", targetId = card.id) => {
      if (kind === "dispute") {
        const dispute = await db.paymentDispute.create({ data: { workspaceId, providerAccountId: "acct_fictional", livemode: false,
          providerDisputeId: `dp_${randomUUID()}`, chargeId: `ch_${randomUUID()}`, providerStatus: "needs_response", reason: privateReason,
          amountCents: 3000, currency: "cad", chargeAmountCents: 3000, isChargeRefundable: false, evidence: {}, evidenceHash: createHash("sha256").update("{}").digest("hex"),
          accessState: "HELD", moneyState: "UNDER_REVIEW" } });
        return db.financialEntitlementHold.create({ data: { workspaceId, targetKind: "PUNCH_CARD", targetId, disputeId: dispute.id } });
      }
      const operation = await db.financialOperation.create({ data: { workspaceId, operationKey: randomUUID(), requestHash: "fictional-held-pack",
        kind: "REFUND", targetId, providerIdempotencyKey: randomUUID(), status: "SUBMITTED", payload: { reason: privateReason } } });
      return db.financialEntitlementHold.create({ data: { workspaceId, targetKind: "PUNCH_CARD", targetId, operationId: operation.id } });
    };
    const selection = { workspaceId, memberId: member.id, programId: program.id, scheduledForDate: "2030-01-07", db: db as never };
    const access = (allowDropIn = false) => resolveBookingAccessForProgram({ ...selection,
      occurrenceStartsAt: new Date("2030-01-07T18:00:00Z"), now, allowDropIn });
    const book = (allowDropIn = false) => createAccessBackedBooking({ workspaceId, memberId: member.id, classTemplateId: template.id,
      scheduledForDate: "2030-01-07", timezone: "UTC", source: "ADMIN", now, allowDropIn, db: db as never });
    const state = async () => ({
      bookings: await db.classBooking.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
      cards: await db.memberPunchCard.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
      holds: await db.financialEntitlementHold.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
      ledger: await db.punchCardEntry.count({ where: { workspaceId } }), allowance: await db.membershipAllowanceAllocation.count({ where: { workspaceId } }),
      queue: await db.waitlistEntry.count({ where: { workspaceId } }), payments: await db.payment.count({ where: { workspaceId } }),
      operations: await db.financialOperation.count({ where: { workspaceId } }), notices: await db.notificationJob.count({ where: { workspaceId } }),
    });
    return { workspaceId, member, program, product, card, makeCard, hold, selection, access, book, state };
  }

  it.each(["refund", "dispute"] as const)("reports the canonical %s reason for the only eligible held pack without writes", async kind => {
    const f = await fixture();
    await f.hold(kind);
    const before = await f.state(), message = kind === "refund" ? refundMessage : disputeMessage;
    for (const allowDropIn of [false, true]) {
      holdQueries = [];
      const result = await f.access(allowDropIn);
      expect(result).toEqual({ type: "none", reason: "membership_blocked", message });
      expect(JSON.stringify(result)).not.toContain(privateReason);
      expect(holdQueries).toHaveLength(1);
      expect(await f.book(allowDropIn)).toMatchObject({ status: "error", message });
    }
    expect(await pickOldestEligiblePunchCard(f.selection)).toBeNull();
    expect(await f.state()).toEqual(before);
  });

  it("keeps one batched hold lookup and spends only the oldest eligible unheld pack", async () => {
    const f = await fixture();
    await f.hold("refund");
    const secondHeld = await f.makeCard("2029-11-02T12:00:00Z");
    await f.hold("dispute", secondHeld.id);
    const available = await f.makeCard("2029-11-03T12:00:00Z");
    holdQueries = [];
    expect(await f.access()).toMatchObject({ type: "punch_card", memberPunchCardId: available.id });
    expect(holdQueries).toHaveLength(1);
    holdQueries = [];
    expect(await pickOldestEligiblePunchCard(f.selection)).toMatchObject({ id: available.id });
    expect(holdQueries).toHaveLength(1);
    const booking = await f.book();
    if (booking.status !== "created") throw new Error("The unheld pack should fund this class");
    const balances = await db.memberPunchCard.findMany({ where: { workspaceId: f.workspaceId }, select: { id: true, remainingPunches: true } });
    expect(Object.fromEntries(balances.map(row => [row.id, row.remainingPunches]))).toEqual({ [f.card.id]: 3, [secondHeld.id]: 3, [available.id]: 2 });
    expect(await db.financialEntitlementHold.count({ where: { workspaceId: f.workspaceId, activeSlot: "ACTIVE" } })).toBe(2);
    const entries = await db.punchCardEntry.findMany({ where: { workspaceId: f.workspaceId }, select: { memberPunchCardId: true, bookingId: true, delta: true } });
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(expect.arrayContaining([
      { memberPunchCardId: available.id, bookingId: null, delta: 3 },
      { memberPunchCardId: available.id, bookingId: booking.bookingId, delta: -1 },
    ]));
    expect(entries.reduce((balance, entry) => balance + entry.delta, 0)).toBe(2);
  });

  it("uses an independently eligible membership without spending or releasing the held pack", async () => {
    const f = await fixture();
    await f.hold("refund");
    const plan = await db.membershipPlan.create({ data: { workspaceId: f.workspaceId, name: "Independent membership", monthlyPriceCents: 10000, weeklyClassLimit: 2, monthlyClassLimit: 8 } });
    const membership = await db.memberMembership.create({ data: { workspaceId: f.workspaceId, memberId: f.member.id, membershipPlanId: plan.id,
      startedAt: new Date("2029-12-01Z"), allowanceTimezone: "UTC", allowanceAnchorDate: new Date("2030-01-01Z"),
      acceptedTerms: JSON.parse(JSON.stringify(snapshotMembershipTerms(plan, now))) } });
    expect(await f.access()).toMatchObject({ type: "membership", membershipId: membership.id });
    expect((await f.book()).status).toBe("created");
    expect(await db.classBooking.findFirstOrThrow({ where: { workspaceId: f.workspaceId } })).toMatchObject({ bookingType: "MEMBERSHIP", fundingMembershipId: membership.id, memberPunchCardId: null });
    expect(await db.memberPunchCard.findUniqueOrThrow({ where: { id: f.card.id } })).toMatchObject({ remainingPunches: 3 });
    expect(await db.financialEntitlementHold.count({ where: { workspaceId: f.workspaceId, activeSlot: "ACTIVE" } })).toBe(1);
    expect(await db.punchCardEntry.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
  });

  it("still offers a separate payable drop-in after the held pack and preserves its pending payment boundary", async () => {
    const f = await fixture();
    await f.hold("dispute");
    const product = await db.dropInProduct.create({ data: { workspaceId: f.workspaceId, name: "Separate class", priceCents: 2500, currency: "cad" } });
    expect(await f.access(false)).toEqual({ type: "none", reason: "membership_blocked", message: disputeMessage });
    expect(await f.access(true)).toMatchObject({ type: "drop_in", dropInProductId: product.id, priceCents: 2500 });
    expect(await f.book(true)).toMatchObject({ status: "payment_required", dropInProductId: product.id, priceCents: 2500 });
    expect(await db.classBooking.findFirstOrThrow({ where: { workspaceId: f.workspaceId } })).toMatchObject({ bookingType: "DROP_IN", status: "PENDING_PAYMENT", dropInProductId: product.id, dropInPaidAt: null, memberPunchCardId: null });
    expect(await db.memberPunchCard.findUniqueOrThrow({ where: { id: f.card.id } })).toMatchObject({ remainingPunches: 3 });
    expect(await db.financialEntitlementHold.count({ where: { workspaceId: f.workspaceId, activeSlot: "ACTIVE" } })).toBe(1);
    expect(await db.financialOperation.count({ where: { workspaceId: f.workspaceId, kind: "CHECKOUT" } })).toBe(0);
    expect(await db.payment.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    expect(await db.punchCardEntry.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
  });

  it.each(["expired", "restricted"] as const)("does not expose an irrelevant hold when the pack is %s for this class", async kind => {
    const f = await fixture();
    await f.hold("dispute");
    if (kind === "expired") await db.memberPunchCard.update({ where: { id: f.card.id }, data: { expiresOn: new Date("2030-01-07Z") } });
    else {
      const other = await db.program.create({ data: { workspaceId: f.workspaceId, name: "Another program" } });
      await db.memberPunchCard.update({ where: { id: f.card.id }, data: { acceptedTerms: JSON.parse(JSON.stringify(snapshotPunchCardTerms({ ...f.product,
        restrictionMode: "PROGRAM_RESTRICTED", programRestrictions: [{ programId: other.id }] }, now))) } });
    }
    const before = await f.state();
    holdQueries = [];
    const result = await f.access();
    expect(result).toEqual({ type: "none", reason: "no_membership", message: "This class needs a membership or punch card in this workspace." });
    expect(holdQueries).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("dispute");
    expect((await f.book()).status).toBe("error");
    expect(await f.state()).toEqual(before);
  });

  afterAll(async () => {
    for (const workspaceId of workspaces) await db.$transaction(async tx => {
      await lockClassSchedule(tx, workspaceId);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial:${workspaceId}`}))::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`retention:${workspaceId}`}))::text`;
      const inventory = await inspectRetentionInventory(tx, workspaceId);
      await deleteReviewedWorkspaceRecords(tx, workspaceId, inventory.fingerprint);
    }, { isolationLevel: "Serializable", timeout: 120000 });
    await db.$disconnect();
  }, 120000);
});
