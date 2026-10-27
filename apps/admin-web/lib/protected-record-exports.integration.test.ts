import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  createWorkspaceDataExport,
  downloadWorkspaceDataExport,
  createMemberDataExport,
  downloadMemberDataExport,
} from "@flowstate/db";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../../packages/db/src/retention-inventory";

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "protected scheduling, profile and receipt archives",
  () => {
    const db = new PrismaClient({ datasourceUrl: url, log: [] });
    const tag = randomUUID(),
      now = new Date("2026-11-01T12:00:00Z"),
      digest = (value: unknown) =>
        createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const users: string[] = [],
      workspaces: string[] = [];
    let workspaceId: string,
      foreignWorkspaceId: string,
      ownerId: string,
      payerUserId: string,
      childA: string,
      childB: string,
      grantId: string,
      payerId: string,
      contactId: string,
      profileEventId: string,
      receiptId: string,
      policyId: string,
      bookingId: string,
      lateReceiptId: string,
      roomReceiptId: string,
      operationalNoteId: string;
    const actor = () => ({ workspaceId, userId: ownerId }),
      parent = () => ({ workspaceId, userId: payerUserId });
    const options = () => ({ db, now });
    beforeAll(async () => {
      const workspace = await db.workspace.create({
        data: {
          name: `Archive boundary ${tag}`,
          status: "ACTIVE",
          location: { create: { name: "Fictional", timezone: "UTC" } },
        },
        include: { location: true },
      });
      workspaceId = workspace.id;
      workspaces.push(workspaceId);
      foreignWorkspaceId = (
        await db.workspace.create({
          data: { name: `Unrelated ${tag}`, status: "ACTIVE" },
        })
      ).id;
      workspaces.push(foreignWorkspaceId);
      const owner = await db.user.create({
        data: {
          email: `archive-owner-${tag}@example.test`,
          fullName: "Archive owner",
          workspaceUsers: { create: { workspaceId, role: "OWNER" } },
        },
      });
      ownerId = owner.id;
      users.push(ownerId);
      const staff = await db.workspaceUser.findFirstOrThrow({
        where: { workspaceId, userId: ownerId },
      });
      const payer = await db.user.create({
        data: {
          email: `archive-payer-${tag}@example.test`,
          fullName: "Verified payer",
          workspaceUsers: { create: { workspaceId, role: "CUSTOMER" } },
        },
      });
      payerUserId = payer.id;
      users.push(payerUserId);
      const payerMember = await db.member.create({
        data: {
          workspaceId,
          userId: payerUserId,
          fullName: "Verified payer",
          dateOfBirth: new Date("1990-01-01"),
        },
      });
      payerId = (
        await db.financialAccount.create({
          data: { workspaceId, userId: payerUserId, memberId: payerMember.id },
        })
      ).id;
      childA = (
        await db.member.create({
          data: {
            workspaceId,
            fullName: "Named child",
            dateOfBirth: new Date("2016-01-01"),
            profileVersion: 2,
          },
        })
      ).id;
      childB = (
        await db.member.create({
          data: {
            workspaceId,
            fullName: "Other child",
            dateOfBirth: new Date("2014-01-01"),
          },
        })
      ).id;
      const guardian = await db.guardian.create({
        data: {
          workspaceId,
          fullName: "Verified guardian",
          familyLinks: { create: { workspaceId, childMemberId: childA } },
        },
      });
      grantId = (
        await db.memberPortalGrant.create({
          data: {
            workspaceId,
            userId: payerUserId,
            memberId: childA,
            guardianId: guardian.id,
            verifiedByWorkspaceUserId: staff.id,
            verificationNote:
              "Fictional independently verified child authority",
            verifiedAt: now,
            canSign: true,
            canManageEmergencyContacts: true,
          },
        })
      ).id;
      contactId = (
        await db.memberEmergencyContact.create({
          data: {
            workspaceId,
            memberId: childA,
            fullName: "Emergency person",
            phone: "+1 555 0101",
          },
        })
      ).id;
      await db.memberEmergencyContact.create({
        data: {
          workspaceId,
          memberId: childB,
          fullName: "SIBLING_EMERGENCY_PRIVATE",
          phone: "+1 555 0202",
        },
      });
      const foreignMember = await db.member.create({
        data: { workspaceId: foreignWorkspaceId, fullName: "Foreign member" },
      });
      await db.memberEmergencyContact.create({
        data: {
          workspaceId: foreignWorkspaceId,
          memberId: foreignMember.id,
          fullName: "FOREIGN_EMERGENCY_PRIVATE",
          phone: "+1 555 0303",
        },
      });
      profileEventId = (
        await db.memberProfileEvent.create({
          data: {
            workspaceId,
            memberId: childA,
            emergencyContactId: contactId,
            actorUserId: ownerId,
            actorWorkspaceUserId: staff.id,
            actorNameSnapshot: "STAFF_ACTOR_PRIVATE",
            actorRoleSnapshot: "OWNER",
            operationId: randomUUID(),
            inputHash: "a".repeat(64),
            kind: "EMERGENCY_CONTACT_ADDED",
            profileVersion: 2,
            before: {},
            after: {
              id: contactId,
              fullName: "Emergency person",
              phone: "+1 555 0101",
              privateNote: "PROFILE_JSON_PRIVATE",
            },
            reason: "STAFF_REASON_PRIVATE",
          },
        })
      ).id;
      const policy = {
        schemaVersion: 1,
        classes: {
          maxAdvanceMinutes: 86400,
          minimumLeadMinutes: 15,
          weeklyHours: [
            "MONDAY",
            "TUESDAY",
            "WEDNESDAY",
            "THURSDAY",
            "FRIDAY",
            "SATURDAY",
            "SUNDAY",
          ].map((weekday) => ({
            weekday,
            intervals: [
              {
                startMinute: 0,
                endMinute: 1440,
                privateText: "POLICY_JSON_PRIVATE",
              },
            ],
          })),
        },
      };
      policyId = (
        await db.workspaceSchedulingPolicyRevision.create({
          data: {
            workspaceId,
            version: 1,
            policy,
            policyHash: digest(policy),
            actorUserId: ownerId,
            reason: "Fictional retained policy",
            previewHash: "b".repeat(64),
            activatedAt: now,
          },
        })
      ).id;
      const room = await db.room.create({
        data: { locationId: workspace.location!.id, name: "Mat" },
      });
      const program = await db.program.create({
        data: { workspaceId, name: "Program" },
      });
      const template = await db.classTemplate.create({
        data: {
          workspaceId,
          programId: program.id,
          roomId: room.id,
          weekday: "MONDAY",
          startTimeMinutes: 720,
          endTimeMinutes: 780,
          bookingCutoffMinutes: 15,
          cancellationCutoffMinutes: 60,
        },
      });
      const lateOperationId = randomUUID();
      lateReceiptId = `owner-late-booking:${workspaceId}:${lateOperationId}`;
      const snapshot = {
        schemaVersion: 1,
        mode: "LIVE",
        policyRevisionId: policyId,
        policyVersion: 1,
        policyHash: digest(policy),
        scheduledForDate: "2026-11-02",
        startsAt: "2026-11-02T12:00:00.000Z",
        endsAt: "2026-11-02T13:00:00.000Z",
        timezone: "UTC",
        opensAt: "2026-09-03T12:00:00.000Z",
        closesAt: "2026-11-02T11:45:00.000Z",
        evaluatedAt: now.toISOString(),
        leadOverrideReceiptId: lateReceiptId,
        privatePayload: "SCHEDULING_JSON_PRIVATE",
      };
      bookingId = (
        await db.classBooking.create({
          data: {
            workspaceId,
            memberId: childA,
            classTemplateId: template.id,
            scheduledForDate: new Date("2026-11-02"),
            schedulingPolicySnapshot: snapshot,
          },
        })
      ).id;
      await db.workspaceDataEvent.create({
        data: {
          workspaceId,
          kind: "SCHEDULING_POLICY_APPLIED",
          metadata: { bookingId, fundingRevision: 1, ...snapshot },
        },
      });
      await db.workspaceDataEvent.create({
        data: {
          id: lateReceiptId,
          workspaceId,
          actorUserId: ownerId,
          kind: "OWNER_LATE_BOOKING_CONFIRMED",
          metadata: {
            schemaVersion: 1,
            operationId: lateOperationId,
            inputHash: "d".repeat(64),
            previewHash: "e".repeat(64),
            bookingId,
            fundingRevision: 1,
            memberId: childA,
            classTemplateId: template.id,
            scheduledForDate: snapshot.scheduledForDate,
            policyRevisionId: policyId,
            policyVersion: 1,
            policyHash: digest(policy),
            startsAt: snapshot.startsAt,
            endsAt: snapshot.endsAt,
            timezone: "UTC",
            normalClosesAt: snapshot.closesAt,
            confirmedAt: now.toISOString(),
            overriddenRules: ["BOOKING_CUTOFF", "MINIMUM_LEAD"],
            notificationRecipientCount: 1,
            reason: "OWNER_LATE_REASON_PRIVATE",
            arbitraryPrivate: "LATE_RECEIPT_JSON_PRIVATE",
          },
        },
      });
      roomReceiptId = (
        await db.workspaceDataEvent.create({
          data: {
            workspaceId,
            actorUserId: ownerId,
            kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED",
            metadata: {
              schemaVersion: 1,
              roomId: room.id,
              operationId: randomUUID(),
              inputHash: "a".repeat(64),
              previewHash: "b".repeat(64),
              confirmedVersion: "c".repeat(64),
              revision: 1,
              previousRevision: 0,
              previousCapacity: 20,
              capacity: 15,
              reason: "ROOM_CHANGE_REASON_PRIVATE",
              actorWorkspaceUserId: staff.id,
              actorNameSnapshot: "Archive owner",
              affectedOccurrenceCount: 1,
              reservationCount: 1,
              pendingPaymentCount: 0,
              queuedEntryCount: 2,
              arbitraryPrivate: "ROOM_RECEIPT_JSON_PRIVATE",
            },
          },
        })
      ).id;
      await db.workspaceDataEvent.create({
        data: {
          workspaceId,
          kind: "PRIVATE_UNREVIEWED_KIND",
          metadata: { body: "UNKNOWN_EVENT_PRIVATE" },
        },
      });
      const payment = await db.payment.create({
        data: {
          workspaceId,
          memberId: childA,
          payerAccountId: payerId,
          status: "SUCCEEDED",
          amountCents: 1000,
          currency: "cad",
          paidAt: now,
          stripePaymentIntentId: `pi_${tag}`,
        },
      });
      const receipt = {
        version: 1,
        businessName: "Fictional business",
        description: "Accepted class product",
        providerReference: `pi_${tag}`,
        timezone: "UTC",
        locale: "en-CA",
        privateProvider: "RECEIPT_JSON_PRIVATE",
      };
      receiptId = (
        await db.paymentConfirmation.create({
          data: {
            workspaceId,
            paymentId: payment.id,
            payerAccountId: payerId,
            payerUserId,
            amountMinor: 1000,
            currency: "cad",
            paidAt: now,
            snapshot: receipt,
            snapshotHash: digest(receipt),
          },
        })
      ).id;
      const recordKey = randomUUID();
      const operationBase = {
        workspaceId,
        memberId: childA,
        actorUserId: ownerId,
        actorWorkspaceUserId: staff.id,
        actorNameSnapshot: "Operations owner",
        actorRoleSnapshot: "OWNER",
        inputHash: "f".repeat(64),
      };
      operationalNoteId = (
        await db.memberOperationalRevision.create({
          data: {
            ...operationBase,
            recordKey,
            recordKind: "NOTE",
            version: 1,
            action: "ADD",
            visibility: "ASSIGNED_OPERATIONS",
            noteBody: "OPS_SHARED_ORIGINAL_PRIVATE",
            operationId: randomUUID(),
          },
        })
      ).id;
      await db.memberOperationalRevision.create({
        data: {
          ...operationBase,
          recordKey,
          recordKind: "NOTE",
          version: 2,
          action: "AMEND",
          visibility: "OWNER_ONLY",
          noteBody: "OPS_OWNER_CORRECTION_PRIVATE",
          reason: "OPS_REASON_PRIVATE",
          operationId: randomUUID(),
        },
      });
      await db.memberOperationalRevision.create({
        data: {
          ...operationBase,
          recordKey: randomUUID(),
          recordKind: "TAG",
          version: 1,
          action: "ADD",
          visibility: "ASSIGNED_OPERATIONS",
          tagPurpose: "OPERATIONAL",
          tagLabel: "OPS_SHARED_TAG_PRIVATE",
          operationId: randomUUID(),
        },
      });
      await db.memberOperationalRevision.create({
        data: {
          ...operationBase,
          workspaceId: foreignWorkspaceId,
          memberId: foreignMember.id,
          recordKey: randomUUID(),
          recordKind: "NOTE",
          version: 1,
          action: "ADD",
          visibility: "OWNER_ONLY",
          noteBody: "FOREIGN_OPS_PRIVATE",
          operationId: randomUUID(),
        },
      });
    });
    afterAll(async () => {
      for (const id of workspaces)
        if (await db.workspace.count({ where: { id } }))
          await db.$transaction(
            async (tx) => {
              const inventory = await inspectRetentionInventory(tx, id);
              await deleteReviewedWorkspaceRecords(
                tx,
                id,
                inventory.fingerprint,
              );
            },
            { timeout: 120000 },
          );
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    it("business archive retains new typed records while excluding arbitrary private JSON", async () => {
      const job = await createWorkspaceDataExport(
        actor(),
        "Reviewed business archive",
        options(),
      );
      const result = await downloadWorkspaceDataExport(
        actor(),
        job.id,
        options(),
      );
      const text = gunzipSync(result.bytes).toString("utf8"),
        archive = JSON.parse(text);
      for (const value of [
        "PROFILE_JSON_PRIVATE",
        "POLICY_JSON_PRIVATE",
        "SCHEDULING_JSON_PRIVATE",
        "UNKNOWN_EVENT_PRIVATE",
        "RECEIPT_JSON_PRIVATE",
        "LATE_RECEIPT_JSON_PRIVATE",
        "ROOM_RECEIPT_JSON_PRIVATE",
        "FOREIGN_EMERGENCY_PRIVATE",
        "FOREIGN_OPS_PRIVATE",
      ])
        expect(text).not.toContain(value);
      expect(archive.tables.MemberEmergencyContact).toHaveLength(2);
      expect(archive.tables.MemberOperationalRevision).toHaveLength(3);
      expect(archive.tables.MemberOperationalRevision).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: operationalNoteId,
            noteBody: "OPS_SHARED_ORIGINAL_PRIVATE",
            version: 1,
          }),
          expect.objectContaining({
            noteBody: "OPS_OWNER_CORRECTION_PRIVATE",
            visibility: "OWNER_ONLY",
            version: 2,
            reason: "OPS_REASON_PRIVATE",
          }),
          expect.objectContaining({
            tagLabel: "OPS_SHARED_TAG_PRIVATE",
            tagPurpose: "OPERATIONAL",
            noteBody: null,
          }),
        ]),
      );
      for (const row of archive.tables.MemberOperationalRevision)
        expect(row).not.toHaveProperty("inputHash");
      expect(archive.tables.MemberProfileEvent[0]).toMatchObject({
        id: profileEventId,
        actorNameSnapshot: "STAFF_ACTOR_PRIVATE",
      });
      expect(archive.tables.WorkspaceSchedulingPolicyRevision[0].id).toBe(
        policyId,
      );
      expect(archive.tables.PaymentConfirmation[0]).toMatchObject({
        id: receiptId,
        amountMinor: 1000,
        currency: "cad",
      });
      expect(archive.tables.WorkspaceDataEvent).toHaveLength(3);
      expect(archive.tables.WorkspaceDataEvent).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "SCHEDULING_POLICY_APPLIED",
            metadata: expect.objectContaining({
              bookingId,
              fundingRevision: 1,
            }),
          }),
          expect.objectContaining({
            id: lateReceiptId,
            kind: "OWNER_LATE_BOOKING_CONFIRMED",
            metadata: expect.objectContaining({
              bookingId,
              reason: "OWNER_LATE_REASON_PRIVATE",
              overriddenRules: ["BOOKING_CUTOFF", "MINIMUM_LEAD"],
            }),
          }),
          expect.objectContaining({
            id: roomReceiptId,
            kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED",
            metadata: expect.objectContaining({
              previousCapacity: 20,
              capacity: 15,
              revision: 1,
              reason: "ROOM_CHANGE_REASON_PRIVATE",
              reservationCount: 1,
            }),
          }),
        ]),
      );
      const roomReceipt = archive.tables.WorkspaceDataEvent.find(
        (row: { id: string }) => row.id === roomReceiptId,
      );
      for (const key of [
        "operationId",
        "inputHash",
        "previewHash",
        "confirmedVersion",
        "arbitraryPrivate",
      ])
        expect(roomReceipt.metadata).not.toHaveProperty(key);
    });
    it("child records require separate emergency authority at creation and again at download; payer scope remains financial", async () => {
      const target = { scope: "MEMBER" as const, targetId: childA };
      const job = await createMemberDataExport(
        parent(),
        target,
        randomUUID(),
        options(),
      );
      const download = await downloadMemberDataExport(
        parent(),
        job.id,
        options(),
      );
      const text = gunzipSync(download.bytes).toString("utf8"),
        archive = JSON.parse(text);
      expect(archive.manifest.requiresEmergencyContactAccess).toBe(true);
      expect(archive.tables.MemberEmergencyContact).toEqual([
        expect.objectContaining({ id: contactId, memberId: childA }),
      ]);
      expect(archive.tables.WorkspaceDataEvent[0].metadata.bookingId).toBe(
        bookingId,
      );
      expect(archive.tables.WorkspaceDataEvent).toHaveLength(1);
      expect(
        archive.tables.ClassBooking[0].schedulingPolicySnapshot
          .leadOverrideReceiptId,
      ).toBe(lateReceiptId);
      for (const value of [
        "SIBLING_EMERGENCY_PRIVATE",
        "FOREIGN_EMERGENCY_PRIVATE",
        "STAFF_ACTOR_PRIVATE",
        "STAFF_REASON_PRIVATE",
        "PROFILE_JSON_PRIVATE",
        "SCHEDULING_JSON_PRIVATE",
        "OWNER_LATE_REASON_PRIVATE",
        "LATE_RECEIPT_JSON_PRIVATE",
        "OWNER_LATE_BOOKING_CONFIRMED",
        "ROOM_DEFAULT_CAPACITY_CONFIRMED",
        "ROOM_CHANGE_REASON_PRIVATE",
        "ROOM_RECEIPT_JSON_PRIVATE",
        "OPS_SHARED_ORIGINAL_PRIVATE",
        "OPS_OWNER_CORRECTION_PRIVATE",
        "OPS_REASON_PRIVATE",
        "OPS_SHARED_TAG_PRIVATE",
        "FOREIGN_OPS_PRIVATE",
      ])
        expect(text).not.toContain(value);
      expect(archive.tables).not.toHaveProperty("MemberOperationalRevision");
      await db.memberPortalGrant.update({
        where: { id: grantId },
        data: { canManageEmergencyContacts: false },
      });
      await expect(
        downloadMemberDataExport(parent(), job.id, options()),
      ).rejects.toThrow("unavailable");
      const reduced = await createMemberDataExport(
        parent(),
        target,
        randomUUID(),
        options(),
      );
      const reducedArchive = JSON.parse(
        gunzipSync(
          (await downloadMemberDataExport(parent(), reduced.id, options()))
            .bytes,
        ).toString("utf8"),
      );
      expect(reducedArchive.tables).not.toHaveProperty(
        "MemberEmergencyContact",
      );
      expect(reducedArchive.tables.MemberProfileEvent).toEqual([]);
      const payer = await createMemberDataExport(
        parent(),
        { scope: "PAYER", targetId: payerId },
        randomUUID(),
        options(),
      );
      const payerArchive = JSON.parse(
        gunzipSync(
          (await downloadMemberDataExport(parent(), payer.id, options())).bytes,
        ).toString("utf8"),
      );
      expect(payerArchive.tables.PaymentConfirmation).toEqual([
        expect.objectContaining({ id: receiptId }),
      ]);
      expect(payerArchive.tables).not.toHaveProperty("MemberEmergencyContact");
      expect(payerArchive.tables).not.toHaveProperty("MemberProfileEvent");
      expect(payerArchive.tables).not.toHaveProperty(
        "MemberOperationalRevision",
      );
      for (const value of [
        "OPS_SHARED_ORIGINAL_PRIVATE",
        "OPS_OWNER_CORRECTION_PRIVATE",
        "OPS_SHARED_TAG_PRIVATE",
        "ROOM_DEFAULT_CAPACITY_CONFIRMED",
        "ROOM_CHANGE_REASON_PRIVATE",
        "ROOM_RECEIPT_JSON_PRIVATE",
      ])
        expect(JSON.stringify(payerArchive)).not.toContain(value);
      expect(JSON.stringify(payerArchive)).not.toContain(
        "OWNER_LATE_REASON_PRIVATE",
      );
      expect(JSON.stringify(payerArchive)).not.toContain(
        "OWNER_LATE_BOOKING_CONFIRMED",
      );
    });
    it("history cannot be changed or linked to another child; reviewed removal deletes it and preserves another gym and global identities", async () => {
      await expect(
        db.memberOperationalRevision.update({
          where: { id: operationalNoteId },
          data: { noteBody: "overwrite" },
        }),
      ).rejects.toThrow("immutable");
      const originalOperation =
        await db.memberOperationalRevision.findUniqueOrThrow({
          where: { id: operationalNoteId },
        });
      // Read results include this DB-generated value; clone only insertable fields.
      const { previousVersion, ...insertableOperation } = originalOperation;
      expect(previousVersion).toBeNull();
      await expect(
        db.memberOperationalRevision.create({
          data: {
            ...insertableOperation,
            id: randomUUID(),
            workspaceId: foreignWorkspaceId,
            memberId: childA,
            operationId: randomUUID(),
            recordKey: randomUUID(),
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
      await expect(
        db.memberProfileEvent.update({
          where: { id: profileEventId },
          data: { reason: "overwrite" },
        }),
      ).rejects.toThrow("immutable");
      await expect(
        db.paymentConfirmation.delete({ where: { id: receiptId } }),
      ).rejects.toThrow("immutable");
      await expect(
        db.workspaceDataEvent.update({
          where: { id: lateReceiptId },
          data: { actorUserId: null },
        }),
      ).rejects.toThrow("immutable");
      await expect(
        db.workspaceDataEvent.delete({ where: { id: lateReceiptId } }),
      ).rejects.toThrow("immutable");
      await expect(
        db.workspaceDataEvent.update({
          where: { id: roomReceiptId },
          data: { actorUserId: null },
        }),
      ).rejects.toThrow("immutable");
      await expect(
        db.workspaceDataEvent.delete({ where: { id: roomReceiptId } }),
      ).rejects.toThrow("immutable");
      await expect(
        db.workspaceDataEvent.create({
          data: {
            workspaceId,
            actorUserId: ownerId,
            kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED",
            metadata: {},
          },
        }),
      ).rejects.toThrow();
      await expect(
        db.memberProfileEvent.create({
          data: {
            workspaceId,
            memberId: childB,
            emergencyContactId: contactId,
            actorUserId: ownerId,
            actorWorkspaceUserId: (
              await db.workspaceUser.findFirstOrThrow({
                where: { workspaceId, userId: ownerId },
              })
            ).id,
            actorNameSnapshot: "Owner",
            actorRoleSnapshot: "OWNER",
            operationId: randomUUID(),
            inputHash: "c".repeat(64),
            kind: "EMERGENCY_CONTACT_ADDED",
            profileVersion: 1,
            before: {},
            after: {},
          },
        }),
      ).rejects.toThrow();
      const result = await db.$transaction(
        async (tx) => {
          const inventory = await inspectRetentionInventory(tx, workspaceId);
          return deleteReviewedWorkspaceRecords(
            tx,
            workspaceId,
            inventory.fingerprint,
          );
        },
        { timeout: 120000 },
      );
      expect(result.counts).toMatchObject({
        WorkspaceSchedulingPolicyRevision: 1,
        MemberEmergencyContact: 2,
        MemberProfileEvent: 1,
        PaymentConfirmation: 1,
        MemberOperationalRevision: 3,
      });
      expect(
        await db.memberEmergencyContact.count({
          where: { workspaceId: foreignWorkspaceId },
        }),
      ).toBe(1);
      expect(
        await db.memberOperationalRevision.count({ where: { workspaceId } }),
      ).toBe(0);
      expect(
        await db.memberOperationalRevision.count({
          where: { workspaceId: foreignWorkspaceId },
        }),
      ).toBe(1);
      expect(await db.user.count({ where: { id: { in: users } } })).toBe(2);
      expect(
        await db.workspaceDataEvent.count({ where: { id: lateReceiptId } }),
      ).toBe(0);
      expect(
        await db.workspaceDataEvent.count({ where: { id: roomReceiptId } }),
      ).toBe(0);
    });
  },
);
