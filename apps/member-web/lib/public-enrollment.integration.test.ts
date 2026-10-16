import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  Prisma,
  PrismaClient,
  startPublicEnrollment,
  verifyPublicEnrollment,
  preparePublicEnrollmentIdentity,
  getPublicEnrollment,
  acceptPublicMembershipTerms,
  getPublicEnrollmentForms,
  readPublicParticipant,
  websiteOfferFromPlan,
  defaultMembershipLifecyclePolicy,
} from "@flowstate/db";
const testUrl = process.env.TEST_DATABASE_URL;
(testUrl ? describe : describe.skip)(
  "verified public enrollment in PostgreSQL",
  () => {
    const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const gyms: string[] = [],
      owners: string[] = [];
    let gym: string,
      owner: string,
      slug: string,
      email: string,
      planId: string,
      fingerprint: string;
    const now = new Date("2026-10-16T18:00:00Z");
    beforeEach(async () => {
      const tag = randomUUID();
      slug = `enrollment-${tag}`;
      email = `person-${tag}@example.test`;
      owner = (
        await db.user.create({ data: { email: `owner-${tag}@example.test` } })
      ).id;
      owners.push(owner);
      gym = (
        await db.workspace.create({
          data: {
            name: "Registration gym",
            status: "ACTIVE",
            workspaceUsers: { create: { userId: owner, role: "OWNER" } },
            migration: {
              create: {
                stage: "COMPLETE",
                nextOwnerAction: "Ready",
                flowstateResponsibility: "Ready",
                ownerReviewAcknowledgedAt: now,
                ownerReviewAcknowledgedByUserId: owner,
                operationallyReadyAt: now,
                operationallyReadyByUserId: owner,
              },
            },
          },
        })
      ).id;
      gyms.push(gym);
      const plan = await db.membershipPlan.create({
        data: {
          workspaceId: gym,
          name: "Two classes weekly",
          monthlyPriceCents: 12900,
          currency: "cad",
          weeklyClassLimit: 2,
          lifecyclePolicy:
            defaultMembershipLifecyclePolicy as unknown as Prisma.InputJsonObject,
          cancellationPolicyReference: "Two calendar months",
        },
        include: { programRestrictions: true },
      });
      planId = plan.id;
      const offer = websiteOfferFromPlan(plan, { visible: true });
      fingerprint = offer.termsFingerprint;
      const content = {
        title: "Registration gym",
        description: "Martial arts classes",
        headline: "Train with us",
        introduction: "Muay Thai and grappling classes.",
        contactEmail: "gym@example.test",
        seoTitle: "Registration gym",
        seoDescription: "Local martial arts classes and memberships.",
        shareImageUrl: "",
        offers: [offer],
      } as unknown as Prisma.InputJsonObject;
      await db.workspaceWebsite.create({
        data: {
          workspaceId: gym,
          slug,
          draft: content,
          published: content,
          publishedVersion: 1,
          publishedAt: now,
        },
      });
    });
    afterAll(async () => {
      const users = await db.member.findMany({
        where: { workspaceId: { in: gyms }, userId: { not: null } },
        select: { userId: true },
      });
      await db.publicEnrollment.deleteMany({
        where: { workspaceId: { in: gyms } },
      });
      await db.signedDocument.deleteMany({
        where: { workspaceId: { in: gyms } },
      });
      await db.financialAccount.deleteMany({
        where: { workspaceId: { in: gyms } },
      });
      await db.memberPortalGrant.deleteMany({
        where: { workspaceId: { in: gyms } },
      });
      await db.workspace.deleteMany({ where: { id: { in: gyms } } });
      await db.user.deleteMany({
        where: {
          id: { in: [...owners, ...users.map((item) => item.userId!)] },
        },
      });
      await db.$disconnect();
    });
    const begin = (
      overrides: Record<string, unknown> = {},
      marketingConsent = false,
    ) =>
      startPublicEnrollment({
        slug,
        kind: "MEMBERSHIP",
        participant: {
          fullName: "Jordan Lee",
          dateOfBirth: "1990-05-04",
          email,
          offerId: planId,
          termsFingerprint: fingerprint,
          ...overrides,
        },
        serviceConsent: true,
        marketingConsent,
        db,
        now,
      });
    async function verify(token: string) {
      const job = await db.notificationJob.findFirstOrThrow({
        where: { workspaceId: gym, recipientEmail: email },
        orderBy: { createdAt: "desc" },
      });
      const code = /code is (\d{6})/.exec(job.body)![1]!;
      await verifyPublicEnrollment({ workspaceId: gym, token, code, db, now });
      return code;
    }
    async function childRegistration(kind: "TRIAL" | "MEMBERSHIP") {
      return startPublicEnrollment({
        slug,
        kind,
        participant: {
          fullName: "Jamie Lee",
          dateOfBirth: "2016-05-04",
          email,
          guardianFullName: "Jordan Lee",
          relationshipLabel: "Parent",
          offerId: planId,
          termsFingerprint: fingerprint,
          classTemplateId: "identity-review-class",
          scheduledForDate: "2026-10-19",
        },
        serviceConsent: true,
        marketingConsent: false,
        db,
        now,
      });
    }
    async function childGrant(
      kind: "TRIAL" | "MEMBERSHIP",
      permissions: { canBook: boolean; canSign: boolean; canPay: boolean },
    ) {
      const started = await childRegistration(kind);
      await verify(started.token);
      const identity = await preparePublicEnrollmentIdentity({
        workspaceId: gym,
        token: started.token,
        passwordHash: "test-hash",
        db,
        now,
      });
      expect(identity.reviewRequired).toBe(true);
      const enrollment = await db.publicEnrollment.findUniqueOrThrow({
        where: { id: started.id },
      });
      const participant = readPublicParticipant(enrollment);
      const staff = await db.workspaceUser.findFirstOrThrow({
        where: { workspaceId: gym, userId: owner },
      });
      const grant = await db.memberPortalGrant.create({
        data: {
          workspaceId: gym,
          memberId: identity.memberId,
          userId: identity.userId,
          guardianId: participant.guardianId!,
          verifiedByWorkspaceUserId: staff.id,
          verificationNote:
            "Owner verified guardian identity and specific permissions",
          ...permissions,
        },
      });
      return { started, identity, participant, staff, grant };
    }
    it("creates no identity before verification and keeps marketing separate", async () => {
      const started = await begin({
        accountUserId: owner,
        payerMemberId: "forged",
      });
      expect(await db.member.count({ where: { workspaceId: gym } })).toBe(0);
      await expect(
        preparePublicEnrollmentIdentity({
          workspaceId: gym,
          token: started.token,
          passwordHash: "test-hash",
          db,
          now,
        }),
      ).rejects.toThrow("Verify");
      const before = await getPublicEnrollment({
        workspaceId: gym,
        token: started.token,
        db,
        now,
      });
      expect(readPublicParticipant(before!).accountUserId).toBeUndefined();
      expect(before?.marketingConsent).toBe(false);
      const code = await verify(started.token);
      expect(before?.verificationCodeHash).not.toContain(code);
      const identity = await preparePublicEnrollmentIdentity({
        workspaceId: gym,
        token: started.token,
        passwordHash: "test-hash",
        db,
        now,
      });
      expect(
        (
          await db.member.findUniqueOrThrow({
            where: { id: identity.memberId },
          })
        ).status,
      ).toBe("TRIAL");
      expect(
        await db.memberMembership.count({ where: { workspaceId: gym } }),
      ).toBe(0);
    });
    it("persists failed attempts, expires codes and prevents cross-workspace access", async () => {
      const started = await begin();
      for (let i = 0; i < 5; i++)
        await expect(
          verifyPublicEnrollment({
            workspaceId: gym,
            token: started.token,
            code: "bad",
            db,
            now,
          }),
        ).rejects.toThrow("match");
      expect(
        (
          await getPublicEnrollment({
            workspaceId: gym,
            token: started.token,
            db,
            now,
          })
        )?.verificationAttempts,
      ).toBe(5);
      await expect(verify(started.token)).rejects.toThrow("expired");
      expect(
        await getPublicEnrollment({
          workspaceId: "another-gym",
          token: started.token,
          db,
          now,
        }),
      ).toBeNull();
      const second = await begin();
      await expect(
        verifyPublicEnrollment({
          workspaceId: gym,
          token: second.token,
          code: "123456",
          db,
          now: new Date(now.getTime() + 11 * 60_000),
        }),
      ).rejects.toThrow("expired");
    });
    it("rate-limits the verified mailbox without creating people or unlimited outbox jobs", async () => {
      await Promise.all([begin(), begin(), begin()]);
      await expect(begin()).rejects.toThrow("15 minutes");
      expect(
        await db.notificationJob.count({ where: { workspaceId: gym } }),
      ).toBe(3);
      expect(await db.member.count({ where: { workspaceId: gym } })).toBe(0);
    });
    it("requires authentication for existing accounts and never links a legacy person by email", async () => {
      const legacy = await db.member.create({
        data: { workspaceId: gym, fullName: "Legacy person", email },
      });
      const started = await begin();
      await verify(started.token);
      await expect(
        preparePublicEnrollmentIdentity({
          workspaceId: gym,
          token: started.token,
          passwordHash: "test-hash",
          db,
          now,
        }),
      ).rejects.toThrow("portal account");
      const user = await db.user.create({
        data: {
          email,
          passwordHash: "existing-hash",
          workspaceUsers: { create: { workspaceId: gym, role: "CUSTOMER" } },
        },
      });
      await db.member.update({
        where: { id: legacy.id },
        data: { userId: user.id, dateOfBirth: new Date("1990-05-04") },
      });
      await expect(
        preparePublicEnrollmentIdentity({
          workspaceId: gym,
          token: started.token,
          passwordHash: "new-hash",
          db,
          now,
        }),
      ).rejects.toThrow("Sign in");
      const result = await preparePublicEnrollmentIdentity({
        workspaceId: gym,
        token: started.token,
        actorUserId: user.id,
        db,
        now,
      });
      expect(result.memberId).toBe(legacy.id);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
          .passwordHash,
      ).toBe("existing-hash");
    });
    it("creates one identity under concurrent submissions and reuses it only for its signed-in account", async () => {
      const started = await begin();
      await verify(started.token);
      const results = await Promise.allSettled([
        preparePublicEnrollmentIdentity({
          workspaceId: gym,
          token: started.token,
          passwordHash: "test-hash",
          db,
          now,
        }),
        preparePublicEnrollmentIdentity({
          workspaceId: gym,
          token: started.token,
          passwordHash: "test-hash",
          db,
          now,
        }),
      ]);
      expect(
        results.filter((item) => item.status === "fulfilled"),
      ).toHaveLength(1);
      expect(await db.member.count({ where: { workspaceId: gym } })).toBe(1);
      const saved = await getPublicEnrollment({
        workspaceId: gym,
        token: started.token,
        db,
        now,
      });
      const userId = readPublicParticipant(saved!).accountUserId!;
      expect(
        (
          await preparePublicEnrollmentIdentity({
            workspaceId: gym,
            token: started.token,
            actorUserId: userId,
            db,
            now,
          })
        ).memberId,
      ).toBe(saved!.memberId);
      await expect(
        preparePublicEnrollmentIdentity({
          workspaceId: gym,
          token: started.token,
          actorUserId: owner,
          db,
          now,
        }),
      ).rejects.toThrow("Sign in");
    });
    it("does not treat a verified guardian email as authority over a child", async () => {
      const started = await begin({
        fullName: "Jamie Lee",
        dateOfBirth: "2016-05-04",
        guardianFullName: "Jordan Lee",
        relationshipLabel: "Parent",
      });
      await verify(started.token);
      const identity = await preparePublicEnrollmentIdentity({
        workspaceId: gym,
        token: started.token,
        passwordHash: "test-hash",
        db,
        now,
      });
      expect(identity.reviewRequired).toBe(true);
      expect(
        await db.memberPortalGrant.count({ where: { workspaceId: gym } }),
      ).toBe(0);
      expect(await db.member.count({ where: { workspaceId: gym } })).toBe(2);
      await expect(
        acceptPublicMembershipTerms({
          workspaceId: gym,
          token: started.token,
          actorUserId: identity.userId,
          db,
          now,
        }),
      ).rejects.toThrow("verify guardian");
      await expect(
        getPublicEnrollmentForms({
          workspaceId: gym,
          enrollmentId: started.id,
          actorUserId: identity.userId,
          ensure: true,
          db,
        }),
      ).rejects.toThrow("guardian");
    });
    it.each(["TRIAL", "MEMBERSHIP"] as const)(
      "uses only the permissions needed for initial and repeated %s identity selection",
      async (kind) => {
        const { started, identity, grant } = await childGrant(kind, {
          canBook: kind === "TRIAL",
          canSign: true,
          canPay: kind === "MEMBERSHIP",
        });
        expect(
          await preparePublicEnrollmentIdentity({
            workspaceId: gym,
            token: started.token,
            actorUserId: identity.userId,
            db,
            now,
          }),
        ).toMatchObject({ memberId: identity.memberId, reviewRequired: false });
        const second = await childRegistration(kind);
        await verify(second.token);
        expect(
          await preparePublicEnrollmentIdentity({
            workspaceId: gym,
            token: second.token,
            actorUserId: identity.userId,
            db,
            now,
          }),
        ).toMatchObject({ memberId: identity.memberId, reviewRequired: false });
        expect(await db.member.count({ where: { workspaceId: gym } })).toBe(2);
        if (kind === "MEMBERSHIP") {
          expect(
            await acceptPublicMembershipTerms({
              workspaceId: gym,
              token: started.token,
              actorUserId: identity.userId,
              db,
              now,
            }),
          ).toMatchObject({ status: "FORMS_REQUIRED" });
        }
        await db.memberPortalGrant.update({
          where: { id: grant.id },
          data: kind === "TRIAL" ? { canBook: false } : { canPay: false },
        });
        expect(
          await preparePublicEnrollmentIdentity({
            workspaceId: gym,
            token: started.token,
            actorUserId: identity.userId,
            db,
            now,
          }),
        ).toMatchObject({ reviewRequired: true });
        const third = await childRegistration(kind);
        await verify(third.token);
        await expect(
          preparePublicEnrollmentIdentity({
            workspaceId: gym,
            token: third.token,
            actorUserId: identity.userId,
            db,
            now,
          }),
        ).rejects.toThrow("family access");
        expect(await db.member.count({ where: { workspaceId: gym } })).toBe(2);
      },
    );
    it("allows a verified signing-only guardian to request the child's form without granting purchase authority", async () => {
      const { started, identity, participant, staff, grant } = await childGrant(
        "MEMBERSHIP",
        { canBook: false, canSign: true, canPay: false },
      );
      const document = await db.formDocument.create({
        data: {
          workspaceId: gym,
          name: "Required agreement",
          formType: "MEMBERSHIP_AGREEMENT",
        },
      });
      const version = await db.formVersion.create({
        data: {
          workspaceId: gym,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: "agreement.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 1,
          fileSha256: "test",
          fileData: Buffer.from("x"),
          uploadedByWorkspaceUserId: staff.id,
        },
      });
      await db.formDocument.update({
        where: { id: document.id },
        data: { currentVersionId: version.id },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId: gym,
          formDocumentId: document.id,
          requirementTarget: "MEMBERSHIP_ACTIVATION",
        },
      });
      const forms = await getPublicEnrollmentForms({
        workspaceId: gym,
        enrollmentId: started.id,
        actorUserId: identity.userId,
        ensure: true,
        db,
      });
      expect(forms).toHaveLength(1);
      expect(
        await db.signatureRequest.findUniqueOrThrow({
          where: { id: forms[0]!.requestId! },
        }),
      ).toMatchObject({
        memberId: identity.memberId,
        signerKind: "GUARDIAN",
        guardianId: participant.guardianId,
      });
      await expect(
        acceptPublicMembershipTerms({
          workspaceId: gym,
          token: started.token,
          actorUserId: identity.userId,
          db,
          now,
        }),
      ).rejects.toThrow("verify guardian");
      await db.memberPortalGrant.update({
        where: { id: grant.id },
        data: { canSign: false, canPay: true },
      });
      await expect(
        getPublicEnrollmentForms({
          workspaceId: gym,
          enrollmentId: started.id,
          actorUserId: identity.userId,
          ensure: true,
          db,
        }),
      ).rejects.toThrow("verify guardian");
      await expect(
        acceptPublicMembershipTerms({
          workspaceId: gym,
          token: started.token,
          actorUserId: identity.userId,
          db,
          now,
        }),
      ).rejects.toThrow("verify guardian");
      expect(
        await db.signatureRequest.count({ where: { workspaceId: gym } }),
      ).toBe(1);
    });
    it("does not reuse a child's identity through a grant for an unrelated guardian", async () => {
      const { identity, grant } = await childGrant("MEMBERSHIP", {
        canBook: false,
        canSign: true,
        canPay: true,
      });
      const unrelated = await db.guardian.create({
        data: {
          workspaceId: gym,
          fullName: "Different guardian",
          email: "different@example.test",
        },
      });
      await db.memberPortalGrant.update({
        where: { id: grant.id },
        data: { guardianId: unrelated.id },
      });
      const second = await childRegistration("MEMBERSHIP");
      await verify(second.token);
      await expect(
        preparePublicEnrollmentIdentity({
          workspaceId: gym,
          token: second.token,
          actorUserId: identity.userId,
          db,
          now,
        }),
      ).rejects.toThrow("family access");
      expect(await db.member.count({ where: { workspaceId: gym } })).toBe(2);
      expect(
        (
          await db.publicEnrollment.findUniqueOrThrow({
            where: { id: second.id },
          })
        ).memberId,
      ).toBeNull();
    });
    it("captures the reviewed membership policy and rejects an offer changed after verification", async () => {
      const started = await begin({}, true);
      await verify(started.token);
      const identity = await preparePublicEnrollmentIdentity({
        workspaceId: gym,
        token: started.token,
        passwordHash: "test-hash",
        db,
        now,
      });
      const accepted = await acceptPublicMembershipTerms({
        workspaceId: gym,
        token: started.token,
        actorUserId: identity.userId,
        db,
        now,
      });
      expect(accepted.marketingConsent).toBe(true);
      expect(accepted.acceptedTerms).toMatchObject({
        membership: {
          monthlyPriceCents: 12900,
          weeklyClassLimit: 2,
          lifecyclePolicy: { noticeLength: 2 },
          acceptedByUserId: identity.userId,
        },
      });
      await db.membershipPlan.update({
        where: { id: planId },
        data: {
          lifecyclePolicy: {
            ...defaultMembershipLifecyclePolicy,
            noticeLength: 3,
          },
        },
      });
      await expect(
        acceptPublicMembershipTerms({
          workspaceId: gym,
          token: started.token,
          actorUserId: identity.userId,
          db,
          now,
        }),
      ).rejects.toThrow("offer changed");
      expect(
        (
          await db.publicEnrollment.findUniqueOrThrow({
            where: { id: started.id },
          })
        ).acceptedTerms,
      ).toEqual(accepted.acceptedTerms);
    });
    it("refuses terms, form requests and identity replay after account access is revoked", async () => {
      const started = await begin();
      await verify(started.token);
      const identity = await preparePublicEnrollmentIdentity({
        workspaceId: gym,
        token: started.token,
        passwordHash: "test-hash",
        db,
        now,
      });
      const before = await db.publicEnrollment.findUniqueOrThrow({
        where: { id: started.id },
      });
      await db.workspaceUser.updateMany({
        where: { workspaceId: gym, userId: identity.userId },
        data: { isActive: false },
      });
      await expect(
        acceptPublicMembershipTerms({
          workspaceId: gym,
          token: started.token,
          actorUserId: identity.userId,
          db,
          now,
        }),
      ).rejects.toThrow("not available");
      await expect(
        getPublicEnrollmentForms({
          workspaceId: gym,
          enrollmentId: started.id,
          actorUserId: identity.userId,
          ensure: true,
          db,
        }),
      ).rejects.toThrow("not available");
      await expect(
        preparePublicEnrollmentIdentity({
          workspaceId: gym,
          token: started.token,
          actorUserId: identity.userId,
          db,
          now,
        }),
      ).rejects.toThrow("not available");
      expect(
        (
          await db.publicEnrollment.findUniqueOrThrow({
            where: { id: started.id },
          })
        ).version,
      ).toBe(before.version);
      expect(
        await db.signatureRequest.count({ where: { workspaceId: gym } }),
      ).toBe(0);
    });
    it("checks current guardian permissions and family links instead of a saved review flag", async () => {
      const started = await begin({
        fullName: "Jamie Lee",
        dateOfBirth: "2016-05-04",
        guardianFullName: "Jordan Lee",
        relationshipLabel: "Parent",
      });
      await verify(started.token);
      const identity = await preparePublicEnrollmentIdentity({
        workspaceId: gym,
        token: started.token,
        passwordHash: "test-hash",
        db,
        now,
      });
      const saved = await db.publicEnrollment.findUniqueOrThrow({
          where: { id: started.id },
        }),
        participant = readPublicParticipant(saved);
      const staff = await db.workspaceUser.findFirstOrThrow({
        where: { workspaceId: gym, userId: owner },
      });
      const grant = await db.memberPortalGrant.create({
        data: {
          workspaceId: gym,
          memberId: identity.memberId,
          userId: identity.userId,
          guardianId: participant.guardianId!,
          verifiedByWorkspaceUserId: staff.id,
          verificationNote: "Verified separately",
          canBook: true,
          canSign: true,
          canPay: true,
        },
      });
      expect(
        (
          await preparePublicEnrollmentIdentity({
            workspaceId: gym,
            token: started.token,
            actorUserId: identity.userId,
            db,
            now,
          })
        ).reviewRequired,
      ).toBe(false);
      await acceptPublicMembershipTerms({
        workspaceId: gym,
        token: started.token,
        actorUserId: identity.userId,
        db,
        now,
      });
      await db.memberPortalGrant.update({
        where: { id: grant.id },
        data: { revokedAt: now },
      });
      await expect(
        getPublicEnrollmentForms({
          workspaceId: gym,
          enrollmentId: started.id,
          actorUserId: identity.userId,
          ensure: true,
          db,
        }),
      ).rejects.toThrow("verify guardian");
      await db.memberPortalGrant.update({
        where: { id: grant.id },
        data: { revokedAt: null },
      });
      await db.familyLink.deleteMany({
        where: { workspaceId: gym, childMemberId: identity.memberId },
      });
      await expect(
        acceptPublicMembershipTerms({
          workspaceId: gym,
          token: started.token,
          actorUserId: identity.userId,
          db,
          now,
        }),
      ).rejects.toThrow("relationship changed");
    });
    it("blocks signup before the gym's migration and operating review are complete", async () => {
      await db.workspaceMigration.update({
        where: { workspaceId: gym },
        data: {
          stage: "REVIEW_READY",
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
          ownerReviewAcknowledgedAt: null,
          ownerReviewAcknowledgedByUserId: null,
        },
      });
      await expect(begin()).rejects.toThrow("not open");
      expect(
        await db.publicEnrollment.count({ where: { workspaceId: gym } }),
      ).toBe(0);
    });
  },
);
