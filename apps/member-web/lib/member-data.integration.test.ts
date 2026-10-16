import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  PrismaClient,
  createMemberDataExport,
  downloadMemberDataExport,
  confirmMemberDataExportReceipt,
  listMemberDataExports,
  getMemberDataOptions,
  expireMemberDataExports,
  snapshotMembershipTerms,
  type MemberDataActor,
  Prisma,
} from "@flowstate/db";

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "individual and payer archives in PostgreSQL",
  () => {
    const db = new PrismaClient({ datasources: { db: { url } } });
    const now = new Date("2026-11-01T12:00:00Z"),
      tag = randomUUID(),
      sha = (bytes: Uint8Array) =>
        createHash("sha256").update(bytes).digest("hex");
    const originalPdf = Buffer.from("%PDF-1.4\noriginal signed waiver\n%%EOF"),
      receiptBytes = Buffer.from(
        "Exact imported signature receipt for child A",
      );
    let workspaceId: string,
      foreignWorkspaceId: string,
      parentId: string,
      otherId: string,
      ownerId: string,
      staffId: string,
      coachId: string,
      childA: string,
      childB: string,
      foreignMember: string,
      payerId: string,
      otherPayerId: string,
      grantId: string,
      formVersionId: string,
      signedId: string,
      bookingId: string;
    let parent: MemberDataActor, owner: MemberDataActor;
    const userIds: string[] = [];
    beforeAll(async () => {
      const gym = await db.workspace.create({
        data: { name: "Scoped archive gym", status: "ACTIVE" },
      });
      workspaceId = gym.id;
      foreignWorkspaceId = (
        await db.workspace.create({
          data: { name: "Foreign gym", status: "ACTIVE" },
        })
      ).id;
      const createPerson = async (
        name: string,
        role: "CUSTOMER" | "OWNER" | "COACH",
      ) => {
        const user = await db.user.create({
          data: {
            email: `${tag}-${name}@example.test`,
            fullName: name,
            passwordHash: "PASSWORD_SECRET_SENTINEL",
            workspaceUsers: { create: { workspaceId, role } },
          },
        });
        userIds.push(user.id);
        const member = await db.member.create({
          data: {
            workspaceId,
            userId: user.id,
            fullName: name,
            email: user.email,
            dateOfBirth: new Date("1990-01-01"),
            notes: "INTERNAL_MEMBER_SECRET",
          },
        });
        return { user, member };
      };
      const p = await createPerson("Verified parent", "CUSTOMER"),
        q = await createPerson("Other payer", "CUSTOMER"),
        o = await createPerson("Named records resolver", "OWNER"),
        c = await createPerson("Coach", "COACH");
      parentId = p.member.id;
      otherId = q.user.id;
      ownerId = o.user.id;
      coachId = c.user.id;
      parent = { workspaceId, userId: p.user.id };
      owner = { workspaceId, userId: ownerId };
      staffId = (
        await db.workspaceUser.findFirstOrThrow({
          where: { workspaceId, userId: ownerId },
        })
      ).id;
      childA = (
        await db.member.create({
          data: {
            workspaceId,
            fullName: "=CHILD_A_FORMULA",
            dateOfBirth: new Date("2016-01-01"),
            notes: "CHILD_INTERNAL_SECRET",
          },
        })
      ).id;
      childB = (
        await db.member.create({
          data: {
            workspaceId,
            fullName: "Unrelated child B",
            email: "CHILD_B_EMAIL_SECRET@example.test",
            dateOfBirth: new Date("2014-01-01"),
          },
        })
      ).id;
      foreignMember = (
        await db.member.create({
          data: {
            workspaceId: foreignWorkspaceId,
            fullName: "FOREIGN_MEMBER_SECRET",
          },
        })
      ).id;
      const guardian = await db.guardian.create({
        data: {
          workspaceId,
          fullName: "Verified parent",
          email: p.user.email,
          notes: "GUARDIAN_INTERNAL_SECRET",
          familyLinks: {
            create: [
              { workspaceId, childMemberId: childA },
              { workspaceId, childMemberId: childB },
            ],
          },
        },
      });
      grantId = (
        await db.memberPortalGrant.create({
          data: {
            workspaceId,
            userId: p.user.id,
            memberId: childA,
            guardianId: guardian.id,
            verifiedByWorkspaceUserId: staffId,
            verificationNote: "Verified signing authority",
            canSign: true,
          },
        })
      ).id;
      payerId = (
        await db.financialAccount.create({
          data: { workspaceId, userId: p.user.id, memberId: parentId },
        })
      ).id;
      otherPayerId = (
        await db.financialAccount.create({
          data: { workspaceId, userId: q.user.id, memberId: q.member.id },
        })
      ).id;
      const plan = await db.membershipPlan.create({
        data: {
          workspaceId,
          name: "Accepted membership",
          monthlyPriceCents: 12900,
          currency: "cad",
        },
      });
      const membership = await db.memberMembership.create({
        data: {
          workspaceId,
          memberId: childA,
          membershipPlanId: plan.id,
          acceptedTerms: {
            ...snapshotMembershipTerms(plan, now),
            unexpectedPrivateNote: "POLICY_PRIVATE_SECRET",
          } as unknown as Prisma.InputJsonObject,
        },
      });
      const location = await db.location.create({
        data: { workspaceId, name: "Gym", timezone: "America/Vancouver" },
      });
      const room = await db.room.create({
        data: { locationId: location.id, name: "Mat", capacity: 10 },
      });
      const program = await db.program.create({
        data: { workspaceId, name: "Muay Thai" },
      });
      const template = await db.classTemplate.create({
        data: {
          workspaceId,
          roomId: room.id,
          programId: program.id,
          weekday: "MONDAY",
          startTimeMinutes: 1080,
          endTimeMinutes: 1140,
          bookingCutoffMinutes: 60,
          cancellationCutoffMinutes: 60,
        },
      });
      bookingId = (
        await db.classBooking.create({
          data: {
            workspaceId,
            memberId: childA,
            classTemplateId: template.id,
            fundingMembershipId: membership.id,
            scheduledForDate: new Date("2026-11-02"),
            acceptedPolicy: {
              ...snapshotMembershipTerms(plan),
              hidden: "BOOKING_POLICY_SECRET",
            } as unknown as Prisma.InputJsonObject,
          },
        })
      ).id;
      await db.classBooking.create({
        data: {
          workspaceId,
          memberId: childB,
          classTemplateId: template.id,
          scheduledForDate: new Date("2026-11-02"),
        },
      });
      await db.attendanceRecord.create({
        data: {
          workspaceId,
          memberId: childA,
          classTemplateId: template.id,
          scheduledForDate: new Date("2026-10-26"),
          state: "PRESENT",
          note: "ATTENDANCE_PRIVATE_SECRET",
        },
      });
      const form = await db.formDocument.create({
        data: { workspaceId, name: "Signed waiver", formType: "WAIVER" },
      });
      formVersionId = (
        await db.formVersion.create({
          data: {
            workspaceId,
            formDocumentId: form.id,
            versionNumber: 1,
            fileName: "signed-waiver.pdf",
            mimeType: "application/pdf",
            fileSizeBytes: originalPdf.length,
            fileSha256: sha(originalPdf),
            fileData: originalPdf,
            uploadedByWorkspaceUserId: staffId,
          },
        })
      ).id;
      const newer = Buffer.from("UNSIGNED_FORM_SECRET");
      const version2 = await db.formVersion.create({
        data: {
          workspaceId,
          formDocumentId: form.id,
          versionNumber: 2,
          fileName: "new-waiver.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: newer.length,
          fileSha256: sha(newer),
          fileData: newer,
          uploadedByWorkspaceUserId: staffId,
        },
      });
      await db.formDocument.update({
        where: { id: form.id },
        data: { currentVersionId: version2.id },
      });
      const request = await db.signatureRequest.create({
        data: {
          workspaceId,
          memberId: childA,
          formVersionId,
          guardianId: guardian.id,
          signerKind: "GUARDIAN",
          accessMethod: "PORTAL",
          status: "COMPLETED",
          completedAt: now,
          tokenHash: "SIGNATURE_TOKEN_SECRET",
        },
      });
      signedId = (
        await db.signedDocument.create({
          data: {
            workspaceId,
            memberId: childA,
            guardianId: guardian.id,
            formVersionId,
            signedFromRequestId: request.id,
            signerKind: "GUARDIAN",
            signerNameSnapshot: "Verified parent",
            signerEmailSnapshot: p.user.email,
            signatureMethod: "LOCAL",
            signedAt: now,
            ipAddress: "IP_ADDRESS_SECRET",
            userAgent: "USER_AGENT_SECRET",
          },
        })
      ).id;
      await db.importedSignatureEvidence.create({
        data: {
          workspaceId,
          sourceSystem: "Reviewed source",
          sourceExternalId: "signature-1",
          memberId: childA,
          guardianId: guardian.id,
          formVersionId,
          signedDocumentId: signedId,
          sourceDocumentHash: sha(originalPdf),
          signatureReceiptHash: sha(receiptBytes),
          signatureReceiptData: receiptBytes,
          sourceSignerReference: "SIGNER_REFERENCE_SECRET",
          sourceBeneficiaryReference: "source-child",
          signerAuthorityEvidence: "AUTHORITY_REVIEW_SECRET",
          sourceEvidence: "SOURCE_REVIEW_SECRET",
          sourceSignedAt: now,
          sourceFileHash: "source-hash",
          sourceRowHash: "row-hash",
          importJobId: "fixture-job",
          stagingRecordId: "fixture-row",
          actorId: ownerId,
        },
      });
      for (const [payerAccountId, memberId, amountCents] of [
        [payerId, childA, 12900],
        [payerId, childB, 9900],
        [otherPayerId, childA, 77777],
      ] as const) {
        const invoice = await db.invoice.create({
          data: {
            workspaceId,
            payerAccountId,
            memberId,
            status: "PAID",
            subtotalCents: amountCents,
            totalCents: amountCents,
            amountPaidCents: amountCents,
            currency: "cad",
            lineItems: {
              create: {
                workspaceId,
                description: "Membership",
                unitAmountCents: amountCents,
                amountCents,
                currency: "cad",
              },
            },
          },
        });
        const payment = await db.payment.create({
          data: {
            workspaceId,
            payerAccountId,
            memberId,
            invoiceId: invoice.id,
            status: "SUCCEEDED",
            amountCents,
            currency: "cad",
            failureMessage: "PAYMENT_PROCESSOR_SECRET",
          },
        });
        await db.refund.create({
          data: {
            workspaceId,
            memberId,
            paymentId: payment.id,
            status: "SUCCEEDED",
            amountCents: 100,
            currency: "cad",
            reason: "REFUND_INTERNAL_SECRET",
          },
        });
      }
      const credit = await db.accountCredit.create({
        data: {
          workspaceId,
          payerAccountId: payerId,
          memberId: parentId,
          originalAmountCents: 500,
          remainingAmountCents: 500,
          currency: "cad",
          reason: "CREDIT_INTERNAL_SECRET",
        },
      });
      await db.financialOperation.create({
        data: {
          workspaceId,
          operationKey: randomUUID(),
          requestHash: "request",
          kind: "ISSUE_CREDIT",
          status: "SUCCEEDED",
          payerAccountId: payerId,
          beneficiaryMemberId: childA,
          targetId: credit.id,
          amountCents: 500,
          currency: "cad",
          providerIdempotencyKey: randomUUID(),
          payload: { secret: "OPERATION_PAYLOAD_SECRET" },
          events: {
            create: {
              workspaceId,
              version: 1,
              state: "SUCCEEDED",
              detail: { secret: "EVENT_PRIVATE_SECRET" },
            },
          },
        },
      });
      const coachingProgram = await db.coachingProgram.create({
        data: { workspaceId, name: "COACHING_PROGRAM_SECRET" },
      });
      const coachingVersion = await db.coachingProgramVersion.create({
        data: {
          programId: coachingProgram.id,
          number: 1,
          durationDays: 30,
          deliveryWeekdays: [1],
          responseHours: 24,
          goals: "COACHING_GOALS_SECRET",
          milestones: [],
          priceCents: 10000,
          currency: "cad",
          terms: "Private program terms",
        },
      });
      const enrollment = await db.coachingEnrollment.create({
        data: {
          workspaceId,
          memberId: parentId,
          programVersionId: coachingVersion.id,
          startsOn: new Date("2026-11-01"),
          endsOn: new Date("2026-12-01"),
          timezone: "UTC",
          caseOwnerWorkspaceUserId: staffId,
        },
      });
      await db.coachingPrivateNote.create({
        data: {
          enrollmentId: enrollment.id,
          authorWorkspaceUserId: staffId,
          localDate: new Date("2026-11-01"),
          body: "COACHING_PRIVATE_SECRET",
        },
      });
      await db.coachingDailyNote.create({
        data: {
          enrollmentId: enrollment.id,
          authorWorkspaceUserId: staffId,
          localDate: new Date("2026-11-01"),
          draftBody: "UNPUBLISHED_COACHING_SECRET",
        },
      });
    });
    beforeEach(async () => {
      await db.memberPortalGrant.update({
        where: { id: grantId },
        data: { revokedAt: null, canBook: false, canSign: true, canPay: false },
      });
      await db.workspaceUser.updateMany({
        where: { workspaceId, userId: parent.userId },
        data: { isActive: true },
      });
      await db.formVersion.update({
        where: { id: formVersionId },
        data: { fileData: originalPdf },
      });
    });
    afterAll(async () => {
      for (const id of [workspaceId, foreignWorkspaceId].filter(Boolean)) {
        await db.sourceMembershipLifecycleEvidence.deleteMany({
          where: { workspaceId: id },
        });
        await db.membershipLifecycleEvent.deleteMany({
          where: { request: { workspaceId: id } },
        });
        await db.membershipLifecycleRequest.deleteMany({
          where: { workspaceId: id },
        });
        await db.importedFinancialEvidence.updateMany({
          where: { workspaceId: id },
          data: { parentEvidenceId: null },
        });
        await db.importedFinancialEvidence.deleteMany({
          where: { workspaceId: id },
        });
        await db.importedSignatureEvidence.deleteMany({
          where: { workspaceId: id },
        });
        await db.memberPortalGrant.deleteMany({ where: { workspaceId: id } });
        await db.coachingEnrollment.deleteMany({ where: { workspaceId: id } });
        await db.coachingProgramVersion.deleteMany({
          where: { program: { workspaceId: id } },
        });
        await db.coachingProgram.deleteMany({ where: { workspaceId: id } });
        await db.financialOperationEvent.deleteMany({
          where: { workspaceId: id },
        });
        await db.financialOperation.deleteMany({ where: { workspaceId: id } });
        await db.refund.deleteMany({ where: { workspaceId: id } });
        await db.payment.deleteMany({ where: { workspaceId: id } });
        await db.invoice.deleteMany({ where: { workspaceId: id } });
        await db.accountCredit.deleteMany({ where: { workspaceId: id } });
        await db.financialAccount.deleteMany({ where: { workspaceId: id } });
        await db.attendanceRecord.deleteMany({ where: { workspaceId: id } });
        await db.classBooking.deleteMany({ where: { workspaceId: id } });
        await db.classTemplate.deleteMany({ where: { workspaceId: id } });
        await db.memberMembership.deleteMany({ where: { workspaceId: id } });
        await db.formVersion.deleteMany({ where: { workspaceId: id } });
        await db.workspace.delete({ where: { id } });
      }
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.$disconnect();
    });
    const create = (
      actor = parent,
      scope: "MEMBER" | "PAYER" = "MEMBER",
      targetId = childA,
      requestId = randomUUID(),
    ) =>
      createMemberDataExport(actor, { scope, targetId }, requestId, {
        db,
        now,
      });
    const unpack = async (id: string, actor = parent) => {
      const archive = await downloadMemberDataExport(actor, id, { db, now });
      expect(sha(archive.bytes)).toBe(archive.sha256);
      return {
        archive,
        payload: JSON.parse(gunzipSync(archive.bytes).toString("utf8")),
      };
    };
    it("exports one child with exact historical signed bytes and imported signature receipt, without household or payer data", async () => {
      const option = (await getMemberDataOptions(parent, childA, { db, now }))
        .member!;
      const job = await createMemberDataExport(parent, option, randomUUID(), {
          db,
          now,
        }),
        { payload } = await unpack(job.id),
        text = JSON.stringify(payload);
      expect(
        (await listMemberDataExports(parent, option, { db, now })).some(
          (row) => row.id === job.id,
        ),
      ).toBe(true);
      expect(payload.tables.Member).toEqual([
        expect.objectContaining({ id: childA, fullName: "=CHILD_A_FORMULA" }),
      ]);
      expect(payload.tables.ClassBooking).toEqual([
        expect.objectContaining({ id: bookingId, memberId: childA }),
      ]);
      expect(payload.tables.SignedDocument).toEqual([
        expect.objectContaining({ id: signedId, formVersionId }),
      ]);
      expect(payload.tables.FormVersion).toHaveLength(1);
      expect(payload.files).toHaveLength(2);
      expect(
        Buffer.from(
          payload.files.find(
            (file: { id: string }) => file.id === formVersionId,
          ).base64,
          "base64",
        ),
      ).toEqual(originalPdf);
      expect(
        payload.files.some((file: { base64: string }) =>
          Buffer.from(file.base64, "base64").equals(receiptBytes),
        ),
      ).toBe(true);
      expect(payload.csv["Member.csv"]).toContain("'=CHILD_A_FORMULA");
      expect(
        payload.dictionary.SignedDocument.some(
          (field: { name: string }) => field.name === "formVersionId",
        ),
      ).toBe(true);
      for (const secret of [
        "Unrelated child B",
        "CHILD_B_EMAIL_SECRET",
        "PRIVATE_SECRET",
        "INTERNAL_SECRET",
        "POLICY_SECRET",
        "PASSWORD_SECRET",
        "SIGNATURE_TOKEN_SECRET",
        "IP_ADDRESS_SECRET",
        "USER_AGENT_SECRET",
        "UNSIGNED_FORM_SECRET",
        "SOURCE_REVIEW_SECRET",
        "AUTHORITY_REVIEW_SECRET",
        "SIGNER_REFERENCE_SECRET",
        "COACHING_GOALS_SECRET",
      ])
        expect(text).not.toContain(secret);
      expect(payload.tables.Payment).toBeUndefined();
      expect(payload.tables.FinancialAccount).toBeUndefined();
    });
    it("exports only the exact payer's money and minimal beneficiary attribution", async () => {
      const job = await create(parent, "PAYER", payerId),
        { payload } = await unpack(job.id),
        text = JSON.stringify(payload);
      expect(payload.tables.Payment).toHaveLength(2);
      expect(payload.tables.Refund).toHaveLength(2);
      expect(
        payload.tables.Payment.every(
          (row: { payerAccountId: string }) => row.payerAccountId === payerId,
        ),
      ).toBe(true);
      expect(
        payload.tables.Beneficiary.map((row: { id: string }) => row.id).sort(),
      ).toEqual([childA, childB].sort());
      expect(
        payload.tables.Beneficiary.every(
          (row: Record<string, unknown>) =>
            Object.keys(row).sort().join() === "fullName,id",
        ),
      ).toBe(true);
      expect(payload.tables.FinancialOperation[0].accountCreditId).toBe(
        payload.tables.AccountCredit[0].id,
      );
      for (const name of [
        "Member",
        "AttendanceRecord",
        "ClassBooking",
        "SignedDocument",
        "CoachingEnrollment",
      ])
        expect(payload.tables[name]).toBeUndefined();
      for (const secret of [
        "CHILD_B_EMAIL_SECRET",
        "77777",
        "PROCESSOR_SECRET",
        "INTERNAL_SECRET",
        "PAYLOAD_SECRET",
        "EVENT_PRIVATE_SECRET",
        "COACHING_PRIVATE_SECRET",
      ])
        expect(text).not.toContain(secret);
      const self = await create(parent, "MEMBER", parentId);
      expect(JSON.stringify((await unpack(self.id)).payload)).not.toContain(
        "COACHING_PRIVATE_SECRET",
      );
    });
    it("preserves imported payer status and source receipt links without other payers or private source files", async () => {
      const payment = await db.payment.findFirstOrThrow({
        where: { workspaceId, payerAccountId: payerId, memberId: childA },
      });
      const foreignPayment = await db.payment.findFirstOrThrow({
        where: { workspaceId, payerAccountId: otherPayerId },
      });
      const refund = await db.refund.findFirstOrThrow({
        where: { paymentId: payment.id },
      });
      const otherAccount = await db.financialAccount.findUniqueOrThrow({
        where: { id: otherPayerId },
      });
      const common = {
        workspaceId,
        sourceSystem: "legacy",
        sourceAccountReference: "SOURCE_ACCOUNT_SECRET",
        sourceExternalId: randomUUID(),
        sourceRecordKind: "INVOICE",
        sourceStatus: "paid",
        billingOwner: "SOURCE",
        refundOwner: "SOURCE",
        payerMemberId: parentId,
        beneficiaryMemberId: childA,
        payerAuthorityEvidence: "PAYER_AUTHORITY_SECRET",
        sourceEvidence: "SOURCE_REVIEW_SECRET",
        sourceFileHash: "f".repeat(64),
        sourceRowHash: "a".repeat(64),
        sourceSnapshot: { private: "SOURCE_FILE_SECRET" },
        amountCents: payment.amountCents,
        paidCents: payment.amountCents,
        refundedCents: refund.amountCents,
        currency: "cad",
        occurredAt: now,
        importJobId: "source-job",
        stagingRecordId: "source-row",
        actorId: ownerId,
      };
      const invoiceProof = await db.importedFinancialEvidence.create({
        data: { ...common, invoiceId: payment.invoiceId },
      });
      const paymentProof = await db.importedFinancialEvidence.create({
        data: {
          ...common,
          sourceRecordKind: "PAYMENT",
          sourceExternalId: randomUUID(),
          paymentId: payment.id,
          parentEvidenceId: invoiceProof.id,
        },
      });
      const refundProof = await db.importedFinancialEvidence.create({
        data: {
          ...common,
          sourceRecordKind: "REFUND",
          sourceExternalId: randomUUID(),
          sourceStatus: "refunded",
          refundId: refund.id,
          parentEvidenceId: paymentProof.id,
        },
      });
      await db.importedFinancialEvidence.create({
        data: {
          ...common,
          payerMemberId: otherAccount.memberId,
          sourceExternalId: "OTHER_PAYER_SOURCE_SECRET",
          sourceRecordKind: "PAYMENT",
          paymentId: foreignPayment.id,
        },
      });
      const job = await create(parent, "PAYER", payerId),
        { payload } = await unpack(job.id);
      expect(
        payload.tables.ImportedFinancialEvidence.map(
          (row: { id: string }) => row.id,
        ).sort(),
      ).toEqual([invoiceProof.id, paymentProof.id, refundProof.id].sort());
      expect(
        payload.tables.ImportedFinancialEvidence.find(
          (row: { id: string }) => row.id === refundProof.id,
        ),
      ).toMatchObject({
        sourceStatus: "refunded",
        parentEvidenceId: paymentProof.id,
        refundOwner: "SOURCE",
      });
      for (const secret of [
        "SOURCE_FILE_SECRET",
        "SOURCE_ACCOUNT_SECRET",
        "PAYER_AUTHORITY_SECRET",
        "SOURCE_REVIEW_SECRET",
        "OTHER_PAYER_SOURCE_SECRET",
      ])
        expect(JSON.stringify(payload)).not.toContain(secret);
      await db.importedFinancialEvidence.update({
        where: { id: paymentProof.id },
        data: { invoiceId: foreignPayment.invoiceId },
      });
      try {
        await expect(create(parent, "PAYER", payerId)).rejects.toThrow(
          "inconsistent payer",
        );
      } finally {
        await db.importedFinancialEvidence.update({
          where: { id: paymentProof.id },
          data: { invoiceId: null },
        });
      }
    });
    it("exports own source lifecycle status without source accounts, receipts, reviews or other members", async () => {
      const own = await db.memberMembership.findFirstOrThrow({
        where: { workspaceId, memberId: childA },
      });
      await db.memberMembership.update({
        where: { id: own.id },
        data: { sourceBillingManaged: true, sourceAccessHeld: true },
      });
      const foreignPlan = await db.membershipPlan.create({
        data: {
          workspaceId: foreignWorkspaceId,
          name: "Foreign source plan",
          monthlyPriceCents: 10000,
        },
      });
      const otherMembership = await db.memberMembership.create({
        data: {
          workspaceId,
          memberId: childB,
          membershipPlanId: own.membershipPlanId,
        },
      });
      const foreignMembership = await db.memberMembership.create({
        data: {
          workspaceId: foreignWorkspaceId,
          memberId: foreignMember,
          membershipPlanId: foreignPlan.id,
        },
      });
      const receipt = Buffer.from(
        "%PDF-1.4\nPRIVATE_SOURCE_RECEIPT_SENTINEL\n%%EOF",
      );
      const receipts = [];
      for (const membership of [own, otherMembership, foreignMembership]) {
        const request = await db.membershipLifecycleRequest.create({
          data: {
            workspaceId: membership.workspaceId,
            membershipId: membership.id,
            operationKey: randomUUID(),
            inputHash: "hash",
            requesterUserId: ownerId,
            kind: "CANCEL",
            state: "AWAITING_PROVIDER",
            policy: {},
            policyVersion: 1,
            effectiveOn: new Date("2026-12-01"),
          },
        });
        receipts.push(
          await db.sourceMembershipLifecycleEvidence.create({
            data: {
              workspaceId: membership.workspaceId,
              membershipId: membership.id,
              requestId: request.id,
              operationKey: randomUUID(),
              inputHash: "PRIVATE_SOURCE_INPUT",
              sourceSystem: "Legacy gym software",
              sourceAccountReference: "PRIVATE_SOURCE_ACCOUNT_SENTINEL",
              sourceContractReference: "PRIVATE_SOURCE_CONTRACT_SENTINEL",
              sourceReference: "PRIVATE_SOURCE_REFERENCE_SENTINEL",
              evidenceState: "CONFIGURED",
              confirmedAt: now,
              receiptData: receipt,
              receiptHash: sha(receipt),
              reviewSnapshot: { private: "PRIVATE_SOURCE_REVIEW_SENTINEL" },
              recordedByUserId: ownerId,
            },
          }),
        );
      }
      const { payload } = await unpack((await create()).id),
        text = JSON.stringify(payload);
      expect(
        payload.tables.MemberMembership.find(
          (row: { id: string }) => row.id === own.id,
        ),
      ).toMatchObject({ sourceBillingManaged: true, sourceAccessHeld: true });
      expect(payload.tables.SourceMembershipLifecycleEvidence).toEqual([
        expect.objectContaining({
          id: receipts[0]!.id,
          membershipId: own.id,
          requestId: receipts[0]!.requestId,
          sourceSystem: "Legacy gym software",
          evidenceState: "CONFIGURED",
          confirmedAt: now.toISOString(),
        }),
      ]);
      expect(payload.tables.MembershipLifecycleRequest).toEqual([
        expect.objectContaining({
          id: receipts[0]!.requestId,
          state: "AWAITING_PROVIDER",
          effectiveOn: "2026-12-01T00:00:00.000Z",
        }),
      ]);
      for (const hidden of [
        otherMembership.id,
        foreignMembership.id,
        receipts[1]!.id,
        receipts[2]!.id,
        "PRIVATE_SOURCE",
        receipt.toString("base64"),
        "reviewSnapshot",
        "sourceAccountReference",
        "sourceContractReference",
        "receiptData",
        "sourceReference",
      ])
        expect(text).not.toContain(hidden);
      const payerArchive = await unpack(
        (await create(parent, "PAYER", payerId)).id,
      );
      expect(
        payerArchive.payload.tables.SourceMembershipLifecycleEvidence,
      ).toBeUndefined();
      expect(payerArchive.payload.tables.MemberMembership).toBeUndefined();
    });
    it("rejects booking-only, payer-only, unrelated guardian, coach and foreign-workspace requests", async () => {
      for (const data of [
        { canBook: true, canSign: false, canPay: false },
        { canBook: false, canSign: false, canPay: true },
      ]) {
        await db.memberPortalGrant.update({ where: { id: grantId }, data });
        await expect(create()).rejects.toThrow("unavailable");
      }
      await expect(create(parent, "MEMBER", childB)).rejects.toThrow(
        "unavailable",
      );
      await expect(create({ workspaceId, userId: coachId })).rejects.toThrow(
        "unavailable",
      );
      await expect(create(owner, "MEMBER", foreignMember)).rejects.toThrow(
        "unavailable",
      );
      await expect(create(parent, "PAYER", otherPayerId)).rejects.toThrow(
        "unavailable",
      );
      expect(
        (await getMemberDataOptions(parent, childA, { db, now })).member,
      ).toBeNull();
      expect(
        (await getMemberDataOptions(parent, childA, { db, now })).payer
          ?.targetId,
      ).toBe(payerId);
    });
    it("rechecks current grants and account access for lists, downloads and receipts", async () => {
      const job = await create();
      await unpack(job.id);
      await db.memberPortalGrant.update({
        where: { id: grantId },
        data: { revokedAt: now },
      });
      await expect(
        downloadMemberDataExport(parent, job.id, { db, now }),
      ).rejects.toThrow("unavailable");
      await expect(
        listMemberDataExports(
          parent,
          { scope: "MEMBER", targetId: childA },
          { db, now },
        ),
      ).rejects.toThrow("unavailable");
      await expect(
        confirmMemberDataExportReceipt(parent, job.id, job.sha256!, {
          db,
          now,
        }),
      ).rejects.toThrow("unavailable");
      await expect(
        downloadMemberDataExport({ workspaceId, userId: otherId }, job.id, {
          db,
          now,
        }),
      ).rejects.toThrow("unavailable");
      await db.workspaceUser.updateMany({
        where: { workspaceId, userId: parent.userId },
        data: { isActive: false },
      });
      await expect(create(parent, "PAYER", payerId)).rejects.toThrow(
        "unavailable",
      );
      expect(
        (await db.memberDataExport.findUniqueOrThrow({ where: { id: job.id } }))
          .receiptConfirmedAt,
      ).toBeNull();
    });
    it("deduplicates concurrent preparation and keeps scope immutable on replay", async () => {
      const requestId = randomUUID();
      await Promise.all([
        create(parent, "MEMBER", childA, requestId),
        create(parent, "MEMBER", childA, requestId),
      ]);
      expect(
        await db.memberDataExport.count({ where: { id: requestId } }),
      ).toBe(1);
      await unpack(requestId);
      await expect(create(parent, "PAYER", payerId, requestId)).rejects.toThrow(
        "unavailable",
      );
      expect(
        await db.workspaceDataEvent.count({
          where: {
            workspaceId,
            kind: "MEMBER_EXPORT_READY",
            metadata: { path: ["exportId"], equals: requestId },
          },
        }),
      ).toBe(1);
    });
    it("retries rolled-back serialization snapshots and records only a safe code for non-retryable failures", async () => {
      const retryDb = new PrismaClient({ datasources: { db: { url } } });
      const original = retryDb.$transaction.bind(retryDb);
      let attempts = 0;
      const injected = new Prisma.PrismaClientKnownRequestError(
        "Injected serialization rollback",
        { code: "P2034", clientVersion: "test" },
      );
      const spy = vi.spyOn(retryDb, "$transaction").mockImplementation(((
        work: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: {
          isolationLevel?: Prisma.TransactionIsolationLevel;
          timeout?: number;
        },
      ) =>
        original(async (tx) => {
          const value = await work(tx);
          attempts++;
          if (attempts >= 2 && attempts <= 4) throw injected;
          return value;
        }, options)) as typeof retryDb.$transaction);
      try {
        const requestId = randomUUID();
        const job = await createMemberDataExport(
          parent,
          { scope: "MEMBER", targetId: childA },
          requestId,
          { db: retryDb, now },
        );
        expect(attempts).toBe(5);
        expect(job.state).toBe("READY");
        expect(
          await db.workspaceDataEvent.count({
            where: {
              workspaceId,
              kind: "MEMBER_EXPORT_READY",
              metadata: { path: ["exportId"], equals: requestId },
            },
          }),
        ).toBe(1);
        await unpack(requestId);
        attempts = 0;
        spy.mockImplementation(((
          work: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: {
            isolationLevel?: Prisma.TransactionIsolationLevel;
            timeout?: number;
          },
        ) =>
          original(async (tx) => {
            const value = await work(tx);
            if (++attempts === 2)
              throw new Prisma.PrismaClientKnownRequestError(
                "PRIVATE_DATABASE_ERROR_SENTINEL",
                { code: "P2004", clientVersion: "test" },
              );
            return value;
          }, options)) as typeof retryDb.$transaction);
        const failedId = randomUUID();
        await expect(
          createMemberDataExport(
            parent,
            { scope: "MEMBER", targetId: childA },
            failedId,
            { db: retryDb, now },
          ),
        ).rejects.toThrow("could not be prepared");
        expect(attempts).toBe(2);
        const failure = await db.workspaceDataEvent.findFirstOrThrow({
          where: {
            workspaceId,
            kind: "MEMBER_EXPORT_FAILED",
            metadata: { path: ["exportId"], equals: failedId },
          },
        });
        expect(failure.metadata).toEqual({
          exportId: failedId,
          databaseErrorCode: "P2004",
        });
        expect(
          await db.memberDataExport.findUnique({ where: { id: failedId } }),
        ).toMatchObject({
          state: "FAILED",
          artifact: null,
          resolverUserId: ownerId,
        });
        expect(JSON.stringify(failure)).not.toContain(
          "PRIVATE_DATABASE_ERROR_SENTINEL",
        );
      } finally {
        spy.mockRestore();
        await retryDb.$disconnect();
      }
    }, 20000);
    it("requires the exact current family link and stops guardian archives when the child becomes an adult", async () => {
      const job = await create(),
        grant = await db.memberPortalGrant.findUniqueOrThrow({
          where: { id: grantId },
        });
      await db.familyLink.deleteMany({
        where: {
          workspaceId,
          guardianId: grant.guardianId,
          childMemberId: childA,
        },
      });
      try {
        await expect(
          downloadMemberDataExport(parent, job.id, { db, now }),
        ).rejects.toThrow("unavailable");
      } finally {
        await db.familyLink.create({
          data: {
            workspaceId,
            guardianId: grant.guardianId,
            childMemberId: childA,
          },
        });
      }
      await db.member.update({
        where: { id: childA },
        data: { dateOfBirth: new Date("1990-01-01") },
      });
      try {
        await expect(
          downloadMemberDataExport(parent, job.id, { db, now }),
        ).rejects.toThrow("unavailable");
      } finally {
        await db.member.update({
          where: { id: childA },
          data: { dateOfBirth: new Date("2016-01-01") },
        });
      }
      expect((await unpack(job.id)).payload.tables.Member[0].id).toBe(childA);
    });
    it("records a named failure resolver, detects bad files, and never exposes a partial archive", async () => {
      await db.formVersion.update({
        where: { id: formVersionId },
        data: { fileData: Buffer.from("corrupt bytes") },
      });
      const requestId = randomUUID();
      await expect(create(parent, "MEMBER", childA, requestId)).rejects.toThrow(
        "checksum",
      );
      expect(
        await db.memberDataExport.findUniqueOrThrow({
          where: { id: requestId },
        }),
      ).toMatchObject({
        state: "FAILED",
        artifact: null,
        resolverUserId: ownerId,
        resolverName: "Named records resolver",
      });
      await expect(
        downloadMemberDataExport(parent, requestId, { db, now }),
      ).rejects.toThrow("unavailable");
      expect(
        (
          await listMemberDataExports(
            owner,
            { scope: "MEMBER", targetId: childA },
            { db, now },
          )
        ).some((job) => job.id === requestId && job.state === "FAILED"),
      ).toBe(true);
    });
    it("requires download and matching checksum for receipt, then removes expired bytes", async () => {
      const job = await create();
      await expect(
        confirmMemberDataExportReceipt(parent, job.id, job.sha256!, {
          db,
          now,
        }),
      ).rejects.toThrow("Download");
      await unpack(job.id);
      await expect(
        confirmMemberDataExportReceipt(parent, job.id, "0".repeat(64), {
          db,
          now,
        }),
      ).rejects.toThrow("Download");
      await confirmMemberDataExportReceipt(parent, job.id, job.sha256!, {
        db,
        now,
      });
      await confirmMemberDataExportReceipt(parent, job.id, job.sha256!, {
        db,
        now,
      });
      expect(
        (await db.memberDataExport.findUniqueOrThrow({ where: { id: job.id } }))
          .receiptConfirmedAt,
      ).toEqual(now);
      const later = new Date(now.getTime() + 24 * 3600000);
      await expect(
        downloadMemberDataExport(parent, job.id, { db, now: later }),
      ).rejects.toThrow("expired");
      await expireMemberDataExports({ db, now: later });
      expect(
        await db.memberDataExport.findUniqueOrThrow({ where: { id: job.id } }),
      ).toMatchObject({ state: "EXPIRED", artifact: null, sha256: job.sha256 });
    });
  },
);
