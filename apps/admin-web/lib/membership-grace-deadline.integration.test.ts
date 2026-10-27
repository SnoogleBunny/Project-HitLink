import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@flowstate/db";
import { beforeGrace, deadline, graceFixture, requireGraceTestDatabase } from "./membership-grace-fixture";
const url = process.env.TEST_DATABASE_URL;
requireGraceTestDatabase(url);
(url ? describe : describe.skip)("MP13 existing invoice reconciliation at the fixed deadline", () => {
  const db = new PrismaClient({ datasourceUrl: url, log: [] });
  const fixtures: Awaited<ReturnType<typeof graceFixture>>[] = [];
  afterAll(async () => { for (const fixture of fixtures) await fixture.dispose(); await db.$disconnect(); });
  it("keeps grace until its exact boundary, then releases a future reservation without penalty or later seat resurrection", async () => {
    const f = await graceFixture(db); fixtures.push(f);
    const booking = await f.book();
    const original = await db.membershipAllowanceAllocation.findMany({ where: { workspaceId: f.workspaceId, bookingId: booking.id }, orderBy: { id: "asc" } });
    expect(original).toHaveLength(2);
    await f.reconcile(beforeGrace);
    await f.reconcile(new Date(+deadline - 1));
    expect((await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("BOOKED");
    // Existing source re-delivers/recomputes debt but never disposes of the seat: intended RED.
    await f.reconcile(deadline);
    expect((await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CANCELLED");
    const released = await db.membershipAllowanceAllocation.findMany({ where: { bookingId: booking.id }, orderBy: { id: "asc" } });
    expect(released.map(row => [row.id, row.periodStart, row.periodEnd, row.state])).toEqual(original.map(row => [row.id, row.periodStart, row.periodEnd, "RELEASED"]));
    expect(await db.attendanceRecord.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    expect(await db.membershipAllowanceEntry.count({ where: { workspaceId: f.workspaceId, usedDelta: { not: 0 } } })).toBe(0);
    expect(await db.workspaceDataEvent.count({ where: { workspaceId: f.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED" } })).toBe(1);
    await f.reconcile(deadline);
    expect(await db.workspaceDataEvent.count({ where: { workspaceId: f.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED" } })).toBe(1);
    await f.reconcile(new Date(+deadline + 60000), true);
    expect((await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CANCELLED");
    expect((await db.membershipBillingState.findUniqueOrThrow({ where: { memberMembershipId: f.membershipId } })).status).toBe("ACTIVE");
    expect(await db.notificationJob.count({ where: { workspaceId: f.workspaceId, dedupeKey: { startsWith: "membership-grace:" } } })).toBe(1);
  });
});
