import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { getWorkspaceAudit } from "./workspace-audit";
import { afterAll, describe, expect, it } from "vitest";
import {
  Prisma,
  PrismaClient,
  createWorkspaceDataExport,
  downloadWorkspaceDataExport,
  createMemberDataExport,
  downloadMemberDataExport,
  addDays,
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  getWeekdayForDateString,
  createAccessBackedBooking,
  recordLocalFormSignature,
  snapshotMembershipTerms,
  snapshotPunchCardTerms,
  previewFormPublication,
  publishFormRequirement,
  resolveRequiredFormStatusesForMember,
  resolveBookingFormRecovery,
  processFormRequirementWarnings,
  shouldDeliverNotification,
  reconcileFormRecoveryRefund,
  lockClassSchedule,
  buildRequiredFormsMemberFilterTx,
  summarizeRequiredFormsForMembersTx,
  type PublicationInput,
  startDurableCheckout,
  previewOwnerRefund,
  reserveOwnerRefund,
  saveOwnerRefundEvidence,
  formEvidenceHash,
  getPublicEnrollmentForms,
  completeVerifiedTrial,
} from "@flowstate/db";
import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../../packages/db/src/retention-inventory.js";
import {
  recordAttendance,
  closeClassRoster,
  type RosterAccessContext,
} from "./rosters";

const url = process.env.TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !/test|e2e/i.test(new URL(url).pathname))
)
  throw new Error(
    "Form requirements integration needs an explicit disposable local database.",
  );
