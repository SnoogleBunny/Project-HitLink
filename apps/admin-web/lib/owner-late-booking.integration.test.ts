import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PrismaClient,
  confirmOwnerLateClassBooking,
  previewOwnerLateClassBooking,
  createAccessBackedBooking,
  schedulingPolicyHash,
  snapshotMembershipTerms,
  type OwnerLateBookingInput,
  type ClassSchedulingPolicy,
  Prisma,
  lockClassSchedule,
  OwnerLateBookingError,
} from "@flowstate/db";
import { fixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "explicit owner-only late class booking",
  () => {
    const db = new PrismaClient({ datasourceUrl: url });
    const workspaces: string[] = [],
      users: string[] = [];
    const now = new Date("2030-01-01T12:00:00Z"),
      date = "2030-01-07";
    let workspaceId: string,
      ownerId: string,
      coachId: string,
      templateId: string,
      membershipId: string;
    let people: Array<{ memberId: string; userId: string }>;
    const actor = () => ({ workspaceId, userId: ownerId });
    const input = (): OwnerLateBookingInput => ({
      memberId: people[0]!.memberId,
      classTemplateId: templateId,
      scheduledForDate: date,
      bookingType: "ACCESS",
      operationId: randomUUID(),
      reason: "PRIVATE_OWNER_LATE_REASON_SENTINEL",
    });
    const review = (next: OwnerLateBookingInput, client = db) =>
      previewOwnerLateClassBooking({
        actor: actor(),
        input: next,
        db: client,
        now,
      });
    const confirm = (
      next: OwnerLateBookingInput,
      previewHash: string,
      confirmed = true,
      client: unknown = db,
    ) =>
      confirmOwnerLateClassBooking({
        actor: actor(),
        input: next,
        previewHash,
        confirmed,
        db: client as PrismaClient,
        now,
      });
    async function rules(
      version = 1,
      change?: (policy: ClassSchedulingPolicy) => void,
    ) {
      const policy: ClassSchedulingPolicy = JSON.parse(
        JSON.stringify(fixtureClassSchedulingPolicy),
      );
      policy.classes.minimumLeadMinutes = 14 * 1440;
      change?.(policy);
      await db.workspaceSchedulingPolicyRevision.create({
        data: {
          workspaceId,
          version,
          policy: policy as unknown as Prisma.InputJsonValue,
          policyHash: schedulingPolicyHash(policy),
          previousPolicyHash:
            version > 1
              ? schedulingPolicyHash({
                  ...fixtureClassSchedulingPolicy,
                  classes: {
                    ...fixtureClassSchedulingPolicy.classes,
                    minimumLeadMinutes: 14 * 1440,
                  },
                })
              : null,
          actorUserId: ownerId,
          reason: "Fictional reviewed policy",
          previewHash: schedulingPolicyHash(policy),
          activatedAt: new Date("2029-12-01"),
        },
      });
    }
    beforeEach(async () => {
      for (const role of ["OWNER", "COACH"] as const) {
        const user = await db.user.create({
          data: { email: `${randomUUID()}@late.test` },
        });
        users.push(user.id);
        if (role === "OWNER") ownerId = user.id;
        else coachId = user.id;
      }
      const workspace = await db.workspace.create({
        data: {
          name: `owner-late-${randomUUID()}`,
          status: "ACTIVE",
          workspaceUsers: {
            create: [
              { userId: ownerId, role: "OWNER" },
              { userId: coachId, role: "COACH" },
            ],
          },
          location: { create: { name: "Gym", timezone: "UTC" } },
          migration: {
            create: {
              stage: "COMPLETE",
              nextOwnerAction: "Local fixture",
              flowstateResponsibility: "Reviewed fictional fixture",
              ownerReviewAcknowledgedAt: now,
              ownerReviewAcknowledgedByUserId: ownerId,
              operationallyReadyAt: now,
              operationallyReadyByUserId: ownerId,
            },
          },
        },
        include: { location: true },
      });
      workspaceId = workspace.id;
      workspaces.push(workspaceId);
      const room = await db.room.create({
          data: {
            locationId: workspace.location!.id,
            name: "Mat",
            capacity: 1,
          },
        }),
        program = await db.program.create({
          data: { workspaceId, name: "Late review program" },
        });
      templateId = (
        await db.classTemplate.create({
          data: {
            workspaceId,
            roomId: room.id,
            programId: program.id,
            title: "Late review class",
            weekday: "MONDAY",
            startTimeMinutes: 1080,
            endTimeMinutes: 1140,
            bookingCutoffMinutes: 60,
            cancellationCutoffMinutes: 120,
          },
        })
      ).id;
      const plan = await db.membershipPlan.create({
        data: {
          workspaceId,
          name: "Two weekly",
          weeklyClassLimit: 2,
          monthlyPriceCents: 12000,
        },
      });
      people = [];
      for (let index = 0; index < 2; index++) {
        const user = await db.user.create({
          data: {
            email: `${randomUUID()}@late.test`,
            fullName: `Late participant ${index}`,
            workspaceUsers: { create: { workspaceId, role: "CUSTOMER" } },
          },
        });
        users.push(user.id);
        const member = await db.member.create({
          data: {
            workspaceId,
            userId: user.id,
            fullName: user.fullName!,
            email: user.email,
            dateOfBirth: new Date("1990-01-01"),
            status: "ACTIVE",
          },
        });
        const membership = await db.memberMembership.create({
          data: {
            workspaceId,
            memberId: member.id,
            membershipPlanId: plan.id,
            startedAt: new Date("2029-12-01"),
            status: "ACTIVE",
            allowanceAnchorDate: new Date("2030-01-01"),
            allowanceTimezone: "UTC",
            acceptedTerms: JSON.parse(
              JSON.stringify(snapshotMembershipTerms(plan)),
            ),
          },
        });
        if (!index) membershipId = membership.id;
        people.push({ memberId: member.id, userId: user.id });
      }
      await rules();
    });
    afterAll(async () => {
      for (const id of workspaces) {
        await db.financialEntitlementHold.deleteMany({
          where: { workspaceId: id },
        });
        await db.financialOperation.deleteMany({ where: { workspaceId: id } });
        await db.signatureRequest.deleteMany({ where: { workspaceId: id } });
        await db.requiredFormAssignment.deleteMany({
          where: { workspaceId: id },
        });
        await db.formDocument.updateMany({
          where: { workspaceId: id },
          data: { currentVersionId: null },
        });
        await db.formVersion.deleteMany({ where: { workspaceId: id } });
        await db.formDocument.deleteMany({ where: { workspaceId: id } });
        await db.membershipAllowanceAllocation.deleteMany({
          where: { workspaceId: id },
        });
        await db.waitlistEntry.deleteMany({ where: { workspaceId: id } });
        await db.classBooking.deleteMany({ where: { workspaceId: id } });
        await db.classTemplate.deleteMany({ where: { workspaceId: id } });
        await db.workspace.delete({ where: { id } });
      }
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    it("a normal ADMIN request stays denied; explicit owner confirmation creates one ordinary booking with private receipt and generic atomic notice", async () => {
      const next = input();
      expect(
        await createAccessBackedBooking({
          workspaceId,
          memberId: next.memberId,
          classTemplateId: templateId,
          scheduledForDate: date,
          timezone: "UTC",
          source: "ADMIN",
          db: db as never,
          now,
        }),
      ).toMatchObject({
        status: "error",
        message: expect.stringContaining("deadline"),
      });
      expect(
        await createAccessBackedBooking({
          workspaceId,
          memberId: next.memberId,
          classTemplateId: templateId,
          scheduledForDate: date,
          timezone: "UTC",
          source: "ADMIN",
          db: db as never,
          now,
          ownerLateBooking: {
            ownerUserId: ownerId,
            receiptId: "forged-private-capability",
          },
        } as never),
      ).toMatchObject({
        status: "error",
        message: expect.stringContaining("deadline"),
      });
      const preview = await review(next);
      expect(preview.policyVersion).toBe(1);
      expect(preview.fundingLabel).toBe("Membership");
      const result = await confirm(next, preview.previewHash);
      const booking = await db.classBooking.findUniqueOrThrow({
        where: { id: result.bookingId },
      });
      expect(booking.status).toBe("BOOKED");
      expect(booking.schedulingPolicySnapshot).toMatchObject({
        mode: "LIVE",
        leadOverrideReceiptId: result.receiptId,
      });
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { bookingId: booking.id, state: "RESERVED" },
        }),
      ).toBe(1);
      const receipt = await db.workspaceDataEvent.findUniqueOrThrow({
        where: { id: result.receiptId },
      });
      expect(receipt.metadata).toMatchObject({
        reason: next.reason,
        overriddenRules: ["BOOKING_CUTOFF", "MINIMUM_LEAD"],
        fundingRevision: 1,
      });
      const jobs = await db.notificationJob.findMany({
        where: { workspaceId },
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.body).not.toContain(next.reason);
      expect(jobs[0]!.context).toMatchObject({
        kind: "CLASS_BOOKING",
        bookingId: booking.id,
      });
      await expect(
        db.workspaceDataEvent.update({
          where: { id: receipt.id },
          data: { metadata: {} },
        }),
      ).rejects.toThrow("immutable");
      expect(await db.payment.count({ where: { workspaceId } })).toBe(0);
    });
    it("rejects malformed protected receipt shapes even when a caller bypasses the domain writer", async () => {
      const next = input(),
        preview = await review(next),
        result = await confirm(next, preview.previewHash),
        receipt = await db.workspaceDataEvent.findUniqueOrThrow({
          where: { id: result.receiptId },
        });
      const malformed: Array<{
        label: string;
        actorUserId?: string | null;
        change?: Record<string, unknown>;
        missing?: string;
      }> = [
        { label: "null actor", actorUserId: null },
        { label: "blank actor", actorUserId: "  " },
        { label: "missing schema version", missing: "schemaVersion" },
        { label: "wrong schema version", change: { schemaVersion: 2 } },
        { label: "text schema version", change: { schemaVersion: "1" } },
        { label: "missing operation ID", missing: "operationId" },
        { label: "short operation ID", change: { operationId: "short" } },
        {
          label: "operation ID outside permitted alphabet",
          change: { operationId: "forbidden operation ID" },
        },
        { label: "missing policy revision", missing: "policyRevisionId" },
        { label: "blank policy revision", change: { policyRevisionId: " " } },
        { label: "missing policy version", missing: "policyVersion" },
        { label: "fractional policy version", change: { policyVersion: 1.5 } },
        { label: "text policy version", change: { policyVersion: "1" } },
        { label: "zero policy version", change: { policyVersion: 0 } },
        { label: "missing funding revision", missing: "fundingRevision" },
        {
          label: "fractional funding revision",
          change: { fundingRevision: 1.5 },
        },
        { label: "text funding revision", change: { fundingRevision: "1" } },
        { label: "zero funding revision", change: { fundingRevision: 0 } },
        { label: "blank booking", change: { bookingId: " " } },
        { label: "blank participant", change: { memberId: " " } },
        { label: "blank class", change: { classTemplateId: " " } },
        { label: "blank reason", change: { reason: "     " } },
      ];
      for (const shape of malformed) {
        const metadata = {
          ...(receipt.metadata as Record<string, unknown>),
          ...shape.change,
        };
        if (shape.missing) delete metadata[shape.missing];
        await expect(
          db.workspaceDataEvent.create({
            data: {
              id: `malformed-late:${randomUUID()}`,
              workspaceId,
              actorUserId:
                shape.actorUserId === undefined ? ownerId : shape.actorUserId,
              kind: "OWNER_LATE_BOOKING_CONFIRMED",
              metadata: metadata as Prisma.InputJsonObject,
            },
          }),
          shape.label,
        ).rejects.toThrow("owner_late_booking_receipt_shape");
      }
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "OWNER_LATE_BOOKING_CONFIRMED" },
        }),
      ).toBe(1);
    });
    it("requires unchecked-to-checked explicit confirmation, a reason and the current active OWNER inside the transaction", async () => {
      const next = input(),
        preview = await review(next);
      await expect(confirm(next, preview.previewHash, false)).rejects.toThrow(
        "Explicitly confirm",
      );
      await expect(
        previewOwnerLateClassBooking({
          actor: { workspaceId, userId: coachId },
          input: next,
          db,
          now,
        }),
      ).rejects.toThrow("active owner");
      await db.workspaceUser.updateMany({
        where: { workspaceId, userId: ownerId },
        data: { isActive: false },
      });
      await expect(confirm(next, preview.previewHash)).rejects.toThrow(
        "active owner",
      );
      expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
    });
    it.each(["owner deactivation", "business disabled"] as const)(
      "rechecks %s committed while confirmation waits for the schedule lock",
      async (change) => {
        const next = input(),
          preview = await review(next);
        let acquired!: () => void, applyChange!: () => void;
        const hasLock = new Promise<void>((resolve) => {
          acquired = resolve;
        });
        const mayCommit = new Promise<void>((resolve) => {
          applyChange = resolve;
        });
        const blocker = db.$transaction(
          async (tx) => {
            await lockClassSchedule(tx, workspaceId);
            acquired();
            await mayCommit;
            if (change === "owner deactivation") {
              await tx.workspaceUser.updateMany({
                where: { workspaceId, userId: ownerId },
                data: { isActive: false },
              });
            } else {
              await tx.workspace.update({
                where: { id: workspaceId },
                data: { status: "DISABLED" },
              });
            }
          },
          { timeout: 15000 },
        );
        await hasLock;
        const attempted = confirm(next, preview.previewHash).then(
          (result) => ({ ok: true as const, result }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        try {
          await expect
            .poll(
              async () => {
                const rows = await db.$queryRaw<{ waiting: boolean }[]>`
              SELECT EXISTS (
                SELECT 1 FROM pg_locks
                WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
                  AND objid::bigint = (hashtext(${`class-schedule:${workspaceId}`})::bigint & 4294967295)
              ) AS waiting
            `;
                return rows[0]?.waiting;
              },
              { timeout: 5000 },
            )
            .toBe(true);
        } finally {
          applyChange();
        }
        await blocker;
        const outcome = await attempted;
        expect(outcome.ok).toBe(false);
        if (outcome.ok)
          throw new Error(
            "A revoked owner confirmation unexpectedly committed",
          );
        expect(outcome.error).toBeInstanceOf(OwnerLateBookingError);
        expect((outcome.error as Error).message).toContain(
          "current active owner",
        );
        expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
        expect(
          await db.membershipAllowanceAllocation.count({
            where: { workspaceId },
          }),
        ).toBe(0);
        expect(
          await db.membershipAllowanceEntry.count({ where: { workspaceId } }),
        ).toBe(0);
        expect(
          await db.workspaceDataEvent.count({
            where: {
              workspaceId,
              kind: {
                in: [
                  "OWNER_LATE_BOOKING_CONFIRMED",
                  "SCHEDULING_POLICY_APPLIED",
                ],
              },
            },
          }),
        ).toBe(0);
        expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(
          0,
        );
        expect(await db.payment.count({ where: { workspaceId } })).toBe(0);
      },
      20000,
    );
    it.each(["hours", "horizon", "started"] as const)(
      "does not override %s",
      async (boundary) => {
        if (boundary === "hours")
          await rules(2, (policy) => {
            policy.classes.weeklyHours = policy.classes.weeklyHours.map(
              (day) => ({ ...day, intervals: [] }),
            );
          });
        if (boundary === "horizon")
          await rules(2, (policy) => {
            policy.classes.maxAdvanceMinutes = 1440;
            policy.classes.minimumLeadMinutes = 60;
          });
        await expect(
          previewOwnerLateClassBooking({
            actor: actor(),
            input: input(),
            db,
            now:
              boundary === "started" ? new Date("2030-01-07T18:00:00Z") : now,
          }),
        ).rejects.toThrow();
        expect(
          await db.membershipAllowanceAllocation.count({
            where: { workspaceId },
          }),
        ).toBe(0);
      },
    );
    it.each(["seat", "funding", "policy", "queue"] as const)(
      "rejects a stale or newly blocked %s review without spending access",
      async (change) => {
        const next = input(),
          preview = await review(next);
        if (change === "seat")
          await db.classBooking.create({
            data: {
              workspaceId,
              memberId: people[1]!.memberId,
              classTemplateId: templateId,
              scheduledForDate: new Date(date),
              bookingType: "TRIAL",
              status: "BOOKED",
            },
          });
        if (change === "funding")
          await db.memberMembership.update({
            where: { id: membershipId },
            data: { status: "FROZEN" },
          });
        if (change === "policy")
          await rules(2, (policy) => {
            policy.classes.minimumLeadMinutes = 13 * 1440;
          });
        if (change === "queue")
          await db.waitlistEntry.create({
            data: {
              workspaceId,
              memberId: people[1]!.memberId,
              classTemplateId: templateId,
              scheduledForDate: new Date(date),
              status: "ACTIVE",
            },
          });
        await expect(confirm(next, preview.previewHash)).rejects.toThrow();
        expect(
          await db.membershipAllowanceAllocation.count({
            where: { workspaceId, memberId: next.memberId },
          }),
        ).toBe(0);
        expect(
          await db.workspaceDataEvent.count({
            where: { workspaceId, kind: "OWNER_LATE_BOOKING_CONFIRMED" },
          }),
        ).toBe(0);
        if (change === "queue")
          expect(
            await db.waitlistEntry.count({
              where: { workspaceId, status: "ACTIVE" },
            }),
          ).toBe(1);
      },
    );
    it.each([
      "hold",
      "eligibility",
      "conflict",
      "provider_record",
      "foreign_person",
    ] as const)(
      "retains the existing %s guard rather than treating owner role as blanket permission",
      async (guard) => {
        const next = input();
        if (guard === "hold") {
          const operation = await db.financialOperation.create({
            data: {
              workspaceId,
              kind: "REFUND",
              targetId: membershipId,
              operationKey: randomUUID(),
              requestHash: "fictional-hold",
              providerIdempotencyKey: randomUUID(),
              payload: {},
              status: "SUBMITTED",
            },
          });
          await db.financialEntitlementHold.create({
            data: {
              workspaceId,
              operationId: operation.id,
              targetKind: "MEMBERSHIP",
              targetId: membershipId,
            },
          });
        }
        if (guard === "eligibility")
          await db.classTemplate.update({
            where: { id: templateId },
            data: {
              prerequisites: {
                version: 1,
                minimumAge: 3,
                maximumAge: 12,
                cohortTag: null,
                minimumRankKey: null,
                minimumStripeCount: 0,
              },
            },
          });
        if (guard === "conflict") {
          const old = await db.classTemplate.findUniqueOrThrow({
            where: { id: templateId },
          });
          const other = await db.classTemplate.create({
            data: {
              workspaceId,
              programId: old.programId,
              roomId: old.roomId,
              weekday: "MONDAY",
              startTimeMinutes: 1080,
              endTimeMinutes: 1140,
              bookingCutoffMinutes: 0,
              cancellationCutoffMinutes: 0,
            },
          });
          await db.classBooking.create({
            data: {
              workspaceId,
              memberId: next.memberId,
              classTemplateId: other.id,
              scheduledForDate: new Date(date),
              bookingType: "TRIAL",
              status: "BOOKED",
            },
          });
        }
        if (guard === "provider_record")
          await db.classBooking.create({
            data: {
              workspaceId,
              memberId: next.memberId,
              classTemplateId: templateId,
              scheduledForDate: new Date(date),
              bookingType: "DROP_IN",
              status: "CANCELLED",
              dropInCheckoutSessionId: `cs_${randomUUID()}`,
            },
          });
        if (guard === "foreign_person") next.memberId = "foreign-member-id";
        await expect(review(next)).rejects.toThrow();
        expect(
          await db.membershipAllowanceAllocation.count({
            where: { workspaceId },
          }),
        ).toBe(0);
        expect(
          await db.workspaceDataEvent.count({
            where: { workspaceId, kind: "OWNER_LATE_BOOKING_CONFIRMED" },
          }),
        ).toBe(0);
      },
    );
    it("books only the selected queue head through explicit owner action, preserving every later position and original consent", async () => {
      const next = input();
      const head = await db.waitlistEntry.create({
        data: {
          workspaceId,
          memberId: next.memberId,
          classTemplateId: templateId,
          scheduledForDate: new Date(date),
          status: "ACTIVE",
          joinedAt: new Date("2029-12-20"),
        },
      });
      const later = await db.waitlistEntry.create({
        data: {
          workspaceId,
          memberId: people[1]!.memberId,
          classTemplateId: templateId,
          scheduledForDate: new Date(date),
          status: "ACTIVE",
          joinedAt: new Date("2029-12-21"),
        },
      });
      const preview = await review(next);
      const booked = await confirm(next, preview.previewHash);
      expect(
        await db.waitlistEntry.findUniqueOrThrow({ where: { id: head.id } }),
      ).toMatchObject({
        status: "CANCELLED",
        autoPromotionOptedInAt: null,
        autoPromotionConsentUserId: null,
      });
      expect(
        await db.waitlistEntry.findUniqueOrThrow({ where: { id: later.id } }),
      ).toMatchObject({
        status: "ACTIVE",
        joinedAt: later.joinedAt,
        autoPromotionOptedInAt: null,
      });
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { bookingId: booked.bookingId },
        }),
      ).toBe(1);
      expect(
        await db.classBooking.count({
          where: { workspaceId, memberId: people[1]!.memberId },
        }),
      ).toBe(0);
    });
    it("rechecks newly published required forms even after a valid preview", async () => {
      const next = input(),
        preview = await review(next),
        staff = await db.workspaceUser.findFirstOrThrow({
          where: { workspaceId, userId: ownerId },
        });
      const document = await db.formDocument.create({
        data: {
          workspaceId,
          name: "Current required waiver",
          formType: "WAIVER",
        },
      });
      const version = await db.formVersion.create({
        data: {
          workspaceId,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: "fixture.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 8,
          fileSha256: "0".repeat(64),
          fileData: Buffer.from("%PDF-1.7"),
          uploadedByWorkspaceUserId: staff.id,
        },
      });
      await db.formDocument.update({
        where: { id: document.id },
        data: { currentVersionId: version.id },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId,
          formDocumentId: document.id,
          requirementTarget: "MEMBER",
        },
      });
      await expect(confirm(next, preview.previewHash)).rejects.toThrow(
        "current required form",
      );
      expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
    });
    const normalizedHash = (value: OwnerLateBookingInput) =>
      createHash("sha256")
        .update(
          JSON.stringify({
            ...value,
            memberId: value.memberId.trim(),
            guardianId: value.guardianId?.trim() || null,
            classTemplateId: value.classTemplateId.trim(),
            scheduledForDate: value.scheduledForDate.trim(),
            reason: value.reason.trim(),
          }),
        )
        .digest("hex");
    async function retryWinner() {
      const next = input(),
        preview = await review(next),
        winner = await confirm(next, preview.previewHash);
      const receipt = await db.workspaceDataEvent.findUniqueOrThrow({
        where: { id: winner.receiptId },
      });
      expect((receipt.metadata as Prisma.JsonObject).inputHash).toBe(
        normalizedHash(next),
      );
      return { next, preview, winner, receipt };
    }
    async function nativeConflict(
      f: Awaited<ReturnType<typeof retryWinner>>,
      kind: "booking" | "receipt" | "serialization",
    ) {
      if (kind === "serialization") {
        let release!: () => void,
          ready!: () => void,
          reads = 0;
        const mayWrite = new Promise<void>((resolve) => {
          release = resolve;
        });
        const bothRead = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const writers = [0, 1].map((index) =>
          db
            .$transaction(
              async (tx) => {
                await tx.member.findUniqueOrThrow({
                  where: { id: people[1]!.memberId },
                });
                if (++reads === 2) ready();
                await mayWrite;
                await tx.member.update({
                  where: { id: people[1]!.memberId },
                  data: { fullName: `Fictional serialization writer ${index}` },
                });
              },
              { isolationLevel: "Serializable" },
            )
            .then(
              () => ({ ok: true as const }),
              (error: unknown) => ({ ok: false as const, error }),
            ),
        );
        try {
          await bothRead;
        } finally {
          release();
        }
        const results = await Promise.all(writers),
          failed = results.find((result) => !result.ok);
        if (!failed || failed.ok)
          throw new Error("Native serialization fixture produced no conflict");
        expect(failed.error).toBeInstanceOf(
          Prisma.PrismaClientKnownRequestError,
        );
        expect(
          (failed.error as Prisma.PrismaClientKnownRequestError).code,
        ).toBe("P2034");
        return failed.error as Prisma.PrismaClientKnownRequestError;
      }
      let captured: unknown;
      try {
        if (kind === "booking")
          await db.classBooking.create({
            data: {
              workspaceId,
              memberId: f.next.memberId,
              classTemplateId: templateId,
              scheduledForDate: new Date(date),
              status: "CANCELLED",
              fundingMembershipId: membershipId,
            },
          });
        else
          await db.workspaceDataEvent.create({
            data: {
              id: f.receipt.id,
              workspaceId,
              actorUserId: ownerId,
              kind: f.receipt.kind,
              metadata: f.receipt.metadata as Prisma.InputJsonValue,
            },
          });
      } catch (error) {
        captured = error;
      }
      expect(captured).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      const native = captured as Prisma.PrismaClientKnownRequestError;
      expect(native.code).toBe("P2002");
      console.info(
        "OWNER_LATE_CAPTURED_NATIVE_UNIQUE",
        JSON.stringify({
          kind,
          modelName: native.meta?.modelName,
          target: native.meta?.target,
        }),
      );
      return native;
    }
    function conflictClient(
      error: unknown,
      options: { always?: boolean; afterWitness?: () => Promise<void> } = {},
    ) {
      const txids: string[] = [];
      let injected = 0,
        witnessed = 0;
      const client = new Proxy(db, {
        get(target, key) {
          if (key === "$transaction")
            return <T>(
              callback: (tx: Prisma.TransactionClient) => Promise<T>,
              settings?: {
                isolationLevel?: Prisma.TransactionIsolationLevel;
                timeout?: number;
                maxWait?: number;
              },
            ) =>
              target.$transaction(async (tx) => {
                const ids = await tx.$queryRaw<
                  Array<{ id: string }>
                >`SELECT txid_current()::text AS id`;
                txids.push(ids[0]!.id);
                const scoped = new Proxy(tx, {
                  get(inner, field) {
                    if (field === "workspaceDataEvent")
                      return new Proxy(inner.workspaceDataEvent, {
                        get(delegate, method) {
                          if (method === "findUnique")
                            return async (...args: unknown[]) => {
                              if (injected === 0 || options.always) {
                                injected++;
                                await inner.workspaceDataEvent.create({
                                  data: {
                                    workspaceId,
                                    actorUserId: ownerId,
                                    kind: "FICTIONAL_LATE_RETRY_ROLLBACK",
                                    metadata: { attempt: injected },
                                  },
                                });
                                throw error;
                              }
                              return Reflect.apply(
                                delegate.findUnique,
                                delegate,
                                args,
                              );
                            };
                          const value = Reflect.get(delegate, method);
                          return typeof value === "function"
                            ? value.bind(delegate)
                            : value;
                        },
                      });
                    const value = Reflect.get(inner, field);
                    return typeof value === "function"
                      ? value.bind(inner)
                      : value;
                  },
                });
                return callback(scoped);
              }, settings);
          if (key === "workspaceDataEvent")
            return new Proxy(target.workspaceDataEvent, {
              get(delegate, method) {
                if (method === "findUnique")
                  return async (...args: unknown[]) => {
                    const row = await Reflect.apply(
                      delegate.findUnique,
                      delegate,
                      args,
                    );
                    witnessed++;
                    if (options.afterWitness) await options.afterWitness();
                    return row;
                  };
                const value = Reflect.get(delegate, method);
                return typeof value === "function"
                  ? value.bind(delegate)
                  : value;
              },
            });
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      return {
        client,
        txids,
        injected: () => injected,
        witnessed: () => witnessed,
      };
    }
    async function noExtraEffects(f: Awaited<ReturnType<typeof retryWinner>>) {
      expect(
        await db.classBooking.count({
          where: { workspaceId, status: "BOOKED" },
        }),
      ).toBe(1);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(1);
      expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(
        1,
      );
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "FICTIONAL_LATE_RETRY_ROLLBACK" },
        }),
      ).toBe(0);
      expect(
        await db.classBooking.findUniqueOrThrow({
          where: { id: f.winner.bookingId },
        }),
      ).toMatchObject({
        fundingRevision: 1,
        status: "BOOKED",
        fundingMembershipId: membershipId,
      });
    }
    it.each(["booking", "receipt", "serialization"] as const)(
      "replays the full owner operation after captured native %s conflict, with rollback and exact committed receipt",
      async (kind) => {
        const f = await retryWinner(),
          error = await nativeConflict(f, kind),
          traced = conflictClient(error);
        const result = await confirm(
          f.next,
          f.preview.previewHash,
          true,
          traced.client,
        );
        expect(result).toMatchObject({
          status: "already_created",
          bookingId: f.winner.bookingId,
          receiptId: f.winner.receiptId,
        });
        expect(traced.txids).toHaveLength(2);
        expect(new Set(traced.txids).size).toBe(2);
        expect(traced.injected()).toBe(1);
        await noExtraEffects(f);
      },
    );
    it.each([
      "foreign model",
      "foreign target",
      "forged code/meta",
      "error proxy",
      "metadata proxy",
      "target proxy",
    ] as const)(
      "does not retry a %s despite an existing matching receipt",
      async (kind) => {
        const f = await retryWinner(),
          captured = await nativeConflict(f, "booking");
        const originalMeta = captured.meta!;
        let error: unknown;
        if (kind === "forged code/meta")
          error = { code: "P2002", meta: originalMeta };
        else if (kind === "error proxy") error = new Proxy(captured, {});
        else
          error = new Prisma.PrismaClientKnownRequestError(
            "Fictional unrelated conflict",
            {
              code: "P2002",
              clientVersion: captured.clientVersion,
              meta:
                kind === "foreign model"
                  ? { ...originalMeta, modelName: "User" }
                  : kind === "foreign target"
                    ? { ...originalMeta, target: ["id"] }
                    : kind === "metadata proxy"
                      ? new Proxy(originalMeta, {})
                      : {
                          ...originalMeta,
                          target: new Proxy(
                            originalMeta.target as string[],
                            {},
                          ),
                        },
            },
          );
        const traced = conflictClient(error);
        await expect(
          confirm(f.next, f.preview.previewHash, true, traced.client),
        ).rejects.toBe(error);
        expect(traced.txids).toHaveLength(1);
        expect(traced.witnessed()).toBe(0);
        await noExtraEffects(f);
      },
    );
    const unsafeCases = (["P2002", "P2034"] as const).flatMap((code) =>
      [
        "forged prototype",
        "plain getter object",
        "code getter",
        "meta getter",
        "model getter",
        "target getter",
        "element getter",
        "revoked proxy",
        "proxy target",
        "native proxy prototype",
        "native revoked proxy prototype",
      ].map((kind) => ({ code, kind })),
    );
    it.each(unsafeCases)(
      "unknown $code $kind never executes supplied getters or retries",
      async ({ code, kind }) => {
        const f = await retryWinner();
        let reads = 0;
        const keys = [
          "workspaceId",
          "memberId",
          "classTemplateId",
          "scheduledForDate",
        ];
        const meta: Record<string, unknown> = {
          modelName: "ClassBooking",
          target: keys,
        };
        let error: unknown = new Prisma.PrismaClientKnownRequestError(
          "Fictional unsafe error",
          { code, clientVersion: "6.19.3", meta },
        );
        const getter = (value: unknown) => ({
          configurable: true,
          enumerable: true,
          get: () => {
            reads++;
            return value;
          },
        });
        if (kind === "forged prototype") {
          error = Object.create(Prisma.PrismaClientKnownRequestError.prototype);
          Object.defineProperty(error, "code", getter(code));
          Object.defineProperty(error, "meta", getter(meta));
        }
        if (kind === "plain getter object") {
          error = {};
          Object.defineProperty(error, "code", getter(code));
          Object.defineProperty(error, "meta", getter(meta));
        }
        if (kind === "code getter")
          Object.defineProperty(error, "code", getter(code));
        if (kind === "meta getter")
          Object.defineProperty(error, "meta", getter(meta));
        if (kind === "model getter")
          Object.defineProperty(meta, "modelName", getter("ClassBooking"));
        if (kind === "target getter")
          Object.defineProperty(meta, "target", getter(keys));
        if (kind === "element getter")
          Object.defineProperty(keys, "0", getter("workspaceId"));
        if (kind === "proxy target") meta.target = new Proxy(keys, {});
        if (kind === "revoked proxy") {
          const pair = Proxy.revocable(error as object, {});
          pair.revoke();
          error = pair.proxy;
        }
        if (
          kind === "native proxy prototype" ||
          kind === "native revoked proxy prototype"
        ) {
          error = new Error("Fictional native error with unsafe prototype");
          Object.defineProperty(error, "code", {
            value: code,
            configurable: true,
          });
          Object.defineProperty(error, "meta", {
            value: meta,
            configurable: true,
          });
          const pair = Proxy.revocable(
            Prisma.PrismaClientKnownRequestError.prototype,
            {
              getPrototypeOf: () => {
                reads++;
                return Error.prototype;
              },
            },
          );
          Object.setPrototypeOf(error, pair.proxy);
          if (kind === "native revoked proxy prototype") pair.revoke();
        }
        const traced = conflictClient(error);
        const result = await confirm(
          f.next,
          f.preview.previewHash,
          true,
          traced.client,
        ).then(
          () => ({ ok: true as const }),
          (caught: unknown) => ({ ok: false as const, caught }),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(Object.is(result.caught, error)).toBe(true);
        expect(reads).toBe(0);
        expect(traced.txids).toHaveLength(1);
        expect(traced.witnessed()).toBe(0);
        await noExtraEffects(f);
      },
    );
    it("native target comparison never calls a supplied includes getter", async () => {
      const f = await retryWinner(),
        error = await nativeConflict(f, "booking");
      let reads = 0;
      const target = error.meta!.target;
      expect(Array.isArray(target)).toBe(true);
      if (!Array.isArray(target))
        throw new Error("Captured composite target is not an array");
      Object.defineProperty(target, "includes", {
        configurable: true,
        get: () => {
          reads++;
          throw new Error("Supplied includes must not run");
        },
      });
      const traced = conflictClient(error);
      expect(
        (await confirm(f.next, f.preview.previewHash, true, traced.client))
          .status,
      ).toBe("already_created");
      expect(reads).toBe(0);
      expect(traced.txids).toHaveLength(2);
      await noExtraEffects(f);
    });
    it.each([
      "missing",
      "wrong actor",
      "wrong input hash",
      "wrong workspace",
    ] as const)(
      "rejects native uniqueness when the committed exact receipt is %s",
      async (kind) => {
        const f = await retryWinner(),
          error = await nativeConflict(f, "booking"),
          next = { ...f.next, operationId: randomUUID() };
        if (kind !== "missing") {
          let receiptWorkspace = workspaceId;
          if (kind === "wrong workspace") {
            const other = await db.workspace.create({
              data: {
                name: `Fictional wrong witness ${randomUUID()}`,
                status: "ACTIVE",
              },
            });
            workspaces.push(other.id);
            receiptWorkspace = other.id;
          }
          await db.workspaceDataEvent.create({
            data: {
              id: `owner-late-booking:${workspaceId}:${next.operationId}`,
              workspaceId: receiptWorkspace,
              actorUserId: kind === "wrong actor" ? coachId : ownerId,
              kind: "OWNER_LATE_BOOKING_CONFIRMED",
              metadata: {
                ...(f.receipt.metadata as Prisma.JsonObject),
                operationId: next.operationId,
                inputHash:
                  kind === "wrong input hash"
                    ? "0".repeat(64)
                    : normalizedHash(next),
              },
            },
          });
        }
        const traced = conflictClient(error);
        await expect(
          confirm(next, f.preview.previewHash, true, traced.client),
        ).rejects.toBe(error);
        expect(traced.txids).toHaveLength(1);
        await noExtraEffects(f);
      },
    );
    it("retains the original four-attempt budget for a witnessed native conflict", async () => {
      const f = await retryWinner(),
        error = await nativeConflict(f, "booking"),
        traced = conflictClient(error, { always: true });
      await expect(
        confirm(f.next, f.preview.previewHash, true, traced.client),
      ).rejects.toBe(error);
      expect(traced.txids).toHaveLength(4);
      expect(new Set(traced.txids).size).toBe(4);
      await noExtraEffects(f);
    });
    it("a receipt witness cannot bypass owner revocation before full replay", async () => {
      const f = await retryWinner(),
        error = await nativeConflict(f, "booking"),
        traced = conflictClient(error, {
          afterWitness: async () => {
            await db.workspaceUser.updateMany({
              where: { workspaceId, userId: ownerId },
              data: { isActive: false },
            });
          },
        });
      await expect(
        confirm(f.next, f.preview.previewHash, true, traced.client),
      ).rejects.toThrow("current active owner");
      expect(traced.txids).toHaveLength(2);
      await noExtraEffects(f);
    });
    it("replays an exact owner retry whose Serializable snapshot waits after the first writer reviewed absence", async () => {
      const next = input(),
        preview = await review(next);
      let release!: () => void,
        firstReady!: (pid: number) => void,
        secondReady!: (pid: number) => void;
      const mayCreate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const firstAtCreate = new Promise<number>((resolve) => {
        firstReady = resolve;
      });
      const secondStarted = new Promise<number>((resolve) => {
        secondReady = resolve;
      });
      function traced(gate: boolean) {
        return new Proxy(db, {
          get(target, key) {
            if (key === "$transaction")
              return <T>(
                callback: (tx: Prisma.TransactionClient) => Promise<T>,
                options?: {
                  isolationLevel?: Prisma.TransactionIsolationLevel;
                  timeout?: number;
                  maxWait?: number;
                },
              ) =>
                target.$transaction(async (tx) => {
                  const rows = await tx.$queryRaw<
                    Array<{ pid: number }>
                  >`SELECT pg_backend_pid() AS pid`;
                  if (!gate) secondReady(rows[0]!.pid);
                  const scoped = new Proxy(tx, {
                    get(inner, field) {
                      if (field === "classBooking" && gate)
                        return new Proxy(inner.classBooking, {
                          get(delegate, method) {
                            if (method === "create")
                              return async (...args: unknown[]) => {
                                firstReady(rows[0]!.pid);
                                await mayCreate;
                                return Reflect.apply(
                                  delegate.create,
                                  delegate,
                                  args,
                                );
                              };
                            const value = Reflect.get(delegate, method);
                            return typeof value === "function"
                              ? value.bind(delegate)
                              : value;
                          },
                        });
                      const value = Reflect.get(inner, field);
                      return typeof value === "function"
                        ? value.bind(inner)
                        : value;
                    },
                  });
                  return callback(scoped);
                }, options);
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      }
      const first = confirm(next, preview.previewHash, true, traced(true)).then(
        (result) => ({ ok: true as const, result }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      let second: typeof first | undefined, primary: unknown;
      try {
        const initial = await Promise.race([
          firstAtCreate.then((pid) => ({ kind: "ready" as const, pid })),
          first.then((result) => ({ kind: "finished" as const, result })),
        ]);
        if (initial.kind === "finished")
          throw initial.result.ok
            ? new Error("First confirmation completed before create gate")
            : initial.result.error;
        second = confirm(next, preview.previewHash, true, traced(false)).then(
          (result) => ({ ok: true as const, result }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        const started = await Promise.race([
          secondStarted.then((pid) => ({ kind: "ready" as const, pid })),
          second.then((result) => ({ kind: "finished" as const, result })),
        ]);
        if (started.kind === "finished")
          throw started.result.ok
            ? new Error("Second confirmation completed before transaction")
            : started.result.error;
        let observed: Array<{
          pid: number;
          blockedBy: number[];
          query: string;
        }> = [];
        await expect
          .poll(
            async () => {
              observed =
                await db.$queryRaw`SELECT DISTINCT a.pid, pg_blocking_pids(a.pid) AS "blockedBy", a.query FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.pid=${started.pid} AND l.locktype='advisory' AND NOT l.granted AND l.objsubid=1 AND l.objid::bigint=(hashtext(${`class-schedule:${workspaceId}`})::bigint & 4294967295) AND ${initial.pid}=ANY(pg_blocking_pids(a.pid))`;
              return observed.length > 0;
            },
            { timeout: 2000 },
          )
          .toBe(true);
        console.info(
          "OWNER_LATE_EXACT_RETRY_OBSERVED_STAGGERED_WAIT",
          JSON.stringify({
            blockerPid: initial.pid,
            waiterPid: started.pid,
            observed,
          }),
        );
      } catch (error) {
        primary = error;
      } finally {
        release();
        await first;
        if (second) await second;
      }
      if (primary) throw primary;
      const results = await Promise.all([first, second!]);
      for (const result of results)
        if (!result.ok) {
          const detail = result.error as {
            code?: unknown;
            meta?: { modelName?: unknown; target?: unknown };
          };
          console.info(
            "OWNER_LATE_EXACT_RETRY_NATIVE_FAILURE",
            JSON.stringify({
              errorName:
                result.error instanceof Error
                  ? result.error.constructor.name
                  : typeof result.error,
              code: detail?.code,
              modelName: detail?.meta?.modelName,
              target: detail?.meta?.target,
            }),
          );
          throw result.error;
        }
      const successes = results.map((result) => {
        if (!result.ok) throw result.error;
        return result.result;
      });
      expect(successes.map((result) => result.status).sort()).toEqual([
        "already_created",
        "created",
      ]);
      expect(new Set(successes.map((result) => result.bookingId)).size).toBe(1);
      expect(new Set(successes.map((result) => result.receiptId)).size).toBe(1);
      expect(await db.classBooking.count({ where: { workspaceId } })).toBe(1);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(1);
      expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(
        1,
      );
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "OWNER_LATE_BOOKING_CONFIRMED" },
        }),
      ).toBe(1);
    });
    it("replays one exact owner request after both Serializable callers wait behind the actual schedule lock", async () => {
      const next = input(),
        preview = await review(next);
      let release!: () => void, ready!: (pid: number) => void;
      const mayCommit = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = new Promise<number>((resolve) => {
        ready = resolve;
      });
      const blocker = db
        .$transaction(async (tx) => {
          await lockClassSchedule(tx, workspaceId);
          const rows = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          ready(rows[0]!.pid);
          await mayCommit;
        })
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );
      let primary: unknown;
      let outcomes: Array<
        Promise<
          | { ok: true; result: Awaited<ReturnType<typeof confirm>> }
          | { ok: false; error: unknown }
        >
      > = [];
      try {
        const initial = await Promise.race([
          locked.then((pid) => ({ kind: "ready" as const, pid })),
          blocker.then((result) => ({ kind: "finished" as const, result })),
        ]);
        if (initial.kind === "finished")
          throw initial.result.ok
            ? new Error("Schedule blocker finished early")
            : initial.result.error;
        outcomes = [0, 1].map(() =>
          confirm(next, preview.previewHash).then(
            (result) => ({ ok: true as const, result }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
        );
        let observed: Array<{
          pid: number;
          blockedBy: number[];
          query: string;
        }> = [];
        await expect
          .poll(
            async () => {
              observed =
                await db.$queryRaw`SELECT DISTINCT a.pid, pg_blocking_pids(a.pid) AS "blockedBy", a.query FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE l.locktype='advisory' AND NOT l.granted AND l.objsubid=1 AND l.objid::bigint=(hashtext(${`class-schedule:${workspaceId}`})::bigint & 4294967295) AND ${initial.pid}=ANY(pg_blocking_pids(a.pid))`;
              return new Set(observed.map((row) => row.pid)).size;
            },
            { timeout: 2000 },
          )
          .toBe(2);
        console.info(
          "OWNER_LATE_EXACT_RETRY_OBSERVED_TWO_WAITERS",
          JSON.stringify({ blockerPid: initial.pid, observed }),
        );
      } catch (error) {
        primary = error;
      } finally {
        release();
        const completed = await blocker;
        await Promise.all(outcomes);
        if (!completed.ok) {
          if (primary)
            console.error(
              "Supplemental owner-late schedule blocker failure retained",
              {
                errorType:
                  completed.error instanceof Error
                    ? completed.error.name
                    : typeof completed.error,
              },
            );
          else primary = completed.error;
        }
      }
      if (primary) throw primary;
      const results = await Promise.all(outcomes);
      for (const result of results)
        if (!result.ok) {
          const detail = result.error as {
            code?: unknown;
            meta?: { modelName?: unknown; target?: unknown };
          };
          console.info(
            "OWNER_LATE_EXACT_RETRY_NATIVE_FAILURE",
            JSON.stringify({
              errorName:
                result.error instanceof Error
                  ? result.error.constructor.name
                  : typeof result.error,
              code: detail?.code,
              modelName: detail?.meta?.modelName,
              target: detail?.meta?.target,
            }),
          );
          throw result.error;
        }
      const successes = results.map((result) => {
        if (!result.ok) throw result.error;
        return result.result;
      });
      expect(successes.map((result) => result.status).sort()).toEqual([
        "already_created",
        "created",
      ]);
      expect(new Set(successes.map((result) => result.bookingId)).size).toBe(1);
      expect(new Set(successes.map((result) => result.receiptId)).size).toBe(1);
      expect(await db.classBooking.count({ where: { workspaceId } })).toBe(1);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(1);
      expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(
        1,
      );
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "OWNER_LATE_BOOKING_CONFIRMED" },
        }),
      ).toBe(1);
      expect(
        await db.classBooking.findFirstOrThrow({ where: { workspaceId } }),
      ).toMatchObject({
        fundingRevision: 1,
        status: "BOOKED",
        fundingMembershipId: membershipId,
      });
    });
    it("serializes concurrent exact retries and never restores a cancelled receipt or spends another unit", async () => {
      const next = input(),
        preview = await review(next);
      const results = await Promise.all([
        confirm(next, preview.previewHash),
        confirm(next, preview.previewHash),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([
        "already_created",
        "created",
      ]);
      expect(new Set(results.map((result) => result.bookingId)).size).toBe(1);
      expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(
        1,
      );
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(1);
      await db.classBooking.update({
        where: { id: results[0]!.bookingId },
        data: { status: "CANCELLED" },
      });
      await expect(confirm(next, preview.previewHash)).rejects.toThrow(
        "cannot restore a seat",
      );
      await expect(
        confirm(
          { ...next, memberId: people[1]!.memberId },
          preview.previewHash,
        ),
      ).rejects.toThrow("another booking");
      expect(
        await db.classBooking.count({
          where: { workspaceId, status: "BOOKED" },
        }),
      ).toBe(0);
    });
    it.each(["receipt", "notice"] as const)(
      "rolls back seat, allowance, queue and applied proof when the required %s write fails",
      async (failure) => {
        const next = input(),
          preview = await review(next);
        const failing = db.$extends({
          query: {
            workspaceDataEvent: {
              async create({ args, query }) {
                if (
                  failure === "receipt" &&
                  args.data.kind === "OWNER_LATE_BOOKING_CONFIRMED"
                )
                  throw Error("Injected late receipt failure");
                return query(args);
              },
            },
            notificationJob: {
              async createMany({ args, query }) {
                if (failure === "notice")
                  throw Error("Injected late notice failure");
                return query(args);
              },
            },
          },
        });
        await expect(
          confirm(next, preview.previewHash, true, failing),
        ).rejects.toThrow("Injected late");
        expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
        expect(
          await db.membershipAllowanceAllocation.count({
            where: { workspaceId },
          }),
        ).toBe(0);
        expect(
          await db.workspaceDataEvent.count({
            where: {
              workspaceId,
              kind: {
                in: [
                  "SCHEDULING_POLICY_APPLIED",
                  "OWNER_LATE_BOOKING_CONFIRMED",
                ],
              },
            },
          }),
        ).toBe(0);
        expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(
          0,
        );
      },
    );
  },
);
