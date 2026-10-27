import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { installProviderNetworkGuard } from "../../../tests/support/provider-network-guard.mjs";
import { startCoachingPayment } from "@flowstate/payments";

const provider = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: provider.create } };
  },
}));
type CheckoutRequest = NonNullable<
  Parameters<Stripe["checkout"]["sessions"]["create"]>[0]
>;
import type {
  PrismaClient,
  CoachingActor,
  CoachingCommand,
  Prisma,
} from "@flowstate/db";
import { createFixtureCoachingBookingPolicy, deleteFixtureCoachingWorkspace } from "../../../packages/db/tests/coaching-booking-policy-fixture.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("adult coaching permissions and persistent workflows", () => {
  let db: PrismaClient;
  let providerNetworkGuard: ReturnType<typeof installProviderNetworkGuard> | undefined;
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
    providerNetworkGuard = installProviderNetworkGuard();
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
    await createFixtureCoachingBookingPolicy(db, workspaceId, owner.userId);
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
    try {
      if (db) {
        await deleteFixtureCoachingWorkspace(db, workspaceId);
        await db.user.deleteMany({
          where: {
            id: {
              in: [owner, coach, replacement, client, stranger].map(
                (actor) => actor.userId,
              ),
            },
          },
        });
      }
      if (providerNetworkGuard) {
        expect(providerNetworkGuard.report.blocked).toHaveLength(0);
        expect(providerNetworkGuard.report.openedExternalSockets).toBe(0);
      }
    } finally {
      providerNetworkGuard?.restore();
      vi.unstubAllEnvs();
    }
  }, 600000);

  async function waitedMutation<T>(
    change: (tx: Prisma.TransactionClient) => Promise<unknown>,
    run: () => Promise<T>,
  ) {
    let release!: () => void, acquired!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const holder = db.$transaction(
      async (tx) => {
        await api.lockClassSchedule(tx, workspaceId);
        acquired();
        await gate;
        await change(tx);
      },
      { timeout: 15000 },
    );
    await locked;
    const attempted = run().then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error: error as Error }),
    );
    try {
      await expect
        .poll(
          async () => {
            const rows = await db.$queryRaw<Array<{ waiting: boolean }>>`
          SELECT EXISTS (SELECT 1 FROM pg_locks
            WHERE locktype='advisory' AND NOT granted AND objsubid=1
              AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
              AND objid::bigint=(hashtext(${`class-schedule:${workspaceId}`})::bigint & 4294967295)
          ) AS waiting`;
            return rows[0]?.waiting;
          },
          { timeout: 5000 },
        )
        .toBe(true);
    } finally {
      release();
      await holder;
    }
    return attempted;
  }
  for (const revoked of ["owner", "business"] as const)
    it(`denies a waited coaching mutation after ${revoked} authority is revoked`, async () => {
      const name = `waited-${randomUUID()}`;
      try {
        const result = await waitedMutation(
          (tx) =>
            revoked === "owner"
              ? tx.workspaceUser.update({
                  where: { id: ownerId },
                  data: { isActive: false },
                })
              : tx.workspace.update({
                  where: { id: workspaceId },
                  data: { status: "DISABLED" },
                }),
          () =>
            command(owner, "createProgram", {
              name,
              durationDays: 28,
              deliveryWeekdays: "1,3,5",
              responseHours: 48,
              goals: "Reviewed goal",
              milestones: "First step",
              priceCents: 0,
              currency: "cad",
              terms: "Fictional terms",
            }),
        );
        expect(result.ok).toBe(false);
        if (!result.ok)
          expect(result.error.message).toContain("access to coaching");
        expect(
          await db.coachingProgram.count({ where: { workspaceId, name } }),
        ).toBe(0);
      } finally {
        await db.workspace.update({
          where: { id: workspaceId },
          data: { status: "ACTIVE" },
        });
        await db.workspaceUser.update({
          where: { id: ownerId },
          data: { isActive: true },
        });
      }
    }, 20000);
  it("denies a waited private note after active coach access is revoked", async () => {
    const enrollment = await activeEnrollment(),
      body = `waited-private-${randomUUID()}`,
      operationId = randomUUID();
    try {
      const result = await waitedMutation(
        (tx) =>
          tx.workspaceUser.update({
            where: { id: coachId },
            data: { isActive: false },
          }),
        () =>
          command(
            coach,
            "savePrivateNote",
            { localDate: today, body },
            enrollment.id,
            enrollment.version,
            operationId,
          ),
      );
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error.message).toContain("access to coaching");
      expect(
        await db.coachingPrivateNote.count({
          where: { enrollmentId: enrollment.id },
        }),
      ).toBe(0);
      expect(
        await db.coachingEvent.count({ where: { workspaceId, operationId } }),
      ).toBe(0);
    } finally {
      await db.workspaceUser.update({
        where: { id: coachId },
        data: { isActive: true },
      });
    }
  }, 20000);
  it("denies a waited coach proposal after its prospective coach is deactivated", async () => {
    const enrollment = await activeEnrollment(),
      operationId = randomUUID();
    try {
      const result = await waitedMutation(
        (tx) =>
          tx.workspaceUser.update({
            where: { id: replacementId },
            data: { isActive: false },
          }),
        () =>
          command(
            owner,
            "proposeCoach",
            { coachId: replacementId },
            enrollment.id,
            enrollment.version,
            operationId,
          ),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain("active coach");
      expect(
        (
          await db.coachingEnrollment.findUniqueOrThrow({
            where: { id: enrollment.id },
          })
        ).proposedCoachWorkspaceUserId,
      ).toBeNull();
      expect(
        await db.coachingEvent.count({ where: { workspaceId, operationId } }),
      ).toBe(0);
    } finally {
      await db.workspaceUser.update({
        where: { id: replacementId },
        data: { isActive: true },
      });
    }
  }, 20000);
  it("denies a waited private note after reassignment while its former coach stays active", async () => {
    const enrollment = await activeEnrollment(),
      operationId = randomUUID();
    const result = await waitedMutation(
      async (tx) => {
        await tx.coachingAssignment.updateMany({
          where: { enrollmentId: enrollment.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.coachingAssignment.create({
          data: {
            enrollmentId: enrollment.id,
            coachWorkspaceUserId: replacementId,
            acceptedAt: new Date(),
            historyFromDate: new Date(`${today}T00:00:00Z`),
          },
        });
        await tx.coachingEnrollment.update({
          where: { id: enrollment.id },
          data: {
            currentCoachWorkspaceUserId: replacementId,
            version: { increment: 1 },
          },
        });
      },
      () =>
        command(
          coach,
          "savePrivateNote",
          { localDate: today, body: "Former coach must not save this" },
          enrollment.id,
          enrollment.version,
          operationId,
        ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.message).toContain("access to this program");
    expect(
      (await db.workspaceUser.findUniqueOrThrow({ where: { id: coachId } }))
        .isActive,
    ).toBe(true);
    expect(
      await db.coachingPrivateNote.count({
        where: { enrollmentId: enrollment.id },
      }),
    ).toBe(0);
    expect(
      await db.coachingEvent.count({ where: { workspaceId, operationId } }),
    ).toBe(0);
  }, 20000);

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
    expect(notice.expiresAt?.getTime()).toBe(
      record.verificationExpiresAt?.getTime(),
    );
    expect(
      await api.shouldDeliverNotification(
        notice,
        db,
        record.verificationSentAt!,
      ),
    ).toBe(true);
    await db.workspaceUser.updateMany({
      where: { workspaceId, userId: client.userId },
      data: { isActive: false },
    });
    expect(
      await api.shouldDeliverNotification(
        notice,
        db,
        record.verificationSentAt!,
      ),
    ).toBe(false);
    await expect(api.getCoachingDetail(client, offer.id)).rejects.toThrow(
      "do not have access",
    );
    await db.workspaceUser.updateMany({
      where: { workspaceId, userId: client.userId },
      data: { isActive: true },
    });
    expect(
      await api.shouldDeliverNotification(
        {
          ...notice,
          context: {
            ...(notice.context as object),
            verificationHash: "superseded-challenge",
          },
        },
        db,
        record.verificationSentAt!,
      ),
    ).toBe(false);
    await mutate(client, offer.id, "verifyContact", { code });
    expect(
      await api.shouldDeliverNotification(
        notice,
        db,
        record.verificationSentAt!,
      ),
    ).toBe(false);
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
      "Only the adult client",
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
    await db.member.update({
      where: { id: `${prefix}-stranger-member` },
      data: {
        dateOfBirth: new Date(`${Number(today.slice(0, 4)) - 16}-01-01`),
      },
    });
    await expect(
      command(owner, "enroll", {
        memberId: `${prefix}-stranger-member`,
        programVersionId,
        coachId,
        startsOn: today,
      }),
    ).rejects.toThrow("18 or older");
    const e = await activeEnrollment();
    await db.workspaceUser.update({
      where: { id: coachId },
      data: { isActive: false },
    });
    try {
      expect((await api.getCoachingDetail(client, e.id)).status).toBe(
        "AWAITING_REPLACEMENT",
      );
      expect((await api.getCoachingDetail(client, e.id)).coachAccepted).toBe(
        false,
      );
      await expect(
        mutate(coach, e.id, "savePrivateNote", {
          localDate: today,
          body: "No longer allowed",
          noteVersion: -1,
        }),
      ).rejects.toThrow("access");
    } finally {
      await db.workspaceUser.update({
        where: { id: coachId },
        data: { isActive: true },
      });
    }
  });

  it("finishes closure settlement only after the adult accepts the reviewed unused obligations", async () => {
    const e = await activeEnrollment();
    await mutate(client, e.id, "close", {
      reason: "End service",
      confirmConsequences: true,
    });
    const review = await api.getCoachingSettlement(owner, e.id);
    expect(review?.snapshot.unusedUnits).toBe(1);
    expect(review?.snapshot.undeliveredDays.length).toBeGreaterThan(0);
    await expect(
      mutate(coach, e.id, "proposeSettlement", {
        settlementKind: "NO_ADJUSTMENT",
        amountCents: 0,
        obligationHash: review!.obligationHash,
        reason: "Client agrees to close without adjustment",
      }),
    ).rejects.toThrow("owner");
    const proposal = await mutate(owner, e.id, "proposeSettlement", {
      settlementKind: "NO_ADJUSTMENT",
      amountCents: 0,
      obligationHash: review!.obligationHash,
      reason:
        "Unused free-program services waived by agreement; no money changes",
    });
    await expect(
      mutate(owner, e.id, "confirmSettlement", { decisionId: proposal.id }),
    ).rejects.toThrow("accepted");
    await expect(
      mutate(owner, e.id, "acceptSettlement", {
        decisionId: proposal.id,
        confirmConsequences: true,
      }),
    ).rejects.toThrow("adult client");
    await mutate(client, e.id, "acceptSettlement", {
      decisionId: proposal.id,
      confirmConsequences: true,
    });
    await mutate(owner, e.id, "confirmSettlement", { decisionId: proposal.id });
    const settled = await db.coachingEnrollment.findUniqueOrThrow({
      where: { id: e.id },
    });
    expect(settled.settlementState).toBe("SETTLED");
    expect(settled.status).toBe("CLOSED");
    expect(settled.retrievalUntil).toEqual(
      (await api.getCoachingDetail(client, e.id)).retrievalUntil,
    );
    expect(
      await db.payment.count({
        where: { workspaceId, id: settled.paymentId ?? "none" },
      }),
    ).toBe(0);
  });

  it("exports accepted-plan evidence and own intake with a scoped checksum receipt, never private notes or drafts", async () => {
    const e = await activeEnrollment();
    await mutate(client, e.id, "submitIntake", {
      body: "My submitted intake for export",
    });
    await mutate(client, e.id, "acceptPlan", { acceptTerms: true });
    await mutate(coach, e.id, "savePrivateNote", {
      localDate: today,
      noteVersion: -1,
      body: "EXPORT_PRIVATE_SENTINEL",
    });
    await mutate(coach, e.id, "saveDailyNote", {
      localDate: today,
      noteVersion: -1,
      body: "EXPORT_DRAFT_SENTINEL",
    });
    const prepared = await api.prepareCoachingRecordExport(client, e.id);
    expect(prepared.records.acceptedPlans).toHaveLength(1);
    expect(prepared.records.acceptedPlans[0]?.clientUserId).toBe(client.userId);
    expect(prepared.records.acceptedPlans[0]?.agreement).toMatchObject({
      acceptedTerms: true,
    });
    expect(prepared.records.submittedIntake?.content).toBe(
      "My submitted intake for export",
    );
    expect(prepared.records.transactionHistory).toEqual([]);
    expect(JSON.stringify(prepared.records)).not.toContain(
      "EXPORT_PRIVATE_SENTINEL",
    );
    expect(JSON.stringify(prepared.records)).not.toContain(
      "EXPORT_DRAFT_SENTINEL",
    );
    await expect(
      api.downloadCoachingRecordExport(owner, e.id, prepared.id),
    ).rejects.toThrow("adult client");
    await expect(
      api.downloadCoachingRecordExport(stranger, e.id, prepared.id),
    ).rejects.toThrow("access");
    const downloaded = await api.downloadCoachingRecordExport(
      client,
      e.id,
      prepared.id,
    );
    expect(downloaded.checksum).toBe(prepared.checksum);
    expect(Buffer.from(downloaded.artifact).toString("utf8")).not.toContain(
      "EXPORT_PRIVATE_SENTINEL",
    );
    await expect(
      api.confirmCoachingExportReceipt(
        client,
        e.id,
        prepared.id,
        "incorrect-checksum",
      ),
    ).rejects.toThrow("Download and check");
    await api.confirmCoachingExportReceipt(
      client,
      e.id,
      prepared.id,
      prepared.checksum,
    );
    expect(
      (
        await db.coachingRecordExport.findUniqueOrThrow({
          where: { id: prepared.id },
        })
      ).receiptConfirmedAt,
    ).toBeInstanceOf(Date);
    await api.expireCoachingRecordExports(new Date(Date.now() + 25 * 3600000));
    expect(
      (
        await db.coachingRecordExport.findUniqueOrThrow({
          where: { id: prepared.id },
        })
      ).artifact,
    ).toBeNull();
    await expect(
      api.downloadCoachingRecordExport(client, e.id, prepared.id),
    ).rejects.toThrow("unavailable or expired");
  });

  it("does not turn a refund note or pending provider record into completed settlement", async () => {
    const e = await activeEnrollment();
    const base = await db.coachingProgramVersion.findUniqueOrThrow({
      where: { id: programVersionId },
    });
    const paidPlan = await db.coachingProgramVersion.create({
      data: {
        programId: base.programId,
        number: 50,
        durationDays: 28,
        deliveryWeekdays: base.deliveryWeekdays,
        responseHours: 48,
        goals: "Paid program",
        milestones: [],
        priceCents: 10000,
        currency: "cad",
        terms: "Agreed refund review",
        appointmentUnits: 1,
      },
    });
    const payment = await db.payment.create({
      data: {
        workspaceId,
        memberId,
        status: "SUCCEEDED",
        amountCents: 10000,
        currency: "cad",
        stripePaymentIntentId: `${prefix}-settlement-intent`,
      },
    });
    await db.coachingEnrollment.update({
      where: { id: e.id },
      data: { programVersionId: paidPlan.id, paymentId: payment.id },
    });
    await mutate(client, e.id, "close", {
      reason: "Review unused service",
      confirmConsequences: true,
    });
    const review = await api.getCoachingSettlement(owner, e.id);
    const proposal = await mutate(owner, e.id, "proposeSettlement", {
      settlementKind: "REFUND",
      amountCents: 5000,
      obligationHash: review!.obligationHash,
      reason: "Return half and waive remaining delivery by agreement",
    });
    await mutate(client, e.id, "acceptSettlement", {
      decisionId: proposal.id,
      confirmConsequences: true,
    });
    const refund = await db.refund.create({
      data: {
        workspaceId,
        memberId,
        paymentId: payment.id,
        amountCents: 5000,
        currency: "cad",
        status: "PENDING",
      },
    });
    await expect(
      mutate(owner, e.id, "confirmSettlement", {
        decisionId: proposal.id,
        evidenceIds: refund.id,
      }),
    ).rejects.toThrow("pending");
    await db.refund.update({
      where: { id: refund.id },
      data: {
        status: "SUCCEEDED",
        stripeRefundId: `${prefix}-settlement-refund`,
        refundedAt: new Date(),
      },
    });
    await db.payment.update({
      where: { id: payment.id },
      data: { refundedAmountCents: 5000 },
    });
    await mutate(owner, e.id, "confirmSettlement", {
      decisionId: proposal.id,
      evidenceIds: refund.id,
    });
    expect(
      (await db.coachingEnrollment.findUniqueOrThrow({ where: { id: e.id } }))
        .settlementState,
    ).toBe("SETTLED");
    expect(
      (
        await db.coachingSettlementDecision.findUniqueOrThrow({
          where: { id: proposal.id },
        })
      ).evidenceIds,
    ).toEqual([refund.id]);
  });

  it("contains publications after closure and never republishes withdrawn revision history", async () => {
    const e = await activeEnrollment();
    await mutate(coach, e.id, "saveDailyNote", {
      localDate: today,
      noteVersion: -1,
      body: "WITHDRAWN_SENTINEL",
    });
    await mutate(coach, e.id, "publishDailyNote", {
      localDate: today,
      noteVersion: 0,
      confirmPublish: true,
      confirmClientId: memberId,
    });
    const archive = await api.prepareCoachingRecordExport(client, e.id);
    await mutate(owner, e.id, "withdrawDailyNote", {
      localDate: today,
      noteVersion: 1,
      reason: "Wrong publication; recipient follow-up needed",
    });
    expect(
      (
        await db.coachingRecordExport.findUniqueOrThrow({
          where: { id: archive.id },
        })
      ).artifact,
    ).toBeNull();
    await mutate(coach, e.id, "saveDailyNote", {
      localDate: today,
      noteVersion: 2,
      body: "Corrected client note",
    });
    await mutate(coach, e.id, "publishDailyNote", {
      localDate: today,
      noteVersion: 3,
      confirmPublish: true,
      confirmClientId: memberId,
    });
    const view = await api.getCoachingDetail(client, e.id);
    expect(view.published[0]?.revisions).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain("WITHDRAWN_SENTINEL");
    expect(
      JSON.stringify(await api.exportCoachingRecords(client, e.id)),
    ).not.toContain("WITHDRAWN_SENTINEL");
    await mutate(client, e.id, "close", {
      reason: "End service",
      confirmConsequences: true,
    });
    await db.workspaceUser.update({
      where: { id: coachId },
      data: { isActive: false },
    });
    try {
      await mutate(owner, e.id, "withdrawDailyNote", {
        localDate: today,
        noteVersion: 4,
        reason: "Contain after author departure",
      });
    } finally {
      await db.workspaceUser.update({
        where: { id: coachId },
        data: { isActive: true },
      });
    }
    expect((await api.getCoachingDetail(client, e.id)).published).toHaveLength(
      0,
    );
    expect(
      (await api.getCoachingRecordReview(owner, e.id)).incidents,
    ).toHaveLength(2);
    await expect(
      mutate(client, e.id, "acceptPlan", { acceptTerms: true }),
    ).rejects.toThrow("explicit owner proposal");
  });

  it("requires exact owner, client and author approval for temporary audited private reads", async () => {
    const e = await activeEnrollment();
    await mutate(coach, e.id, "savePrivateNote", {
      localDate: today,
      noteVersion: -1,
      body: "EXCEPTIONAL_PRIVATE_SENTINEL",
    });
    const note = await db.coachingPrivateNote.findFirstOrThrow({
      where: { enrollmentId: e.id },
    });
    const proposed = await mutate(owner, e.id, "proposeRecordReview", {
      privateNoteIds: note.id,
      reviewerId: replacementId,
      reason: "Client and author requested bounded incident review",
      expiresInMinutes: 30,
    });
    await expect(
      api.readExceptionalCoachingNotes(replacement, proposed.id),
    ).rejects.toThrow("not currently authorized");
    await expect(
      mutate(stranger, e.id, "approveRecordReview", {
        grantId: proposed.id,
        confirmConsequences: true,
      }),
    ).rejects.toThrow("access");
    await mutate(client, e.id, "approveRecordReview", {
      grantId: proposed.id,
      confirmConsequences: true,
    });
    // The author can consent after a handoff without regaining ordinary client-record access.
    await db.coachingEnrollment.update({
      where: { id: e.id },
      data: { currentCoachWorkspaceUserId: replacementId },
    });
    await mutate(coach, e.id, "approveRecordReview", {
      grantId: proposed.id,
      confirmConsequences: true,
    });
    await expect(
      api.readExceptionalCoachingNotes(owner, proposed.id),
    ).rejects.toThrow("authority");
    expect(
      (await api.readExceptionalCoachingNotes(replacement, proposed.id))
        .notes[0]?.body,
    ).toBe("EXCEPTIONAL_PRIVATE_SENTINEL");
    expect(
      await db.coachingRecordAccessEvent.findMany({
        where: { reviewGrantId: proposed.id, kind: "EXCEPTIONAL_PRIVATE_READ" },
      }),
    ).toHaveLength(1);
    expect(
      JSON.stringify(await api.exportCoachingRecords(client, e.id)),
    ).not.toContain("EXCEPTIONAL_PRIVATE_SENTINEL");
    expect(
      JSON.stringify(await api.getCoachingDetail(owner, e.id)),
    ).not.toContain("EXCEPTIONAL_PRIVATE_SENTINEL");
    await mutate(client, e.id, "revokeRecordReview", { grantId: proposed.id });
    await expect(
      api.readExceptionalCoachingNotes(replacement, proposed.id),
    ).rejects.toThrow("not currently authorized");
    expect(
      JSON.stringify(
        await db.coachingRecordAccessEvent.findMany({
          where: { enrollmentId: e.id },
        }),
      ),
    ).not.toContain("EXCEPTIONAL_PRIVATE_SENTINEL");
  });

  it("retains late-move consumption, atomic failure and reasoned owner waiver in appointment history", async () => {
    const e = await activeEnrollment();
    const base = await db.coachingProgramVersion.findUniqueOrThrow({
      where: { id: programVersionId },
    });
    const plan = await db.coachingProgramVersion.create({
      data: {
        programId: base.programId,
        number: 60,
        durationDays: 28,
        deliveryWeekdays: base.deliveryWeekdays,
        responseHours: 48,
        goals: "Move rules",
        milestones: [],
        priceCents: 0,
        currency: "cad",
        terms: "Late moves consume the previous unit",
        appointmentUnits: 2,
        cancellationHours: 24,
        noShowGraceMinutes: 15,
      },
    });
    await db.coachingEnrollment.update({
      where: { id: e.id },
      data: { programVersionId: plan.id },
    });
    const slot = (hours: number) =>
      db.coachingAvailability.create({
        data: {
          workspaceId,
          coachWorkspaceUserId: coachId,
          startsAt: new Date(Date.now() + hours * 3600000),
          endsAt: new Date(Date.now() + (hours + 1) * 3600000),
        },
      });
    const first = await slot(2),
      second = await slot(4),
      third = await slot(6);
    const booking = await mutate(client, e.id, "bookAppointment", {
      availabilityId: first.id,
    });
    await expect(
      mutate(client, e.id, "moveAppointment", {
        appointmentId: booking.id,
        availabilityId: second.id,
      }),
    ).rejects.toThrow("consumes the original");
    const moved = await mutate(client, e.id, "moveAppointment", {
      appointmentId: booking.id,
      availabilityId: second.id,
      confirmConsequences: true,
      reason: "Client requested late move",
    });
    const old = await db.coachingAppointment.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(old.unitState).toBe("CONSUMED");
    expect(old.status).toBe("LATE_MOVED");
    expect(
      (
        await db.coachingAppointment.findUniqueOrThrow({
          where: { id: moved.id },
        })
      ).movedFromId,
    ).toBe(booking.id);
    await expect(
      mutate(client, e.id, "moveAppointment", {
        appointmentId: moved.id,
        availabilityId: third.id,
        confirmConsequences: true,
      }),
    ).rejects.toThrow("All included");
    expect(
      (
        await db.coachingAppointment.findUniqueOrThrow({
          where: { id: moved.id },
        })
      ).status,
    ).toBe("BOOKED");
    const waived = await mutate(owner, e.id, "moveAppointment", {
      appointmentId: moved.id,
      availabilityId: third.id,
      waiveLatePenalty: true,
      reason: "Gym changed availability; waive penalty",
    });
    expect(
      (
        await db.coachingAppointment.findUniqueOrThrow({
          where: { id: moved.id },
        })
      ).unitState,
    ).toBe("RELEASED");
    expect(
      (
        await db.coachingAppointment.findUniqueOrThrow({
          where: { id: waived.id },
        })
      ).unitState,
    ).toBe("HELD");
    expect(
      await db.coachingAppointmentEvent.count({
        where: {
          workspaceId,
          appointmentId: { in: [booking.id, moved.id, waived.id] },
        },
      }),
    ).toBe(5);
  });

  it("requires coach confirmation after accepted no-show grace and returns units for provider absence", async () => {
    const e = await activeEnrollment();
    const pastSlot = await db.coachingAvailability.create({
      data: {
        workspaceId,
        coachWorkspaceUserId: coachId,
        startsAt: new Date(Date.now() - 5 * 60000),
        endsAt: new Date(Date.now() + 55 * 60000),
      },
    });
    const appointment = await db.coachingAppointment.create({
      data: {
        workspaceId,
        enrollmentId: e.id,
        availabilityId: pastSlot.id,
        coachWorkspaceUserId: coachId,
        startsAt: pastSlot.startsAt,
        endsAt: pastSlot.endsAt,
        policySnapshot: { noShowGraceMinutes: 15, cancellationHours: 24 },
      },
    });
    await expect(
      mutate(coach, e.id, "completeAppointment", {
        appointmentId: appointment.id,
        appointmentVersion: 0,
        noShow: true,
        reason: "Coach checked attendance",
      }),
    ).rejects.toThrow("grace period");
    expect(
      (
        await db.coachingAppointment.findUniqueOrThrow({
          where: { id: appointment.id },
        })
      ).unitState,
    ).toBe("HELD");
    await db.coachingAppointment.update({
      where: { id: appointment.id },
      data: { startsAt: new Date(Date.now() - 20 * 60000) },
    });
    await mutate(coach, e.id, "completeAppointment", {
      appointmentId: appointment.id,
      appointmentVersion: 0,
      noShow: true,
      reason: "Coach confirmed absence after grace",
    });
    expect(
      (
        await db.coachingAppointment.findUniqueOrThrow({
          where: { id: appointment.id },
        })
      ).status,
    ).toBe("NO_SHOW");
    const other = await activeEnrollment();
    const futureSlot = await db.coachingAvailability.create({
      data: {
        workspaceId,
        coachWorkspaceUserId: coachId,
        startsAt: new Date(Date.now() + 4 * 86400000),
        endsAt: new Date(Date.now() + 4 * 86400000 + 3600000),
      },
    });
    const future = await db.coachingAppointment.create({
      data: {
        workspaceId,
        enrollmentId: other.id,
        availabilityId: futureSlot.id,
        coachWorkspaceUserId: coachId,
        startsAt: futureSlot.startsAt,
        endsAt: futureSlot.endsAt,
      },
    });
    await db.workspaceUser.update({
      where: { id: coachId },
      data: { isActive: false },
    });
    try {
      await api.reconcileCoachingDelivery(workspaceId);
    } finally {
      await db.workspaceUser.update({
        where: { id: coachId },
        data: { isActive: true },
      });
    }
    expect(
      (
        await db.coachingAppointment.findUniqueOrThrow({
          where: { id: future.id },
        })
      ).unitState,
    ).toBe("RELEASED");
    expect(
      (
        await db.coachingEnrollment.findUniqueOrThrow({
          where: { id: other.id },
        })
      ).currentCoachWorkspaceUserId,
    ).toBeNull();
    expect(
      await db.coachingDeliveryException.count({
        where: {
          enrollmentId: other.id,
          kind: "COACH_UNAVAILABLE",
          reviewerWorkspaceUserId: ownerId,
        },
      }),
    ).toBe(1);
  });

  it("shows an empty payer inbox for gym-only accounts without adult eligibility", async () => {
    await db.member.update({
      where: { id: `${prefix}-stranger-member` },
      data: { dateOfBirth: null },
    });
    expect(await api.getCoachingPayerRequests(stranger)).toEqual([]);
  });

  it("retains past promised delivery dates when an accepted revision changes the future schedule", () => {
    const date = (value: string) => new Date(`${value}T00:00:00Z`);
    expect(
      api.coachingExpectedDeliveryDates({
        startsOn: date("2026-10-10"),
        endsOn: date("2026-10-20"),
        timezone: "UTC",
        weekdays: [4],
        pauses: [],
        acceptedPlans: [
          {
            startsOn: date("2026-10-05"),
            endsOn: date("2026-10-20"),
            acceptedAt: date("2026-10-01"),
            snapshot: { deliveryWeekdays: [1] },
          },
          {
            startsOn: date("2026-10-10"),
            endsOn: date("2026-10-20"),
            acceptedAt: date("2026-10-10"),
            snapshot: { deliveryWeekdays: [4] },
          },
        ],
      }),
    ).toEqual(["2026-10-05", "2026-10-15"]);
  });

  it("separates adult payer consent, current verified contact and money authority from coaching records", async () => {
    const e = await activeEnrollment();
    // This case accepts its own paid terms before inviting a payer. Keep the
    // shared free-plan fixture and every other enrollment unchanged.
    const paidProgram = await db.coachingProgram.create({
      data: {
        workspaceId,
        name: "Fictional payer-consent paid program",
        versions: {
          create: {
            number: 1,
            durationDays: 28,
            deliveryWeekdays: [0, 1, 2, 3, 4, 5, 6],
            responseHours: 48,
            goals: "PAYER_PRIVATE_GOAL",
            milestones: [],
            priceCents: 12000,
            currency: "cad",
            terms: "Exact fictional paid terms accepted by client and payer.",
            appointmentUnits: 1,
            appointmentMinutes: 60,
            cancellationHours: 24,
          },
        },
      },
      include: { versions: true },
    });
    await db.coachingEnrollment.update({
      where: { id: e.id },
      data: {
        programVersionId: paidProgram.versions[0]!.id,
        paymentState: "UNPAID",
      },
    });
    await db.member.update({
      where: { id: `${prefix}-stranger-member` },
      data: { dateOfBirth: new Date("1991-01-01") },
    });
    await mutate(coach, e.id, "savePrivateNote", {
      localDate: today,
      noteVersion: -1,
      body: "PAYER_PRIVATE_SENTINEL",
    });
    await expect(
      mutate(owner, e.id, "inviteCoachingPayer", {
        payerEmail: `${stranger.userId}@example.test`,
        confirmConsequences: true,
      }),
    ).rejects.toThrow("adult");
    const request = await mutate(client, e.id, "inviteCoachingPayer", {
      payerEmail: `${stranger.userId}@example.test`,
      confirmConsequences: true,
    });
    const view = await api.getCoachingPayerView(stranger, request.id);
    expect(view.clientName).toBe("Adult client");
    expect(view).not.toHaveProperty("intake");
    expect(view).not.toHaveProperty("goals");
    expect(JSON.stringify(view)).not.toContain("PAYER_PRIVATE_SENTINEL");
    expect(JSON.stringify(view)).not.toContain("PAYER_PRIVATE_GOAL");
    await expect(api.getCoachingDetail(stranger, e.id)).rejects.toThrow(
      "access",
    );
    const authority = () =>
      db.$transaction(async (tx) => {
        await api.lockClassSchedule(tx, workspaceId);
        return api.requireCoachingPaymentAuthority(tx, stranger, e.id);
      });
    await expect(authority()).rejects.toThrow("both consent");
    await mutate(stranger, e.id, "sendPayerVerification", {
      grantId: request.id,
    });
    const job = await db.notificationJob.findFirstOrThrow({
      where: {
        workspaceId,
        context: { path: ["grantId"], equals: request.id },
      },
    });
    expect(await api.shouldDeliverNotification(job, db)).toBe(true);
    await db.workspaceUser.update({
      where: { id: `${prefix}-client-role` },
      data: { isActive: false },
    });
    expect(await api.shouldDeliverNotification(job, db)).toBe(false);
    await db.workspaceUser.update({
      where: { id: `${prefix}-client-role` },
      data: { isActive: true },
    });
    const stored = await db.coachingPayerGrant.findUniqueOrThrow({
      where: { id: request.id },
    });
    await db.coachingPayerGrant.update({
      where: { id: request.id },
      data: { verificationHash: "superseded-hash" },
    });
    expect(await api.shouldDeliverNotification(job, db)).toBe(false);
    await db.coachingPayerGrant.update({
      where: { id: request.id },
      data: { verificationHash: stored.verificationHash },
    });
    const code = job.body.match(/request: ([a-f0-9]+)/)?.[1];
    expect(code).toBeTruthy();
    await mutate(stranger, e.id, "verifyPayerContact", {
      grantId: request.id,
      code,
    });
    expect(await api.shouldDeliverNotification(job, db)).toBe(false);
    await expect(authority()).rejects.toThrow("both consent");
    await mutate(stranger, e.id, "acceptPayerTerms", {
      grantId: request.id,
      confirmConsequences: true,
    });
    const approved = await authority();
    expect(approved.payerGrantId).toBe(request.id);
    expect(approved.payerUserId).toBe(stranger.userId);
    const stripeAccountId = `acct_${prefix}_payer`;
    await db.workspaceStripeSettings.create({
      data: {
        workspaceId,
        stripeAccountId,
        connectionStatus: "ACTIVE",
        chargesEnabled: true,
      },
    });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fictional_payer_consent");
    vi.stubEnv("NEXT_PUBLIC_MEMBER_WEB_URL", "https://member.example.test");
    provider.create.mockReset().mockImplementationOnce(async (payload: CheckoutRequest) => {
      const line = payload.line_items?.[0];
      if (!line?.price_data || typeof line.price_data.unit_amount !== "number")
        throw new Error("The fictional checkout needs exact priced line items.");
      return {
        id: `cs_fictional_${e.id}`,
        object: "checkout.session",
        mode: "payment",
        client_reference_id: payload.client_reference_id,
        metadata: payload.metadata,
        amount_total: line.price_data.unit_amount * (line.quantity ?? 1),
        currency: line.price_data.currency,
        status: "open",
        payment_status: "unpaid",
        payment_intent: null,
        livemode: false,
        url: "https://checkout.example.test/pending",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
    });
    expect(await startCoachingPayment(stranger, e.id)).toBe(
      "https://checkout.example.test/pending",
    );
    const operation = await db.financialOperation.findUniqueOrThrow({
      where: {
        workspaceId_operationKey: {
          workspaceId,
          operationKey: `coaching-checkout:${e.id}:first`,
        },
      },
    });
    expect(operation).toMatchObject({
      status: "SUBMITTED",
      actorUserId: stranger.userId,
      payerAccountId: approved.payerAccountId,
      beneficiaryMemberId: memberId,
      amountCents: 12000,
      currency: "cad",
      providerUrl: "https://checkout.example.test/pending",
    });
    expect(provider.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        mode: "payment",
        client_reference_id: e.id,
        metadata: expect.objectContaining({
          payerUserId: stranger.userId,
          payerAccountId: approved.payerAccountId,
          payerGrantId: request.id,
          programVersionId: paidProgram.versions[0]!.id,
          appointmentTimesNotHeld: "true",
        }),
      }),
      { stripeAccount: stripeAccountId, idempotencyKey: operation.providerIdempotencyKey },
    );
    expect(await db.workspaceDataEvent.count({
      where: {
        workspaceId,
        kind: "COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED",
        metadata: { path: ["operationId"], equals: operation.id },
      },
    })).toBe(1);
    expect(providerNetworkGuard?.report.blocked).toHaveLength(0);
    expect(providerNetworkGuard?.report.openedExternalSockets).toBe(0);
    await mutate(client, e.id, "revokeCoachingPayer", { grantId: request.id });
    await expect(authority()).rejects.toThrow("both consent");
    expect(await api.shouldDeliverNotification(job, db)).toBe(false);
    const blocked = await db.financialOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    expect(blocked.status).toBe("REVIEW_REQUIRED");
    expect(blocked.providerUrl).toBeNull();
    expect(
      await db.financialReviewCase.count({
        where: { workspaceId, operationId: operation.id, resolvedAt: null },
      }),
    ).toBe(1);
  });

  it("checks class conflicts including buffers and keeps the old reservation after a failed move", async () => {
    const e = await activeEnrollment();
    const day = api.addDays(today, 10);
    const location = await db.location.findUniqueOrThrow({
      where: { workspaceId },
    });
    const room = await db.room.create({
      data: { locationId: location.id, name: "Coaching conflict room" },
    });
    const program = await db.program.create({
      data: { workspaceId, name: "Conflict class" },
    });
    await db.classTemplate.create({
      data: {
        workspaceId,
        programId: program.id,
        roomId: room.id,
        coachWorkspaceUserId: coachId,
        weekday: api.getWeekdayForDateString(day),
        startTimeMinutes: 660,
        endTimeMinutes: 720,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 0,
      },
    });
    const slot = async (minutes: number, bufferMinutes = 0) =>
      db.coachingAvailability.create({
        data: {
          workspaceId,
          coachWorkspaceUserId: coachId,
          roomId: room.id,
          startsAt: api.getZonedDateTimeAsUtc({
            dateString: day,
            minutes,
            timezone: e.timezone,
          }),
          endsAt: api.getZonedDateTimeAsUtc({
            dateString: day,
            minutes: minutes + 60,
            timezone: e.timezone,
          }),
          bufferMinutes,
        },
      });
    const original = await slot(540),
      buffered = await slot(720, 15);
    const booking = await mutate(client, e.id, "bookAppointment", {
      availabilityId: original.id,
    });
    await expect(
      mutate(client, e.id, "moveAppointment", {
        appointmentId: booking.id,
        availabilityId: buffered.id,
      }),
    ).rejects.toThrow("has a class");
    const retained = await db.coachingAppointment.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(retained.availabilityId).toBe(original.id);
    expect(retained.unitState).toBe("HELD");
    expect(retained.status).toBe("BOOKED");
    expect(
      (await api.getCoachingDetail(client, e.id)).reservedOrUsedUnits,
    ).toBe(1);
  });
});
