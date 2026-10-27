import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  buildRequiredFormsMemberFilterTx,
  summarizeRequiredFormsForMembersTx,
  lockClassSchedule,
} from "@flowstate/db";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../../packages/db/src/retention-inventory.js";
const url = process.env.TEST_DATABASE_URL;
if (
  url &&
  (!/test|e2e/i.test(new URL(url).pathname) ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
)
  throw new Error(
    "Forms summary regression requires a dedicated loopback test database.",
  );
(url ? describe : describe.skip)(
  "WF07 null-safe member signer filters in PostgreSQL",
  () => {
    const db = new PrismaClient({ datasourceUrl: url });
    const workspaces: string[] = [],
      users: string[] = [];
    const now = new Date("2030-02-01T12:00:00Z");
    afterAll(async () => {
      for (const workspaceId of workspaces)
        await db.$transaction(
          async (tx) => {
            await lockClassSchedule(tx, workspaceId);
            const inventory = await inspectRetentionInventory(tx, workspaceId);
            await deleteReviewedWorkspaceRecords(
              tx,
              workspaceId,
              inventory.fingerprint,
            );
          },
          { timeout: 120000 },
        );
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    }, 120000);
    it("agrees with canonical summaries for unknown DOB/account/family combinations and retains known minor/adult signer requirements", async () => {
      const owner = await db.user.create({
        data: { email: `${randomUUID()}-owner@example.test` },
      });
      const account = await db.user.create({
        data: { email: `${randomUUID()}-member@example.test` },
      });
      users.push(owner.id, account.id);
      const workspace = await db.workspace.create({
        data: {
          name: "Fictional null-DOB form proof",
          status: "ACTIVE",
          workspaceUsers: { create: { userId: owner.id, role: "OWNER" } },
        },
        include: { workspaceUsers: true },
      });
      workspaces.push(workspace.id);
      const actor = { workspaceId: workspace.id, userId: owner.id };
      const guardian = await db.guardian.create({
        data: { workspaceId: workspace.id, fullName: "Fictional guardian" },
      });
      async function member(
        label: string,
        dob: Date | null,
        hasAccount: boolean,
        family: boolean,
      ) {
        return db.member.create({
          data: {
            workspaceId: workspace.id,
            fullName: label,
            status: "ACTIVE",
            dateOfBirth: dob,
            ...(hasAccount ? { userId: account.id } : {}),
            ...(family
              ? {
                  familyLinks: {
                    create: {
                      workspaceId: workspace.id,
                      guardianId: guardian.id,
                    },
                  },
                }
              : {}),
          },
        });
      }
      const unknownMissing = await member(
        "A unknown no-account no-family missing",
        null,
        false,
        false,
      );
      const unknownSigned = await member(
        "B unknown no-account no-family signed",
        null,
        false,
        false,
      );
      const accountMissing = await member(
        "C unknown account and family missing",
        null,
        true,
        true,
      );
      const guardianSigned = await member(
        "D unknown no-account family signed",
        null,
        false,
        true,
      );
      const minorWrong = await member(
        "E known minor wrong member proof",
        new Date("2015-01-01Z"),
        false,
        true,
      );
      const adultWrong = await member(
        "F known adult wrong guardian proof",
        new Date("1990-01-01Z"),
        false,
        true,
      );
      const rows = [
        unknownMissing,
        unknownSigned,
        accountMissing,
        guardianSigned,
        minorWrong,
        adultWrong,
      ];
      const document = await db.formDocument.create({
        data: {
          workspaceId: workspace.id,
          name: "Fictional required form",
          formType: "WAIVER",
        },
      });
      const bytes = Buffer.from("%PDF-1.7\n%%EOF\n");
      const version = await db.formVersion.create({
        data: {
          workspaceId: workspace.id,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: "fictional.pdf",
          mimeType: "application/pdf",
          fileData: bytes,
          fileSizeBytes: bytes.length,
          fileSha256: createHash("sha256").update(bytes).digest("hex"),
          uploadedByWorkspaceUserId: workspace.workspaceUsers[0]!.id,
        },
      });
      await db.formDocument.update({
        where: { id: document.id },
        data: { currentVersionId: version.id },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId: workspace.id,
          formDocumentId: document.id,
          requirementTarget: "MEMBER",
        },
      });
      async function proof(
        memberId: string,
        signerKind: "MEMBER" | "GUARDIAN",
      ) {
        await db.signedDocument.create({
          data: {
            workspaceId: workspace.id,
            memberId,
            formVersionId: version.id,
            signerKind,
            signerNameSnapshot: "Fictional signer",
            signatureMethod: "TEST",
            signedAt: new Date(+now - 1000),
            ...(signerKind === "GUARDIAN" ? { guardianId: guardian.id } : {}),
          },
        });
      }
      await proof(unknownSigned.id, "MEMBER");
      await proof(guardianSigned.id, "GUARDIAN");
      await proof(minorWrong.id, "MEMBER");
      await proof(adultWrong.id, "GUARDIAN");
      const expectedMissing = [
        unknownMissing.id,
        accountMissing.id,
        minorWrong.id,
        adultWrong.id,
      ].sort();
      const expectedComplete = [unknownSigned.id, guardianSigned.id].sort();
      const result = await db.$transaction(async (tx) => {
        const missing = await buildRequiredFormsMemberFilterTx({
          db: tx,
          actor,
          state: "ACTION_REQUIRED",
          now,
        });
        const complete = await buildRequiredFormsMemberFilterTx({
          db: tx,
          actor,
          state: "COMPLETE",
          now,
        });
        const summary = await summarizeRequiredFormsForMembersTx({
          db: tx,
          actor,
          memberIds: rows.map((row) => row.id),
          now,
        });
        return {
          missing: (
            await tx.member.findMany({
              where: missing,
              select: { id: true },
              orderBy: { id: "asc" },
            })
          ).map((row) => row.id),
          complete: (
            await tx.member.findMany({
              where: complete,
              select: { id: true },
              orderBy: { id: "asc" },
            })
          ).map((row) => row.id),
          summaryMissing: rows
            .filter((row) => summary.get(row.id)?.state === "ACTION_REQUIRED")
            .map((row) => row.id)
            .sort(),
          missingCount: await tx.member.count({ where: missing }),
          firstMissing: (
            await tx.member.findMany({
              where: missing,
              orderBy: { fullName: "asc" },
              take: 1,
              select: { id: true },
            })
          ).map((row) => row.id),
        };
      });
      expect(result.summaryMissing).toEqual(expectedMissing);
      expect(result.missing).toEqual(expectedMissing);
      expect(result.complete).toEqual(expectedComplete);
      expect(result.missingCount).toBe(4);
      expect(result.firstMissing).toEqual([unknownMissing.id]);
    });
  },
);
