import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { PrismaClient, createAccessBackedBooking, reconcileMembershipInvoice, snapshotMembershipTerms, type InvoiceEvidence } from "@flowstate/db";
import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import { inspectRetentionInventory, deleteReviewedWorkspaceRecords } from "../../../packages/db/src/retention-inventory.js";

export const beforeGrace = new Date("2030-01-01T12:00:00Z");
export const deadline = new Date("2030-01-08T12:00:00Z");
export function requireGraceTestDatabase(value: string | undefined) {
  if (!value) return;
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/_test$/.test(url.pathname)) throw Error("Grace integration requires a dedicated loopback *_test database.");
}
export async function graceFixture(db: PrismaClient) {
  const token = randomUUID();
  const workspace = await db.workspace.create({ data: { name: `Grace fixture ${token}`, status: "ACTIVE", location: { create: { name: "Fictional UTC gym", timezone: "UTC" } }, stripeSettings: { create: { stripeAccountId: `acct_${token}`, failedPaymentGracePeriodDays: 7 } } }, include: { location: true } });
  const user = await db.user.create({ data: { email: `grace-${token}@example.test`, workspaceUsers: { create: { workspaceId: workspace.id, role: "CUSTOMER" } } } });
  await db.workspaceSetupActivation.create({ data: { workspaceId: workspace.id, setupId: `fixture_${token}`, ownerUserId: user.id, setupVersion: 1, serviceMode: "MARTIAL_ARTS", verifiedEmailHash: "1".repeat(64), snapshotHash: "2".repeat(64), snapshot: {}, ownerVerifiedAt: beforeGrace, acceptedAt: beforeGrace, activatedAt: beforeGrace } });
  await createFixtureClassSchedulingPolicy(db, workspace.id);
  const member = await db.member.create({ data: { workspaceId: workspace.id, userId: user.id, fullName: "Fictional participant", dateOfBirth: new Date("1990-01-01"), status: "ACTIVE" } });
  const payer = await db.financialAccount.create({ data: { workspaceId: workspace.id, userId: user.id, memberId: member.id, stripeAccountId: `acct_${token}`, stripeCustomerId: `cus_${token}` } });
  const room = await db.room.create({ data: { locationId: workspace.location!.id, name: "Mat", capacity: 20 } });
  const program = await db.program.create({ data: { workspaceId: workspace.id, name: "Fictional class program" } });
  const template = await db.classTemplate.create({ data: { workspaceId: workspace.id, programId: program.id, roomId: room.id, weekday: "TUESDAY", title: "Tuesday practice", startTimeMinutes: 1080, endTimeMinutes: 1140, bookingCutoffMinutes: 60, cancellationCutoffMinutes: 1440 } });
  const plan = await db.membershipPlan.create({ data: { workspaceId: workspace.id, name: "Two per week", monthlyPriceCents: 10000, currency: "cad", weeklyClassLimit: 2, monthlyClassLimit: 8, allowanceCountingMode: "RESERVATION", lateCancellationConsumesClass: true, noShowConsumesClass: true } });
  const membership = await db.memberMembership.create({ data: { workspaceId: workspace.id, memberId: member.id, membershipPlanId: plan.id, payerAccountId: payer.id, stripeSubscriptionId: `sub_${token}`, status: "ACTIVE", startedAt: new Date("2029-12-01"), allowanceAnchorDate: new Date("2030-01-01"), allowanceTimezone: "UTC", acceptedTerms: JSON.parse(JSON.stringify(snapshotMembershipTerms(plan))) } });
  function evidence(overrides: Partial<InvoiceEvidence> = {}): InvoiceEvidence {
    return { id: `in_${token}`, accountId: `acct_${token}`, subscriptionId: membership.stripeSubscriptionId, customerId: `cus_${token}`, status: "OPEN", number: "FICTIONAL-1", currency: "cad", subtotalCents: 10000, taxCents: 0, totalCents: 10000, amountPaidCents: 0, amountDueCents: 10000, issuedAt: beforeGrace, dueAt: beforeGrace, paidAt: null, voidedAt: null, firstFailedAt: beforeGrace, failureCode: "card_declined", failureMessage: "Payment needs attention", payments: [], ...overrides };
  }
  async function reconcile(at = beforeGrace, paid = false) {
    // Variable preserves a baseline-callable existing API: old source ignores graceClock.
    const input = { workspaceId: workspace.id, evidence: paid ? evidence({ status: "PAID", amountPaidCents: 10000, amountDueCents: 0, paidAt: at, firstFailedAt: undefined, failureCode: null, failureMessage: null, payments: [{ allocationId: `inpay_${token}`, paymentIntentId: `pi_${token}`, amountCents: 10000, paidAt: at }] }) : evidence(), eventId: `evt_${randomUUID()}`, db, now: at, graceClock: () => at };
    return reconcileMembershipInvoice(input);
  }
  async function book(date = "2030-01-08", at = beforeGrace) {
    const result = await createAccessBackedBooking({ workspaceId: workspace.id, memberId: member.id, classTemplateId: template.id, scheduledForDate: date, timezone: "UTC", source: "ADMIN", db: db as never, now: at });
    expect(result.status).toBe("created");
    if (result.status === "error") throw Error(result.message);
    return db.classBooking.findUniqueOrThrow({ where: { id: result.bookingId } });
  }
  async function dispose() {
    await db.$transaction(async tx => { const inventory = await inspectRetentionInventory(tx, workspace.id); await deleteReviewedWorkspaceRecords(tx, workspace.id, inventory.fingerprint); }, { timeout: 30000 });
    await db.user.delete({ where: { id: user.id } });
  }
  return { workspaceId: workspace.id, userId: user.id, memberId: member.id, membershipId: membership.id, templateId: template.id, programId: program.id, roomId: room.id, evidence, reconcile, book, dispose };
}
