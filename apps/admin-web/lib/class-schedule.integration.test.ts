import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, addDays, createAccessBackedBooking, getClassOccurrence, getWeekdayForDateString, shouldDeliverNotification } from "@flowstate/db";
import { commitClassSchedule, reviewClassSchedule, type ClassScheduleAccess, type ClassScheduleInput } from "./class-schedule";
import { getClassRoster } from "./rosters";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite("persisted class schedule changes", () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const workspaces: string[] = [], users: string[] = [];
  let access: ClassScheduleAccess, input: ClassScheduleInput, substitute: string, memberId: string;
  const now = new Date("2030-01-01T12:00:00Z");
  beforeEach(async () => {
    const workspace = await db.workspace.create({ data: { name: `schedule-test-${randomUUID()}` } }); workspaces.push(workspace.id);
    await createFixtureClassSchedulingPolicy(db, workspace.id);
    const location = await db.location.create({ data: { workspaceId: workspace.id, name: "Test gym", timezone: "UTC" } });
    const owner = await db.user.create({ data: { email: `${randomUUID()}@schedule.test`, fullName: "Owner" } }); users.push(owner.id);
    const other = await db.user.create({ data: { email: `${randomUUID()}@schedule.test`, fullName: "Substitute" } }); users.push(other.id);
    const staff = await db.workspaceUser.create({ data: { workspaceId: workspace.id, userId: owner.id, role: "OWNER" } });
    substitute = (await db.workspaceUser.create({ data: { workspaceId: workspace.id, userId: other.id, role: "COACH" } })).id;
    const program = await db.program.create({ data: { workspaceId: workspace.id, name: "Muay Thai" } });
    const room = await db.room.create({ data: { locationId: location.id, name: "Main mat", capacity: 20 } });
    const template = await db.classTemplate.create({ data: { workspaceId: workspace.id, programId: program.id, roomId: room.id, coachWorkspaceUserId: staff.id, title: "Beginner Muay Thai", weekday: "MONDAY", startTimeMinutes: 1080, endTimeMinutes: 1140, capacityOverride: 2, bookingCutoffMinutes: 0, cancellationCutoffMinutes: 0 } });
    const account = await db.user.create({data:{email:`${randomUUID()}@schedule.test`,workspaceUsers:{create:{workspaceId:workspace.id,role:"CUSTOMER"}}}}); users.push(account.id);
    memberId = (await db.member.create({ data: { workspaceId: workspace.id, userId:account.id, fullName: "Member", email: account.email } })).id;
    access = { workspaceId: workspace.id, workspaceUserId: staff.id, locationId: location.id, timezone: "UTC", role: "OWNER" };
    input = { templateId: template.id, scope: "coach", date: "2030-01-07", title: "Beginner Muay Thai", programId: program.id, roomId: room.id, coachWorkspaceUserId: substitute, coachAssignmentMode: "ASSIGNED", startTime: "18:00", endTime: "19:00", capacity: "2", bookingCutoffMinutes: "0", cancellationCutoffMinutes: "0", recurrence: "WEEKLY", weekdays: ["MONDAY"], endDate: "", reason: "" };
  });
  afterAll(async () => {
    for (const workspaceId of workspaces) {
      await db.memberPortalGrant.deleteMany({where:{workspaceId}});
      await db.financialReviewCase.deleteMany({ where: { workspaceId } });
      await db.classScheduleChange.deleteMany({ where: { workspaceId } });
      await db.attendanceRecord.deleteMany({ where: { workspaceId } }); await db.waitlistEntry.deleteMany({ where: { workspaceId } }); await db.classBooking.deleteMany({ where: { workspaceId } });
      await db.classInstance.deleteMany({ where: { workspaceId } }); await db.classScheduleRevision.deleteMany({ where: { workspaceId } }); await db.classTemplate.deleteMany({ where: { workspaceId } });
      await db.workspace.delete({ where: { id: workspaceId } });
    }
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
  });
  async function save(value = input) {
    const review = await reviewClassSchedule({ access, input: value, db, now });
    expect(review.errors).toEqual([]);
    return commitClassSchedule({ access, input: value, reviewToken: review.token, mutationId: randomUUID(), db, now });
  }
  async function reserve(date = input.date) { return db.classBooking.create({ data: { workspaceId: access.workspaceId, classTemplateId: input.templateId!, memberId, scheduledForDate: new Date(`${date}T00:00:00Z`), status: "BOOKED" } }); }
  it("assigns a substitute, preserves bookings, authorizes only the dated coach and queues one durable notice", async () => {
    const booking = await reserve();
    const review = await reviewClassSchedule({ access, input, db, now }); expect(review.errors).toEqual([]);
    const mutationId = randomUUID();
    const args = { access, input, reviewToken: review.token, mutationId, db, now };
    expect((await commitClassSchedule(args)).status).toBe("saved"); expect((await commitClassSchedule(args)).status).toBe("saved");
    const instance = await db.classInstance.findFirst({ where: { workspaceId: access.workspaceId } }); expect(instance).toMatchObject({ isScheduleOverride: false, coachAssignmentMode: "ASSIGNED", coachWorkspaceUserId: substitute });
    expect((await db.classBooking.findUnique({ where: { id: booking.id } }))?.status).toBe("BOOKED");
    expect(await db.notificationJob.count({ where: { workspaceId: access.workspaceId } })).toBe(1);
    expect(await db.classScheduleChange.count({ where: { workspaceId: access.workspaceId } })).toBe(1);
    const rosterArgs = { templateId: input.templateId!, scheduledForDate: input.date, db: db as never, now };
    expect(await getClassRoster({ ...rosterArgs, access: { ...access, role: "COACH", workspaceUserId: substitute } })).not.toBeNull();
    expect(await getClassRoster({ ...rosterArgs, access: { ...access, role: "COACH" } })).toBeNull();
  });
  it("notifies only current verified account recipients and suppresses a queued notice after guardian revocation", async () => {
    await db.member.update({where:{id:memberId},data:{userId:null,email:"unverified-contact@schedule.test"}});
    const guardian = await db.guardian.create({data:{workspaceId:access.workspaceId,fullName:"Raw contact",email:"raw-guardian@schedule.test",familyLinks:{create:{workspaceId:access.workspaceId,childMemberId:memberId,isPrimary:true}}}});
    await reserve();
    expect((await reviewClassSchedule({access,input,db,now})).notificationCount).toBe(0);
    const account = await db.user.create({data:{email:`${randomUUID()}@schedule.test`,workspaceUsers:{create:{workspaceId:access.workspaceId,role:"CUSTOMER"}}}}); users.push(account.id);
    const grant = await db.memberPortalGrant.create({data:{workspaceId:access.workspaceId,memberId,userId:account.id,guardianId:guardian.id,verifiedByWorkspaceUserId:access.workspaceUserId,verificationNote:"Verified against guardian evidence",canBook:true}});
    expect((await save()).status).toBe("saved");
    const notices = await db.notificationJob.findMany({where:{workspaceId:access.workspaceId}});
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({recipientEmail:account.email,context:{kind:"MEMBER_ACCESS",memberId}});
    expect(await shouldDeliverNotification(notices[0]!,db,now)).toBe(true);
    await db.memberPortalGrant.update({where:{id:grant.id},data:{revokedAt:now}});
    expect(await shouldDeliverNotification(notices[0]!,db,now)).toBe(false);
  });
  it("keeps explicit unassignment independent of future timetable changes", async () => {
    expect((await save({ ...input, coachAssignmentMode: "UNASSIGNED", coachWorkspaceUserId: "" })).status).toBe("saved");
    expect((await save({ ...input, scope: "future", coachWorkspaceUserId: substitute, startTime: "19:00", endTime: "20:00" })).status).toBe("saved");
    const occurrence = await getClassOccurrence({ workspaceId: access.workspaceId, classTemplateId: input.templateId!, scheduledForDate: input.date, db });
    expect(occurrence).toMatchObject({ startTimeMinutes: 1140, coachWorkspaceUserId: null, defaultCoachWorkspaceUserId: substitute, isScheduleOverride: false });
    const next = await getClassOccurrence({ workspaceId: access.workspaceId, classTemplateId: input.templateId!, scheduledForDate: "2030-01-14", db }); expect(next?.coachWorkspaceUserId).toBe(substitute);
  });
  it("rejects stale reviews after a reservation arrives and serializes competing changes", async () => {
    const review = await reviewClassSchedule({ access, input, db, now }); await reserve();
    expect(await commitClassSchedule({ access, input, reviewToken: review.token, mutationId: randomUUID(), db, now })).toMatchObject({ status: "error", message: expect.stringContaining("changed after") });
    const current = await reviewClassSchedule({ access, input, db, now });
    const result = await Promise.all([randomUUID(), randomUUID()].map((mutationId) => commitClassSchedule({ access, input, reviewToken: current.token, mutationId, db, now })));
    expect(result.filter((item) => item.status === "saved")).toHaveLength(1); expect(result.filter((item) => item.status === "error")).toHaveLength(1);
  });
  it("protects bookings many years away and checks conflicts after a far-future revision", async () => {
    const farDate = "2045-06-05";
    const weekday = getWeekdayForDateString(farDate);
    await db.classTemplate.update({ where: { id: input.templateId! }, data: { weekday } }); input.weekdays = [weekday]; input.date = "2030-01-02"; while (getWeekdayForDateString(input.date) != weekday) input.date = addDays(input.date, 1);
    await reserve(farDate);
    const review = await reviewClassSchedule({ access, input: { ...input, scope: "future", recurrence: "ONCE" }, db, now });
    expect(review.errors.some((error) => error.includes(farDate) && error.includes("booked"))).toBe(true);
    const conflict = await db.classTemplate.create({ data: { workspaceId: access.workspaceId, programId: input.programId, roomId: input.roomId, title: "Far future class", weekday, coachWorkspaceUserId: null, startTimeMinutes: 600, endTimeMinutes: 660, bookingCutoffMinutes: 0, cancellationCutoffMinutes: 0 } });
    await db.classScheduleRevision.create({ data: { workspaceId: access.workspaceId, classTemplateId: conflict.id, effectiveFrom: new Date(`${farDate}T00:00:00Z`), startDate: new Date(`${farDate}T00:00:00Z`), recurrence: "WEEKLY", weekdays: [weekday], programId: input.programId, roomId: input.roomId, startTimeMinutes: 1140, endTimeMinutes: 1200, bookingCutoffMinutes: 0, cancellationCutoffMinutes: 0 } });
    const conflictReview = await reviewClassSchedule({ access, input: { ...input, scope: "future", startTime: "19:00", endTime: "20:00" }, db, now });
    expect(conflictReview.errors.some((error) => error.includes(farDate) && error.includes("overlaps"))).toBe(true);
  });
  it("serializes concurrent last-seat reservations using the same schedule lock", async () => {
    await db.classTemplate.update({ where: { id: input.templateId! }, data: { capacityOverride: 1 } });
    const secondMember = await db.member.create({ data: { workspaceId: access.workspaceId, fullName: "Second" } });
    const product = await db.punchCardProduct.create({ data: { workspaceId: access.workspaceId, name: "Test pack", punchesIncluded: 2, priceCents: 1000 } });
    for (const id of [memberId, secondMember.id]) await db.memberPunchCard.create({ data: { workspaceId: access.workspaceId, memberId: id, punchCardProductId: product.id, originalPunches: 2, remainingPunches: 2, purchasePriceCents: 1000 } });
    const results = await Promise.all([memberId, secondMember.id].map((id) => createAccessBackedBooking({ workspaceId: access.workspaceId, memberId: id, classTemplateId: input.templateId!, scheduledForDate: input.date, timezone: "UTC", source: "MEMBER_PORTAL", db: db as never, now })));
    expect(results.filter((item) => item.status === "created")).toHaveLength(1); expect(results.filter((item) => item.status === "error")).toHaveLength(1);
    expect(await db.classBooking.count({ where: { workspaceId: access.workspaceId, status: "BOOKED" } })).toBe(1);
  });
  it("queues a financial review when the gym cancels transferred paid access", async () => {
    const product = await db.dropInProduct.create({ data: { workspaceId: access.workspaceId, name: "Single class", priceCents: 2500 } });
    const funding = await db.classBooking.create({ data: { workspaceId: access.workspaceId, memberId, classTemplateId: input.templateId!, scheduledForDate: new Date("2030-01-14"), bookingType: "DROP_IN", status: "CANCELLED", dropInProductId: product.id, dropInPriceCents: 2500, dropInCurrency: "usd", dropInCheckoutSessionId: "cs_transferred", dropInPaidAt: now } });
    const active = await db.classBooking.create({ data: { workspaceId: access.workspaceId, memberId, classTemplateId: input.templateId!, scheduledForDate: new Date(input.date), bookingType: "DROP_IN", fundedByBookingId: funding.id } });
    expect((await save({ ...input, scope: "cancel", reason: "Gym is closed" })).status).toBe("saved");
    const review = await db.financialReviewCase.findFirst({ where: { workspaceId: access.workspaceId } });
    expect(review).toMatchObject({ bookingId: active.id, amountCents: 2500, currency: "usd", sourceKey: `gym-cancel:${active.id}:1` });
    expect((await db.classBooking.findUnique({ where: { id: active.id } }))?.status).toBe("CANCELLED");
  });

});