(url ? describe : describe.skip)(
  "published form cycles and accepted-booking recovery",
  () => {
    const db = new PrismaClient({ datasourceUrl: url }),
      workspaces: string[] = [],
      users: string[] = [];
    async function fixture(
      options: {
        timezone?: string;
        pack?: boolean;
        historical?: boolean;
        limit?: number;
        dropIn?: boolean;
      } = {},
    ) {
      const actual = new Date(),
        timezone = options.timezone ?? "UTC",
        date = addDays(
          getWorkspaceDateString(actual, timezone),
          options.historical ? -7 : 7,
        );
      const serviceAt = getZonedDateTimeAsUtc({
        dateString: date,
        minutes: 600,
        timezone,
      });
      const acceptedAt = options.historical
        ? new Date(+serviceAt - 2 * 86400000)
        : new Date(+actual - 60000);
      const owner = await db.user.create({
        data: { email: `${randomUUID()}@forms-owner.example.test` },
      });
      const customer = await db.user.create({
        data: { email: `${randomUUID()}@forms-member.example.test` },
      });
      users.push(owner.id, customer.id);
      const workspace = await db.workspace.create({
        data: {
          name: "Fictional form lifecycle gym",
          status: "ACTIVE",
          location: { create: { name: "Gym", timezone } },
          workspaceUsers: {
            create: [
              { userId: owner.id, role: "OWNER" },
              { userId: customer.id, role: "CUSTOMER" },
            ],
          },
          migration: {
            create: {
              stage: "COMPLETE",
              nextOwnerAction: "Fictional verified fixture",
              flowstateResponsibility: "Local test only",
              ownerReviewAcknowledgedAt: acceptedAt,
              ownerReviewAcknowledgedByUserId: owner.id,
              operationallyReadyAt: acceptedAt,
              operationallyReadyByUserId: owner.id,
            },
          },
        },
        include: { location: true, workspaceUsers: true },
      });
      workspaces.push(workspace.id);
      const staff = workspace.workspaceUsers.find(
        (row) => row.userId === owner.id,
      )!;
      await createFixtureClassSchedulingPolicy(db, workspace.id, owner.id);
      const member = await db.member.create({
        data: {
          workspaceId: workspace.id,
          userId: customer.id,
          fullName: "Fictional participant",
          email: customer.email,
          dateOfBirth: new Date("1990-01-01"),
          status: "ACTIVE",
        },
      });
      const program = await db.program.create({
        data: { workspaceId: workspace.id, name: "Fictional program" },
      });
      const room = await db.room.create({
        data: { locationId: workspace.location!.id, name: "Mat", capacity: 10 },
      });
      const template = await db.classTemplate.create({
        data: {
          workspaceId: workspace.id,
          programId: program.id,
          roomId: room.id,
          coachWorkspaceUserId: staff.id,
          weekday: getWeekdayForDateString(date),
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          cancellationCutoffMinutes: 1440,
          bookingCutoffMinutes: 0,
        },
      });
      if (options.dropIn) {
        await db.dropInProduct.create({
          data: {
            workspaceId: workspace.id,
            name: "Fictional paid class",
            priceCents: 2500,
            currency: "cad",
          },
        });
      } else if (options.pack) {
        const product = await db.punchCardProduct.create({
          data: {
            workspaceId: workspace.id,
            name: "Fictional one pack",
            punchesIncluded: 1,
            priceCents: 1000,
            noShowConsumesPunch: true,
          },
        });
        await db.memberPunchCard.create({
          data: {
            workspaceId: workspace.id,
            memberId: member.id,
            punchCardProductId: product.id,
            originalPunches: 1,
            remainingPunches: 1,
            purchasePriceCents: 1000,
            acceptedTerms: JSON.parse(
              JSON.stringify(snapshotPunchCardTerms(product, acceptedAt)),
            ),
          },
        });
      } else {
        const plan = await db.membershipPlan.create({
          data: {
            workspaceId: workspace.id,
            name: "Fictional weekly allowance",
            monthlyPriceCents: 10000,
            currency: "cad",
            weeklyClassLimit: options.limit ?? 2,
            allowanceCountingMode: "ATTENDANCE",
            noShowConsumesClass: true,
          },
        });
        await db.memberMembership.create({
          data: {
            workspaceId: workspace.id,
            memberId: member.id,
            membershipPlanId: plan.id,
            startedAt: new Date(+acceptedAt - 86400000),
            allowanceAnchorDate: new Date(
              acceptedAt.toISOString().slice(0, 10),
            ),
            allowanceTimezone: timezone,
            acceptedTerms: JSON.parse(
              JSON.stringify(snapshotMembershipTerms(plan, acceptedAt)),
            ),
          },
        });
      }
      // An honest pre-upgrade fixture: old exact PDF/proof, no invented expiry.
      const document = await db.formDocument.create({
        data: {
          workspaceId: workspace.id,
          name: "Fictional required waiver",
          formType: "WAIVER",
        },
      });
      const bytes = Buffer.from("%PDF-1.7\n%%EOF\n"),
        sha = createHash("sha256").update(bytes).digest("hex");
      const pdf = await db.formVersion.create({
        data: {
          workspaceId: workspace.id,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: "fictional.pdf",
          mimeType: "application/pdf",
          fileData: bytes,
          fileSizeBytes: bytes.length,
          fileSha256: sha,
          uploadedByWorkspaceUserId: staff.id,
          createdAt: new Date(+acceptedAt - 86400000),
        },
      });
      await db.formDocument.update({
        where: { id: document.id },
        data: { currentVersionId: pdf.id },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId: workspace.id,
          formDocumentId: document.id,
          requirementTarget: "MEMBER",
        },
      });
      const request = await db.signatureRequest.create({
        data: {
          workspaceId: workspace.id,
          memberId: member.id,
          formVersionId: pdf.id,
          signerKind: "MEMBER",
          accessMethod: "PORTAL",
        },
      });
      expect(
        (
          await recordLocalFormSignature({
            workspaceId: workspace.id,
            memberId: member.id,
            requestId: request.id,
            actorUserId: customer.id,
            signerName: "Fictional participant",
            db,
            now: acceptedAt,
          })
        ).status,
      ).toBe("signed");
      const booked = await createAccessBackedBooking({
        workspaceId: workspace.id,
        memberId: member.id,
        classTemplateId: template.id,
        scheduledForDate: date,
        timezone,
        source: "MEMBER_PORTAL",
        db: db as never,
        now: acceptedAt,
      });
      if (booked.status !== "created" && booked.status !== "payment_required")
        throw new Error(`Fictional reservation failed: ${booked.status}`);
      const access: RosterAccessContext = {
        workspaceId: workspace.id,
        workspaceUserId: staff.id,
        role: "OWNER",
        timezone,
      };
      return {
        workspace,
        owner,
        customer,
        staff,
        member,
        program,
        room,
        template,
        document,
        pdf,
        bytes,
        date,
        serviceAt,
        acceptedAt,
        bookingId: booked.bookingId,
        access,
      };
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    async function paidFixture() {
      const f = await fixture({ dropIn: true });
      await db.workspaceStripeSettings.create({
        data: {
          workspaceId: f.workspace.id,
          stripeAccountId: "acct_forms_fictional",
          connectionStatus: "ACTIVE",
          chargesEnabled: true,
          payoutsEnabled: true,
        },
      });
      const result = await startDurableCheckout({
        workspaceId: f.workspace.id,
        actorUserId: f.customer.id,
        payerMemberId: f.member.id,
        memberId: f.member.id,
        bookingId: f.bookingId,
        successUrl: "https://members.example.test/app/schedule",
        cancelUrl: "https://members.example.test/app/schedule",
        db,
        gateway: {
          async create(request) {
            return {
              id: `cs_forms_${randomUUID()}`,
              state: "complete" as const,
              paid: true,
              url: null,
              amountCents: request.amountCents,
              currency: request.currency,
              paymentIntentId: `pi_forms_${randomUUID()}`,
              customerId: null,
              operationId: request.operationId,
              payerAccountId: request.payerAccountId,
              expiresAt: null,
            };
          },
          async retrieve() {
            throw new Error("Unexpected fictional provider retrieve");
          },
          async expire() {},
        },
      });
      if (result.status !== "ok")
        throw new Error(`Fictional checkout failed: ${result.message}`);
      const payment = await db.payment.findFirstOrThrow({
        where: { workspaceId: f.workspace.id, memberId: f.member.id },
      });
      return { ...f, payment };
    }
    async function refundOperation(
      f: Awaited<ReturnType<typeof paidFixture>>,
      amount = 2500,
      settle = true,
    ) {
      const review = await previewOwnerRefund({
        workspaceId: f.workspace.id,
        actorUserId: f.owner.id,
        paymentId: f.payment.id,
        db,
      });
      const operation = await reserveOwnerRefund({
        workspaceId: f.workspace.id,
        actorUserId: f.owner.id,
        paymentId: f.payment.id,
        amountCents: amount,
        disposition: "RETAIN_ACCESS",
        reason: "Fictional provider form recovery",
        requestId: randomUUID(),
        reviewHash: review.reviewHash,
        db,
      });
      if (settle)
        await saveOwnerRefundEvidence({
          operationId: operation.id,
          accountId: "acct_forms_fictional",
          db,
          evidence: {
            id: `re_forms_${randomUUID()}`,
            operationId: operation.id,
            amountCents: amount,
            currency: "cad",
            paymentIntentId: f.payment.stripePaymentIntentId,
            status: "succeeded",
          },
        });
      return db.financialOperation.findUniqueOrThrow({
        where: { id: operation.id },
      });
    }
    async function publication(
      f: Fixture,
      options: {
        versionId?: string;
        validUntil?: Date;
        effectiveAt?: Date;
        targets?: PublicationInput["terms"]["targets"];
      } = {},
    ) {
      const now = new Date(),
        head = await db.formRequirementRevision.findFirst({
          where: { formDocumentId: f.document.id },
          orderBy: { version: "desc" },
        });
      const input: PublicationInput = {
        publicationId: randomUUID(),
        formDocumentId: f.document.id,
        formVersionId: options.versionId ?? f.pdf.id,
        expectedHeadHash: head?.revisionHash ?? null,
        reason: "Fictional reviewed requirement renewal",
        terms: {
          schemaVersion: 1,
          targets: options.targets ?? ["MEMBER"],
          effectiveAt: (
            options.effectiveAt ?? new Date(+now + 2 * 86400000)
          ).toISOString(),
          consentValidUntil: options.validUntil?.toISOString() ?? null,
          noticeLeadMinutes: 60,
          expiryWarningLeadMinutes: 1440,
        },
      };
      const args = {
        db,
        workspaceId: f.workspace.id,
        actorUserId: f.owner.id,
        input,
        now,
      };
      const preview = await previewFormPublication(args);
      return {
        args,
        preview,
        publish: () =>
          publishFormRequirement({
            ...args,
            expectedPreviewHash: preview.previewHash,
            confirmShortNotice: true,
            portalOrigin: "https://members.example.test",
          }),
      };
    }
    async function acceptCycle(f: Fixture, revisionId: string) {
      const statuses = await resolveRequiredFormStatusesForMember({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        includeUpcoming: true,
        db,
      });
      const item = statuses.items.find(
        (row) => row.requirementRevisionId === revisionId,
      )!;
      const requestId = item.openRequests[0]!.requestId;
      const args = {
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        actorUserId: f.customer.id,
        requestId,
        signerName: "Fictional participant",
        db,
      };
      return { args, result: await recordLocalFormSignature(args) };
    }
    const caseFor = (f: Fixture) =>
      db.bookingFormRecovery.findFirstOrThrow({
        where: {
          workspaceId: f.workspace.id,
          bookingId: f.bookingId,
          state: "OPEN",
        },
      });
    const remedy = async (
      f: Fixture,
      choice: "CANCEL" | "REBOOK" | "REFUND_REVIEW" | "KEEP_BOOKING",
      extra: Partial<Parameters<typeof resolveBookingFormRecovery>[0]> = {},
    ) => {
      const recovery = await caseFor(f);
      return resolveBookingFormRecovery({
        workspaceId: f.workspace.id,
        actorUserId: f.customer.id,
        recoveryId: recovery.id,
        expectedVersion: recovery.version,
        choice,
        operationId: randomUUID(),
        db,
        ...extra,
      });
    };
    afterAll(async () => {
      for (const workspaceId of workspaces)
        for (let attempt = 0; ; attempt++)
          try {
            await db.$transaction(
              async (tx) => {
                await lockClassSchedule(tx, workspaceId);
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))`;
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial:${workspaceId}`}))`;
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`retention:${workspaceId}`}))`;
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
    }, 120000);

    async function verifiedEnrollment(
      f: Fixture,
      member = f.member,
      guardianId: string | null = null,
      kind: "TRIAL" | "MEMBERSHIP" = "MEMBERSHIP",
    ) {
      return db.publicEnrollment.create({
        data: {
          workspaceId: f.workspace.id,
          kind,
          status: "FORMS_REQUIRED",
          accessTokenHash: randomUUID(),
          email: f.customer.email,
          verificationCodeHash: "fictional-verified-registration",
          verificationExpiresAt: new Date(Date.now() + 86400000),
          verifiedAt: new Date(),
          memberId: member.id,
          participant: {
            fullName: member.fullName,
            dateOfBirth: member.dateOfBirth?.toISOString().slice(0, 10) ?? "",
            email: f.customer.email,
            phone: "",
            guardianFullName: "",
            relationshipLabel: "",
            classTemplateId: kind === "TRIAL" ? f.template.id : "",
            scheduledForDate: kind === "TRIAL" ? f.date : "",
            offerId: "",
            termsFingerprint: "",
            accountUserId: f.customer.id,
            payerMemberId: f.member.id,
            ...(guardianId ? { guardianId } : {}),
          },
          acceptedTerms: { registrationConsent: true },
        },
      });
    }
    it("[WF07 public enrollment] preserves honest legacy consent before the scheduled revision takes effect", async () => {
      const f = await fixture();
      const enrollment = await verifiedEnrollment(f);
      const args = {
        workspaceId: f.workspace.id,
        enrollmentId: enrollment.id,
        actorUserId: f.customer.id,
        ensure: true,
        db,
      };
      expect((await getPublicEnrollmentForms(args))[0]!.signed).toBe(true);
      const published = await (await publication(f)).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
        where: { id: published.revisionId },
      });
      const forms = await getPublicEnrollmentForms({
        ...args,
        now: new Date(+revision.effectiveAt - 1),
      });
      expect(forms).toEqual([
        { name: f.document.name, version: 1, signed: true, requestId: null },
      ]);
      expect(
        await db.signedDocument.count({ where: { memberId: f.member.id } }),
      ).toBe(1);
    });
    it("[WF07 public enrollment] lets a verified TRIAL buyer accept an unsigned legacy MEMBER baseline without inventing a cycle", async () => {
      const f = await fixture();
      await db.member.update({
        where: { id: f.member.id },
        data: { status: "TRIAL" },
      });
      const document = await db.formDocument.create({
        data: {
          workspaceId: f.workspace.id,
          name: "Fictional unsigned legacy member baseline",
          formType: "WAIVER",
        },
      });
      const pdf = await db.formVersion.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: "legacy.pdf",
          mimeType: "application/pdf",
          fileData: f.bytes,
          fileSizeBytes: f.bytes.length,
          fileSha256: createHash("sha256").update(f.bytes).digest("hex"),
          uploadedByWorkspaceUserId: f.staff.id,
        },
      });
      await db.formDocument.update({
        where: { id: document.id },
        data: { currentVersionId: pdf.id },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: document.id,
          requirementTarget: "MEMBER",
        },
      });
      const enrollment = await verifiedEnrollment(f),
        at = new Date();
      const formsArgs = {
        workspaceId: f.workspace.id,
        enrollmentId: enrollment.id,
        actorUserId: f.customer.id,
        ensure: true,
        db,
        now: at,
      };
      const form = (await getPublicEnrollmentForms(formsArgs)).find(
        (row) => row.name === document.name,
      )!;
      expect(form.signed).toBe(false);
      expect(form.requestId).toBeTruthy();
      const result = await recordLocalFormSignature({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        requestId: form.requestId!,
        actorUserId: f.customer.id,
        signerName: "Fictional participant",
        db,
        now: at,
      });
      expect(result.status).toBe("signed");
      if (result.status !== "signed") throw new Error(JSON.stringify(result));
      expect(
        await db.signedDocument.findUniqueOrThrow({
          where: { id: result.signedDocumentId },
        }),
      ).toMatchObject({
        formVersionId: pdf.id,
        requirementRevisionId: null,
        acceptanceCycleKey: "legacy",
        validUntil: null,
      });
      expect(
        (await getPublicEnrollmentForms(formsArgs)).find(
          (row) => row.name === document.name,
        )!.signed,
      ).toBe(true);
    });
    it("[WF07 public trial] offers the future exact service cycle before its effective date and books only after its acceptance", async () => {
      const f = await fixture({ timezone: "America/Vancouver" });
      await db.member.update({
        where: { id: f.member.id },
        data: { status: "TRIAL" },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: f.document.id,
          requirementTarget: "TRIAL",
        },
      });
      const trialDate = addDays(f.date, 7),
        enrollment = await verifiedEnrollment(
          { ...f, date: trialDate },
          f.member,
          null,
          "TRIAL",
        );
      await db.workspaceWebsite.create({
        data: {
          workspaceId: f.workspace.id,
          slug: `forms-trial-${randomUUID()}`,
          draft: {},
          published: {},
          publishedAt: new Date(),
        },
      });
      const trialServiceAt = getZonedDateTimeAsUtc({
        dateString: trialDate,
        minutes: 600,
        timezone: "America/Vancouver",
      });
      const published = await (
        await publication(f, {
          targets: ["TRIAL"],
          effectiveAt: new Date(+trialServiceAt - 30 * 60000),
        })
      ).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
          where: { id: published.revisionId },
        }),
        at = new Date();
      expect(at < revision.effectiveAt).toBe(true);
      const args = {
        workspaceId: f.workspace.id,
        enrollmentId: enrollment.id,
        actorUserId: f.customer.id,
        ensure: true,
        db,
        now: at,
      };
      const forms = await getPublicEnrollmentForms(args);
      expect(forms).toHaveLength(1);
      expect(forms[0]!.signed).toBe(false);
      const request = await db.signatureRequest.findUniqueOrThrow({
        where: { id: forms[0]!.requestId! },
      });
      expect(request).toMatchObject({
        requirementRevisionId: revision.id,
        acceptanceCycleKey: revision.id,
      });
      expect(
        (
          await completeVerifiedTrial({
            ...args,
            portalBaseUrl: "https://members.example.test",
          })
        ).status,
      ).toBe("error");
      expect(
        (
          await recordLocalFormSignature({
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            requestId: request.id,
            actorUserId: f.customer.id,
            signerName: "Fictional trial participant",
            db,
            now: at,
          })
        ).status,
      ).toBe("signed");
      expect((await getPublicEnrollmentForms(args))[0]!.signed).toBe(true);
      const booked = await completeVerifiedTrial({
        ...args,
        portalBaseUrl: "https://members.example.test",
      });
      expect(booked.status).toBe("booked");
      if (booked.status !== "booked") throw new Error(JSON.stringify(booked));
      expect(
        await db.classBooking.findUniqueOrThrow({
          where: { id: booked.bookingId },
        }),
      ).toMatchObject({
        memberId: f.member.id,
        bookingType: "TRIAL",
        scheduledForDate: new Date(trialDate),
        schedulingPolicySnapshot: {
          timezone: "America/Vancouver",
          startsAt: trialServiceAt.toISOString(),
        },
      });
    });
    it("[WF07 public trial] rejects a currently signed cycle that expires before the named class without issuing an unusable request", async () => {
      const f = await fixture();
      await db.member.update({
        where: { id: f.member.id },
        data: { status: "TRIAL" },
      });
      const enrollment = await verifiedEnrollment(
        { ...f, date: addDays(f.date, 7) },
        f.member,
        null,
        "TRIAL",
      );
      const effectiveAt = new Date(Date.now() + 61 * 60000),
        validUntil = new Date(+effectiveAt + 86400000);
      const published = await (
        await publication(f, { targets: ["TRIAL"], effectiveAt, validUntil })
      ).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
          where: { id: published.revisionId },
        }),
        at = new Date(+effectiveAt + 1);
      const statuses = await resolveRequiredFormStatusesForMember({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        targets: ["TRIAL"],
        db,
        now: at,
      });
      const requestId = statuses.items[0]!.openRequests[0]!.requestId;
      expect(
        (
          await recordLocalFormSignature({
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            requestId,
            actorUserId: f.customer.id,
            signerName: "Fictional trial participant",
            db,
            now: at,
          })
        ).status,
      ).toBe("signed");
      const count = await db.signatureRequest.count({
        where: { memberId: f.member.id },
      });
      await expect(
        getPublicEnrollmentForms({
          workspaceId: f.workspace.id,
          enrollmentId: enrollment.id,
          actorUserId: f.customer.id,
          ensure: true,
          db,
          now: at,
        }),
      ).rejects.toThrow("expires before");
      expect(
        await db.signatureRequest.count({ where: { memberId: f.member.id } }),
      ).toBe(count);
      expect(
        await db.formRequirementRevision.count({
          where: { formDocumentId: f.document.id },
        }),
      ).toBe(1);
      expect(
        (revision.terms as { consentValidUntil: string }).consentValidUntil,
      ).toBe(validUntil.toISOString());
    });
    it("[WF07 public trial] fails closed for another gym's, unavailable or past named occurrence without issuing signing requests", async () => {
      const f = await fixture(),
        other = await fixture();
      await db.member.update({
        where: { id: f.member.id },
        data: { status: "TRIAL" },
      });
      const enrollment = await verifiedEnrollment(f, f.member, null, "TRIAL");
      const published = await (
        await publication(f, { targets: ["TRIAL"] })
      ).publish();
      const participant = (
        await db.publicEnrollment.findUniqueOrThrow({
          where: { id: enrollment.id },
        })
      ).participant as Prisma.JsonObject;
      const args = {
        workspaceId: f.workspace.id,
        enrollmentId: enrollment.id,
        actorUserId: f.customer.id,
        ensure: true,
        db,
      };
      const count = await db.signatureRequest.count({
        where: { memberId: f.member.id },
      });
      await db.publicEnrollment.update({
        where: { id: enrollment.id },
        data: {
          participant: { ...participant, classTemplateId: other.template.id },
        },
      });
      await expect(getPublicEnrollmentForms(args)).rejects.toThrow(
        "class changed or is unavailable",
      );
      await db.publicEnrollment.update({
        where: { id: enrollment.id },
        data: { participant },
      });
      await db.room.update({
        where: { id: f.room.id },
        data: { isActive: false },
      });
      await expect(getPublicEnrollmentForms(args)).rejects.toThrow(
        "class changed or is unavailable",
      );
      await db.room.update({
        where: { id: f.room.id },
        data: { isActive: true },
      });
      await db.publicEnrollment.update({
        where: { id: enrollment.id },
        data: {
          participant: {
            ...participant,
            scheduledForDate: addDays(f.date, -14),
          },
        },
      });
      await expect(getPublicEnrollmentForms(args)).rejects.toThrow(
        "no longer upcoming",
      );
      expect(
        await db.signatureRequest.count({ where: { memberId: f.member.id } }),
      ).toBe(count);
      expect(
        await db.signedDocument.count({
          where: {
            memberId: f.member.id,
            requirementRevisionId: published.revisionId,
          },
        }),
      ).toBe(0);
    });
    it("[WF07 public trial] preserves current-minor authority when the birthday precedes service and issues no unusable MEMBER request", async () => {
      const f = await fixture(),
        birthday = new Date(Date.now() + 3 * 86400000);
      const dob = new Date(
        Date.UTC(
          birthday.getUTCFullYear() - 18,
          birthday.getUTCMonth(),
          birthday.getUTCDate(),
        ),
      );
      const child = await db.member.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "Fictional upcoming adult",
          dateOfBirth: dob,
          status: "TRIAL",
        },
      });
      const guardian = await db.guardian.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "Fictional current guardian",
          email: f.customer.email,
          familyLinks: {
            create: {
              workspaceId: f.workspace.id,
              childMemberId: child.id,
              relationshipLabel: "Parent",
            },
          },
        },
      });
      await db.memberPortalGrant.create({
        data: {
          workspaceId: f.workspace.id,
          userId: f.customer.id,
          memberId: child.id,
          guardianId: guardian.id,
          canSign: true,
          canBook: true,
          canPay: true,
          verificationNote: "Fictional current verified guardian",
          verifiedByWorkspaceUserId: f.staff.id,
        },
      });
      const enrollment = await verifiedEnrollment(
        f,
        child,
        guardian.id,
        "TRIAL",
      );
      const published = await (
        await publication(f, { targets: ["TRIAL"] })
      ).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
          where: { id: published.revisionId },
        }),
        at = new Date();
      await expect(
        getPublicEnrollmentForms({
          workspaceId: f.workspace.id,
          enrollmentId: enrollment.id,
          actorUserId: f.customer.id,
          ensure: true,
          db,
          now: at,
        }),
      ).rejects.toThrow("signing authority changes");
      expect(
        await db.signatureRequest.count({ where: { memberId: child.id } }),
      ).toBe(0);
      const childAccount = await db.user.create({
        data: {
          email: `${randomUUID()}@forms-current-minor.example.test`,
          workspaceUsers: {
            create: { workspaceId: f.workspace.id, role: "CUSTOMER" },
          },
        },
      });
      users.push(childAccount.id);
      const linked = await db.member.update({
        where: { id: child.id },
        data: { userId: childAccount.id },
      });
      const selfEnrollment = await verifiedEnrollment(
        { ...f, customer: childAccount, member: linked },
        linked,
        null,
        "TRIAL",
      );
      await expect(
        getPublicEnrollmentForms({
          workspaceId: f.workspace.id,
          enrollmentId: selfEnrollment.id,
          actorUserId: childAccount.id,
          ensure: true,
          db,
          now: at,
        }),
      ).rejects.toThrow("currently verified guardian");
      expect(
        await db.signatureRequest.count({ where: { memberId: child.id } }),
      ).toBe(0);
      const crafted = await db.signatureRequest.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: child.id,
          formVersionId: f.pdf.id,
          requirementRevisionId: revision.id,
          acceptanceCycleKey: revision.id,
          signerKind: "MEMBER",
          accessMethod: "PORTAL",
        },
      });
      expect(
        (
          await recordLocalFormSignature({
            workspaceId: f.workspace.id,
            memberId: child.id,
            requestId: crafted.id,
            actorUserId: childAccount.id,
            signerName: "Fictional current minor",
            db,
            now: at,
          })
        ).status,
      ).toBe("error");
      expect(
        await db.signedDocument.count({ where: { memberId: child.id } }),
      ).toBe(0);
    });
    it("[WF07 public enrollment] rereads revoked persisted intent after a real legacy-signature enrollment-row lock wait", async () => {
      const f = await fixture();
      await db.member.update({
        where: { id: f.member.id },
        data: { status: "TRIAL" },
      });
      const enrollment = await verifiedEnrollment(f),
        document = await db.formDocument.create({
          data: {
            workspaceId: f.workspace.id,
            name: "Fictional waited legacy waiver",
            formType: "WAIVER",
          },
        });
      const pdf = await db.formVersion.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: "waited.pdf",
          mimeType: "application/pdf",
          fileData: f.bytes,
          fileSizeBytes: f.bytes.length,
          fileSha256: createHash("sha256").update(f.bytes).digest("hex"),
          uploadedByWorkspaceUserId: f.staff.id,
        },
      });
      await db.formDocument.update({
        where: { id: document.id },
        data: { currentVersionId: pdf.id },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: document.id,
          requirementTarget: "MEMBER",
        },
      });
      const request = await db.signatureRequest.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          formVersionId: pdf.id,
          signerKind: "MEMBER",
          accessMethod: "PORTAL",
        },
      });
      let seen!: () => void,
        proceed!: () => void,
        locked!: () => void,
        release!: () => void;
      const candidatesSeen = new Promise<void>((resolve) => (seen = resolve)),
        continueLookup = new Promise<void>((resolve) => (proceed = resolve)),
        writerLocked = new Promise<void>((resolve) => (locked = resolve)),
        releaseWriter = new Promise<void>((resolve) => (release = resolve));
      const wrapped = new Proxy(db, {
        get(target, key, receiver) {
          if (key !== "$transaction") return Reflect.get(target, key, receiver);
          return async (
            work: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options?: object,
          ) =>
            target.$transaction(
              async (tx) =>
                work(
                  new Proxy(tx, {
                    get(inner, property, innerReceiver) {
                      if (property !== "publicEnrollment")
                        return Reflect.get(inner, property, innerReceiver);
                      return new Proxy(inner.publicEnrollment, {
                        get(delegate, method, delegateReceiver) {
                          if (method !== "findMany")
                            return Reflect.get(
                              delegate,
                              method,
                              delegateReceiver,
                            );
                          return async (...args: unknown[]) => {
                            const result = await Reflect.apply(
                              delegate.findMany,
                              delegate,
                              args,
                            );
                            seen();
                            await continueLookup;
                            return result;
                          };
                        },
                      });
                    },
                  }),
                ),
              options,
            );
        },
      }) as PrismaClient;
      const signing = recordLocalFormSignature({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        requestId: request.id,
        actorUserId: f.customer.id,
        signerName: "Fictional participant",
        db: wrapped,
      });
      await candidatesSeen;
      const writer = db.$transaction(
        async (tx) => {
          await tx.publicEnrollment.update({
            where: { id: enrollment.id },
            data: { status: "FAILED" },
          });
          locked();
          await releaseWriter;
        },
        { timeout: 15000 },
      );
      await writerLocked;
      proceed();
      let observed = false;
      try {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const rows = await db.$queryRaw<
            Array<{ waiting: boolean }>
          >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0 AND query LIKE '%public_enrollments%' AND query LIKE '%FOR SHARE%') AS waiting`;
          if (rows[0]?.waiting) {
            observed = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      } finally {
        release();
        await writer;
      }
      const result = await signing;
      expect(observed).toBe(true);
      expect(result.status).toBe("error");
      expect(
        await db.signedDocument.count({
          where: { memberId: f.member.id, formVersionId: pdf.id },
        }),
      ).toBe(0);
      expect(
        (
          await db.signatureRequest.findUniqueOrThrow({
            where: { id: request.id },
          })
        ).status,
      ).toBe("OPEN");
    }, 20000);
    it("[WF07 public trial] uses the canonical ACTIVE person's MEMBER audience and can complete the trial after its exact proof", async () => {
      const f = await fixture();
      const document = await db.formDocument.create({
        data: {
          workspaceId: f.workspace.id,
          name: "Fictional active person's current member waiver",
          formType: "WAIVER",
        },
      });
      const pdf = await db.formVersion.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: "active-member.pdf",
          mimeType: "application/pdf",
          fileData: f.bytes,
          fileSizeBytes: f.bytes.length,
          fileSha256: createHash("sha256").update(f.bytes).digest("hex"),
          uploadedByWorkspaceUserId: f.staff.id,
        },
      });
      await db.formDocument.update({
        where: { id: document.id },
        data: { currentVersionId: pdf.id },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: document.id,
          requirementTarget: "MEMBER",
        },
      });
      await (await publication(f, { targets: ["TRIAL"] })).publish();
      const published = await (
        await publication({ ...f, document, pdf }, { targets: ["MEMBER"] })
      ).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
          where: { id: published.revisionId },
        }),
        at = new Date(),
        trialDate = addDays(f.date, 7);
      const enrollment = await verifiedEnrollment(
        { ...f, date: trialDate },
        f.member,
        null,
        "TRIAL",
      );
      await db.workspaceWebsite.create({
        data: {
          workspaceId: f.workspace.id,
          slug: `forms-active-trial-${randomUUID()}`,
          draft: {},
          published: {},
          publishedAt: at,
        },
      });
      const args = {
        workspaceId: f.workspace.id,
        enrollmentId: enrollment.id,
        actorUserId: f.customer.id,
        ensure: true,
        db,
        now: at,
      };
      const forms = await getPublicEnrollmentForms(args);
      expect(forms.map((row) => row.name)).toEqual([document.name]);
      expect(forms[0]!.signed).toBe(false);
      const request = await db.signatureRequest.findUniqueOrThrow({
        where: { id: forms[0]!.requestId! },
      });
      expect(request).toMatchObject({
        formVersionId: pdf.id,
        requirementRevisionId: revision.id,
        acceptanceCycleKey: revision.id,
        signerKind: "MEMBER",
      });
      expect(
        (
          await completeVerifiedTrial({
            ...args,
            portalBaseUrl: "https://members.example.test",
          })
        ).status,
      ).toBe("error");
      expect(
        (
          await recordLocalFormSignature({
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            requestId: request.id,
            actorUserId: f.customer.id,
            signerName: "Fictional active participant",
            db,
            now: at,
          })
        ).status,
      ).toBe("signed");
      expect(
        (
          await completeVerifiedTrial({
            ...args,
            portalBaseUrl: "https://members.example.test",
          })
        ).status,
      ).toBe("booked");
      expect(
        await db.signatureRequest.count({
          where: {
            memberId: f.member.id,
            formVersionId: f.pdf.id,
            requirementRevisionId: { not: null },
          },
        }),
      ).toBe(0);
    });
    it("[WF07 public enrollment] resolves the current TRIAL cycle without substituting membership enrollment intent", async () => {
      const f = await fixture();
      await db.member.update({
        where: { id: f.member.id },
        data: { status: "TRIAL" },
      });
      const enrollment = await verifiedEnrollment(f, f.member, null, "TRIAL");
      const published = await (
        await publication(f, {
          targets: ["TRIAL"],
          effectiveAt: new Date(Date.now() + 61 * 60000),
        })
      ).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
          where: { id: published.revisionId },
        }),
        at = new Date(+revision.effectiveAt + 1);
      const formsArgs = {
        workspaceId: f.workspace.id,
        enrollmentId: enrollment.id,
        actorUserId: f.customer.id,
        ensure: true,
        db,
        now: at,
      };
      const forms = await getPublicEnrollmentForms(formsArgs);
      expect(forms).toHaveLength(1);
      expect(forms[0]!.signed).toBe(false);
      const request = await db.signatureRequest.findUniqueOrThrow({
        where: { id: forms[0]!.requestId! },
      });
      expect(request).toMatchObject({
        requirementRevisionId: revision.id,
        acceptanceCycleKey: revision.id,
        signerKind: "MEMBER",
      });
      expect(
        (
          await recordLocalFormSignature({
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            requestId: request.id,
            actorUserId: f.customer.id,
            signerName: "Fictional trial participant",
            db,
            now: at,
          })
        ).status,
      ).toBe("signed");
      expect((await getPublicEnrollmentForms(formsArgs))[0]!.signed).toBe(true);
      expect(
        await db.publicEnrollment.count({
          where: { workspaceId: f.workspace.id, kind: "MEMBERSHIP" },
        }),
      ).toBe(0);
    });
    it("[WF07 public enrollment] allows the exact current verified guardian and reauthorizes signed replays after revocation", async () => {
      const f = await fixture();
      const child = await db.member.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "Fictional guardian enrollment child",
          dateOfBirth: new Date("2015-01-01"),
          status: "TRIAL",
        },
      });
      const guardian = await db.guardian.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "Fictional guardian",
          email: f.customer.email,
          familyLinks: {
            create: {
              workspaceId: f.workspace.id,
              childMemberId: child.id,
              relationshipLabel: "Parent",
            },
          },
        },
      });
      const grant = await db.memberPortalGrant.create({
        data: {
          workspaceId: f.workspace.id,
          userId: f.customer.id,
          memberId: child.id,
          guardianId: guardian.id,
          canSign: true,
          canPay: true,
          canBook: true,
          verificationNote: "Fictional verified guardian enrollment",
          verifiedByWorkspaceUserId: f.staff.id,
        },
      });
      const enrollment = await verifiedEnrollment(f, child, guardian.id);
      const published = await (
        await publication(f, { effectiveAt: new Date(Date.now() + 61 * 60000) })
      ).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
        where: { id: published.revisionId },
      });
      const at = new Date(+revision.effectiveAt + 1);
      const formsArgs = {
        workspaceId: f.workspace.id,
        enrollmentId: enrollment.id,
        actorUserId: f.customer.id,
        ensure: true,
        db,
        now: at,
      };
      const forms = await getPublicEnrollmentForms(formsArgs);
      expect(forms).toHaveLength(1);
      expect(forms[0]!.signed).toBe(false);
      const request = await db.signatureRequest.findUniqueOrThrow({
        where: { id: forms[0]!.requestId! },
      });
      expect(request).toMatchObject({
        workspaceId: f.workspace.id,
        memberId: child.id,
        guardianId: guardian.id,
        signerKind: "GUARDIAN",
        requirementRevisionId: revision.id,
        acceptanceCycleKey: revision.id,
      });
      const signArgs = {
        workspaceId: f.workspace.id,
        memberId: child.id,
        guardianId: guardian.id,
        requestId: request.id,
        actorUserId: f.customer.id,
        signerName: "Fictional guardian",
        db,
        now: at,
      };
      expect((await recordLocalFormSignature(signArgs)).status).toBe("signed");
      expect((await getPublicEnrollmentForms(formsArgs))[0]!.signed).toBe(true);
      // Consent belongs to this child/PDF/cycle; another currently authorized
      // guardian may rely on it without inventing a second unique signature.
      const secondCustomer = await db.user.create({
        data: {
          email: `${randomUUID()}@forms-second-guardian.example.test`,
          workspaceUsers: {
            create: { workspaceId: f.workspace.id, role: "CUSTOMER" },
          },
        },
      });
      users.push(secondCustomer.id);
      const secondPayer = await db.member.create({
        data: {
          workspaceId: f.workspace.id,
          userId: secondCustomer.id,
          fullName: "Fictional second guardian payer",
          email: secondCustomer.email,
          dateOfBirth: new Date("1988-01-01"),
          status: "ACTIVE",
        },
      });
      const secondGuardian = await db.guardian.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "Fictional second guardian",
          email: secondCustomer.email,
          familyLinks: {
            create: {
              workspaceId: f.workspace.id,
              childMemberId: child.id,
              relationshipLabel: "Parent",
            },
          },
        },
      });
      await db.memberPortalGrant.create({
        data: {
          workspaceId: f.workspace.id,
          userId: secondCustomer.id,
          memberId: child.id,
          guardianId: secondGuardian.id,
          canSign: true,
          canPay: true,
          canBook: true,
          verificationNote: "Fictional second currently verified guardian",
          verifiedByWorkspaceUserId: f.staff.id,
        },
      });
      const secondEnrollment = await verifiedEnrollment(
        { ...f, customer: secondCustomer, member: secondPayer },
        child,
        secondGuardian.id,
      );
      const secondFormsArgs = {
        ...formsArgs,
        enrollmentId: secondEnrollment.id,
        actorUserId: secondCustomer.id,
      };
      expect((await getPublicEnrollmentForms(secondFormsArgs))[0]!.signed).toBe(
        true,
      );
      await db.memberPortalGrant.update({
        where: { id: grant.id },
        data: { revokedAt: at },
      });
      await expect(getPublicEnrollmentForms(formsArgs)).rejects.toThrow(
        "verify guardian access",
      );
      expect((await recordLocalFormSignature(signArgs)).status).toBe("error");
      expect(
        await db.signedDocument.count({
          where: { memberId: child.id, requirementRevisionId: revision.id },
        }),
      ).toBe(1);
    });
    it("[WF07 public enrollment] rejects current-minor self signing and cross-tenant or cross-actor registration claims without issuing proof", async () => {
      const f = await fixture(),
        other = await fixture();
      await db.member.update({
        where: { id: f.member.id },
        data: { dateOfBirth: new Date("2015-01-01"), status: "TRIAL" },
      });
      const enrollment = await verifiedEnrollment(f);
      const published = await (
        await publication(f, { effectiveAt: new Date(Date.now() + 61 * 60000) })
      ).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
          where: { id: published.revisionId },
        }),
        at = new Date(+revision.effectiveAt + 1);
      const formsArgs = {
        workspaceId: f.workspace.id,
        enrollmentId: enrollment.id,
        actorUserId: f.customer.id,
        ensure: true,
        db,
        now: at,
      };
      await expect(getPublicEnrollmentForms(formsArgs)).rejects.toThrow(
        "currently verified guardian",
      );
      await expect(
        getPublicEnrollmentForms({
          ...formsArgs,
          workspaceId: other.workspace.id,
        }),
      ).rejects.toThrow("Registration not found");
      await expect(
        getPublicEnrollmentForms({
          ...formsArgs,
          actorUserId: other.customer.id,
        }),
      ).rejects.toThrow("account used for this registration");
      const request = await db.signatureRequest.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          formVersionId: f.pdf.id,
          signerKind: "MEMBER",
          accessMethod: "PORTAL",
          requirementRevisionId: revision.id,
          acceptanceCycleKey: revision.id,
        },
      });
      expect(
        (
          await recordLocalFormSignature({
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            requestId: request.id,
            actorUserId: f.customer.id,
            signerName: "Fictional minor",
            db,
            now: at,
          })
        ).status,
      ).toBe("error");
      expect(
        (
          await recordLocalFormSignature({
            workspaceId: other.workspace.id,
            memberId: f.member.id,
            requestId: request.id,
            actorUserId: other.customer.id,
            signerName: "Fictional foreign actor",
            db,
            now: at,
          })
        ).status,
      ).toBe("error");
      expect(
        await db.signedDocument.count({
          where: { memberId: f.member.id, requirementRevisionId: revision.id },
        }),
      ).toBe(0);
    });
    it("[WF07 public enrollment] does not treat a crafted MEMBER request as persisted enrollment intent", async () => {
      const f = await fixture();
      await db.member.update({
        where: { id: f.member.id },
        data: { status: "TRIAL" },
      });
      const published = await (
        await publication(f, { effectiveAt: new Date(Date.now() + 61 * 60000) })
      ).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
          where: { id: published.revisionId },
        }),
        at = new Date(+revision.effectiveAt + 1);
      const request = await db.signatureRequest.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          formVersionId: f.pdf.id,
          signerKind: "MEMBER",
          accessMethod: "PORTAL",
          requirementRevisionId: revision.id,
          acceptanceCycleKey: revision.id,
        },
      });
      const args = {
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        requestId: request.id,
        actorUserId: f.customer.id,
        signerName: "Fictional participant",
        db,
        now: at,
      };
      expect((await recordLocalFormSignature(args)).status).toBe("error");
      const enrollment = await verifiedEnrollment(f);
      await db.publicEnrollment.update({
        where: { id: enrollment.id },
        data: { createdAt: new Date(+at - 25 * 3600000) },
      });
      expect((await recordLocalFormSignature(args)).status).toBe("error");
      expect(
        await db.signedDocument.count({
          where: { memberId: f.member.id, requirementRevisionId: revision.id },
        }),
      ).toBe(0);
    });
    it("[WF07 public enrollment] rejects an old same-PDF proof for the newly effective renewal cycle", async () => {
      const f = await fixture();
      const published = await (
        await publication(f, { effectiveAt: new Date(Date.now() + 61 * 60000) })
      ).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
        where: { id: published.revisionId },
      });
      const at = new Date(+revision.effectiveAt + 1);
      const enrollment = await db.publicEnrollment.create({
        data: {
          workspaceId: f.workspace.id,
          kind: "MEMBERSHIP",
          status: "FORMS_REQUIRED",
          accessTokenHash: randomUUID(),
          email: f.customer.email,
          verificationCodeHash: "verified-fictional",
          verificationExpiresAt: new Date(+at + 3600000),
          verifiedAt: new Date(),
          memberId: f.member.id,
          participant: {
            fullName: f.member.fullName,
            dateOfBirth: "1990-01-01",
            email: f.customer.email,
            phone: "",
            guardianFullName: "",
            relationshipLabel: "",
            classTemplateId: "",
            scheduledForDate: "",
            offerId: "",
            termsFingerprint: "",
            accountUserId: f.customer.id,
            payerMemberId: f.member.id,
          },
          acceptedTerms: { registrationConsent: true },
        },
      });
      await db.member.update({
        where: { id: f.member.id },
        data: { status: "TRIAL" },
      });
      const forms = await getPublicEnrollmentForms({
        workspaceId: f.workspace.id,
        enrollmentId: enrollment.id,
        actorUserId: f.customer.id,
        ensure: true,
        db,
        now: at,
      } as Parameters<typeof getPublicEnrollmentForms>[0]);
      expect(forms).toHaveLength(1);
      expect(forms[0]!.signed).toBe(false);
      expect(forms[0]!.requestId).not.toBeNull();
      const request = await db.signatureRequest.findUniqueOrThrow({
        where: { id: forms[0]!.requestId! },
      });
      expect(request.requirementRevisionId).toBe(revision.id);
      expect(request.acceptanceCycleKey).toBe(revision.id);
      expect(
        (
          await recordLocalFormSignature({
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            requestId: request.id,
            actorUserId: f.customer.id,
            signerName: "Fictional participant",
            db,
            now: at,
          })
        ).status,
      ).toBe("signed");
      expect(
        (
          await getPublicEnrollmentForms({
            workspaceId: f.workspace.id,
            enrollmentId: enrollment.id,
            actorUserId: f.customer.id,
            ensure: true,
            db,
            now: at,
          })
        )[0]!.signed,
      ).toBe(true);
    });
    it("[WF07 public enrollment] rejects a revoked guardian even through a crafted published-cycle request", async () => {
      const f = await fixture();
      const child = await db.member.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "Fictional minor",
          dateOfBirth: new Date("2015-01-01"),
          status: "TRIAL",
        },
      });
      const guardian = await db.guardian.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "Fictional guardian",
          email: f.customer.email,
          familyLinks: {
            create: {
              workspaceId: f.workspace.id,
              childMemberId: child.id,
              relationshipLabel: "Parent",
            },
          },
        },
      });
      await db.memberPortalGrant.create({
        data: {
          workspaceId: f.workspace.id,
          userId: f.customer.id,
          memberId: child.id,
          guardianId: guardian.id,
          canSign: true,
          canPay: true,
          canBook: true,
          verificationNote: "Fictional previously verified grant",
          verifiedByWorkspaceUserId: f.staff.id,
          revokedAt: new Date(),
        },
      });
      const published = await (
        await publication(f, { targets: ["MEMBERSHIP_ACTIVATION"] })
      ).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
        where: { id: published.revisionId },
      });
      const request = await db.signatureRequest.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: child.id,
          guardianId: guardian.id,
          formVersionId: f.pdf.id,
          signerKind: "GUARDIAN",
          accessMethod: "PORTAL",
          requirementRevisionId: revision.id,
          acceptanceCycleKey: revision.id,
        },
      });
      const result = await recordLocalFormSignature({
        workspaceId: f.workspace.id,
        memberId: child.id,
        guardianId: guardian.id,
        requestId: request.id,
        actorUserId: f.customer.id,
        signerName: "Fictional guardian",
        db,
        now: new Date(+revision.effectiveAt + 1),
      });
      expect(result.status).toBe("error");
      expect(
        await db.signedDocument.count({
          where: { memberId: child.id, requirementRevisionId: revision.id },
        }),
      ).toBe(0);
    });
    for (const pack of [false, true])
      it(`blocks individual and bulk no-show consumption for a newly stranded ${pack ? "pack" : "membership"} booking`, async () => {
        const f = await fixture({ pack });
        await (await publication(f)).publish();
        const before = await db.membershipAllowanceEntry.findMany({
            where: { workspaceId: f.workspace.id },
          }),
          packBefore = await db.punchCardEntry.findMany({
            where: { workspaceId: f.workspace.id },
          });
        const afterClass = new Date(+f.serviceAt + 61 * 60000);
        expect(
          await recordAttendance({
            access: f.access,
            memberId: f.member.id,
            classTemplateId: f.template.id,
            scheduledForDate: f.date,
            state: "NO_SHOW",
            expectedVersion: "UNRECORDED",
            requestKey: randomUUID(),
            db: db as never,
            now: afterClass,
          }),
        ).toMatchObject({
          status: "error",
          message: expect.stringContaining("penalty-free"),
        });
        expect(
          await closeClassRoster({
            access: f.access,
            classTemplateId: f.template.id,
            scheduledForDate: f.date,
            requestKey: randomUUID(),
            db: db as never,
            now: afterClass,
          }),
        ).toMatchObject({
          status: "closed",
          closedCount: 0,
          skipped: [
            {
              memberId: f.member.id,
              reason: expect.stringContaining("penalty-free"),
            },
          ],
        });
        expect(
          await db.attendanceRecord.count({
            where: { workspaceId: f.workspace.id },
          }),
        ).toBe(0);
        expect(
          await db.membershipAllowanceEntry.findMany({
            where: { workspaceId: f.workspace.id },
          }),
        ).toEqual(before);
        expect(
          await db.punchCardEntry.findMany({
            where: { workspaceId: f.workspace.id },
          }),
        ).toEqual(packBefore);
        expect((await caseFor(f)).state).toBe("OPEN");
      });
    it("keeps a valid historical no-show when replacement publication occurs after service", async () => {
      const f = await fixture({ historical: true });
      await (await publication(f)).publish();
      const result = await recordAttendance({
        access: f.access,
        memberId: f.member.id,
        classTemplateId: f.template.id,
        scheduledForDate: f.date,
        state: "NO_SHOW",
        expectedVersion: "UNRECORDED",
        requestKey: randomUUID(),
        db: db as never,
        now: new Date(),
      });
      expect(result.status).toBe("recorded");
      expect(
        await db.bookingFormRecovery.count({
          where: { bookingId: f.bookingId },
        }),
      ).toBe(0);
      expect(
        (
          await db.classBooking.findUniqueOrThrow({
            where: { id: f.bookingId },
          })
        ).status,
      ).toBe("NO_SHOW");
    });
    it("exports exact form cycles and recovery rights through typed owner/member records while isolating another participant and payer", async () => {
      const f = await fixture();
      const published = await (
        await publication(f, { validUntil: new Date(+f.serviceAt + 86400000) })
      ).publish();
      expect((await acceptCycle(f, published.revisionId)).result.status).toBe(
        "signed",
      );
      await remedy(f, "KEEP_BOOKING");
      const recovery = await db.bookingFormRecovery.findFirstOrThrow({
        where: { bookingId: f.bookingId },
      });
      const booked = await db.classBooking.findUniqueOrThrow({
        where: { id: f.bookingId },
      });
      await db.classBooking.update({
        where: { id: f.bookingId },
        data: {
          formRequirementSnapshot: {
            ...(booked.formRequirementSnapshot as Prisma.JsonObject),
            privateNote: "UNREVIEWED_BOOKING_JSON_PRIVATE",
          },
        },
      });
      const other = await db.member.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "UNRELATED_PARTICIPANT_PRIVATE",
        },
      });
      const otherBooking = await db.classBooking.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: other.id,
          classTemplateId: f.template.id,
          scheduledForDate: new Date(f.date),
          bookingType: "TRIAL",
          status: "CANCELLED",
        },
      });
      await db.workspaceDataEvent.create({
        data: {
          workspaceId: f.workspace.id,
          kind: "FORM_RECOVERY_OPENED",
          metadata: {
            recoveryId: "UNRELATED_RECOVERY_PRIVATE",
            bookingId: otherBooking.id,
            fundingRevision: 1,
            revisionId: published.revisionId,
            arbitraryPrivate: "UNRELATED_EVENT_JSON_PRIVATE",
          },
        },
      });
      const injected = await db.workspaceDataEvent.create({
        data: {
          workspaceId: f.workspace.id,
          kind: "FORM_RECOVERY_TRANSITIONED",
          metadata: {
            recoveryId: recovery.id,
            bookingId: f.bookingId,
            fundingRevision: 1,
            from: "OPEN",
            to: "SIGNED",
            version: 2,
            action: "KEEP_BOOKING",
            privateContact: "UNREVIEWED_FORM_EVENT_PRIVATE",
            inputHash: "PRIVATE_COMMAND_HASH",
            refundEvidenceHash: "PRIVATE_REFUND_EVIDENCE_HASH",
            financialReviewCaseId: "PAYER_CASE_ID_PRIVATE",
            refundOperationIds: ["PAYER_REFUND_ID_PRIVATE"],
            refundIds: ["PAYER_REFUND_RECORD_PRIVATE"],
          },
        },
      });
      const owner = { workspaceId: f.workspace.id, userId: f.owner.id },
        member = { workspaceId: f.workspace.id, userId: f.customer.id };
      const job = await createWorkspaceDataExport(
        owner,
        "Fictional reviewed form archive",
        { db },
      );
      const business = JSON.parse(
        gunzipSync(
          (await downloadWorkspaceDataExport(owner, job.id, { db })).bytes,
        ).toString("utf8"),
      );
      expect(business.tables.FormRequirementRevision).toEqual([
        expect.objectContaining({
          id: published.revisionId,
          formVersionId: f.pdf.id,
          terms: expect.objectContaining({
            consentValidUntil: new Date(+f.serviceAt + 86400000).toISOString(),
          }),
        }),
      ]);
      expect(business.tables.BookingFormRecovery).toEqual([
        expect.objectContaining({
          id: recovery.id,
          state: "SIGNED",
          bookingId: f.bookingId,
        }),
      ]);
      expect(business.tables.FormRequirementRevision[0]).not.toHaveProperty(
        "previewHash",
      );
      expect(business.tables.BookingFormRecovery[0]).not.toHaveProperty(
        "evidenceHash",
      );
      const personalJob = await createMemberDataExport(
        member,
        { scope: "MEMBER", targetId: f.member.id },
        randomUUID(),
        { db },
      );
      const personal = JSON.parse(
        gunzipSync(
          (await downloadMemberDataExport(member, personalJob.id, { db }))
            .bytes,
        ).toString("utf8"),
      );
      expect(personal.tables.SignedDocument).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            acceptanceCycleKey: "legacy",
            validUntil: null,
          }),
          expect.objectContaining({
            requirementRevisionId: published.revisionId,
            acceptanceCycleKey: published.revisionId,
            validUntil: new Date(+f.serviceAt + 86400000).toISOString(),
          }),
        ]),
      );
      expect(personal.tables.BookingFormRecovery).toEqual([
        expect.objectContaining({ id: recovery.id, state: "SIGNED" }),
      ]);
      expect(
        personal.tables.FormRequirementRevision.map(
          (row: { id: string }) => row.id,
        ),
      ).toEqual([published.revisionId]);
      const personalEvent = personal.tables.WorkspaceDataEvent.find(
        (row: { id: string }) => row.id === injected.id,
      );
      for (const key of [
        "financialReviewCaseId",
        "refundOperationIds",
        "refundIds",
        "inputHash",
        "refundEvidenceHash",
      ])
        expect(personalEvent.metadata).not.toHaveProperty(key);
      for (const privateValue of [
        "UNREVIEWED_BOOKING_JSON_PRIVATE",
        "UNREVIEWED_FORM_EVENT_PRIVATE",
        "PRIVATE_COMMAND_HASH",
        "PRIVATE_REFUND_EVIDENCE_HASH",
      ]) {
        expect(JSON.stringify(personal)).not.toContain(privateValue);
        expect(JSON.stringify(business)).not.toContain(privateValue);
      }
      for (const privateValue of [
        "UNRELATED_PARTICIPANT_PRIVATE",
        "UNRELATED_RECOVERY_PRIVATE",
        otherBooking.id,
        "PAYER_CASE_ID_PRIVATE",
        "PAYER_REFUND_ID_PRIVATE",
        "PAYER_REFUND_RECORD_PRIVATE",
      ])
        expect(JSON.stringify(personal)).not.toContain(privateValue);
      const payer = await db.financialAccount.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          userId: f.customer.id,
        },
      });
      const payerJob = await createMemberDataExport(
        member,
        { scope: "PAYER", targetId: payer.id },
        randomUUID(),
        { db },
      );
      const payerArchive = JSON.parse(
        gunzipSync(
          (await downloadMemberDataExport(member, payerJob.id, { db })).bytes,
        ).toString("utf8"),
      );
      for (const model of [
        "FormRequirementRevision",
        "BookingFormRecovery",
        "SignedDocument",
      ])
        expect(payerArchive.tables).not.toHaveProperty(model);
      const audit = await getWorkspaceAudit({
        workspaceId: f.workspace.id,
        actorUserId: f.owner.id,
        kind: "FORM_RECOVERY_TRANSITIONED",
        db: db as never,
      });
      const audited = audit.events.find((row) => row.id === injected.id)!;
      expect(audited.before).toEqual({ state: "OPEN" });
      expect(audited.after).toEqual({ state: "SIGNED" });
      expect(JSON.stringify(audited)).not.toContain(
        "UNREVIEWED_FORM_EVENT_PRIVATE",
      );
      expect(JSON.stringify(audited)).not.toContain(
        "PRIVATE_REFUND_EVIDENCE_HASH",
      );
    });

    it("preserves exact split-refund identities and total in the business form history without adding payer details to the person's remedy projection", async () => {
      const f = await paidFixture();
      await (await publication(f)).publish();
      await remedy(f, "REFUND_REVIEW");
      const recovery = await db.bookingFormRecovery.findFirstOrThrow({
        where: { bookingId: f.bookingId },
      });
      const first = await refundOperation(f, 1000),
        second = await refundOperation(f, 1500);
      await reconcileFormRecoveryRefund({
        workspaceId: f.workspace.id,
        actorUserId: f.owner.id,
        recoveryId: recovery.id,
        expectedVersion: recovery.version,
        db,
      });
      const owner = { workspaceId: f.workspace.id, userId: f.owner.id },
        member = { workspaceId: f.workspace.id, userId: f.customer.id };
      const job = await createWorkspaceDataExport(
        owner,
        "Fictional split refund evidence archive",
        { db },
      );
      const business = JSON.parse(
        gunzipSync(
          (await downloadWorkspaceDataExport(owner, job.id, { db })).bytes,
        ).toString("utf8"),
      );
      const event = business.tables.WorkspaceDataEvent.find(
        (row: { kind: string; metadata: { to?: string } }) =>
          row.kind === "FORM_RECOVERY_TRANSITIONED" &&
          row.metadata.to === "REFUNDED",
      );
      expect(event.metadata).toMatchObject({
        recoveryId: recovery.id,
        refundOperationIds: [first.id, second.id].sort(),
        refundedAmountCents: 2500,
        refundCurrency: "cad",
      });
      expect(event.metadata.refundIds).toHaveLength(2);
      expect(event.metadata).not.toHaveProperty("refundEvidenceHash");
      const personalJob = await createMemberDataExport(
        member,
        { scope: "MEMBER", targetId: f.member.id },
        randomUUID(),
        { db },
      );
      const personal = JSON.parse(
        gunzipSync(
          (await downloadMemberDataExport(member, personalJob.id, { db }))
            .bytes,
        ).toString("utf8"),
      );
      const personalEvent = personal.tables.WorkspaceDataEvent.find(
        (row: { id: string }) => row.id === event.id,
      );
      expect(personalEvent.metadata).toMatchObject({
        recoveryId: recovery.id,
        to: "REFUNDED",
      });
      for (const key of [
        "refundOperationIds",
        "refundIds",
        "financialReviewCaseId",
        "refundedAmountCents",
        "refundCurrency",
      ])
        expect(personalEvent.metadata).not.toHaveProperty(key);
    });

    it("renews the same immutable PDF with one new proof per cycle, preserving legacy history", async () => {
      const f = await fixture(),
        published = await (await publication(f)).publish();
      const { args, result } = await acceptCycle(f, published.revisionId);
      expect(result.status).toBe("signed");
      const tapped = await Promise.all([
        recordLocalFormSignature(args),
        recordLocalFormSignature(args),
      ]);
      expect(tapped.every((row) => row.status === "already_signed")).toBe(true);
      expect(
        await db.formVersion.count({
          where: { formDocumentId: f.document.id },
        }),
      ).toBe(1);
      const signatures = await db.signedDocument.findMany({
        where: { memberId: f.member.id, formVersionId: f.pdf.id },
      });
      expect(signatures).toHaveLength(2);
      expect(signatures.map((row) => row.acceptanceCycleKey).sort()).toEqual(
        ["legacy", published.revisionId].sort(),
      );
      expect(
        signatures.find((row) => row.acceptanceCycleKey === "legacy")
          ?.validUntil,
      ).toBeNull();
      await expect(
        db.signedDocument.update({
          where: { id: signatures[0]!.id },
          data: { signerNameSnapshot: "Invented replacement" },
        }),
      ).rejects.toThrow("immutable");
      expect((await caseFor(f)).state).toBe("OPEN"); // Signature is not an implicit remedy waiver.
      expect((await remedy(f, "KEEP_BOOKING")).status).toBe("retained");
      expect(
        (
          await db.classBooking.findUniqueOrThrow({
            where: { id: f.bookingId },
          })
        ).status,
      ).toBe("BOOKED");
    });
    it("moves the last original allowance atomically inside its normal penalty cutoff", async () => {
      const f = await fixture({ limit: 1 }),
        published = await (await publication(f)).publish();
      await acceptCycle(f, published.revisionId);
      const target = await db.classTemplate.create({
        data: {
          workspaceId: f.workspace.id,
          programId: f.program.id,
          roomId: f.room.id,
          weekday: getWeekdayForDateString(f.date),
          startTimeMinutes: 720,
          endTimeMinutes: 780,
          cancellationCutoffMinutes: 1440,
          bookingCutoffMinutes: 0,
        },
      });
      const result = await remedy(f, "REBOOK", {
        targetClassTemplateId: target.id,
        targetDate: f.date,
        now: new Date(+f.serviceAt - 60000),
      });
      expect(result.status).toBe("moved");
      expect(
        (
          await db.classBooking.findUniqueOrThrow({
            where: { id: f.bookingId },
          })
        ).status,
      ).toBe("CANCELLED");
      expect(
        await db.classBooking.count({
          where: { workspaceId: f.workspace.id, status: "BOOKED" },
        }),
      ).toBe(1);
    });
    it("leaves the original seat, pack unit and review open when the atomic target move fails", async () => {
      const f = await fixture({ pack: true }),
        published = await (await publication(f)).publish();
      await acceptCycle(f, published.revisionId);
      const target = await db.classTemplate.create({
        data: {
          workspaceId: f.workspace.id,
          programId: f.program.id,
          roomId: f.room.id,
          weekday: getWeekdayForDateString(f.date),
          startTimeMinutes: 720,
          endTimeMinutes: 780,
          cancellationCutoffMinutes: 1440,
          capacityOverride: 0,
          bookingCutoffMinutes: 0,
        },
      });
      const original = await db.classBooking.findUniqueOrThrow({
          where: { id: f.bookingId },
        }),
        pack = await db.memberPunchCard.findFirstOrThrow({
          where: { memberId: f.member.id },
        });
      expect(
        (
          await remedy(f, "REBOOK", {
            targetClassTemplateId: target.id,
            targetDate: f.date,
            now: new Date(+f.serviceAt - 60000),
          })
        ).status,
      ).toBe("error");
      expect(
        await db.classBooking.findUniqueOrThrow({ where: { id: f.bookingId } }),
      ).toEqual(original);
      expect(
        await db.memberPunchCard.findUniqueOrThrow({ where: { id: pack.id } }),
      ).toEqual(pack);
      expect((await caseFor(f)).state).toBe("OPEN");
    });
    it("does not call a refund review a refund or erase a later legitimate no-show after valid acceptance", async () => {
      const f = await fixture();
      await (await publication(f)).publish();
      expect(
        (
          await remedy(f, "REFUND_REVIEW", {
            now: new Date(+f.serviceAt + 60000),
          })
        ).status,
      ).toBe("refund_review");
      const recovery = await db.bookingFormRecovery.findFirstOrThrow({
        where: { bookingId: f.bookingId },
      });
      expect(recovery.state).toBe("REFUND_REVIEW");
      await expect(
        reconcileFormRecoveryRefund({
          db,
          workspaceId: f.workspace.id,
          actorUserId: f.owner.id,
          recoveryId: recovery.id,
          expectedVersion: recovery.version,
        }),
      ).rejects.toThrow("has not completed");
      expect(
        await db.refund.count({ where: { workspaceId: f.workspace.id } }),
      ).toBe(0);
      const valid = await fixture(),
        published = await (await publication(valid)).publish();
      await acceptCycle(valid, published.revisionId);
      expect(
        (
          await remedy(valid, "CANCEL", {
            now: new Date(+valid.serviceAt + 60000),
          })
        ).status,
      ).toBe("error");
    });
    it("binds publication preview to real affected contacts and current owner authority", async () => {
      const f = await fixture(),
        plan = await publication(f);
      const originalNotices = await db.notificationJob.findMany({
        where: { workspaceId: f.workspace.id },
        orderBy: { id: "asc" },
      });
      expect(originalNotices).toHaveLength(1);
      expect(originalNotices[0]!.context).toMatchObject({
        kind: "CLASS_SERVICE_NOTICE",
        notice: "CONFIRMATION",
        bookingId: f.bookingId,
      });
      await db.user.update({
        where: { id: f.customer.id },
        data: { email: `${randomUUID()}@changed.example.test` },
      });
      await expect(plan.publish()).rejects.toThrow("changed");
      expect(
        await db.formRequirementRevision.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(0);
      const next = await publication(f);
      await db.workspaceUser.update({
        where: { id: f.staff.id },
        data: { role: "COACH" },
      });
      await expect(next.publish()).rejects.toThrow("access changed");
      expect(
        await db.formRequirementRevision.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(0);
      expect(
        await db.notificationJob.findMany({
          where: { workspaceId: f.workspace.id },
          orderBy: { id: "asc" },
        }),
      ).toEqual(originalNotices);
    });
    it("warns about actual consent expiry once and suppresses stale/renewed delivery without claiming sent", async () => {
      const f = await fixture(),
        effectiveAt = new Date(Date.now() + 2 * 86400000),
        expiry = new Date(+effectiveAt + 86400000);
      const published = await (
        await publication(f, { effectiveAt, validUntil: expiry })
      ).publish();
      await acceptCycle(f, published.revisionId);
      const now = new Date(+expiry - 3600000);
      const args = {
        db,
        workspaceId: f.workspace.id,
        portalOrigin: "https://members.example.test",
        now,
      };
      expect((await processFormRequirementWarnings(args)).queued).toBe(1);
      expect((await processFormRequirementWarnings(args)).queued).toBe(0);
      const warning = await db.notificationJob.findFirstOrThrow({
        where: {
          workspaceId: f.workspace.id,
          dedupeKey: { startsWith: "form-expiry:" },
        },
      });
      expect(warning.status).toBe("PENDING");
      expect(warning.providerMessageId).toBeNull();
      expect(await shouldDeliverNotification(warning, db, now)).toBe(true);
      expect(await shouldDeliverNotification(warning, db, expiry)).toBe(false);
      await db.workspaceUser.updateMany({
        where: { workspaceId: f.workspace.id, userId: f.customer.id },
        data: { isActive: false },
      });
      expect(await shouldDeliverNotification(warning, db, now)).toBe(false);
    });
    it("withdraws a scheduled obstacle through a new revision without deleting the original proof or case", async () => {
      const f = await fixture(),
        first = await publication(f),
        published = await first.publish();
      const second = await publication(f, {
        effectiveAt: new Date(first.args.input.terms.effectiveAt),
        targets: [],
      });
      await second.publish();
      expect(
        await db.formRequirementRevision.count({
          where: { formDocumentId: f.document.id },
        }),
      ).toBe(2);
      expect(
        (
          await db.bookingFormRecovery.findFirstOrThrow({
            where: {
              bookingId: f.bookingId,
              requirementRevisionId: published.revisionId,
            },
          })
        ).state,
      ).toBe("NO_LONGER_REQUIRED");
      expect(
        await db.signedDocument.count({ where: { memberId: f.member.id } }),
      ).toBe(1);
      expect(
        (
          await db.classBooking.findUniqueOrThrow({
            where: { id: f.bookingId },
          })
        ).status,
      ).toBe("BOOKED");
    });
    it("enforces composite tenant/version foreign keys and rejects mismatched exact-cycle evidence", async () => {
      const f = await fixture(),
        other = await fixture();
      const first = await (await publication(f)).publish(),
        foreign = await (await publication(other)).publish();
      const secondPdf = await db.formVersion.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: f.document.id,
          versionNumber: 2,
          fileName: "fictional-revision.pdf",
          mimeType: "application/pdf",
          fileData: f.bytes,
          fileSizeBytes: f.bytes.length,
          fileSha256: f.pdf.fileSha256,
          uploadedByWorkspaceUserId: f.staff.id,
        },
      });
      const secondDocument = await db.formDocument.create({
        data: {
          workspaceId: f.workspace.id,
          name: "Fictional separate exact document",
          formType: "WAIVER",
        },
      });
      const defs = await db.$queryRaw<
        Array<{ conname: string; definition: string }>
      >`SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('form_revision_document_scope_fk','form_revision_version_scope_fk','form_recovery_original_scope_fk','form_recovery_revision_scope_fk','form_recovery_reviewer_scope_fk','form_recovery_replacement_scope_fk','form_recovery_financial_case_scope_fk','signature_request_revision_scope_fk','signed_document_revision_scope_fk')`;
      expect(defs).toHaveLength(9);
      expect(
        defs.find((row) => row.conname === "form_revision_version_scope_fk")
          ?.definition,
      ).toContain(
        'FOREIGN KEY ("workspaceId", "formDocumentId", "formVersionId")',
      );
      expect(
        defs.find(
          (row) => row.conname === "signature_request_revision_scope_fk",
        )?.definition,
      ).toContain(
        'FOREIGN KEY ("workspaceId", "formVersionId", "requirementRevisionId")',
      );
      for (const data of [
        {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          formVersionId: f.pdf.id,
          requirementRevisionId: foreign.revisionId,
          acceptanceCycleKey: foreign.revisionId,
        },
        {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          formVersionId: other.pdf.id,
          requirementRevisionId: first.revisionId,
          acceptanceCycleKey: first.revisionId,
        },
        {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          formVersionId: secondPdf.id,
          requirementRevisionId: first.revisionId,
          acceptanceCycleKey: first.revisionId,
        },
        {
          workspaceId: f.workspace.id,
          memberId: other.member.id,
          formVersionId: f.pdf.id,
          requirementRevisionId: first.revisionId,
          acceptanceCycleKey: first.revisionId,
        },
      ])
        await expect(
          db.signatureRequest.create({
            data: { ...data, signerKind: "MEMBER", accessMethod: "PORTAL" },
          }),
        ).rejects.toThrow();
      const row = await db.formRequirementRevision.findUniqueOrThrow({
        where: { id: first.revisionId },
      });
      await expect(
        db.formRequirementRevision.create({
          data: {
            ...row,
            id: randomUUID(),
            version: 2,
            previousRevisionHash: row.revisionHash,
            legacyBaseline: Prisma.DbNull,
            formDocumentId: other.document.id,
            terms: row.terms as Prisma.InputJsonValue,
          },
        }),
      ).rejects.toThrow();
      await expect(
        db.formRequirementRevision.create({
          data: {
            ...row,
            id: randomUUID(),
            version: 2,
            previousRevisionHash: row.revisionHash,
            legacyBaseline: Prisma.DbNull,
            formDocumentId: secondDocument.id,
            terms: row.terms as Prisma.InputJsonValue,
          },
        }),
      ).rejects.toThrow();
      await acceptCycle(f, first.revisionId);
      const legacy = await db.signatureRequest.findFirstOrThrow({
        where: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          acceptanceCycleKey: "legacy",
          status: "COMPLETED",
        },
      });
      await expect(
        db.signedDocument.create({
          data: {
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            formVersionId: f.pdf.id,
            requirementRevisionId: first.revisionId,
            acceptanceCycleKey: first.revisionId,
            signerKind: "MEMBER",
            signedFromRequestId: legacy.id,
            signerNameSnapshot: "Fictional participant",
            signatureMethod: "LOCAL_TYPED_NAME",
            signedAt: new Date(),
          },
        }),
      ).rejects.toThrow();
      const recovery = await caseFor(f),
        foreignCase = await caseFor(other);
      const review = await db.financialReviewCase.create({
        data: {
          workspaceId: other.workspace.id,
          sourceKey: randomUUID(),
          reason: "Fictional cross-gym review",
          memberId: other.member.id,
          bookingId: other.bookingId,
        },
      });
      for (const change of [
        { bookingId: other.bookingId },
        { requirementRevisionId: foreignCase.requirementRevisionId },
        { assignedToWorkspaceUserId: other.staff.id },
        { replacementBookingId: other.bookingId },
        { financialReviewCaseId: review.id },
      ])
        await expect(
          db.bookingFormRecovery.create({
            data: {
              ...recovery,
              id: randomUUID(),
              evidence: recovery.evidence as Prisma.InputJsonValue,
              ...change,
            },
          }),
        ).rejects.toThrow();
      expect(
        await db.bookingFormRecovery.count({
          where: { workspaceId: f.workspace.id },
        }),
      ).toBe(1);
    });
    it("retains legacy uniqueness and forbids a made-up cycle with no reviewed revision", async () => {
      const f = await fixture();
      const data = {
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        formVersionId: f.pdf.id,
        signerKind: "MEMBER" as const,
        signerNameSnapshot: "Fictional participant",
        signatureMethod: "LOCAL_TYPED_NAME",
        signedAt: new Date(),
      };
      await expect(db.signedDocument.create({ data })).rejects.toMatchObject({
        code: "P2002",
      });
      await expect(
        db.signedDocument.create({
          data: { ...data, acceptanceCycleKey: "invented-no-revision" },
        }),
      ).rejects.toThrow();
      await expect(
        db.signatureRequest.create({
          data: {
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            formVersionId: f.pdf.id,
            acceptanceCycleKey: "invented-no-revision",
            signerKind: "MEMBER",
            accessMethod: "PORTAL",
          },
        }),
      ).rejects.toThrow();
      expect(
        await db.signedDocument.count({ where: { memberId: f.member.id } }),
      ).toBe(1);
    });
    it("rejects a replacement or financial review for a different participant in the same gym", async () => {
      const f = await fixture();
      await (await publication(f)).publish();
      const unrelated = await db.member.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "Fictional unrelated participant",
        },
      });
      const target = await db.classBooking.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: unrelated.id,
          classTemplateId: f.template.id,
          scheduledForDate: new Date(f.date),
          bookingType: "TRIAL",
          source: "ADMIN",
        },
      });
      const review = await db.financialReviewCase.create({
        data: {
          workspaceId: f.workspace.id,
          sourceKey: randomUUID(),
          reason: "Fictional unrelated participant",
          memberId: unrelated.id,
          bookingId: f.bookingId,
        },
      });
      const recovery = await caseFor(f);
      for (const change of [
        { replacementBookingId: target.id },
        { financialReviewCaseId: review.id },
      ])
        await expect(
          db.bookingFormRecovery.update({
            where: { id: recovery.id },
            data: { ...change, version: { increment: 1 } },
          }),
        ).rejects.toThrow("exact tenant/commitment/reviewer");
      expect((await caseFor(f)).version).toBe(recovery.version);
    });
    it("applies aggregate status before database count and cursor pagination, with an exact-cycle page summary", async () => {
      const f = await fixture(),
        published = await (await publication(f)).publish();
      const completeAt = new Date(+f.serviceAt - 60000);
      const missing = await db.$transaction((tx) =>
        buildRequiredFormsMemberFilterTx({
          db: tx,
          actor: { workspaceId: f.workspace.id, userId: f.owner.id },
          now: completeAt,
          state: "ACTION_REQUIRED",
        }),
      );
      expect(
        await db.member.count({
          where: { AND: [missing, { archivedAt: null }] },
        }),
      ).toBe(1);
      expect(
        (
          await db.member.findMany({
            where: { AND: [missing, { archivedAt: null }] },
            orderBy: { id: "asc" },
            take: 1,
          })
        ).map((row) => row.id),
      ).toEqual([f.member.id]);
      await acceptCycle(f, published.revisionId);
      const rows = await db.$transaction(async (tx) => {
        const filter = await buildRequiredFormsMemberFilterTx({
          db: tx,
          actor: { workspaceId: f.workspace.id, userId: f.owner.id },
          now: completeAt,
          state: "COMPLETE",
        });
        const page = await tx.member.findMany({
          where: filter,
          orderBy: { id: "asc" },
          take: 1,
        });
        const summary = await summarizeRequiredFormsForMembersTx({
          db: tx,
          actor: { workspaceId: f.workspace.id, userId: f.owner.id },
          memberIds: page.map((row) => row.id),
          now: completeAt,
        });
        return {
          count: await tx.member.count({ where: filter }),
          page,
          summary,
        };
      });
      expect(rows.count).toBe(1);
      expect(rows.summary.get(f.member.id)).toMatchObject({
        state: "COMPLETE",
        missingCount: 0,
      });
    });
    it("includes a booking that committed before a waited publication, using the actual accepted cycle and serialization order", async () => {
      const f = await fixture({ limit: 2 }),
        plan = await publication(f);
      const target = await db.classTemplate.create({
        data: {
          workspaceId: f.workspace.id,
          programId: f.program.id,
          roomId: f.room.id,
          weekday: getWeekdayForDateString(f.date),
          startTimeMinutes: 720,
          endTimeMinutes: 780,
          cancellationCutoffMinutes: 1440,
          bookingCutoffMinutes: 0,
        },
      });
      let release!: () => void, prepared!: () => void;
      const gate = new Promise<void>((resolve) => {
          release = resolve;
        }),
        ready = new Promise<void>((resolve) => {
          prepared = resolve;
        });
      const holder = db.$transaction(
        async (tx) => {
          await lockClassSchedule(tx, f.workspace.id);
          const adapter = {
            $transaction: (
              work: (client: Prisma.TransactionClient) => Promise<unknown>,
            ) => work(tx),
          };
          const booking = await createAccessBackedBooking({
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            classTemplateId: target.id,
            scheduledForDate: f.date,
            timezone: "UTC",
            source: "MEMBER_PORTAL",
            db: adapter as never,
          });
          if (booking.status !== "created")
            throw new Error(`Earlier real booking failed: ${booking.status}`);
          prepared();
          await gate;
          return booking;
        },
        { isolationLevel: "ReadCommitted", timeout: 20000 },
      );
      await ready;
      const publishing = plan.publish().then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
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
            { timeout: 5000 },
          )
          .toBe(true);
      } finally {
        release();
      }
      const booked = await holder,
        published = await publishing;
      const accepted = (
        await db.classBooking.findUniqueOrThrow({
          where: { id: booked.bookingId },
        })
      ).formRequirementSnapshot as Prisma.JsonObject;
      expect(
        (accepted.requirements as Prisma.JsonArray).every(
          (row) => (row as Prisma.JsonObject).acceptanceCycleKey === "legacy",
        ),
      ).toBe(true);
      if (!published.ok) {
        expect(published.error.message).toContain("changed");
        await (await publication(f)).publish();
      }
      expect(
        await db.bookingFormRecovery.count({
          where: { bookingId: booked.bookingId, state: "OPEN" },
        }),
      ).toBe(1);
      const revision = await db.formRequirementRevision.findFirstOrThrow({
        where: { workspaceId: f.workspace.id },
      });
      expect(revision.publishedAt > new Date(String(accepted.acceptedAt))).toBe(
        true,
      );
    });
    it("reauthorizes a guardian before replay and fails a waited revocation without changing the booking", async () => {
      const f = await fixture();
      await (await publication(f)).publish();
      const user = await db.user.create({
        data: { email: `${randomUUID()}@forms-guardian.example.test` },
      });
      users.push(user.id);
      await db.workspaceUser.create({
        data: {
          workspaceId: f.workspace.id,
          userId: user.id,
          role: "CUSTOMER",
        },
      });
      const guardian = await db.guardian.create({
        data: {
          workspaceId: f.workspace.id,
          fullName: "Fictional verified carer",
          email: user.email,
        },
      });
      await db.familyLink.create({
        data: {
          workspaceId: f.workspace.id,
          childMemberId: f.member.id,
          guardianId: guardian.id,
        },
      });
      const grant = await db.memberPortalGrant.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          userId: user.id,
          guardianId: guardian.id,
          verifiedByWorkspaceUserId: f.staff.id,
          verificationNote: "Fictional verified booking scope",
          canBook: true,
        },
      });
      const recovery = await caseFor(f),
        input = {
          workspaceId: f.workspace.id,
          actorUserId: user.id,
          recoveryId: recovery.id,
          expectedVersion: recovery.version,
          choice: "CANCEL" as const,
          operationId: randomUUID(),
          db,
        };
      let release!: () => void, acquired!: () => void;
      const gate = new Promise<void>((resolve) => {
          release = resolve;
        }),
        ready = new Promise<void>((resolve) => {
          acquired = resolve;
        });
      const holder = db.$transaction(
        async (tx) => {
          await lockClassSchedule(tx, f.workspace.id);
          acquired();
          await gate;
          await tx.memberPortalGrant.update({
            where: { id: grant.id },
            data: { revokedAt: new Date(), version: { increment: 1 } },
          });
        },
        { timeout: 20000 },
      );
      await ready;
      const attempted = resolveBookingFormRecovery(input);
      try {
        await expect
          .poll(
            async () => {
              const rows = await db.$queryRaw<
                Array<{ waiting: boolean }>
              >`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objsubid=1 AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND objid::bigint=(hashtext(${`class-schedule:${f.workspace.id}`})::bigint & 4294967295)) AS waiting`;
              return rows[0]?.waiting;
            },
            { timeout: 5000 },
          )
          .toBe(true);
      } finally {
        release();
        await holder;
      }
      expect(await attempted).toMatchObject({
        status: "error",
        message: expect.stringContaining("permission"),
      });
      expect(
        (
          await db.classBooking.findUniqueOrThrow({
            where: { id: f.bookingId },
          })
        ).status,
      ).toBe("BOOKED");
      await db.memberPortalGrant.update({
        where: { id: grant.id },
        data: { revokedAt: null, version: { increment: 1 } },
      });
      const replayInput = { ...input, operationId: randomUUID() };
      const successful = await resolveBookingFormRecovery(replayInput);
      expect(successful.status).toBe("cancelled");
      await db.workspaceUser.updateMany({
        where: { workspaceId: f.workspace.id, userId: user.id },
        data: { isActive: false },
      });
      expect((await resolveBookingFormRecovery(replayInput)).status).toBe(
        "error",
      );
    });

    for (const target of ["document", "assignment"] as const)
      it(`fences an old Serializable legacy ${target} editor after a first ReadCommitted publication wins`, async () => {
        const f = await fixture(),
          plan = await publication(f);
        let release!: () => void, prepared!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
          }),
          ready = new Promise<void>((resolve) => {
            prepared = resolve;
          });
        // Exercise the SQL boundary even if a legacy/import writer does not opt into
        // Serializable. The product publication itself retains Serializable.
        const holding = new Proxy(db, {
          get(client, key) {
            if (key === "$transaction")
              return (
                work: (tx: Prisma.TransactionClient) => Promise<unknown>,
                options: Record<string, unknown>,
              ) =>
                client.$transaction(
                  async (tx) => {
                    const value = await work(tx);
                    prepared();
                    await gate;
                    return value;
                  },
                  {
                    ...options,
                    isolationLevel: "ReadCommitted",
                    timeout: 20000,
                  },
                );
            const value = Reflect.get(client, key);
            return typeof value === "function" ? value.bind(client) : value;
          },
        }) as PrismaClient;
        const publishing = publishFormRequirement({
          ...plan.args,
          db: holding,
          expectedPreviewHash: plan.preview.previewHash,
          confirmShortNotice: true,
          portalOrigin: "https://members.example.test",
        });
        await ready;
        const editing = db
          .$transaction(
            async (tx) => {
              await tx.formRequirementRevision.count({
                where: { formDocumentId: f.document.id },
              }); // old snapshot: publication is uncommitted
              await tx.$queryRaw`SELECT id FROM form_documents WHERE id=${f.document.id} FOR UPDATE`;
              if (target === "assignment")
                await tx.requiredFormAssignment.updateMany({
                  where: {
                    workspaceId: f.workspace.id,
                    formDocumentId: f.document.id,
                  },
                  data: { isActive: false },
                });
              else
                await tx.formDocument.update({
                  where: { id: f.document.id },
                  data: { archivedAt: new Date() },
                });
            },
            { isolationLevel: "Serializable", timeout: 20000 },
          )
          .then(
            (value) => ({ ok: true as const, value }),
            (error) => ({ ok: false as const, error }),
          );
        try {
          await expect
            .poll(
              async () => {
                const rows = await db.$queryRaw<
                  Array<{ waiting: boolean }>
                >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND state='active' AND query LIKE '%form_documents%') AS waiting`;
                return rows[0]?.waiting;
              },
              { timeout: 5000 },
            )
            .toBe(true);
        } finally {
          release();
          await publishing;
        }
        const result = await editing;
        expect(result.ok).toBe(false);
        if (!result.ok)
          expect(result.error).toMatchObject({
            code: "P2010",
            meta: { code: "40001" },
          });
        expect(
          (
            await db.formDocument.findUniqueOrThrow({
              where: { id: f.document.id },
            })
          ).archivedAt,
        ).toBeNull();
        expect(
          (
            await db.requiredFormAssignment.findFirstOrThrow({
              where: { formDocumentId: f.document.id },
            })
          ).isActive,
        ).toBe(true);
        await expect(
          db.requiredFormAssignment.updateMany({
            where: { formDocumentId: f.document.id },
            data: { isActive: false },
          }),
        ).rejects.toThrow("reviewed publication");
      });
    it("fences a stale first-publication preview when a legacy assignment edit wins its parent row", async () => {
      const f = await fixture(),
        plan = await publication(f);
      let release!: () => void, prepared!: () => void;
      const gate = new Promise<void>((resolve) => {
          release = resolve;
        }),
        ready = new Promise<void>((resolve) => {
          prepared = resolve;
        });
      const editing = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM form_documents WHERE id=${f.document.id} FOR UPDATE`;
          await tx.requiredFormAssignment.updateMany({
            where: { formDocumentId: f.document.id },
            data: { isActive: false },
          });
          prepared();
          await gate;
        },
        { isolationLevel: "ReadCommitted", timeout: 20000 },
      );
      await ready;
      const publishing = plan.publish().then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      );
      try {
        await expect
          .poll(
            async () => {
              const rows = await db.$queryRaw<
                Array<{ waiting: boolean }>
              >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND state='active' AND query LIKE '%form_documents%') AS waiting`;
              return rows[0]?.waiting;
            },
            { timeout: 5000 },
          )
          .toBe(true);
      } finally {
        release();
        await editing;
      }
      const result = await publishing;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain("changed");
      expect(
        await db.formRequirementRevision.count({
          where: { formDocumentId: f.document.id },
        }),
      ).toBe(0);
      expect(
        (
          await db.requiredFormAssignment.findFirstOrThrow({
            where: { formDocumentId: f.document.id },
          })
        ).isActive,
      ).toBe(false);
    });

    it("rechecks after a waited publication and never invents recovery for a booking accepting its later cycle", async () => {
      const f = await fixture({ limit: 2 });
      const target = await db.classTemplate.create({
        data: {
          workspaceId: f.workspace.id,
          programId: f.program.id,
          roomId: f.room.id,
          weekday: getWeekdayForDateString(f.date),
          startTimeMinutes: 720,
          endTimeMinutes: 780,
          cancellationCutoffMinutes: 1440,
          bookingCutoffMinutes: 0,
        },
      });
      const plan = await publication(f);
      let release!: () => void, prepared!: () => void;
      const gate = new Promise<void>((resolve) => {
          release = resolve;
        }),
        ready = new Promise<void>((resolve) => {
          prepared = resolve;
        });
      const holding = new Proxy(db, {
        get(client, key) {
          if (key === "$transaction")
            return (
              work: (tx: Prisma.TransactionClient) => Promise<unknown>,
              options: Record<string, unknown>,
            ) =>
              client.$transaction(async (tx) => {
                const value = await work(tx);
                prepared();
                await gate;
                return value;
              }, options);
          const value = Reflect.get(client, key);
          return typeof value === "function" ? value.bind(client) : value;
        },
      }) as PrismaClient;
      const publishing = publishFormRequirement({
        ...plan.args,
        db: holding,
        expectedPreviewHash: plan.preview.previewHash,
        confirmShortNotice: true,
        portalOrigin: "https://members.example.test",
      });
      await ready;
      const bookingArgs = {
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        classTemplateId: target.id,
        scheduledForDate: f.date,
        timezone: "UTC",
        source: "MEMBER_PORTAL" as const,
        db: db as never,
      };
      const waiting = createAccessBackedBooking(bookingArgs);
      try {
        await expect
          .poll(
            async () => {
              const rows = await db.$queryRaw<
                Array<{ waiting: boolean }>
              >`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objsubid=1 AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND objid::bigint=(hashtext(${`class-schedule:${f.workspace.id}`})::bigint & 4294967295)) AS waiting`;
              return rows[0]?.waiting;
            },
            { timeout: 5000 },
          )
          .toBe(true);
      } finally {
        release();
      }
      const published = await publishing;
      expect(await waiting).toMatchObject({
        status: "error",
        code: "NO_ACCESS",
      });
      await acceptCycle(f, published.revisionId);
      const later = await createAccessBackedBooking(bookingArgs);
      if (later.status !== "created")
        throw new Error(`Later acceptance failed: ${later.status}`);
      const accepted = (
        await db.classBooking.findUniqueOrThrow({
          where: { id: later.bookingId },
        })
      ).formRequirementSnapshot as Prisma.JsonObject;
      expect(
        (accepted.requirements as Prisma.JsonArray).every(
          (row) =>
            (row as Prisma.JsonObject).acceptanceCycleKey ===
            published.revisionId,
        ),
      ).toBe(true);
      expect(
        await db.bookingFormRecovery.count({
          where: { bookingId: later.bookingId },
        }),
      ).toBe(0);
    });

    it("preserves the current-minor signing restriction for an upcoming adult acceptance cycle", async () => {
      const f = await fixture(),
        birthday = new Date(Date.now() + 86400000);
      birthday.setUTCFullYear(birthday.getUTCFullYear() - 18);
      await db.member.update({
        where: { id: f.member.id },
        data: { dateOfBirth: birthday },
      });
      const published = await (await publication(f)).publish();
      const signed = await acceptCycle(f, published.revisionId);
      expect(signed.result).toMatchObject({
        status: "error",
        message: expect.stringContaining("while this participant is a minor"),
      });
      expect(
        await db.signedDocument.count({
          where: {
            workspaceId: f.workspace.id,
            requirementRevisionId: published.revisionId,
          },
        }),
      ).toBe(0);
    });
    it("binds an actual exact post-review refund once and reauthorizes its replay", async () => {
      const f = await paidFixture();
      await (await publication(f)).publish();
      await remedy(f, "REFUND_REVIEW");
      const recovery = await db.bookingFormRecovery.findFirstOrThrow({
          where: { bookingId: f.bookingId },
        }),
        review = await db.financialReviewCase.findUniqueOrThrow({
          where: { id: recovery.financialReviewCaseId! },
        });
      expect(review.paymentId).toBe(f.payment.id);
      expect(review.operationId).toBeNull();
      const operation = await refundOperation(f);
      expect(operation.status).toBe("SUCCEEDED");
      const args = {
        workspaceId: f.workspace.id,
        actorUserId: f.owner.id,
        recoveryId: recovery.id,
        expectedVersion: recovery.version,
        db,
      };
      expect((await reconcileFormRecoveryRefund(args)).state).toBe("REFUNDED");
      expect(
        (
          await db.financialReviewCase.findUniqueOrThrow({
            where: { id: review.id },
          })
        ).operationId,
      ).toBe(operation.id);
      const events = await db.workspaceDataEvent.count({
        where: {
          workspaceId: f.workspace.id,
          kind: "FORM_RECOVERY_TRANSITIONED",
          metadata: { path: ["to"], equals: "REFUNDED" },
        },
      });
      expect((await reconcileFormRecoveryRefund(args)).state).toBe("REFUNDED");
      expect(
        await db.workspaceDataEvent.count({
          where: {
            workspaceId: f.workspace.id,
            kind: "FORM_RECOVERY_TRANSITIONED",
            metadata: { path: ["to"], equals: "REFUNDED" },
          },
        }),
      ).toBe(events);
      await db.workspace.update({
        where: { id: f.workspace.id },
        data: { status: "DISABLED" },
      });
      await expect(reconcileFormRecoveryRefund(args)).rejects.toThrow(
        "access changed",
      );
    });
    it("closes once for two exact successful partial refunds whose unique total returns the original allocation", async () => {
      const f = await paidFixture();
      await (await publication(f)).publish();
      await remedy(f, "REFUND_REVIEW");
      const recovery = await db.bookingFormRecovery.findFirstOrThrow({
        where: { bookingId: f.bookingId },
      });
      const first = await refundOperation(f, 1000);
      const args = {
        workspaceId: f.workspace.id,
        actorUserId: f.owner.id,
        recoveryId: recovery.id,
        expectedVersion: recovery.version,
        db,
      };
      await expect(reconcileFormRecoveryRefund(args)).rejects.toThrow(
        "has not completed",
      );
      const second = await refundOperation(f, 1500);
      expect((await reconcileFormRecoveryRefund(args)).state).toBe("REFUNDED");
      const events = await db.workspaceDataEvent.findMany({
        where: {
          workspaceId: f.workspace.id,
          kind: "FORM_RECOVERY_TRANSITIONED",
          metadata: { path: ["to"], equals: "REFUNDED" },
        },
      });
      expect(events).toHaveLength(1);
      expect(
        (events[0]!.metadata as Prisma.JsonObject).refundOperationIds,
      ).toEqual([first.id, second.id].sort());
      expect((events[0]!.metadata as Prisma.JsonObject).refundIds).toHaveLength(
        2,
      );
      expect(
        (events[0]!.metadata as Prisma.JsonObject).refundedAmountCents,
      ).toBe(2500);
      expect((await reconcileFormRecoveryRefund(args)).state).toBe("REFUNDED");
      expect(
        await db.workspaceDataEvent.count({
          where: {
            workspaceId: f.workspace.id,
            kind: "FORM_RECOVERY_TRANSITIONED",
            metadata: { path: ["to"], equals: "REFUNDED" },
          },
        }),
      ).toBe(1);
    });
    for (const anomaly of [
      "over-total",
      "duplicate-refund",
      "foreign-beneficiary",
    ] as const)
      it(`keeps complete refund review open when its evidence set contains ${anomaly}`, async () => {
        const f = await paidFixture();
        await (await publication(f)).publish();
        await remedy(f, "REFUND_REVIEW");
        const recovery = await db.bookingFormRecovery.findFirstOrThrow({
            where: { bookingId: f.bookingId },
          }),
          operation = await refundOperation(f);
        const other =
          anomaly === "foreign-beneficiary"
            ? await db.member.create({
                data: {
                  workspaceId: f.workspace.id,
                  fullName: "Fictional foreign refund allocation",
                },
              })
            : null;
        const amount = anomaly === "duplicate-refund" ? 2500 : 1;
        const refund =
          anomaly === "duplicate-refund"
            ? await db.refund.findUniqueOrThrow({
                where: { id: operation.refundId! },
              })
            : await db.refund.create({
                data: {
                  workspaceId: f.workspace.id,
                  paymentId: f.payment.id,
                  memberId: other?.id ?? f.member.id,
                  amountCents: amount,
                  currency: "cad",
                  status: "SUCCEEDED",
                  source: "CURRENT",
                  stripeRefundId: `re_inconsistent_${randomUUID()}`,
                  refundedAt: new Date(),
                },
              });
        const payload = operation.payload as Prisma.JsonObject;
        // Deliberately inconsistent fixture evidence must fail closed; no fake
        // success branch is added to a production provider or payment producer.
        await db.financialOperation.create({
          data: {
            ...operation,
            result:
              operation.result === null
                ? Prisma.DbNull
                : (operation.result as Prisma.InputJsonValue),
            id: randomUUID(),
            operationKey: randomUUID(),
            providerIdempotencyKey: randomUUID(),
            beneficiaryMemberId: other?.id ?? f.member.id,
            amountCents: amount,
            refundId: refund.id,
            providerReference: refund.stripeRefundId,
            payload: {
              ...payload,
              command: {
                ...(payload.command as Prisma.JsonObject),
                amountCents: amount,
              },
            } as Prisma.InputJsonValue,
          },
        });
        await expect(
          reconcileFormRecoveryRefund({
            workspaceId: f.workspace.id,
            actorUserId: f.owner.id,
            recoveryId: recovery.id,
            expectedVersion: recovery.version,
            db,
          }),
        ).rejects.toThrow("has not completed");
        expect(
          (
            await db.bookingFormRecovery.findUniqueOrThrow({
              where: { id: recovery.id },
            })
          ).state,
        ).toBe("REFUND_REVIEW");
      });
    for (const mode of [
      "pending",
      "partial",
      "old",
      "wrong-allocation",
      "credit",
    ] as const)
      it(`keeps form refund review open for ${mode} evidence`, async () => {
        const f = await paidFixture();
        if (mode === "old") await refundOperation(f);
        await (await publication(f)).publish();
        await remedy(f, "REFUND_REVIEW");
        const recovery = await db.bookingFormRecovery.findFirstOrThrow({
          where: { bookingId: f.bookingId },
        });
        if (mode === "pending") await refundOperation(f, 2500, false);
        if (mode === "partial") {
          await refundOperation(f, 1000);
          // Even a partial amount on the mutable review cannot redefine the
          // original booking allocation or turn a partial refund into full recovery.
          await db.financialReviewCase.update({
            where: { id: recovery.financialReviewCaseId! },
            data: { amountCents: 1000 },
          });
        }
        if (mode === "wrong-allocation" || mode === "credit") {
          const pending = await refundOperation(f, 2500, false),
            other = await db.member.create({
              data: {
                workspaceId: f.workspace.id,
                fullName: "Fictional different beneficiary",
              },
            });
          const refund = await db.refund.create({
            data: {
              workspaceId: f.workspace.id,
              paymentId: f.payment.id,
              memberId: mode === "wrong-allocation" ? other.id : f.member.id,
              amountCents: 2500,
              currency: "cad",
              status: "SUCCEEDED",
              source: "CURRENT",
              stripeRefundId: `re_wrong_${randomUUID()}`,
              refundedAt: new Date(),
            },
          });
          await db.financialOperation.create({
            data: {
              workspaceId: f.workspace.id,
              kind: mode === "credit" ? "ISSUE_CREDIT" : "REFUND",
              status: "SUCCEEDED",
              operationKey: randomUUID(),
              requestHash: "fictional-negative-proof",
              providerIdempotencyKey: randomUUID(),
              paymentId: f.payment.id,
              payerAccountId: f.payment.payerAccountId,
              beneficiaryMemberId:
                mode === "wrong-allocation" ? other.id : f.member.id,
              amountCents: 2500,
              currency: "cad",
              providerAccountId: "acct_forms_fictional",
              providerReference: refund.stripeRefundId,
              refundId: refund.id,
              settledAt: new Date(),
              payload: pending.payload as Prisma.InputJsonValue,
            },
          });
        }
        await expect(
          reconcileFormRecoveryRefund({
            workspaceId: f.workspace.id,
            actorUserId: f.owner.id,
            recoveryId: recovery.id,
            expectedVersion: recovery.version,
            db,
          }),
        ).rejects.toThrow("has not completed");
        expect(
          (
            await db.bookingFormRecovery.findUniqueOrThrow({
              where: { id: recovery.id },
            })
          ).state,
        ).toBe("REFUND_REVIEW");
      });

    it("rejects a completed refund already attributed to a prior form review", async () => {
      const f = await paidFixture();
      await (await publication(f)).publish();
      await remedy(f, "REFUND_REVIEW");
      const recovery = await db.bookingFormRecovery.findFirstOrThrow({
          where: { bookingId: f.bookingId },
        }),
        operation = await refundOperation(f);
      await db.financialReviewCase.create({
        data: {
          workspaceId: f.workspace.id,
          sourceKey: `form-recovery:prior-${randomUUID()}`,
          reason: "Fictional prior case owns the same refund",
          bookingId: f.bookingId,
          memberId: f.member.id,
          payerAccountId: f.payment.payerAccountId,
          paymentId: f.payment.id,
          amountCents: 2500,
          currency: "cad",
          operationId: operation.id,
          resolvedAt: new Date(),
        },
      });
      await expect(
        reconcileFormRecoveryRefund({
          workspaceId: f.workspace.id,
          actorUserId: f.owner.id,
          recoveryId: recovery.id,
          expectedVersion: recovery.version,
          db,
        }),
      ).rejects.toThrow("has not completed");
      expect(
        (
          await db.bookingFormRecovery.findUniqueOrThrow({
            where: { id: recovery.id },
          })
        ).state,
      ).toBe("REFUND_REVIEW");
    });
    it("atomically attributes one complete refund set to only one of two concurrent recovery reviews", async () => {
      const f = await paidFixture();
      await (await publication(f)).publish();
      await remedy(f, "REFUND_REVIEW");
      const first = await db.bookingFormRecovery.findFirstOrThrow({
          where: { bookingId: f.bookingId },
        }),
        secondPublication = await (
          await publication(f, {
            effectiveAt: new Date(Date.now() + 3 * 86400000),
          })
        ).publish();
      const revision = await db.formRequirementRevision.findUniqueOrThrow({
          where: { id: secondPublication.revisionId },
        }),
        evidence = {
          ...(first.evidence as Prisma.JsonObject),
          revisionId: revision.id,
          revisionHash: revision.revisionHash,
          publishedAt: revision.publishedAt.toISOString(),
          effectiveAt: revision.effectiveAt.toISOString(),
        };
      const second = await db.bookingFormRecovery.create({
        data: {
          ...first,
          id: randomUUID(),
          requirementRevisionId: revision.id,
          evidence,
          evidenceHash: formEvidenceHash(evidence),
          openedAt: new Date(),
          state: "OPEN",
          version: 1,
          financialReviewCaseId: null,
          resolvedAt: null,
        },
      });
      const review = await db.financialReviewCase.create({
        data: {
          workspaceId: f.workspace.id,
          sourceKey: `form-recovery:${second.id}`,
          reason: "Fictional competing exact recovery allocation",
          bookingId: f.bookingId,
          memberId: f.member.id,
          payerAccountId: f.payment.payerAccountId,
          paymentId: f.payment.id,
          amountCents: 2500,
          currency: "cad",
        },
      });
      const updated = await db.bookingFormRecovery.update({
        where: { id: second.id },
        data: {
          state: "REFUND_REVIEW",
          version: { increment: 1 },
          financialReviewCaseId: review.id,
        },
      });
      await refundOperation(f, 1000);
      const operation = await refundOperation(f, 1500);
      const results = await Promise.allSettled(
        [first, updated].map((recovery) =>
          reconcileFormRecoveryRefund({
            workspaceId: f.workspace.id,
            actorUserId: f.owner.id,
            recoveryId: recovery.id,
            expectedVersion: recovery.version,
            db,
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        await db.bookingFormRecovery.count({
          where: { workspaceId: f.workspace.id, state: "REFUNDED" },
        }),
      ).toBe(1);
      expect(
        await db.financialReviewCase.count({
          where: {
            workspaceId: f.workspace.id,
            sourceKey: { startsWith: "form-recovery:" },
            operationId: { not: null },
          },
        }),
      ).toBe(1);
      expect(operation.status).toBe("SUCCEEDED");
    });
  },
);
