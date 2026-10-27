import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@flowstate/db";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
  currentRetentionSchemaFingerprint,
  REVIEWED_RETENTION_SCHEMA,
} from "../../../packages/db/src/retention-inventory";
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
integration(
  "retention authorization, atomic removal and durable receipts",
  () => {
    let api: typeof import("@flowstate/db"), db: PrismaClient;
    let owner: string,
      second: string,
      custodian: string,
      backup: string,
      outsider: string;
    const workspaces: string[] = [],
      users: string[] = [];
    const due = new Date("2027-11-02T12:00:00Z"),
      later = new Date("2027-11-04T12:00:00Z");
    const options = () => ({ db, now: due });
    beforeAll(async () => {
      process.env.DATABASE_URL = databaseUrl;
      api = await import("@flowstate/db");
      db = api.prisma;
    });
    beforeEach(async () => {
      const ids: string[] = [];
      for (const role of [
        "owner",
        "second",
        "custodian",
        "backup",
        "outsider",
      ]) {
        const user = await db.user.create({
          data: {
            email: `retention-${role}-${randomUUID()}@example.test`,
            fullName: role,
          },
        });
        users.push(user.id);
        ids.push(user.id);
      }
      [owner, second, custodian, backup, outsider] = ids as [
        string,
        string,
        string,
        string,
        string,
      ];
    });
    afterAll(async () => {
      if (!db) return;
      for (const workspaceId of workspaces) {
        if (await db.workspace.count({ where: { id: workspaceId } }))
          await db.$transaction(
            async (tx) => {
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
            { timeout: 120000 },
          );
        await db.workspaceRetentionEvent.deleteMany({
          where: { case: { workspaceId } },
        });
        await db.workspaceRetentionCase.deleteMany({ where: { workspaceId } });
      }
      await db.user.deleteMany({ where: { id: { in: users } } });
    });
    async function fixture() {
      const workspace = await db.workspace.create({
        data: { name: "Retention test gym", status: "DISABLED" },
      });
      const workspaceId = workspace.id;
      workspaces.push(workspaceId);
      const ownerRole = await db.workspaceUser.create({
        data: { workspaceId, userId: owner, role: "OWNER", isActive: false },
      });
      await db.workspaceUser.create({
        data: { workspaceId, userId: second, role: "OWNER", isActive: false },
      });
      // A historical inactive owner is deliberately not in the frozen authorization.
      await db.workspaceUser.create({
        data: { workspaceId, userId: outsider, role: "OWNER", isActive: false },
      });
      const member = await db.member.create({
        data: { workspaceId, fullName: "MEMBER_PRIVATE_SENTINEL" },
      });
      const form = await db.formDocument.create({
        data: { workspaceId, name: "Waiver", formType: "WAIVER" },
      });
      const bytes = Buffer.from("EXACT_FORM_PRIVATE_SENTINEL"),
        sha = createHash("sha256").update(bytes).digest("hex");
      await db.staffTimeOff.create({
        data: {
          workspaceId,
          coachWorkspaceUserId: ownerRole.id,
          startsAt: due,
          endsAt: later,
          reason: "LEAVE_PRIVATE_SENTINEL",
          createdByUserId: owner,
        },
      });
      const membershipPlan = await db.membershipPlan.create({
        data: {
          workspaceId,
          name: "Closed source membership",
          monthlyPriceCents: 0,
          currency: "cad",
        },
      });
      const membership = await db.memberMembership.create({
        data: {
          workspaceId,
          memberId: member.id,
          membershipPlanId: membershipPlan.id,
          status: "CANCELLED",
          currentMembershipSlot: null,
          endedAt: due,
        },
      });
      const lifecycle = await db.membershipLifecycleRequest.create({
        data: {
          workspaceId,
          membershipId: membership.id,
          operationKey: randomUUID(),
          inputHash: sha,
          requesterUserId: owner,
          kind: "CANCEL",
          state: "APPLIED",
          activeSlot: null,
          policy: {},
          policyVersion: 1,
          effectiveOn: due,
        },
      });
      await db.sourceMembershipLifecycleEvidence.create({
        data: {
          workspaceId,
          membershipId: membership.id,
          requestId: lifecycle.id,
          operationKey: randomUUID(),
          inputHash: sha,
          sourceSystem: "legacy",
          sourceAccountReference: "account",
          sourceContractReference: "contract",
          sourceReference: "receipt",
          evidenceState: "COMPLETED",
          confirmedAt: due,
          receiptData: bytes,
          receiptHash: sha,
          reviewSnapshot: {},
          recordedByUserId: owner,
        },
      });
      const formVersion = await db.formVersion.create({
        data: {
          workspaceId,
          formDocumentId: form.id,
          versionNumber: 1,
          fileName: "waiver.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: bytes.length,
          fileSha256: sha,
          fileData: bytes,
          uploadedByWorkspaceUserId: ownerRole.id,
        },
      });
      await db.formDocument.update({
        where: { id: form.id },
        data: { currentVersionId: formVersion.id },
      });
      await db.signedDocument.create({
        data: {
          workspaceId,
          memberId: member.id,
          formVersionId: formVersion.id,
          signerKind: "MEMBER",
          signerNameSnapshot: "PRIVATE_SIGNER",
          signatureMethod: "TYPED_NAME",
          signedAt: due,
        },
      });
      const program = await db.coachingProgram.create({
        data: { workspaceId, name: "Private coaching" },
      });
      const version = await db.coachingProgramVersion.create({
        data: {
          programId: program.id,
          number: 1,
          durationDays: 1,
          deliveryWeekdays: [1],
          responseHours: 24,
          goals: "Goal",
          milestones: [],
          priceCents: 0,
          currency: "cad",
          terms: "Terms",
        },
      });
      const enrollment = await db.coachingEnrollment.create({
        data: {
          workspaceId,
          memberId: member.id,
          programVersionId: version.id,
          startsOn: due,
          endsOn: due,
          timezone: "UTC",
          status: "CLOSED",
          closedAt: due,
          retrievalUntil: due,
          caseOwnerWorkspaceUserId: ownerRole.id,
        },
      });
      await db.coachingPrivateNote.create({
        data: {
          enrollmentId: enrollment.id,
          authorWorkspaceUserId: ownerRole.id,
          localDate: due,
          body: "COACH_PRIVATE_SENTINEL",
        },
      });
      const note = await db.coachingDailyNote.create({
        data: {
          enrollmentId: enrollment.id,
          authorWorkspaceUserId: ownerRole.id,
          localDate: due,
          draftBody: "DRAFT_PRIVATE_SENTINEL",
        },
      });
      await db.coachingDailyNoteRevision.create({
        data: {
          noteId: note.id,
          number: 1,
          body: "OLD_PRIVATE_SENTINEL",
          authorWorkspaceUserId: ownerRole.id,
          withdrawnAt: due,
        },
      });
      const source = await db.importJob.create({
        data: { workspaceId, name: "Exact source", status: "COMPLETED" },
      });
      const sourceFile = await db.importSourceFile.create({
        data: {
          workspaceId,
          importJobId: source.id,
          fileName: "source.csv",
          fileSizeBytes: 4,
          fileSha256: sha,
          rawContent: "SOURCE_PRIVATE_SENTINEL",
        },
      });
      const money = {
        workspaceId,
        sourceSystem: "legacy",
        sourceAccountReference: "source",
        sourceRecordKind: "PAYMENT",
        sourceExternalId: randomUUID(),
        sourceStatus: "paid",
        billingOwner: "SOURCE",
        refundOwner: "SOURCE",
        payerMemberId: member.id,
        beneficiaryMemberId: member.id,
        payerAuthorityEvidence: "receipt",
        sourceEvidence: "receipt",
        sourceFileHash: sha,
        sourceRowHash: sha,
        sourceSnapshot: {},
        amountCents: 100,
        paidCents: 100,
        currency: "cad",
        occurredAt: due,
        importJobId: source.id,
        stagingRecordId: "test",
        actorId: owner,
      };
      const payment = await db.importedFinancialEvidence.create({
        data: money,
      });
      await db.importedFinancialEvidence.create({
        data: {
          ...money,
          sourceRecordKind: "REFUND",
          sourceExternalId: randomUUID(),
          parentEvidenceId: payment.id,
        },
      });
      const exportJob = await db.workspaceDataExport.create({
        data: {
          workspaceId,
          requestedByUserId: owner,
          purpose: "Verified archive",
          state: "EXPIRED",
          sha256: sha,
          expiresAt: due,
          downloadedAt: due,
          receiptConfirmedAt: due,
          receiptConfirmedByUserId: owner,
        },
      });
      const plan = await db.workspaceOffboarding.create({
        data: {
          workspaceId,
          requestedByUserId: owner,
          accessEndsAt: new Date("2027-10-01T00:00:00Z"),
          retentionUntil: due,
          retentionReason: "Agreed record classes",
          recordsContact: "Named custodian",
          exportJobId: exportJob.id,
          accessRevokedAt: new Date("2027-10-01T00:00:00Z"),
          state: "ACCESS_REVOKED",
        },
      });
      await db.workspaceDataEvent.create({
        data: {
          workspaceId,
          actorUserId: owner,
          kind: "WORKSPACE_ACCESS_REVOKED",
          metadata: {
            planId: plan.id,
            version: plan.version,
            approvedOwnerUserIds: [owner, second].sort(),
          },
        },
      });
      const input = {
        workspaceId,
        expectedVersion: 0,
        custodianUserId: custodian,
        backupCustodianUserId: backup,
        retentionAt: due.toISOString(),
        backupDeletionAfter: later.toISOString(),
        retentionBasis: "Owner-approved retention period for all gym records",
      };
      const saved = await api.saveWorkspaceRetentionCase(
        owner,
        input,
        options(),
      );
      return {
        workspaceId,
        caseId: saved.id,
        version: saved.version,
        input,
        memberId: member.id,
        formVersionId: formVersion.id,
        formDocumentId: form.id,
        sourceFileId: sourceFile.id,
        enrollmentId: enrollment.id,
      };
    }
    async function approve(f: Awaited<ReturnType<typeof fixture>>) {
      await api.approveWorkspaceRetentionCase(
        owner,
        f.caseId,
        f.version,
        options(),
      );
      await api.approveWorkspaceRetentionCase(
        second,
        f.caseId,
        f.version,
        options(),
      );
    }
    async function otherGym() {
      const workspace = await db.workspace.create({
        data: { name: "Unrelated retention test gym", status: "ACTIVE" },
      });
      workspaces.push(workspace.id);
      const member = await db.member.create({
        data: { workspaceId: workspace.id, fullName: "Other gym member" },
      });
      return { workspaceId: workspace.id, memberId: member.id };
    }
    async function execute(
      f: Awaited<ReturnType<typeof fixture>>,
      inventoryHash?: string,
    ) {
      const preview = await api.getWorkspaceRetentionCase(
        custodian,
        f.caseId,
        options(),
      );
      return api.executeWorkspaceRetention(
        custodian,
        f.caseId,
        f.version,
        {
          confirmedWorkspaceId: f.workspaceId,
          inventoryHash: inventoryHash ?? preview.inventory!.fingerprint,
        },
        options(),
      );
    }
    it("requires exact frozen owners, all approvals, the retention date and the named executor", async () => {
      const f = await fixture();
      expect(currentRetentionSchemaFingerprint()).toBe(
        REVIEWED_RETENTION_SCHEMA,
      );
      await expect(
        api.getWorkspaceRetentionCase(outsider, f.caseId, options()),
      ).rejects.toThrow("unavailable");
      await expect(
        api.saveWorkspaceRetentionCase(
          outsider,
          { ...f.input, expectedVersion: 1 },
          options(),
        ),
      ).rejects.toThrow("authorized owner");
      await api.approveWorkspaceRetentionCase(owner, f.caseId, 1, options());
      await expect(execute(f)).rejects.toThrow("Every named owner");
      await api.approveWorkspaceRetentionCase(second, f.caseId, 1, options());
      const preview = await api.getWorkspaceRetentionCase(
        custodian,
        f.caseId,
        options(),
      );
      expect(preview.blockers).toEqual([]);
      expect(JSON.stringify(preview.inventory)).not.toContain(
        "PRIVATE_SENTINEL",
      );
      const input = {
        confirmedWorkspaceId: f.workspaceId,
        inventoryHash: preview.inventory!.fingerprint,
      };
      await expect(
        api.executeWorkspaceRetention(owner, f.caseId, 1, input, options()),
      ).rejects.toThrow("named records custodian");
      await expect(
        api.executeWorkspaceRetention(custodian, f.caseId, 1, input, {
          db,
          now: new Date(+due - 1),
        }),
      ).rejects.toThrow("retention period");
      expect(await db.workspace.count({ where: { id: f.workspaceId } })).toBe(
        1,
      );
    });
    it("invalidates approvals after a hold or revised custodian and rejects stale versions", async () => {
      const f = await fixture();
      await approve(f);
      await api.holdWorkspaceRetentionCase(
        second,
        f.caseId,
        1,
        "Resolve a records request",
        options(),
      );
      await expect(execute(f)).rejects.toThrow("retention hold");
      await expect(
        api.saveWorkspaceRetentionCase(
          owner,
          { ...f.input, expectedVersion: 1 },
          options(),
        ),
      ).rejects.toThrow("resolving the existing hold");
      const next = await api.saveWorkspaceRetentionCase(
        owner,
        {
          ...f.input,
          expectedVersion: 1,
          custodianUserId: backup,
          holdResolutionEvidence: "Resolved request receipt 142",
        },
        options(),
      );
      expect(next.version).toBe(2);
      await expect(
        api.getWorkspaceRetentionCase(custodian, f.caseId, options()),
      ).rejects.toThrow("unavailable");
      await expect(
        api.approveWorkspaceRetentionCase(owner, f.caseId, 1, options()),
      ).rejects.toThrow("changed");
      const preview = await api.getWorkspaceRetentionCase(
        backup,
        f.caseId,
        options(),
      );
      expect(preview.blockers).toContain(
        "Every named owner must approve this case version.",
      );
    });
    it("rejects changed previews and cross-gym relationships without partial removal", async () => {
      const f = await fixture();
      await approve(f);
      const before = await api.getWorkspaceRetentionCase(
        custodian,
        f.caseId,
        options(),
      );
      await db.member.create({
        data: {
          workspaceId: f.workspaceId,
          fullName: "New record after preview",
        },
      });
      await expect(execute(f, before.inventory!.fingerprint)).rejects.toThrow(
        "changed after preview",
      );
      const other = await otherGym();
      await db.formDocument.update({
        where: { id: f.formDocumentId },
        data: { currentVersionId: null },
      });
      // A mutable legacy draft pointer can deliberately expose a cross-gym FK
      // without deleting or rewriting immutable signature evidence in cleanup.
      const foreign = await db.formDocument.create({
        data: {
          workspaceId: other.workspaceId,
          name: "Foreign draft reference",
          formType: "WAIVER",
          currentVersionId: f.formVersionId,
        },
      });
      try {
        await expect(
          api.executeWorkspaceRetention(
            custodian,
            f.caseId,
            1,
            {
              confirmedWorkspaceId: f.workspaceId,
              inventoryHash: before.inventory!.fingerprint,
            },
            options(),
          ),
        ).rejects.toThrow("Another gym references");
        expect(
          await db.formVersion.count({ where: { id: f.formVersionId } }),
        ).toBe(1);
        expect(await db.formDocument.count({ where: { id: foreign.id } })).toBe(
          1,
        );
      } finally {
        await db.formDocument.update({
          where: { id: foreign.id },
          data: { currentVersionId: null },
        });
        await db.formDocument.delete({ where: { id: foreign.id } });
        await db.formDocument.update({
          where: { id: f.formDocumentId },
          data: { currentVersionId: f.formVersionId },
        });
      }
    });
    it("fails closed on an unreviewed database table inside a rolled-back transaction", async () => {
      const f = await fixture();
      await expect(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `CREATE TABLE "retention_probe_${randomUUID().replaceAll("-", "")}" (id text)`,
          );
          await inspectRetentionInventory(tx, f.workspaceId);
        }),
      ).rejects.toThrow("tables or columns differ");
      expect(await db.workspace.count({ where: { id: f.workspaceId } })).toBe(
        1,
      );
    });
    it("preserves external storage references until the exact inventory has a completed removal receipt", async () => {
      const f = await fixture();
      await approve(f);
      await db.importSourceFile.update({
        where: { id: f.sourceFileId },
        data: { storageKey: "private/source/object-1" },
      });
      await expect(execute(f)).rejects.toThrow("exact external files");
      const preview = await api.getWorkspaceRetentionCase(
        custodian,
        f.caseId,
        options(),
      );
      await expect(
        api.recordExternalFileRemoval(
          custodian,
          f.caseId,
          1,
          { inventoryHash: "wrong", evidenceReference: "storage receipt" },
          options(),
        ),
      ).rejects.toThrow("inventory changed");
      await api.recordExternalFileRemoval(
        custodian,
        f.caseId,
        1,
        {
          inventoryHash: preview.external!.fingerprint,
          evidenceReference: "Provider receipt: object-1 permanently removed",
        },
        options(),
      );
      const result = await execute(f);
      expect(result).toMatchObject({
        externalFileCount: 1,
        backups: "PENDING_SEPARATE_RECEIPT",
      });
    });
    it("retries rolled-back removals without duplicating their receipt and does not retry other errors", async () => {
      const f = await fixture();
      await approve(f);
      const preview = await api.getWorkspaceRetentionCase(
        custodian,
        f.caseId,
        options(),
      );
      const input = {
        confirmedWorkspaceId: f.workspaceId,
        inventoryHash: preview.inventory!.fingerprint,
      };
      let attempts = 0,
        rollbacks = 0;
      const conflict = new Prisma.PrismaClientKnownRequestError(
        "Injected commit-time serialization conflict",
        { code: "P2034", clientVersion: Prisma.prismaVersion.client },
      );
      const retryDb = new Proxy(db, {
        get(target, property, receiver) {
          if (property !== "$transaction")
            return Reflect.get(target, property, receiver);
          return async (
            work: (tx: Prisma.TransactionClient) => Promise<unknown>,
            transactionOptions: {
              isolationLevel?: Prisma.TransactionIsolationLevel;
              timeout?: number;
              maxWait?: number;
            },
          ) => {
            attempts++;
            expect(transactionOptions.isolationLevel).toBe("Serializable");
            try {
              return await target.$transaction(async (tx) => {
                const result = await work(tx);
                // Count real serialization conflicts toward this exercise's
                // seven failed attempts, while forcing at least one rollback
                // after every removal write has completed.
                if (attempts <= 7 || rollbacks === 0) throw conflict;
                return result;
              }, transactionOptions);
            } catch (error) {
              if (error === conflict) {
                rollbacks++;
                expect(
                  await db.workspace.count({ where: { id: f.workspaceId } }),
                ).toBe(1);
                const unchanged =
                  await db.workspaceRetentionCase.findUniqueOrThrow({
                    where: { id: f.caseId },
                  });
                expect(unchanged.executedAt).toBeNull();
                expect(unchanged.receipt).toBeNull();
                expect(
                  await db.workspaceRetentionEvent.count({
                    where: { caseId: f.caseId, kind: "DATABASE_REMOVED" },
                  }),
                ).toBe(0);
              }
              throw error;
            }
          };
        },
      });
      const receipt = await api.executeWorkspaceRetention(
        custodian,
        f.caseId,
        1,
        input,
        { db: retryDb, now: due },
      );
      expect(rollbacks).toBeGreaterThanOrEqual(1);
      expect(rollbacks).toBeLessThanOrEqual(7);
      // Natural conflicts and deliberate rollbacks share the bounded budget.
      expect(attempts).toBeGreaterThanOrEqual(8);
      expect(attempts).toBeLessThanOrEqual(12);
      expect(await db.workspace.count({ where: { id: f.workspaceId } })).toBe(
        0,
      );
      const saved = await db.workspaceRetentionCase.findUniqueOrThrow({
        where: { id: f.caseId },
      });
      expect(saved.receipt).toEqual(receipt);
      expect(saved.executedAt).toEqual(due);
      expect(
        await api.executeWorkspaceRetention(
          custodian,
          f.caseId,
          1,
          input,
          options(),
        ),
      ).toEqual(receipt);
      expect(
        await db.workspaceRetentionEvent.count({
          where: { caseId: f.caseId, kind: "DATABASE_REMOVED" },
        }),
      ).toBe(1);
      let otherAttempts = 0;
      const otherError = new Prisma.PrismaClientKnownRequestError(
        "Non-serialization failure",
        { code: "P2028", clientVersion: Prisma.prismaVersion.client },
      );
      const failureDb = new Proxy(db, {
        get(target, property, receiver) {
          if (property !== "$transaction")
            return Reflect.get(target, property, receiver);
          return async (
            work: (tx: Prisma.TransactionClient) => Promise<unknown>,
            transactionOptions: {
              isolationLevel?: Prisma.TransactionIsolationLevel;
              timeout?: number;
              maxWait?: number;
            },
          ) => {
            otherAttempts++;
            return target.$transaction(async (tx) => {
              await work(tx);
              throw otherError;
            }, transactionOptions);
          };
        },
      });
      await expect(
        api.executeWorkspaceRetention(custodian, f.caseId, 1, input, {
          db: failureDb,
          now: due,
        }),
      ).rejects.toBe(otherError);
      expect(otherAttempts).toBe(1);
      expect(
        (
          await db.workspaceRetentionCase.findUniqueOrThrow({
            where: { id: f.caseId },
          })
        ).receipt,
      ).toEqual(receipt);
      expect(
        await db.workspaceRetentionEvent.count({
          where: { caseId: f.caseId, kind: "DATABASE_REMOVED" },
        }),
      ).toBe(1);
    });
    it("serializes duplicate removal requests and a simultaneous retention hold", async () => {
      const f = await fixture();
      await approve(f);
      const preview = await api.getWorkspaceRetentionCase(
        custodian,
        f.caseId,
        options(),
      );
      const input = {
        confirmedWorkspaceId: f.workspaceId,
        inventoryHash: preview.inventory!.fingerprint,
      };
      const [first, repeated] = await Promise.all([
        api.executeWorkspaceRetention(custodian, f.caseId, 1, input, options()),
        api.executeWorkspaceRetention(custodian, f.caseId, 1, input, options()),
      ]);
      expect(first).toEqual(repeated);
      expect(
        await db.workspaceRetentionEvent.count({
          where: { caseId: f.caseId, kind: "DATABASE_REMOVED" },
        }),
      ).toBe(1);
      const next = await fixture();
      await approve(next);
      const nextPreview = await api.getWorkspaceRetentionCase(
        custodian,
        next.caseId,
        options(),
      );
      const results = await Promise.allSettled([
        api.holdWorkspaceRetentionCase(
          second,
          next.caseId,
          1,
          "New records request",
          options(),
        ),
        api.executeWorkspaceRetention(
          custodian,
          next.caseId,
          1,
          {
            confirmedWorkspaceId: next.workspaceId,
            inventoryHash: nextPreview.inventory!.fingerprint,
          },
          options(),
        ),
      ]);
      const record = await db.workspaceRetentionCase.findUniqueOrThrow({
        where: { id: next.caseId },
      });
      if (record.executedAt) {
        expect(results[0].status).toBe("rejected");
        expect(results[1].status).toBe("fulfilled");
        expect(record.holdReason).toBeNull();
      } else {
        expect(results[0].status).toBe("fulfilled");
        expect(results[1].status).toBe("rejected");
        expect(record.state).toBe("HELD");
        expect(
          await db.workspace.count({ where: { id: next.workspaceId } }),
        ).toBe(1);
      }
    });
    it("removes owned files and indirect records atomically, preserves other gyms and global login, and replays the same receipt", async () => {
      const f = await fixture(),
        other = await otherGym();
      await approve(f);
      const session = await db.authSession.create({
        data: { userId: owner, tokenHash: randomUUID(), expiresAt: later },
      });
      const recovery = await db.passwordResetChallenge.create({
        data: {
          userId: owner,
          tokenHash: randomUUID(),
          emailHash: randomUUID(),
          portal: "admin",
          expiresAt: later,
          delivery: {
            create: {
              recipientEmail: "recovery@example.test",
              body: "RECOVERY_PRIVATE_SENTINEL",
              status: "CANCELLED",
              expiresAt: later,
            },
          },
        },
        include: { delivery: true },
      });
      const security = await db.accountSecurityEvent.create({
        data: {
          userId: owner,
          kind: "FICTIONAL_RETENTION_PROOF",
          portal: "admin",
        },
      });
      const authBucket = await db.publicAuthThrottleBucket.create({
        data: {
          keyHash: createHash("sha256").update(randomUUID()).digest("hex"),
          attempts: 1,
          windowEndsAt: later,
          expiresAt: later,
        },
      });
      await db.workspaceSetting.create({
        data: {
          workspaceId: f.workspaceId,
          contactEmail: "BUSINESS_PRIVATE_SENTINEL@example.test",
          currency: "cad",
          locale: "en-CA",
          identityVersion: 1,
        },
      });
      await db.workspaceTimezoneRevision.create({
        data: {
          workspaceId: f.workspaceId,
          version: 1,
          previousTimezone: "UTC",
          timezone: "America/Vancouver",
          effectiveFromDate: due,
          effectiveAt: due,
          actorUserId: owner,
          previewHash: createHash("sha256")
            .update("reviewed timezone fixture")
            .digest("hex"),
        },
      });
      const operation = await db.attendanceOperation.create({
        data: {
          workspaceId: f.workspaceId,
          requestKey: randomUUID(),
          payloadHash: createHash("sha256")
            .update("reviewed attendance fixture")
            .digest("hex"),
          action: "RECORD",
          actorWorkspaceUserId: "historical-staff-id",
          result: { private: "ROSTER_PRIVATE_SENTINEL" },
        },
      });
      await db.attendanceEvent.create({
        data: {
          workspaceId: f.workspaceId,
          operationId: operation.id,
          attendanceRecordId: "historical-attendance-id",
          bookingId: "historical-booking-id",
          memberId: f.memberId,
          classTemplateId: "historical-class-id",
          scheduledForDate: due,
          actorWorkspaceUserId: "historical-staff-id",
          actorNameSnapshot: "Historical coach",
          actorRole: "COACH",
          previousState: "NO_SHOW",
          state: "PRESENT",
          reason: "CORRECTION_PRIVATE_SENTINEL",
          occurrenceTimezone: "UTC",
          noShowCutoffAt: due,
        },
      });
      const payment = await db.payment.create({
        data: {
          workspaceId: f.workspaceId,
          memberId: f.memberId,
          status: "SUCCEEDED",
          amountCents: 1000,
          currency: "cad",
        },
      });
      const dispute = await db.paymentDispute.create({
        data: {
          workspaceId: f.workspaceId,
          providerAccountId: `acct-${randomUUID()}`,
          livemode: false,
          providerDisputeId: `dp-${randomUUID()}`,
          chargeId: "ch-fixture",
          paymentId: payment.id,
          providerStatus: "won",
          reason: "fraudulent",
          amountCents: 1000,
          currency: "cad",
          chargeAmountCents: 1000,
          isChargeRefundable: true,
          evidence: { private: "DISPUTE_PRIVATE_SENTINEL" },
          evidenceHash: "a".repeat(64),
          accessState: "RELEASED",
          moneyState: "WON",
          resolvedAt: due,
        },
      });
      await db.paymentDisputeAllocation.create({
        data: {
          workspaceId: f.workspaceId,
          disputeId: dispute.id,
          paymentId: payment.id,
          fundedAmountCents: 1000,
        },
      });
      const disputeEvent = await db.paymentDisputeEvent.create({
        data: {
          workspaceId: f.workspaceId,
          disputeId: dispute.id,
          requestKey: randomUUID(),
          payloadHash: "b".repeat(64),
          kind: "PROVIDER_VERIFIED",
          actorUserId: owner,
          before: {},
          after: { status: "won" },
        },
      });
      await db.financialEntitlementHold.create({
        data: {
          workspaceId: f.workspaceId,
          disputeId: dispute.id,
          targetKind: "PUNCH_CARD",
          targetId: "historical-pack-id",
          activeSlot: null,
          releasedAt: due,
        },
      });
      await expect(
        db.$executeRaw`DELETE FROM payment_dispute_events WHERE id = ${disputeEvent.id}`,
      ).rejects.toThrow("immutable");
      const setup = await db.workspaceSetup.create({
        data: {
          workspaceId: f.workspaceId,
          ownerUserId: owner,
          serviceMode: "COACHING",
          version: 2,
          verificationHash: createHash("sha256")
            .update(randomUUID())
            .digest("hex"),
        },
      });
      await db.workspaceSetupActivation.create({
        data: {
          workspaceId: f.workspaceId,
          setupId: setup.id,
          ownerUserId: owner,
          setupVersion: 2,
          serviceMode: "COACHING",
          verifiedEmailHash: "d".repeat(64),
          ownerVerifiedAt: due,
          acceptedAt: due,
          activatedAt: due,
          snapshotHash: "e".repeat(64),
          snapshot: { private: "SETUP_PRIVATE_SENTINEL" },
        },
      });
      const preview = await api.getWorkspaceRetentionCase(
        custodian,
        f.caseId,
        options(),
      );
      const receipt = await execute(f);
      expect(receipt).toMatchObject({
        counts: {
          CoachingPrivateNote: 1,
          CoachingDailyNoteRevision: 1,
          FormVersion: 1,
          ImportedFinancialEvidence: 2,
          StaffTimeOff: 1,
          SourceMembershipLifecycleEvidence: 1,
          WorkspaceSetting: 1,
          WorkspaceTimezoneRevision: 1,
          AttendanceOperation: 1,
          AttendanceEvent: 1,
          PaymentDispute: 1,
          PaymentDisputeAllocation: 1,
          PaymentDisputeEvent: 1,
          FinancialEntitlementHold: 1,
          WorkspaceSetup: 1,
          WorkspaceSetupActivation: 1,
        },
        schemaHash: REVIEWED_RETENTION_SCHEMA,
      });
      expect(JSON.stringify(receipt)).not.toContain("PRIVATE_SENTINEL");
      expect(await db.workspace.count({ where: { id: f.workspaceId } })).toBe(
        0,
      );
      expect(
        await db.workspace.count({ where: { id: other.workspaceId } }),
      ).toBe(1);
      expect(await db.authSession.count({ where: { id: session.id } })).toBe(1);
      expect(await db.user.count({ where: { id: owner } })).toBe(1);
      expect(
        await db.publicAuthThrottleBucket.count({
          where: { keyHash: authBucket.keyHash },
        }),
      ).toBe(1);
      await db.publicAuthThrottleBucket.delete({
        where: { keyHash: authBucket.keyHash },
      });
      expect(
        await db.passwordResetChallenge.count({ where: { id: recovery.id } }),
      ).toBe(1);
      expect(
        await db.authRecoveryDelivery.count({
          where: { id: recovery.delivery!.id },
        }),
      ).toBe(1);
      expect(
        await db.accountSecurityEvent.count({ where: { id: security.id } }),
      ).toBe(1);
      expect(
        await db.workspaceSetting.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(0);
      expect(JSON.stringify(preview.inventory)).not.toContain(
        "RECOVERY_PRIVATE_SENTINEL",
      );
      expect(JSON.stringify(receipt)).not.toContain(
        "RECOVERY_PRIVATE_SENTINEL",
      );
      expect(
        await api.executeWorkspaceRetention(
          custodian,
          f.caseId,
          1,
          {
            confirmedWorkspaceId: f.workspaceId,
            inventoryHash: preview.inventory!.fingerprint,
          },
          options(),
        ),
      ).toEqual(receipt);
      expect(
        (await api.getWorkspaceRetentionCase(owner, f.caseId, options())).record
          .state,
      ).toBe("BACKUPS_PENDING");
      await expect(
        api.recordWorkspaceBackupRemoval(
          backup,
          f.caseId,
          1,
          {
            confirmedWorkspaceId: f.workspaceId,
            evidenceReference: "not complete",
            removedAt: due.toISOString(),
          },
          options(),
        ),
      ).rejects.toThrow("agreed backup date");
      await expect(
        api.recordWorkspaceBackupRemoval(
          custodian,
          f.caseId,
          1,
          {
            confirmedWorkspaceId: f.workspaceId,
            evidenceReference: "receipt",
            removedAt: later.toISOString(),
          },
          { db, now: later },
        ),
      ).rejects.toThrow("named backup custodian");
      const backupReceipt = await api.recordWorkspaceBackupRemoval(
        backup,
        f.caseId,
        1,
        {
          confirmedWorkspaceId: f.workspaceId,
          evidenceReference: "Provider receipt covering exact gym backups",
          removedAt: later.toISOString(),
        },
        { db, now: later },
      );
      expect(backupReceipt).toMatchObject({
        method: "NAMED_CUSTODIAN_ATTESTATION",
      });
      expect(
        (
          await api.getWorkspaceRetentionCase(owner, f.caseId, {
            db,
            now: later,
          })
        ).record.state,
      ).toBe("COMPLETE");
      expect(
        await db.workspaceRetentionEvent.count({
          where: { caseId: f.caseId, kind: "DATABASE_REMOVED" },
        }),
      ).toBe(1);
    });
  },
  120000,
);
