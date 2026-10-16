import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  PrismaClient,
  CoachingActor,
  CoachingCommand,
} from "@flowstate/db";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("adult coaching permissions and persistent workflows", () => {
  let db: PrismaClient;
  let api: typeof import("@flowstate/db");
  const prefix = `coaching-${randomUUID()}`;
  const workspaceId = `${prefix}-workspace`;
  const owner: CoachingActor = { workspaceId, userId: `${prefix}-owner` };
  const coach: CoachingActor = { workspaceId, userId: `${prefix}-coach` };
  const replacement: CoachingActor = {
    workspaceId,
    userId: `${prefix}-replacement`,
  };
  const client: CoachingActor = { workspaceId, userId: `${prefix}-client` };
  const stranger: CoachingActor = { workspaceId, userId: `${prefix}-stranger` };
  const coachId = `${prefix}-coach-staff`,
    replacementId = `${prefix}-replacement-staff`,
    ownerId = `${prefix}-owner-staff`,
    memberId = `${prefix}-member`;
  let programVersionId: string;
  let today: string;
  const command = (
    actor: CoachingActor,
    kind: CoachingCommand["kind"],
    input: Record<string, unknown>,
    enrollmentId?: string,
    expectedVersion?: number,
    operationId = randomUUID(),
  ) =>
    api.runCoachingCommand(actor, {
      kind,
      input,
      enrollmentId,
      expectedVersion,
      operationId,
    });
  const mutate = async (
    actor: CoachingActor,
    id: string,
    kind: CoachingCommand["kind"],
    input: Record<string, unknown>,
  ) => {
    const record = await db.coachingEnrollment.findUniqueOrThrow({
      where: { id },
    });
    return command(actor, kind, input, id, record.version);
  };
  async function activeEnrollment() {
    return db.coachingEnrollment.create({
      data: {
        workspaceId,
        memberId,
        programVersionId,
        startsOn: new Date(`${today}T00:00:00Z`),
        endsOn: new Date(`${api.addDays(today, 27)}T00:00:00Z`),
        timezone: "America/Vancouver",
        currentCoachWorkspaceUserId: coachId,
        caseOwnerWorkspaceUserId: ownerId,
        acceptedAt: new Date(),
        contactVerifiedAt: new Date(),
        paymentState: "PAID",
        historyFromDate: new Date(`${today}T00:00:00Z`),
        assignments: {
          create: {
            coachWorkspaceUserId: coachId,
            acceptedAt: new Date(),
            historyFromDate: new Date(`${today}T00:00:00Z`),
          },
        },
      },
    });
  }
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    api = await import("@flowstate/db");
    db = api.prisma;
    today = api.getWorkspaceDateString(new Date(), "America/Vancouver");
    await db.workspace.create({
      data: {
        id: workspaceId,
        name: "Coaching integration fixture",
        status: "ACTIVE",
        location: {
          create: { name: "Fixture", timezone: "America/Vancouver" },
        },
      },
    });
    for (const actor of [owner, coach, replacement, client, stranger])
      await db.user.create({
        data: {
          id: actor.userId,
          email: `${actor.userId}@example.test`,
          fullName: actor.userId,
        },
      });
    for (const [id, actor, role] of [
      [ownerId, owner, "OWNER"],
      [coachId, coach, "COACH"],
      [replacementId, replacement, "COACH"],
      [`${prefix}-client-role`, client, "CUSTOMER"],
      [`${prefix}-stranger-role`, stranger, "CUSTOMER"],
    ] as const)
      await db.workspaceUser.create({
        data: { id, workspaceId, userId: actor.userId, role },
      });
    await db.member.create({
      data: {
        id: memberId,
        workspaceId,
        userId: client.userId,
        fullName: "Adult client",
        dateOfBirth: new Date("1990-02-01"),
        status: "ACTIVE",
      },
    });
    await db.member.create({
      data: {
        id: `${prefix}-stranger-member`,
        workspaceId,
        userId: stranger.userId,
        fullName: "Other client",
        dateOfBirth: new Date("1990-01-01"),
        status: "ACTIVE",
      },
    });
    const program = await db.coachingProgram.create({
      data: {
        workspaceId,
        name: "Four week program",
        versions: {
          create: {
            number: 1,
            durationDays: 28,
            deliveryWeekdays: [0, 1, 2, 3, 4, 5, 6],
            responseHours: 48,
            goals: "A shared goal",
            milestones: ["First milestone"],
            priceCents: 0,
            currency: "cad",
            terms: "Pause extends delivery; unused units reviewed at closure.",
            appointmentUnits: 1,
            cancellationHours: 24,
          },
        },
      },
      include: { versions: true },
    });
    programVersionId = program.versions[0]!.id;
  });
  afterAll(async () => {
    if (!db) return;
    await db.coachingEnrollment.deleteMany({ where: { workspaceId } });
    await db.coachingProgramVersion.deleteMany({
      where: { program: { workspaceId } },
    });
    await db.classTemplate.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({
      where: {
        id: {
          in: [owner, coach, replacement, client, stranger].map(
            (actor) => actor.userId,
          ),
        },
      },
    });
  });

  it("requires own adult account, named reviewer, independent verification, intake and plan acceptance", async () => {
    const offer = await command(owner, "enroll", {
      memberId,
      programVersionId,
      coachId,
      startsOn: today,
    });
    await expect(
      mutate(client, offer.id, "submitIntake", { body: "Sensitive intake" }),
    ).rejects.toThrow("Accept your named intake reviewer");
    await mutate(client, offer.id, "sendVerification", {});
    const notice = await db.notificationJob.findFirstOrThrow({
      where: {
        workspaceId,
        recipientEmail: `${client.userId}@example.test`,
        subject: "Verify your coaching contact",
      },
      orderBy: { createdAt: "desc" },
    });
    const code = notice.body.match(/page: ([a-f0-9]{48})/)![1];
    const record = await db.coachingEnrollment.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(record.verificationHash).not.toBe(code);
    expect(notice.expiresAt?.getTime()).toBe(record.verificationExpiresAt?.getTime());
    expect(await api.shouldDeliverNotification(notice, db, record.verificationSentAt!)).toBe(true);
    await db.workspaceUser.updateMany({ where: { workspaceId, userId: client.userId }, data: { isActive: false } });
    expect(await api.shouldDeliverNotification(notice, db, record.verificationSentAt!)).toBe(false);
    await expect(api.getCoachingDetail(client, offer.id)).rejects.toThrow("do not have access");
    await db.workspaceUser.updateMany({ where: { workspaceId, userId: client.userId }, data: { isActive: true } });
    expect(await api.shouldDeliverNotification({ ...notice, context: { ...(notice.context as object), verificationHash: "superseded-challenge" } }, db, record.verificationSentAt!)).toBe(false);
    await mutate(client, offer.id, "verifyContact", { code });
    expect(await api.shouldDeliverNotification(notice, db, record.verificationSentAt!)).toBe(false);
    await expect(
      mutate(client, offer.id, "verifyContact", { code }),
    ).rejects.toThrow("invalid or expired");
    await mutate(client, offer.id, "acceptCoach", { historyFromDate: today });
    await expect(
      mutate(owner, offer.id, "submitIntake", {
        body: "Owner cannot answer for client",
      }),
    ).rejects.toThrow("own account");
    await mutate(client, offer.id, "submitIntake", {
      body: "Sensitive intake",
    });
    await mutate(client, offer.id, "acceptPlan", { acceptTerms: true });
    const detail = await api.getCoachingDetail(client, offer.id);
    expect(detail.status).toBe("ACTIVE");
    expect(detail.paymentState).toBe("PAID"); // zero-price program, no simulated provider payment
    expect(detail.intake?.content).toBe("Sensitive intake");
    expect((await api.getCoachingDetail(owner, offer.id)).intake).toBeNull();
  });

  it("keeps author-private notes and drafts out of owner, other coach, client and export reads", async () => {
    const e = await activeEnrollment();
    await mutate(coach, e.id, "savePrivateNote", {
      localDate: today,
      noteVersion: -1,
      body: "AUTHOR_PRIVATE_SENTINEL",
    });
    await mutate(coach, e.id, "saveDailyNote", {
      localDate: today,
      noteVersion: -1,
      body: "UNPUBLISHED_SENTINEL",
    });
    const ownerView = await api.getCoachingDetail(owner, e.id),
      clientView = await api.getCoachingDetail(client, e.id);
    expect(JSON.stringify(ownerView)).not.toContain("SENTINEL");
    expect(JSON.stringify(clientView)).not.toContain("SENTINEL");
    expect(
      (await api.getCoachingDetail(coach, e.id)).privateNotes[0]?.body,
    ).toBe("AUTHOR_PRIVATE_SENTINEL");
    await expect(api.getCoachingDetail(replacement, e.id)).rejects.toThrow(
      "access",
    );
    await expect(api.getCoachingDetail(stranger, e.id)).rejects.toThrow(
      "access",
    );
    await expect(
      api.getCoachingDetail(
        { ...client, workspaceId: "wrong-workspace" },
        e.id,
      ),
    ).rejects.toThrow("access");
    expect(
      JSON.stringify(await api.exportCoachingRecords(client, e.id)),
    ).not.toContain("SENTINEL");
    await expect(api.exportCoachingRecords(owner, e.id)).rejects.toThrow(
      "Only the client",
    );
  });

  it("publishes explicitly, preserves amendment history, rejects stale writes, and revokes withdrawn content", async () => {
    const e = await activeEnrollment();
    await mutate(coach, e.id, "saveDailyNote", {
      localDate: today,
      noteVersion: -1,
      body: "First public note",
    });
    await expect(
      mutate(coach, e.id, "publishDailyNote", {
        localDate: today,
        noteVersion: 0,
        confirmPublish: true,
        confirmClientId: "other-member",
      }),
    ).rejects.toThrow("Preview");
    await mutate(coach, e.id, "publishDailyNote", {
      localDate: today,
      noteVersion: 0,
      confirmPublish: true,
      confirmClientId: memberId,
    });
    await expect(
      mutate(coach, e.id, "saveDailyNote", {
        localDate: today,
        noteVersion: 0,
        body: "Stale edit",
      }),
    ).rejects.toThrow("changed");
    await mutate(coach, e.id, "saveDailyNote", {
      localDate: today,
      noteVersion: 1,
      body: "Amended public note",
    });
    expect(
      (await api.getCoachingDetail(client, e.id)).published[0]?.revisions[0]
        ?.body,
    ).toBe("First public note");
    await mutate(coach, e.id, "publishDailyNote", {
      localDate: today,
      noteVersion: 2,
      confirmPublish: true,
      confirmClientId: memberId,
    });
    expect(
      (await api.getCoachingDetail(client, e.id)).published[0]?.revisions,
    ).toHaveLength(2);
    await mutate(coach, e.id, "withdrawDailyNote", {
      localDate: today,
      noteVersion: 3,
      reason: "Wrong details published",
    });
    expect((await api.getCoachingDetail(client, e.id)).published).toHaveLength(
      0,
    );
    expect(
      JSON.stringify(await api.exportCoachingRecords(client, e.id)),
    ).not.toContain("public note");
    expect(
      await db.coachingDailyNoteRevision.count({
        where: { note: { enrollmentId: e.id } },
      }),
    ).toBe(2);
  });

  it("revokes departing coaches immediately and never transfers private notes or drafts", async () => {
    const e = await activeEnrollment();
    await mutate(coach, e.id, "savePrivateNote", {
      localDate: today,
      noteVersion: -1,
      body: "Old coach secret",
    });
    await mutate(coach, e.id, "saveDailyNote", {
      localDate: today,
      noteVersion: -1,
      body: "Old coach draft",
    });
    await mutate(owner, e.id, "proposeCoach", {
      coachId: replacementId,
      reason: "Departure",
    });
    await expect(api.getCoachingDetail(coach, e.id)).rejects.toThrow("access");
    await expect(api.getCoachingDetail(replacement, e.id)).rejects.toThrow(
      "access",
    );
    await mutate(client, e.id, "acceptCoach", { historyFromDate: today });
    const view = await api.getCoachingDetail(replacement, e.id);
    expect(view.privateNotes).toHaveLength(0);
    expect(view.drafts).toHaveLength(0);
    await expect(
      mutate(replacement, e.id, "saveDailyNote", {
        localDate: today,
        noteVersion: 0,
        body: "Overwrite",
      }),
    ).rejects.toThrow("Another coach");
  });

  it("cannot grant the owner content access without client acceptance", async () => {
    const e = await activeEnrollment();
    await mutate(owner, e.id, "proposeCoach", {
      coachId: ownerId,
      reason: "Owner now proposes coaching",
    });
    expect((await api.getCoachingDetail(owner, e.id)).coach).toBe(false);
    await expect(
      mutate(owner, e.id, "savePrivateNote", {
        localDate: today,
        noteVersion: -1,
        body: "Attempt",
      }),
    ).rejects.toThrow("currently accepted coach");
    await expect(
      mutate(owner, e.id, "acceptCoach", { historyFromDate: today }),
    ).rejects.toThrow("own account");
  });

  it("replays identical commands once and rejects operation-id reuse with different input", async () => {
    const e = await activeEnrollment();
    const operationId = randomUUID();
    const args = { localDate: today, noteVersion: -1, body: "One draft" };
    const results = await Promise.all([
      command(coach, "saveDailyNote", args, e.id, 0, operationId),
      command(coach, "saveDailyNote", args, e.id, 0, operationId),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      await db.coachingDailyNote.count({ where: { enrollmentId: e.id } }),
    ).toBe(1);
    expect(
      await db.coachingEvent.count({ where: { workspaceId, operationId } }),
    ).toBe(1);
    await expect(
      command(
        coach,
        "saveDailyNote",
        { ...args, body: "Changed" },
        e.id,
        0,
        operationId,
      ),
    ).rejects.toThrow("already been used");
  });

  it("reserves the last appointment unit once under simultaneous booking and returns it on provider cancellation", async () => {
    const e = await activeEnrollment();
    const slots = await Promise.all(
      [3, 4].map((offset) =>
        db.coachingAvailability.create({
          data: {
            workspaceId,
            coachWorkspaceUserId: coachId,
            startsAt: api.getZonedDateTimeAsUtc({
              dateString: api.addDays(today, offset),
              minutes: 600,
              timezone: e.timezone,
            }),
            endsAt: api.getZonedDateTimeAsUtc({
              dateString: api.addDays(today, offset),
              minutes: 660,
              timezone: e.timezone,
            }),
            virtualUrl: "https://example.test/private-meeting",
          },
        }),
      ),
    );
    const results = await Promise.allSettled(
      slots.map((slot) =>
        command(
          client,
          "bookAppointment",
          { availabilityId: slot.id },
          e.id,
          0,
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const appointments = await db.coachingAppointment.findMany({
      where: { enrollmentId: e.id },
    });
    expect(appointments).toHaveLength(1);
    await mutate(coach, e.id, "cancelAppointment", {
      appointmentId: appointments[0]!.id,
      appointmentVersion: 0,
      reason: "Coach unavailable",
    });
    expect(
      (
        await db.coachingAppointment.findUniqueOrThrow({
          where: { id: appointments[0]!.id },
        })
      ).unitState,
    ).toBe("RELEASED");
  });

  it("keeps service closure independent from money and retains units and published retrieval", async () => {
    const e = await activeEnrollment();
    await mutate(client, e.id, "pause", {
      startsOn: api.addDays(today, 1),
      endsOn: api.addDays(today, 2),
      confirmConsequences: true,
    });
    const paused = await db.coachingEnrollment.findUniqueOrThrow({
      where: { id: e.id },
    });
    expect(api.toDateOnlyString(paused.endsOn)).toBe(api.addDays(today, 29));
    await mutate(client, e.id, "close", {
      reason: "Program no longer fits",
      confirmConsequences: true,
    });
    const closed = await api.getCoachingDetail(client, e.id);
    expect(closed.status).toBe("CLOSED");
    expect(closed.settlementState).toBe("REVIEW_REQUIRED");
    expect(closed.includedUnits).toBe(1);
    expect(closed.reservedOrUsedUnits).toBe(0);
    expect(closed.retrievalUntil).toBeInstanceOf(Date);
    await expect(
      mutate(coach, e.id, "saveDailyNote", {
        localDate: today,
        noteVersion: -1,
        body: "No service after closure",
      }),
    ).rejects.toThrow("closed");
  });

  it("rejects enrollment for minors and inactive-coach delivery", async () => {
    await db.member.update({ where: { id: `${prefix}-stranger-member` }, data: { dateOfBirth: new Date(`${Number(today.slice(0, 4)) - 16}-01-01`) } });
    await expect(command(owner, "enroll", { memberId: `${prefix}-stranger-member`, programVersionId, coachId, startsOn: today })).rejects.toThrow("18 or older");
    const e = await activeEnrollment();
    await db.workspaceUser.update({ where: { id: coachId }, data: { isActive: false } });
    try {
      expect((await api.getCoachingDetail(client, e.id)).status).toBe("AWAITING_REPLACEMENT");
      expect((await api.getCoachingDetail(client, e.id)).coachAccepted).toBe(false);
      await expect(mutate(coach, e.id, "savePrivateNote", { localDate: today, body: "No longer allowed", noteVersion: -1 })).rejects.toThrow("access");
    } finally { await db.workspaceUser.update({ where: { id: coachId }, data: { isActive: true } }); }
  });

  it("checks class conflicts including buffers and keeps the old reservation after a failed move", async () => {
    const e = await activeEnrollment();
    const day = api.addDays(today, 10);
    const location = await db.location.findUniqueOrThrow({ where: { workspaceId } });
    const room = await db.room.create({ data: { locationId: location.id, name: "Coaching conflict room" } });
    const program = await db.program.create({ data: { workspaceId, name: "Conflict class" } });
    await db.classTemplate.create({ data: { workspaceId, programId: program.id, roomId: room.id, coachWorkspaceUserId: coachId, weekday: api.getWeekdayForDateString(day), startTimeMinutes: 660, endTimeMinutes: 720, bookingCutoffMinutes: 0, cancellationCutoffMinutes: 0 } });
    const slot = async (minutes: number, bufferMinutes = 0) => db.coachingAvailability.create({ data: { workspaceId, coachWorkspaceUserId: coachId, roomId: room.id, startsAt: api.getZonedDateTimeAsUtc({ dateString: day, minutes, timezone: e.timezone }), endsAt: api.getZonedDateTimeAsUtc({ dateString: day, minutes: minutes + 60, timezone: e.timezone }), bufferMinutes } });
    const original = await slot(540), buffered = await slot(720, 15);
    const booking = await mutate(client, e.id, "bookAppointment", { availabilityId: original.id });
    await expect(mutate(client, e.id, "moveAppointment", { appointmentId: booking.id, availabilityId: buffered.id })).rejects.toThrow("has a class");
    const retained = await db.coachingAppointment.findUniqueOrThrow({ where: { id: booking.id } });
    expect(retained.availabilityId).toBe(original.id);
    expect(retained.unitState).toBe("HELD");
    expect(retained.status).toBe("BOOKED");
    expect((await api.getCoachingDetail(client, e.id)).reservedOrUsedUnits).toBe(1);
  });
});
