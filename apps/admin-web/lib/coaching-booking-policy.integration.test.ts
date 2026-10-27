import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Prisma,
  PrismaClient,
  previewCoachingBookingPolicy,
  confirmCoachingBookingPolicy,
  parseCoachingBookingPolicy,
  hashCoachingBookingPolicy,
  coachingBookingWeekdays,
  runCoachingCommand,
  getCoachingDetail,
  findCoachingResourceConflictTx,
  requireNewCoachingPurchaseTx,
  lockClassSchedule,
  addDays,
  getWorkspaceDateString,
  createStaffLeave,
  getWeekdayForDateString,
  type CoachingBookingPolicy,
  type CoachingCommand,
} from "@flowstate/db";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../../packages/db/src/retention-inventory.js";
import {
  commitWorkspaceTimezoneChange,
  previewWorkspaceTimezoneChange,
} from "./workspace-timezone-settings";
const url = process.env.TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test") ||
    !process.env.DATABASE_URL ||
    new URL(process.env.DATABASE_URL).host !== new URL(url).host ||
    new URL(process.env.DATABASE_URL).pathname !== new URL(url).pathname)
)
  throw new Error(
    "Coaching policy tests require matching local disposable TEST_DATABASE_URL and DATABASE_URL ending in _test.",
  );
(url ? describe : describe.skip)(
  "confirmed program appointment policy and current resource fences",
  () => {
    const db = new PrismaClient({ datasourceUrl: url }),
      workspaces: string[] = [],
      users: string[] = [];
    beforeAll(async () => {
      users.push(
        ...(
          await db.user.findMany({
            where: {
              OR: [
                { email: { endsWith: "@coaching-owner.example.test" } },
                { email: { endsWith: "@coaching-coach.example.test" } },
                { email: { endsWith: "@coaching-client.example.test" } },
              ],
            },
            select: { id: true },
          })
        ).map((row) => row.id),
      );
      const prior = await db.workspace.findMany({
        where: { name: "Fictional appointment policy gym" },
        select: { id: true, workspaceUsers: { select: { userId: true } } },
      });
      for (const workspace of prior) {
        workspaces.push(workspace.id);
        users.push(...workspace.workspaceUsers.map((row) => row.userId));
      }
    });
    const policy = (
      changes: Partial<CoachingBookingPolicy["appointments"]> = {},
    ): CoachingBookingPolicy =>
      parseCoachingBookingPolicy({
        schemaVersion: 1,
        appointments: {
          weeklyHours: coachingBookingWeekdays.map((weekday) => ({
            weekday,
            intervals: [{ startMinute: 0, endMinute: 1440 }],
          })),
          maxAdvanceMinutes: 60 * 1440,
          minimumLeadMinutes: 0,
          minimumBufferMinutes: 0,
          resolutionResponseHours: 24,
          ...changes,
        },
      });
    async function fixture(units = 2) {
      const owner = await db.user.create({
          data: {
            email: `${randomUUID()}@coaching-owner.example.test`,
            fullName: "Fictional booking help owner",
          },
        }),
        coach = await db.user.create({
          data: {
            email: `${randomUUID()}@coaching-coach.example.test`,
            fullName: "Fictional coach",
          },
        }),
        client = await db.user.create({
          data: {
            email: `${randomUUID()}@coaching-client.example.test`,
            fullName: "Fictional client",
          },
        });
      users.push(owner.id, coach.id, client.id);
      const workspace = await db.workspace.create({
        data: {
          name: "Fictional appointment policy gym",
          status: "ACTIVE",
          location: { create: { name: "Gym", timezone: "UTC" } },
          workspaceUsers: {
            create: [
              { userId: owner.id, role: "OWNER" },
              { userId: coach.id, role: "COACH" },
              { userId: client.id, role: "CUSTOMER" },
            ],
          },
        },
        include: { workspaceUsers: true, location: true },
      });
      workspaces.push(workspace.id);
      const ownerStaff = workspace.workspaceUsers.find(
          (row) => row.userId === owner.id,
        )!,
        coachStaff = workspace.workspaceUsers.find(
          (row) => row.userId === coach.id,
        )!;
      const member = await db.member.create({
        data: {
          workspaceId: workspace.id,
          userId: client.id,
          fullName: "Fictional adult client",
          dateOfBirth: new Date("1990-01-01"),
          status: "ACTIVE",
        },
      });
      const program = await db.coachingProgram.create({
          data: {
            workspaceId: workspace.id,
            name: "Fictional structured coaching",
            versions: {
              create: {
                number: 1,
                durationDays: 30,
                deliveryWeekdays: [1, 2, 3, 4, 5],
                responseHours: 48,
                goals: "Fictional goals",
                milestones: ["Fictional milestone"],
                appointmentUnits: units,
                appointmentMinutes: 60,
                cancellationHours: 24,
                noShowGraceMinutes: 15,
                priceCents: 12000,
                currency: "cad",
                terms: "Fictional accepted terms",
              },
            },
          },
          include: { versions: true },
        }),
        version = program.versions[0]!;
      const today = getWorkspaceDateString(new Date(), "UTC");
      const enrollment = await db.coachingEnrollment.create({
        data: {
          workspaceId: workspace.id,
          memberId: member.id,
          programVersionId: version.id,
          startsOn: new Date(today),
          endsOn: new Date(addDays(today, 29)),
          timezone: "UTC",
          acceptedAt: new Date(),
          contactVerifiedAt: new Date(),
          currentCoachWorkspaceUserId: coachStaff.id,
          caseOwnerWorkspaceUserId: ownerStaff.id,
          paymentState: "PAID",
          historyFromDate: new Date(today),
          assignments: {
            create: {
              coachWorkspaceUserId: coachStaff.id,
              acceptedAt: new Date(),
              historyFromDate: new Date(today),
            },
          },
        },
      });
      const room = await db.room.create({
        data: {
          locationId: workspace.location!.id,
          name: "Fictional appointment room",
          capacity: 1,
        },
      });
      return {
        workspace,
        owner,
        ownerStaff,
        coach,
        coachStaff,
        client,
        member,
        version,
        enrollment,
        room,
        actor: { workspaceId: workspace.id, userId: owner.id },
        clientActor: { workspaceId: workspace.id, userId: client.id },
        coachActor: { workspaceId: workspace.id, userId: coach.id },
        tomorrow: new Date(`${addDays(today, 1)}T12:00:00Z`),
      };
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    async function confirm(f: Fixture, next = policy()) {
      const head = await db.coachingBookingPolicy.findUnique({
          where: { workspaceId: f.workspace.id },
        }),
        input = {
          policy: next,
          reason: "Fictional reviewed appointment rules",
          expectedVersion: head?.version ?? 0,
          operationId: randomUUID(),
        },
        args = { actor: f.actor, input, db };
      const preview = await previewCoachingBookingPolicy(args),
        result = await confirmCoachingBookingPolicy({
          ...args,
          previewHash: preview.previewHash,
          confirmed: true,
        });
      return { input, preview, result };
    }
    const command = async (
      f: Fixture,
      kind: CoachingCommand["kind"],
      input: Record<string, unknown>,
      enrollment = true,
    ) =>
      runCoachingCommand(
        kind === "createAvailability" ? f.coachActor : f.clientActor,
        {
          kind,
          input,
          operationId: randomUUID(),
          ...(enrollment
            ? {
                enrollmentId: f.enrollment.id,
                expectedVersion: (
                  await db.coachingEnrollment.findUniqueOrThrow({
                    where: { id: f.enrollment.id },
                  })
                ).version,
              }
            : {}),
        },
      );
    async function slot(f: Fixture, start = f.tomorrow, buffer = 0) {
      return command(
        f,
        "createAvailability",
        {
          startsAt: start.toISOString(),
          endsAt: new Date(+start + 3600000).toISOString(),
          roomId: f.room.id,
          bufferMinutes: buffer,
        },
        false,
      );
    }
    afterAll(async () => {
      for (const workspaceId of workspaces)
        for (let attempt = 0; ; attempt++)
          try {
            await db.$transaction(
              async (tx) => {
                await lockClassSchedule(tx, workspaceId);
                for (const prefix of [
                  "family-access",
                  "financial",
                  "retention",
                ])
                  await tx.$queryRawUnsafe(
                    "SELECT pg_advisory_xact_lock(hashtext($1))::text",
                    `${prefix}:${workspaceId}`,
                  );
                const inventory = await inspectRetentionInventory(
                  tx,
                  workspaceId,
                );
                await deleteReviewedWorkspaceRecords(
                  tx,
                  workspaceId,
                  inventory.fingerprint,
                );
              },
              { isolationLevel: "Serializable", timeout: 120000 },
            );
            break;
          } catch (error) {
            if (
              !(error instanceof Prisma.PrismaClientKnownRequestError) ||
              error.code !== "P2034" ||
              attempt >= 11
            )
              throw error;
            await new Promise((resolve) =>
              setTimeout(resolve, 25 + Math.random() * 100),
            );
          }
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    }, 600000);
    it("confirms an attributable atomic current head, canonical SQL hash and reauthorized replay without rewinding history", async () => {
      const f = await fixture(),
        first = await confirm(f);
      const head = await db.coachingBookingPolicy.findUniqueOrThrow({
          where: { workspaceId: f.workspace.id },
        }),
        event = await db.workspaceDataEvent.findUniqueOrThrow({
          where: { id: first.result.id },
        });
      expect(head).toMatchObject({
        version: 1,
        currentEventId: event.id,
        policyHash: hashCoachingBookingPolicy(policy()),
      });
      expect(head.id).not.toBe(f.workspace.id);
      expect(event).toMatchObject({
        actorUserId: f.owner.id,
        kind: "COACHING_BOOKING_POLICY_CONFIRMED",
        metadata: {
          actorWorkspaceUserId: f.ownerStaff.id,
          version: 1,
          previousVersion: 0,
          previousEventId: null,
        },
      });
      const parity = await db.$queryRaw<
        Array<{ hash: string }>
      >`SELECT coaching_booking_policy_hash(${JSON.stringify(policy())}::jsonb) AS hash`;
      expect(parity[0]!.hash).toBe(head.policyHash);
      await confirm(f, policy({ minimumBufferMinutes: 15 }));
      expect(
        await confirmCoachingBookingPolicy({
          actor: f.actor,
          input: first.input,
          previewHash: first.preview.previewHash,
          confirmed: true,
          db,
        }),
      ).toMatchObject({ id: first.result.id, version: 1, replayed: true });
      expect(
        (
          await db.coachingBookingPolicy.findUniqueOrThrow({
            where: { workspaceId: f.workspace.id },
          })
        ).version,
      ).toBe(2);
      await expect(
        confirmCoachingBookingPolicy({
          actor: f.actor,
          input: { ...first.input, reason: "Changed reason" },
          previewHash: first.preview.previewHash,
          confirmed: true,
          db,
        }),
      ).rejects.toThrow("already used");
      await db.workspaceUser.update({
        where: { id: f.ownerStaff.id },
        data: { isActive: false },
      });
      await expect(
        confirmCoachingBookingPolicy({
          actor: f.actor,
          input: first.input,
          previewHash: first.preview.previewHash,
          confirmed: true,
          db,
        }),
      ).rejects.toThrow("active owner");
    });
    it("rejects orphan heads/receipts, changed-kind edits and ordinary history removal", async () => {
      const f = await fixture(),
        first = await confirm(f),
        head = await db.coachingBookingPolicy.findUniqueOrThrow({
          where: { workspaceId: f.workspace.id },
        }),
        event = await db.workspaceDataEvent.findUniqueOrThrow({
          where: { id: first.result.id },
        });
      await expect(
        db.coachingBookingPolicy.update({
          where: { workspaceId: f.workspace.id },
          data: { version: 2 },
        }),
      ).rejects.toThrow();
      await expect(
        db.coachingBookingPolicy.delete({
          where: { workspaceId: f.workspace.id },
        }),
      ).rejects.toThrow();
      await expect(
        db.workspaceDataEvent.update({
          where: { id: event.id },
          data: { kind: "SILENT_REWRITE" },
        }),
      ).rejects.toThrow();
      await expect(
        db.workspaceDataEvent.delete({ where: { id: event.id } }),
      ).rejects.toThrow();
      const metadata = event.metadata as Prisma.JsonObject;
      await expect(
        db.$transaction((tx) =>
          tx.workspaceDataEvent.create({
            data: {
              workspaceId: f.workspace.id,
              actorUserId: f.owner.id,
              kind: event.kind,
              metadata: {
                ...metadata,
                version: 2,
                previousVersion: 1,
                previousEventId: head.currentEventId,
                previousPolicyHash: head.policyHash,
                operationId: randomUUID(),
              },
            },
          }),
        ),
      ).rejects.toThrow();
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId: f.workspace.id, kind: event.kind },
        }),
      ).toBe(1);
      expect(
        await db.coachingBookingPolicy.findUniqueOrThrow({
          where: { workspaceId: f.workspace.id },
        }),
      ).toEqual(head);
    });
    for (const bad of [
      "previousVersion",
      "previousEventId",
      "previousPolicyHash",
      "policyHash",
      "policy",
    ] as const)
      it(`rolls back the complete transition for wrong ${bad}`, async () => {
        const f = await fixture(),
          first = await confirm(f),
          head = await db.coachingBookingPolicy.findUniqueOrThrow({
            where: { workspaceId: f.workspace.id },
          }),
          event = await db.workspaceDataEvent.findUniqueOrThrow({
            where: { id: first.result.id },
          }),
          metadata = event.metadata as Prisma.JsonObject;
        const next: Record<string, Prisma.InputJsonValue | null> = {
          ...metadata,
          version: 2,
          previousVersion: 1,
          previousEventId: event.id,
          previousPolicyHash: head.policyHash,
          operationId: randomUUID(),
        };
        next[bad] =
          bad === "previousVersion"
            ? 0
            : bad === "policy"
              ? (policy({
                  minimumBufferMinutes: 30,
                }) as unknown as Prisma.InputJsonObject)
              : bad === "policyHash"
                ? "0".repeat(64)
                : "wrong-history-pointer";
        await expect(
          db.$transaction(async (tx) => {
            const receipt = await tx.workspaceDataEvent.create({
              data: {
                workspaceId: f.workspace.id,
                actorUserId: f.owner.id,
                kind: event.kind,
                metadata: next,
              },
            });
            await tx.coachingBookingPolicy.update({
              where: { workspaceId: f.workspace.id },
              data: { version: 2, currentEventId: receipt.id },
            });
          }),
        ).rejects.toThrow();
        expect(
          await db.coachingBookingPolicy.findUniqueOrThrow({
            where: { workspaceId: f.workspace.id },
          }),
        ).toEqual(head);
        expect(
          await db.workspaceDataEvent.count({
            where: { workspaceId: f.workspace.id, kind: event.kind },
          }),
        ).toBe(1);
      });
    it("denies unconfigured new appointments while preserving zero-unit programs and all legacy records", async () => {
      const f = await fixture(),
        zero = await fixture(0),
        before = await db.coachingEnrollment.findUniqueOrThrow({
          where: { id: f.enrollment.id },
        });
      await expect(slot(f)).rejects.toThrow(
        "confirm appointment booking rules",
      );
      expect(
        await db.coachingAvailability.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(0);
      expect(
        await db.coachingEnrollment.findUniqueOrThrow({
          where: { id: f.enrollment.id },
        }),
      ).toEqual(before);
      await expect(
        db.$transaction((tx) =>
          requireNewCoachingPurchaseTx(tx, f.workspace.id, f.enrollment.id),
        ),
      ).rejects.toThrow("delivery and booking-help");
      expect(
        await db.$transaction((tx) =>
          requireNewCoachingPurchaseTx(
            tx,
            zero.workspace.id,
            zero.enrollment.id,
          ),
        ),
      ).toBeNull();
      expect(
        (await getCoachingDetail(f.clientActor, f.enrollment.id)).includedUnits,
      ).toBe(2);
    });
    it("publishes and books with one current snapshot, while later closure retains the accepted appointment and unit", async () => {
      const f = await fixture();
      await confirm(f, policy({ minimumBufferMinutes: 20 }));
      const available = await slot(f);
      const booked = await command(f, "bookAppointment", {
        availabilityId: available.id,
      });
      const appointment = await db.coachingAppointment.findUniqueOrThrow({
        where: { id: booked.id },
      });
      expect(appointment).toMatchObject({
        bufferMinutes: 20,
        status: "BOOKED",
        unitState: "HELD",
        policySnapshot: {
          programVersionId: f.version.id,
          bookingRules: {
            schemaVersion: 1,
            policyVersion: 1,
            effectiveBufferMinutes: 20,
          },
        },
      });
      await confirm(
        f,
        policy({
          weeklyHours: coachingBookingWeekdays.map((weekday) => ({
            weekday,
            intervals: [],
          })),
          minimumBufferMinutes: 600,
        }),
      );
      expect(
        await db.coachingAppointment.findUniqueOrThrow({
          where: { id: booked.id },
        }),
      ).toEqual(appointment);
      await expect(
        slot(f, new Date(+f.tomorrow + 3 * 3600000)),
      ).rejects.toThrow("service hours");
      expect(
        (await getCoachingDetail(f.clientActor, f.enrollment.id))
          .appointments[0],
      ).toMatchObject({ id: booked.id, status: "BOOKED", unitState: "HELD" });
    });
    it("uses full recorded buffers beyond four hours, recorded room conflicts and exact half-open adjacency", async () => {
      const f = await fixture();
      await confirm(f);
      const first = await slot(f, f.tomorrow, 600),
        booked = await command(f, "bookAppointment", {
          availabilityId: first.id,
        });
      const check = (
        startsAt: Date,
        endsAt: Date,
        roomId: string | null = f.room.id,
      ) =>
        db.$transaction((tx) =>
          findCoachingResourceConflictTx(tx, f.workspace.id, {
            coachWorkspaceUserId: f.coachStaff.id,
            roomId,
            startsAt,
            endsAt,
            bufferMinutes: 0,
          }),
        );
      expect(
        await check(
          new Date(+f.tomorrow + 9 * 3600000),
          new Date(+f.tomorrow + 10 * 3600000),
        ),
      ).toContain("another appointment");
      expect(
        await check(
          new Date(+f.tomorrow + 11 * 3600000),
          new Date(+f.tomorrow + 12 * 3600000),
        ),
      ).toBeNull();
      expect(
        (
          await db.coachingAppointment.findUniqueOrThrow({
            where: { id: booked.id },
          })
        ).bufferMinutes,
      ).toBe(600);
    });
    it("blocks published same-coach events without inventing event rooms and leaves unrelated/draft/cancelled events free", async () => {
      const f = await fixture(),
        start = f.tomorrow,
        end = new Date(+start + 3600000),
        event = await db.event.create({
          data: {
            workspaceId: f.workspace.id,
            coachWorkspaceUserId: f.coachStaff.id,
            title: "Fictional private event title",
            startsAt: start,
            endsAt: end,
            status: "DRAFT",
          },
        });
      const check = () =>
        db.$transaction((tx) =>
          findCoachingResourceConflictTx(tx, f.workspace.id, {
            coachWorkspaceUserId: f.coachStaff.id,
            roomId: null,
            startsAt: start,
            endsAt: end,
            bufferMinutes: 0,
          }),
        );
      expect(await check()).toBeNull();
      await db.event.update({
        where: { id: event.id },
        data: { status: "PUBLISHED" },
      });
      expect(await check()).toContain("published event");
      await db.event.update({
        where: { id: event.id },
        data: { coachWorkspaceUserId: f.ownerStaff.id },
      });
      expect(await check()).toBeNull();
      await db.event.update({
        where: { id: event.id },
        data: { coachWorkspaceUserId: f.coachStaff.id, status: "CANCELLED" },
      });
      expect(await check()).toBeNull();
    });
    it("binds preview to current resource effects and rejects another workspace receipt", async () => {
      const f = await fixture(),
        other = await fixture();
      await confirm(f);
      const foreign = await confirm(other);
      const input = {
          policy: policy({ minimumBufferMinutes: 15 }),
          reason: "Review changed resources",
          expectedVersion: 1,
          operationId: randomUUID(),
        },
        preview = await previewCoachingBookingPolicy({
          actor: f.actor,
          input,
          db,
        });
      await db.event.create({
        data: {
          workspaceId: f.workspace.id,
          coachWorkspaceUserId: f.coachStaff.id,
          title: "Fictional new resource commitment",
          startsAt: f.tomorrow,
          endsAt: new Date(+f.tomorrow + 3600000),
          status: "PUBLISHED",
        },
      });
      await expect(
        confirmCoachingBookingPolicy({
          actor: f.actor,
          input,
          previewHash: preview.previewHash,
          confirmed: true,
          db,
        }),
      ).rejects.toThrow("schedule changed");
      await expect(
        db.coachingBookingPolicy.update({
          where: { workspaceId: f.workspace.id },
          data: { version: 2, currentEventId: foreign.result.id },
        }),
      ).rejects.toThrow();
      expect(
        (
          await db.coachingBookingPolicy.findUniqueOrThrow({
            where: { workspaceId: f.workspace.id },
          })
        ).version,
      ).toBe(1);
    });
    it("shows only eligible unheld slots, keeps faster accepted help promises separate, and blocks new sale without disabling paid rights", async () => {
      const f = await fixture();
      await confirm(f, policy({ resolutionResponseHours: 6 }));
      const available = await slot(f),
        later = await slot(f, new Date(+f.tomorrow + 10 * 86400000));
      const online = await command(
        f,
        "createAvailability",
        {
          startsAt: new Date(+f.tomorrow + 4 * 3600000).toISOString(),
          endsAt: new Date(+f.tomorrow + 5 * 3600000).toISOString(),
          bufferMinutes: 0,
          virtualUrl: "https://meet.example.test/PRIVATE_MEETING_SECRET",
        },
        false,
      );
      await db.coachingIntake.create({data:{enrollmentId:f.enrollment.id,content:"Fictional private intake"}});
      await command(f,"acceptPlan",{acceptTerms:true});
      await confirm(f,policy({maxAdvanceMinutes:2*1440,resolutionResponseHours:48}));
      const detail = await getCoachingDetail(f.clientActor, f.enrollment.id),
        value = detail.bookingAvailability!;
      expect(value.slots.map((row) => row.id)).toEqual([
        available.id,
        online.id,
      ]);
      expect(value.notOpenCount).toBe(1);
      expect(value.slots.map((row) => row.id)).not.toContain(later.id);
      await expect(command(f,"bookAppointment",{availabilityId:later.id})).rejects.toThrow("not open for booking yet");
      expect(await db.coachingAppointment.count({where:{enrollmentId:f.enrollment.id}})).toBe(0);
      expect(value).toMatchObject({
        caseOwnerName: "Fictional booking help owner",
        resolutionResponseHours: 6,
        disclosure: { notHeld: true, resolutionResponseHours: 6 },
      });
      expect(JSON.stringify(value)).not.toContain("PRIVATE_MEETING_SECRET");
      expect(JSON.stringify(value)).not.toContain("virtualUrl");
      await command(f, "acceptPlan", { acceptTerms: true });
      const accepted = await db.coachingAcceptedPlan.findFirstOrThrow({
        where: { enrollmentId: f.enrollment.id },
        orderBy: { acceptedAt: "desc" },
      });
      expect(accepted.snapshot).toMatchObject({
        responseHours: 48,
        cancellationHours: 24,
        appointmentBookingDisclosure: {
          resolutionResponseHours: 6,
          notHeld: true,
          availableCount: 2,
        },
      });
      await db.workspaceUser.update({
        where: { id: f.ownerStaff.id },
        data: { isActive: false },
      });
      // A valid later acceptance may have no booking disclosure while its
      // help owner is unavailable. That does not erase the earlier six-hour
      // promise when the owner becomes available again.
      await command(f, "acceptPlan", { acceptTerms: true });
      const withoutOwner = await db.coachingAcceptedPlan.findFirstOrThrow({
        where: { enrollmentId: f.enrollment.id },
        orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
      });
      expect(withoutOwner.snapshot).toMatchObject({ appointmentBookingDisclosure: null });
      await db.workspaceUser.update({where:{id:f.ownerStaff.id},data:{isActive:true}});
      expect((await getCoachingDetail(f.clientActor,f.enrollment.id)).bookingAvailability).toMatchObject({resolutionResponseHours:6,disclosure:{resolutionResponseHours:6}});
      const realDisclosure=(accepted.snapshot as Prisma.JsonObject).appointmentBookingDisclosure as Prisma.JsonObject;
      for(const malformed of [
        {resolutionResponseHours:1},
        {...realDisclosure,resolutionResponseHours:'1'},
        {...realDisclosure,resolutionResponseHours:1,extra:true},
        {...realDisclosure,resolutionResponseHours:1,policyHash:'0'.repeat(64)},
        {...realDisclosure,resolutionResponseHours:1,resolutionOwnerWorkspaceUserId:'foreign-help-owner'},
      ]){
        const acceptedAt=new Date();
        await db.coachingAcceptedPlan.create({data:{workspaceId:f.workspace.id,enrollmentId:f.enrollment.id,programVersionId:f.version.id,clientUserId:f.client.id,operationId:randomUUID(),startsOn:f.enrollment.startsOn,endsOn:f.enrollment.endsOn,timezone:f.enrollment.timezone,snapshot:{appointmentBookingDisclosure:{...malformed,reviewedAt:acceptedAt.toISOString()}},agreement:{acceptedTerms:true},acceptedAt}});
      }
      expect((await getCoachingDetail(f.clientActor,f.enrollment.id)).bookingAvailability).toMatchObject({resolutionResponseHours:6,disclosure:{resolutionResponseHours:6}});
      await db.workspaceUser.update({where:{id:f.ownerStaff.id},data:{isActive:false}});
      await expect(
        db.$transaction((tx) =>
          requireNewCoachingPurchaseTx(tx, f.workspace.id, f.enrollment.id),
        ),
      ).rejects.toThrow("booking-help");
      expect(
        (
          await getCoachingDetail(f.clientActor, f.enrollment.id)
        ).availability.map((row) => row.id),
      ).toContain(available.id);
      const booked = await command(f, "bookAppointment", {
        availabilityId: available.id,
      });
      expect(
        (
          await db.coachingAppointment.findUniqueOrThrow({
            where: { id: booked.id },
          })
        ).unitState,
      ).toBe("HELD");
    });
    it("keeps the original appointment, held unit, accepted buffer and events unchanged when a current-policy move fails", async () => {
      const f = await fixture();
      await confirm(f);
      const a = await slot(f, new Date(+f.tomorrow + 2 * 86400000)),
        b = await slot(f, new Date(+f.tomorrow + 4 * 86400000));
      const booked = await command(f, "bookAppointment", {
          availabilityId: a.id,
        }),
        before = await db.coachingAppointment.findUniqueOrThrow({
          where: { id: booked.id },
        }),
        events = await db.coachingAppointmentEvent.count({
          where: { appointment: { enrollmentId: f.enrollment.id } },
        });
      await confirm(
        f,
        policy({
          weeklyHours: coachingBookingWeekdays.map((weekday) => ({
            weekday,
            intervals: [],
          })),
        }),
      );
      await expect(
        command(f, "moveAppointment", {
          availabilityId: b.id,
          appointmentId: booked.id,
          appointmentVersion: before.version,
        }),
      ).rejects.toThrow("service hours");
      expect(
        await db.coachingAppointment.findUniqueOrThrow({
          where: { id: booked.id },
        }),
      ).toEqual(before);
      expect(
        await db.coachingAppointment.count({
          where: { enrollmentId: f.enrollment.id },
        }),
      ).toBe(1);
      expect(
        await db.coachingAppointmentEvent.count({
          where: { appointment: { enrollmentId: f.enrollment.id } },
        }),
      ).toBe(events);
    });
    it("checks recorded class resources over a long buffer using finite schedule boundaries and protects effective published-availability buffers against leave", async () => {
      const f = await fixture();
      await confirm(f);
      const published = await slot(f);
      await confirm(f, policy({ minimumBufferMinutes: 600 }));
      const start = new Date(+f.tomorrow - 5 * 3600000),
        end = new Date(+start + 3600000),
        local = (value: Date) => value.toISOString().slice(0, 16);
      await expect(
        createStaffLeave(
          f.actor,
          {
            requestId: randomUUID(),
            coachWorkspaceUserId: f.coachStaff.id,
            startsAt: local(start),
            endsAt: local(end),
            reason: "Fictional leave requiring availability resolution",
          },
          { db },
        ),
      ).rejects.toThrow("Resolve these conflicts");
      expect(
        await db.staffTimeOff.count({ where: { workspaceId: f.workspace.id } }),
      ).toBe(0);
      expect(
        (
          await db.coachingAvailability.findUniqueOrThrow({
            where: { id: published.id },
          })
        ).bufferMinutes,
      ).toBe(0);
      const program = await db.program.create({
          data: { workspaceId: f.workspace.id, name: "Fictional dated class" },
        }),
        date = addDays(getWorkspaceDateString(f.tomorrow, "UTC"), 50);
      await db.classTemplate.create({
        data: {
          workspaceId: f.workspace.id,
          programId: program.id,
          roomId: f.room.id,
          coachWorkspaceUserId: f.ownerStaff.id,
          weekday: getWeekdayForDateString(date),
          scheduleStartsOn: new Date(date),
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          bookingCutoffMinutes: 0,
          cancellationCutoffMinutes: 1440,
        },
      });
      expect(
        await db.$transaction((tx) =>
          findCoachingResourceConflictTx(tx, f.workspace.id, {
            coachWorkspaceUserId: f.coachStaff.id,
            roomId: f.room.id,
            startsAt: f.tomorrow,
            endsAt: new Date(+f.tomorrow + 3600000),
            bufferMinutes: 100000,
          }),
        ),
      ).toContain("class");
    });
    async function waited(
      f: Fixture,
      change: (tx: Prisma.TransactionClient) => Promise<void>,
      run: () => Promise<unknown>,
    ) {
      let release!: () => void, acquired!: () => void;
      const locked = new Promise<void>((resolve) => (acquired = resolve)),
        gate = new Promise<void>((resolve) => (release = resolve));
      const blocker = db.$transaction(
        async (tx) => {
          await lockClassSchedule(tx, f.workspace.id);
          await change(tx);
          acquired();
          await gate;
        },
        { timeout: 30000 },
      );
      await Promise.race([locked, blocker]);
      const attempted = run().then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error: error as Error }),
      );
      try {
        await expect
          .poll(
            async () => {
              const rows = await db.$queryRaw<
                Array<{ waiting: boolean }>
              >`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objsubid=1 AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND objid::bigint=(hashtext(${`class-schedule:${f.workspace.id}`})::bigint & 4294967295)) AS waiting`;
              return rows[0]?.waiting;
            },
            { timeout: 10000 },
          )
          .toBe(true);
      } finally {
        release();
        await blocker;
      }
      return attempted;
    }
    for (const kind of [
      "createAvailability",
      "bookAppointment",
      "moveAppointment",
    ] as const)
      it(`retries the whole ${kind} after waiting behind a confirmed head change and denies its stale rule`, async () => {
        const f = await fixture();
        await confirm(f);
        let target: string | undefined,
          old: string | undefined,
          before: unknown;
        if (kind !== "createAvailability") {
          target = (await slot(f, new Date(+f.tomorrow + 4 * 86400000))).id;
          if (kind === "moveAppointment") {
            old = (
              await command(f, "bookAppointment", {
                availabilityId: (
                  await slot(f, new Date(+f.tomorrow + 2 * 86400000))
                ).id,
              })
            ).id;
            before = await db.coachingAppointment.findUniqueOrThrow({
              where: { id: old },
            });
          }
        }
        const appointmentCount = await db.coachingAppointment.count({
            where: { enrollmentId: f.enrollment.id },
          }),
          slotCount = await db.coachingAvailability.count({
            where: { workspaceId: f.workspace.id },
          });
        const input = {
          policy: policy({
            weeklyHours: coachingBookingWeekdays.map((weekday) => ({
              weekday,
              intervals: [],
            })),
          }),
          reason: "Fictional waited current policy",
          expectedVersion: 1,
          operationId: randomUUID(),
        };
        const outcome = await waited(
          f,
          async (tx) => {
            const adapter = new Proxy(db, {
              get(target, key, receiver) {
                if (key === "$transaction")
                  return async (
                    work: (tx: Prisma.TransactionClient) => Promise<unknown>,
                  ) => work(tx);
                return Reflect.get(target, key, receiver);
              },
            }) as PrismaClient;
            const preview = await previewCoachingBookingPolicy({
              actor: f.actor,
              input,
              db: adapter,
            });
            await confirmCoachingBookingPolicy({
              actor: f.actor,
              input,
              previewHash: preview.previewHash,
              confirmed: true,
              db: adapter,
            });
          },
          () =>
            kind === "createAvailability"
              ? slot(f)
              : command(f, kind, {
                  availabilityId: target,
                  appointmentId: old,
                  appointmentVersion: (
                    before as { version: number } | undefined
                  )?.version,
                }),
        );
        expect(outcome.ok).toBe(false);
        if (!outcome.ok)
          expect(outcome.error.message).toContain("service hours");
        expect(
          await db.coachingAppointment.count({
            where: { enrollmentId: f.enrollment.id },
          }),
        ).toBe(appointmentCount);
        expect(
          await db.coachingAvailability.count({
            where: { workspaceId: f.workspace.id },
          }),
        ).toBe(slotCount);
        if (old)
          expect(
            await db.coachingAppointment.findUniqueOrThrow({
              where: { id: old },
            }),
          ).toEqual(before);
      });
    for (const resource of ["coach", "room"] as const)
      it(`rejects new booking after actual waited ${resource} deactivation`, async () => {
        const f = await fixture();
        await confirm(f);
        const a = await slot(f);
        const result = await waited(
          f,
          async (tx) => {
            if (resource === "coach")
              await tx.workspaceUser.update({
                where: { id: f.coachStaff.id },
                data: { isActive: false },
              });
            else
              await tx.room.update({
                where: { id: f.room.id },
                data: { isActive: false },
              });
          },
          () => command(f, "bookAppointment", { availabilityId: a.id }),
        );
        expect(result.ok).toBe(false);
        expect(
          await db.coachingAppointment.count({
            where: { enrollmentId: f.enrollment.id },
          }),
        ).toBe(0);
        expect(
          await db.coachingAppointmentEvent.count({
            where: { appointment: { enrollmentId: f.enrollment.id } },
          }),
        ).toBe(0);
      });

    for (const authority of ["owner", "workspace"] as const)
      it(`rejects a policy confirmation after actual waited ${authority} revocation without a new head or receipt`, async () => {
        const f = await fixture();
        await confirm(f);
        const input = {
            policy: policy({ minimumBufferMinutes: 15 }),
            reason: "Fictional review before authority change",
            expectedVersion: 1,
            operationId: randomUUID(),
          },
          preview = await previewCoachingBookingPolicy({
            actor: f.actor,
            input,
            db,
          });
        const result = await waited(
          f,
          async (tx) => {
            if (authority === "owner")
              await tx.workspaceUser.update({
                where: { id: f.ownerStaff.id },
                data: { isActive: false },
              });
            else
              await tx.workspace.update({
                where: { id: f.workspace.id },
                data: { status: "DISABLED" },
              });
          },
          () =>
            confirmCoachingBookingPolicy({
              actor: f.actor,
              input,
              previewHash: preview.previewHash,
              confirmed: true,
              db,
            }),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.message).toContain("active owner");
        expect(
          (
            await db.coachingBookingPolicy.findUniqueOrThrow({
              where: { workspaceId: f.workspace.id },
            })
          ).version,
        ).toBe(1);
        expect(
          await db.workspaceDataEvent.count({
            where: {
              workspaceId: f.workspace.id,
              kind: "COACHING_BOOKING_POLICY_CONFIRMED",
            },
          }),
        ).toBe(1);
      });
    it("denies an availability withdrawn while a Serializable booking waits, without consuming an appointment unit", async () => {
      const f = await fixture();
      await confirm(f);
      const a = await slot(f);
      const result = await waited(
        f,
        async (tx) => {
          await tx.coachingAvailability.update({
            where: { id: a.id },
            data: { withdrawnAt: new Date() },
          });
        },
        () => command(f, "bookAppointment", { availabilityId: a.id }),
      );
      expect(result.ok).toBe(false);
      expect(
        await db.coachingAppointment.count({
          where: { enrollmentId: f.enrollment.id },
        }),
      ).toBe(0);
      expect(
        await db.coachingAppointmentEvent.count({
          where: { appointment: { enrollmentId: f.enrollment.id } },
        }),
      ).toBe(0);
    });
    it("parses a new local appointment under its dated effective business timezone rather than the current clock", async () => {
      const f = await fixture(),
        today = getWorkspaceDateString(new Date(), "UTC"),
        effectiveFromDate = addDays(today, 2),
        date = addDays(today, 3);
      const input = {
          effectiveFromDate,
          timezone: "Asia/Seoul",
          expectedVersion: 0,
        },
        preview = await previewWorkspaceTimezoneChange({
          actor: f.actor,
          input,
          db,
        });
      expect(preview.ok).toBe(true);
      await commitWorkspaceTimezoneChange({
        actor: f.actor,
        input,
        previewHash: preview.previewHash,
        confirmed: true,
        db,
      });
      await confirm(f);
      const created = await command(
          f,
          "createAvailability",
          {
            startsAt: `${date}T12:00`,
            endsAt: `${date}T13:00`,
            roomId: f.room.id,
            bufferMinutes: 0,
          },
          false,
        ),
        row = await db.coachingAvailability.findUniqueOrThrow({
          where: { id: created.id },
        });
      expect(row.startsAt.toISOString()).toBe(`${date}T03:00:00.000Z`);
      expect(row.endsAt.toISOString()).toBe(`${date}T04:00:00.000Z`);
    });

    it("rejects malformed direct SQL policy documents and normalizes exactly the same weekday/interval hash", async () => {
      const valid = policy(),
        permuted = JSON.parse(JSON.stringify(valid));
      permuted.appointments.weeklyHours.reverse();
      const rows = await db.$queryRaw<
        Array<{ hash: string }>
      >`SELECT coaching_booking_policy_hash(${JSON.stringify(permuted)}::jsonb) AS hash`;
      expect(rows[0]!.hash).toBe(hashCoachingBookingPolicy(valid));
      const invalids: unknown[] = [
        { ...valid, extra: true },
        policy({ minimumBufferMinutes: 0 }),
        {
          ...valid,
          appointments: { ...valid.appointments, minimumBufferMinutes: -1 },
        },
        {
          ...valid,
          appointments: {
            ...valid.appointments,
            minimumBufferMinutes: 2147483648,
          },
        },
        {
          ...valid,
          appointments: {
            ...valid.appointments,
            minimumLeadMinutes: valid.appointments.maxAdvanceMinutes,
          },
        },
        {
          ...valid,
          appointments: {
            ...valid.appointments,
            resolutionResponseHours: Number.MAX_SAFE_INTEGER,
          },
        },
        {
          ...valid,
          appointments: {
            ...valid.appointments,
            weeklyHours: valid.appointments.weeklyHours.map((day, index) =>
              index === 0
                ? {
                    ...day,
                    intervals: [
                      ...day.intervals,
                      { startMinute: 5, endMinute: 6 },
                    ],
                  }
                : day,
            ),
          },
        },
      ];
      invalids[1] = {
        ...valid,
        appointments: {
          ...valid.appointments,
          weeklyHours: valid.appointments.weeklyHours.map((day, index) =>
            index === 1 ? { ...day, weekday: "MONDAY" } : day,
          ),
        },
      };
      for (const invalid of invalids) {
        const result = await db.$queryRaw<
          Array<{ valid: boolean; hash: string | null }>
        >`SELECT coaching_booking_policy_valid(${JSON.stringify(invalid)}::jsonb) AS valid,coaching_booking_policy_hash(${JSON.stringify(invalid)}::jsonb) AS hash`;
        expect(result[0]).toEqual({ valid: false, hash: null });
      }
    });
  },
);
