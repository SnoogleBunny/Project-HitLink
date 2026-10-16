import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type PublicEnrollment,
} from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import { isWorkspaceMigrationReady } from "./workspace-readiness.js";
import { isPublishedOfferCurrent, parseGymWebsiteContent } from "./website.js";
import { snapshotMembershipTerms } from "./membership-allowances.js";

export class PublicEnrollmentError extends Error {}
export interface PublicParticipant {
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  guardianFullName: string;
  relationshipLabel: string;
  classTemplateId: string;
  scheduledForDate: string;
  offerId: string;
  termsFingerprint: string;
  accountUserId?: string;
  payerMemberId?: string;
  guardianId?: string;
  classBookingId?: string;
  identityReview?: boolean;
}
type Db = Prisma.TransactionClient;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function publicEnrollmentTokenHash(token: string) {
  return hash(token);
}
function codeHash(tokenHash: string, code: string) {
  return hash(`${tokenHash}:${code}`);
}
function sameHash(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function bounded(value: unknown, length = 150) {
  return typeof value === "string" ? value.trim().slice(0, length) : "";
}
export function readPublicParticipant(
  enrollment: Pick<PublicEnrollment, "participant">,
) {
  return enrollment.participant as unknown as PublicParticipant;
}
function minor(date: string, now: Date) {
  const birthday = new Date(`${date}T00:00:00Z`);
  return (
    new Date(
      Date.UTC(
        birthday.getUTCFullYear() + 18,
        birthday.getUTCMonth(),
        birthday.getUTCDate(),
      ),
    ) > now
  );
}
function participantInput(
  input: Partial<PublicParticipant>,
  now: Date,
): PublicParticipant {
  const result = {
    fullName: bounded(input.fullName),
    dateOfBirth: bounded(input.dateOfBirth, 10),
    email: bounded(input.email, 254).toLowerCase(),
    phone: bounded(input.phone, 40),
    guardianFullName: bounded(input.guardianFullName),
    relationshipLabel: bounded(input.relationshipLabel, 80),
    classTemplateId: bounded(input.classTemplateId),
    scheduledForDate: bounded(input.scheduledForDate, 10),
    offerId: bounded(input.offerId),
    termsFingerprint: bounded(input.termsFingerprint, 64),
  };
  const birthday = new Date(`${result.dateOfBirth}T00:00:00Z`);
  if (!result.fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
    throw new PublicEnrollmentError(
      "Enter the participant’s name and a valid contact email.",
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result.dateOfBirth) ||
    !Number.isFinite(birthday.getTime()) ||
    birthday.toISOString().slice(0, 10) !== result.dateOfBirth ||
    birthday > now ||
    birthday.getUTCFullYear() < now.getUTCFullYear() - 120
  )
    throw new PublicEnrollmentError("Enter a valid date of birth.");
  if (
    minor(result.dateOfBirth, now) &&
    (!result.guardianFullName || !result.relationshipLabel)
  )
    throw new PublicEnrollmentError(
      "Enter the adult guardian’s name and relationship. Use their email for verification.",
    );
  if (!minor(result.dateOfBirth, now) && result.guardianFullName)
    throw new PublicEnrollmentError(
      "Adults need their own account. Leave guardian details blank.",
    );
  return result;
}
export async function requirePublicWorkspace(db: Db, workspaceId: string) {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: { migration: true, location: true },
  });
  const migration = workspace?.migration;
  if (
    !workspace ||
    !isWorkspaceMigrationReady({
      workspaceStatus: workspace.status,
      migrationStage: migration?.stage,
      ownerReviewAcknowledgedAt: migration?.ownerReviewAcknowledgedAt,
      ownerReviewAcknowledgedByUserId:
        migration?.ownerReviewAcknowledgedByUserId,
      operationallyReadyAt: migration?.operationallyReadyAt,
      operationallyReadyByUserId: migration?.operationallyReadyByUserId,
    })
  )
    throw new PublicEnrollmentError(
      "Online registration is not open for this gym yet.",
    );
  return workspace;
}
async function currentOffer(
  db: Db,
  workspaceId: string,
  participant: PublicParticipant,
) {
  const website = await db.workspaceWebsite.findUnique({
    where: { workspaceId },
  });
  if (!website?.published || !website.publishedAt)
    throw new PublicEnrollmentError("This gym’s registration is unavailable.");
  const offer = parseGymWebsiteContent(website.published).offers.find(
    (item) => item.visible && item.id === participant.offerId,
  );
  const plan =
    offer &&
    (await db.membershipPlan.findFirst({
      where: { id: offer.membershipPlanId, workspaceId, archivedAt: null },
      include: { programRestrictions: true },
    }));
  if (
    !offer ||
    !plan ||
    !isPublishedOfferCurrent(offer, plan) ||
    offer.termsFingerprint !== participant.termsFingerprint
  )
    throw new PublicEnrollmentError(
      "This offer changed. Return to memberships and review the current terms before continuing.",
    );
  return { offer, plan };
}
function enrollmentGuardianPermissions(
  kind: PublicEnrollment["kind"],
  permission: "identity" | "sign" | "pay",
) {
  return {
    canSign: true,
    ...(permission === "pay" ||
    (permission === "identity" && kind === "MEMBERSHIP")
      ? { canPay: true }
      : permission === "identity" && kind === "TRIAL"
        ? { canBook: true }
        : {}),
  };
}
async function requireEnrollmentAuthority(
  db: Db,
  enrollment: PublicEnrollment,
  actorUserId: string,
  permission: "identity" | "sign" | "pay",
) {
  const participant = readPublicParticipant(enrollment);
  if (
    !enrollment.verifiedAt ||
    !enrollment.memberId ||
    participant.accountUserId !== actorUserId ||
    !participant.payerMemberId
  )
    throw new PublicEnrollmentError(
      "Sign in to the account used for this registration.",
    );
  await db.$queryRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1))::text",
    `family-access:${enrollment.workspaceId}`,
  );
  const [account, payer, beneficiary] = await Promise.all([
    db.workspaceUser.findFirst({
      where: {
        workspaceId: enrollment.workspaceId,
        userId: actorUserId,
        role: "CUSTOMER",
        isActive: true,
      },
      select: { id: true },
    }),
    db.member.findFirst({
      where: {
        id: participant.payerMemberId,
        workspaceId: enrollment.workspaceId,
        userId: actorUserId,
      },
      select: { id: true },
    }),
    db.member.findFirst({
      where: { id: enrollment.memberId, workspaceId: enrollment.workspaceId },
      select: { id: true, userId: true },
    }),
  ]);
  if (!account || !payer || !beneficiary)
    throw new PublicEnrollmentError(
      "This account is not available for member registration.",
    );
  if (!participant.guardianId) {
    if (beneficiary.id !== payer.id || beneficiary.userId !== actorUserId)
      throw new PublicEnrollmentError(
        "Use the participant’s own account for this registration.",
      );
    return false;
  }
  const link = await db.familyLink.findFirst({
    where: {
      workspaceId: enrollment.workspaceId,
      childMemberId: beneficiary.id,
      guardianId: participant.guardianId,
      guardian: { workspaceId: enrollment.workspaceId },
    },
    select: { id: true },
  });
  if (!link)
    throw new PublicEnrollmentError(
      "The family relationship changed. Ask the gym to review it.",
    );
  const grant = await db.memberPortalGrant.findFirst({
    where: {
      workspaceId: enrollment.workspaceId,
      userId: actorUserId,
      memberId: beneficiary.id,
      guardianId: participant.guardianId,
      revokedAt: null,
      ...enrollmentGuardianPermissions(enrollment.kind, permission),
    },
    select: { verifiedAt: true },
  });
  if (!grant?.verifiedAt && permission !== "identity")
    throw new PublicEnrollmentError(
      "The gym must verify guardian access before you can sign or pay for this participant.",
    );
  return !grant?.verifiedAt;
}
export async function startPublicEnrollment(args: {
  slug: string;
  kind: "TRIAL" | "MEMBERSHIP";
  participant: Partial<PublicParticipant>;
  serviceConsent: boolean;
  marketingConsent: boolean;
  db?: PrismaClient;
  now?: Date;
}) {
  if (!args.serviceConsent)
    throw new PublicEnrollmentError(
      "Accept the registration terms to continue. Marketing is optional.",
    );
  const now = args.now ?? new Date(),
    participant = participantInput(args.participant, now),
    token = randomBytes(32).toString("base64url"),
    tokenHash = hash(token),
    code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const enrollment = await (args.db ?? prisma).$transaction(async (db) => {
    const website = await db.workspaceWebsite.findUnique({
      where: { slug: args.slug },
    });
    if (!website?.publishedAt)
      throw new PublicEnrollmentError(
        "This gym’s registration is unavailable.",
      );
    await lockClassSchedule(db, website.workspaceId);
    await requirePublicWorkspace(db, website.workspaceId);
    await db.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))::text",
      `public-email:${participant.email}`,
    );
    const recent = await db.publicEnrollment.count({
      where: {
        email: participant.email,
        createdAt: { gt: new Date(now.getTime() - 15 * 60_000) },
      },
    });
    if (recent >= 3)
      throw new PublicEnrollmentError(
        "Too many verification requests. Wait 15 minutes before trying again.",
      );
    if (args.kind === "MEMBERSHIP")
      await currentOffer(db, website.workspaceId, participant);
    else if (
      !participant.classTemplateId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(participant.scheduledForDate)
    )
      throw new PublicEnrollmentError("Choose a trial class date.");
    const created = await db.publicEnrollment.create({
      data: {
        workspaceId: website.workspaceId,
        kind: args.kind,
        accessTokenHash: tokenHash,
        email: participant.email,
        verificationCodeHash: codeHash(tokenHash, code),
        verificationExpiresAt: new Date(now.getTime() + 10 * 60_000),
        participant: participant as unknown as Prisma.InputJsonObject,
        marketingConsent: args.marketingConsent,
        acceptedTerms: {
          registrationConsent: true,
          registrationConsentVersion: "2026-10-16",
          acceptedAt: now.toISOString(),
          marketingConsent: args.marketingConsent,
        },
        createdAt: now,
      },
    });
    await db.notificationJob.create({
      data: {
        workspaceId: website.workspaceId,
        dedupeKey: `public-verification:${created.id}`,
        expiresAt: created.verificationExpiresAt,
        context: { kind: "PUBLIC_VERIFICATION", enrollmentId: created.id },
        templateKind: "ANNOUNCEMENT",
        recipientEmail: participant.email,
        subject: "Your HitLink verification code",
        body: `Your verification code is ${code}. It expires in 10 minutes. If you did not request registration, ignore this message.`,
        status: "PENDING",
        nextAttemptAt: now,
      },
    });
    return created;
  });
  return { id: enrollment.id, token };
}
export async function getPublicEnrollment(args: {
  token: string;
  workspaceId: string;
  db?: PrismaClient;
  now?: Date;
}) {
  if (!/^[\w-]{43}$/.test(args.token)) return null;
  const enrollment = await (args.db ?? prisma).publicEnrollment.findFirst({
    where: { workspaceId: args.workspaceId, accessTokenHash: hash(args.token) },
  });
  if (
    !enrollment ||
    enrollment.createdAt.getTime() + 24 * 3600_000 <
      (args.now ?? new Date()).getTime()
  )
    return null;
  return enrollment;
}
export async function verifyPublicEnrollment(args: {
  token: string;
  workspaceId: string;
  code: string;
  db?: PrismaClient;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const result = await (args.db ?? prisma).$transaction(async (db) => {
    await lockClassSchedule(db, args.workspaceId);
    const enrollment = await db.publicEnrollment.findFirst({
      where: {
        workspaceId: args.workspaceId,
        accessTokenHash: hash(args.token),
      },
    });
    if (
      !enrollment ||
      enrollment.createdAt.getTime() + 24 * 3600_000 < now.getTime()
    )
      return "This registration expired. Start again.";
    if (enrollment.verifiedAt) return null;
    if (
      enrollment.verificationAttempts >= 5 ||
      enrollment.verificationExpiresAt <= now
    )
      return "This code expired. Start a new verification request.";
    const valid =
      /^\d{6}$/.test(args.code) &&
      sameHash(
        enrollment.verificationCodeHash,
        codeHash(enrollment.accessTokenHash, args.code),
      );
    await db.publicEnrollment.update({
      where: { id: enrollment.id },
      data: {
        verificationAttempts: { increment: 1 },
        ...(valid ? { verifiedAt: now, status: "VERIFIED" } : {}),
      },
    });
    return valid
      ? null
      : "That code did not match. Check the six digits and try again.";
  });
  if (result) throw new PublicEnrollmentError(result);
}
/** Email verification proves mailbox access only. Existing people are linked by authenticated identity or an owner, never by contact text. */
export async function preparePublicEnrollmentIdentity(args: {
  token: string;
  workspaceId: string;
  actorUserId?: string;
  passwordHash?: string;
  db?: PrismaClient;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  return (args.db ?? prisma).$transaction(async (db) => {
    await lockClassSchedule(db, args.workspaceId);
    await requirePublicWorkspace(db, args.workspaceId);
    await db.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))::text",
      `family-access:${args.workspaceId}`,
    );
    const enrollment = await db.publicEnrollment.findFirst({
      where: {
        workspaceId: args.workspaceId,
        accessTokenHash: hash(args.token),
      },
    });
    if (
      !enrollment?.verifiedAt ||
      enrollment.createdAt.getTime() + 24 * 3600_000 < now.getTime()
    )
      throw new PublicEnrollmentError("Verify your email before continuing.");
    const participant = readPublicParticipant(enrollment);
    if (participant.accountUserId && enrollment.memberId) {
      if (participant.accountUserId !== args.actorUserId)
        throw new PublicEnrollmentError(
          "Sign in to the account used for this registration.",
        );
      const reviewRequired = await requireEnrollmentAuthority(
        db,
        enrollment,
        args.actorUserId!,
        "identity",
      );
      return {
        userId: participant.accountUserId,
        memberId: enrollment.memberId,
        reviewRequired,
      };
    }
    await db.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))::text",
      `public-email:${enrollment.email}`,
    );
    let user = await db.user.findUnique({
      where: { email: enrollment.email },
      include: { member: true },
    });
    if (user && user.id !== args.actorUserId)
      throw new PublicEnrollmentError(
        "Sign in with this email to continue your registration.",
      );
    if (!user && args.actorUserId)
      throw new PublicEnrollmentError(
        "Use the email for your signed-in account, or sign out to create another account.",
      );
    if (!user && !args.passwordHash)
      throw new PublicEnrollmentError(
        "Choose a password to create your account.",
      );
    if (user && user.member?.workspaceId !== args.workspaceId)
      throw new PublicEnrollmentError(
        "The gym needs to review this account before registration can continue.",
      );
    const child = minor(participant.dateOfBirth, now);
    if (!user) {
      // A legacy person with this contact needs explicit linking; do not silently create a duplicate or reveal their record.
      if (
        await db.member.findFirst({
          where: { workspaceId: args.workspaceId, email: enrollment.email },
        })
      )
        throw new PublicEnrollmentError(
          "Please ask the gym to finish setting up your portal account, then sign in here.",
        );
      user = await db.user.create({
        data: {
          email: enrollment.email,
          fullName: child ? participant.guardianFullName : participant.fullName,
          passwordHash: args.passwordHash,
          workspaceUsers: {
            create: {
              workspaceId: args.workspaceId,
              role: "CUSTOMER",
              isActive: true,
            },
          },
          member: {
            create: {
              workspaceId: args.workspaceId,
              fullName: child
                ? participant.guardianFullName
                : participant.fullName,
              email: enrollment.email,
              phone: participant.phone || null,
              dateOfBirth: child
                ? null
                : new Date(`${participant.dateOfBirth}T00:00:00Z`),
              status: "TRIAL",
            },
          },
        },
        include: { member: true },
      });
    }
    if (
      !user.member ||
      !(await db.workspaceUser.findFirst({
        where: {
          workspaceId: args.workspaceId,
          userId: user.id,
          role: "CUSTOMER",
          isActive: true,
        },
      }))
    )
      throw new PublicEnrollmentError(
        "This account is not available for member registration.",
      );
    let memberId = user.member.id,
      guardianId: string | undefined,
      reviewRequired = false;
    if (child) {
      // Existing verified children are selected by identity in the portal, never inferred from a household email.
      const existing = await db.familyLink.findMany({
        where: {
          workspaceId: args.workspaceId,
          guardian: { email: enrollment.email },
          childMember: {
            fullName: participant.fullName,
            dateOfBirth: new Date(`${participant.dateOfBirth}T00:00:00Z`),
          },
        },
        include: { childMember: true, guardian: true },
      });
      const grants = await db.memberPortalGrant.findMany({
        where: {
          workspaceId: args.workspaceId,
          userId: user.id,
          revokedAt: null,
          ...enrollmentGuardianPermissions(enrollment.kind, "identity"),
          guardian: { workspaceId: args.workspaceId },
          OR: existing.map((link) => ({
            memberId: link.childMemberId,
            guardianId: link.guardianId,
          })),
        },
      });
      const authorized = grants.filter((grant) => Boolean(grant.verifiedAt));
      if (authorized.length === 1) {
        memberId = authorized[0]!.memberId;
        guardianId = authorized[0]!.guardianId;
      } else if (existing.length)
        throw new PublicEnrollmentError(
          "Ask the gym to verify your family access, then continue here.",
        );
      else {
        const member = await db.member.create({
          data: {
            workspaceId: args.workspaceId,
            fullName: participant.fullName,
            dateOfBirth: new Date(`${participant.dateOfBirth}T00:00:00Z`),
            status: "TRIAL",
            notes:
              "Public registration: guardian authority needs owner verification before booking, signing or payment.",
          },
        });
        const guardian = await db.guardian.create({
          data: {
            workspaceId: args.workspaceId,
            fullName: participant.guardianFullName,
            email: enrollment.email,
            phone: participant.phone || null,
            familyLinks: {
              create: {
                workspaceId: args.workspaceId,
                childMemberId: member.id,
                relationshipLabel: participant.relationshipLabel,
                isPrimary: true,
              },
            },
          },
        });
        memberId = member.id;
        guardianId = guardian.id;
        reviewRequired = true;
      }
    } else if (
      user.member.dateOfBirth &&
      user.member.dateOfBirth.toISOString().slice(0, 10) !==
        participant.dateOfBirth
    )
      throw new PublicEnrollmentError(
        "The participant details differ from this account. Ask the gym to review them.",
      );
    await db.financialAccount.upsert({
      where: {
        workspaceId_userId: { workspaceId: args.workspaceId, userId: user.id },
      },
      update: {},
      create: {
        workspaceId: args.workspaceId,
        userId: user.id,
        memberId: user.member.id,
      },
    });
    await db.publicEnrollment.update({
      where: { id: enrollment.id },
      data: {
        memberId,
        participant: {
          ...participant,
          ...(!child ? { fullName: user.member.fullName } : {}),
          accountUserId: user.id,
          payerMemberId: user.member.id,
          ...(guardianId ? { guardianId } : {}),
          identityReview: reviewRequired,
        } as unknown as Prisma.InputJsonObject,
        version: { increment: 1 },
      },
    });
    return { userId: user.id, memberId, reviewRequired };
  });
}
export async function acceptPublicMembershipTerms(args: {
  token: string;
  workspaceId: string;
  actorUserId: string;
  db?: PrismaClient;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  return (args.db ?? prisma).$transaction(async (db) => {
    await lockClassSchedule(db, args.workspaceId);
    await requirePublicWorkspace(db, args.workspaceId);
    const enrollment = await db.publicEnrollment.findFirst({
      where: {
        workspaceId: args.workspaceId,
        accessTokenHash: hash(args.token),
        kind: "MEMBERSHIP",
      },
    });
    if (
      !enrollment?.verifiedAt ||
      !enrollment.memberId ||
      enrollment.createdAt.getTime() + 24 * 3600_000 < now.getTime()
    )
      throw new PublicEnrollmentError("Verify your account before continuing.");
    const participant = readPublicParticipant(enrollment);
    await requireEnrollmentAuthority(db, enrollment, args.actorUserId, "pay");
    const { plan } = await currentOffer(db, args.workspaceId, participant);
    if (enrollment.operationId) return enrollment;
    return db.publicEnrollment.update({
      where: { id: enrollment.id },
      data: {
        acceptedTerms: {
          ...(enrollment.acceptedTerms as Prisma.InputJsonObject),
          membership: {
            ...snapshotMembershipTerms(plan, now),
            acceptedByUserId: args.actorUserId,
            beneficiaryMemberId: enrollment.memberId,
            acceptanceMethod: "PUBLIC_VERIFIED_ACCOUNT",
          },
        } as unknown as Prisma.InputJsonObject,
        status: "FORMS_REQUIRED",
        version: { increment: 1 },
      },
    });
  });
}

export async function publicEnrollmentFormsTx(
  db: Db,
  enrollment: PublicEnrollment,
  actorUserId: string,
  ensure = false,
) {
  const participant = readPublicParticipant(enrollment);
  await requireEnrollmentAuthority(db, enrollment, actorUserId, "sign");
  const assignments = await db.requiredFormAssignment.findMany({
    where: {
      workspaceId: enrollment.workspaceId,
      isActive: true,
      requirementTarget: {
        in:
          enrollment.kind === "TRIAL"
            ? [
                "TRIAL",
                ...(participant.guardianId ? ["GUARDIAN" as const] : []),
              ]
            : [
                "MEMBER",
                "MEMBERSHIP_ACTIVATION",
                ...(participant.guardianId ? ["GUARDIAN" as const] : []),
              ],
      },
      formDocument: { archivedAt: null },
    },
    include: { formDocument: { include: { currentVersion: true } } },
  });
  const forms: Array<{
    name: string;
    version: number;
    signed: boolean;
    requestId: string | null;
  }> = [];
  const seen = new Set<string>();
  for (const assignment of assignments) {
    const version = assignment.formDocument.currentVersion;
    if (!version)
      throw new PublicEnrollmentError(
        "The gym needs to publish a required form before registration can continue.",
      );
    if (seen.has(version.id)) continue;
    seen.add(version.id);
    const signerKind = participant.guardianId
      ? ("GUARDIAN" as const)
      : ("MEMBER" as const);
    const identity = {
      workspaceId: enrollment.workspaceId,
      memberId: enrollment.memberId!,
      guardianId: participant.guardianId ?? null,
      signerKind,
      formVersionId: version.id,
    };
    const signed = !!(await db.signedDocument.findFirst({ where: identity }));
    let request = await db.signatureRequest.findFirst({
      where: { ...identity, accessMethod: "PORTAL", status: "OPEN" },
    });
    if (!signed && !request && ensure)
      request = await db.signatureRequest.create({
        data: { ...identity, accessMethod: "PORTAL" },
      });
    forms.push({
      name: assignment.formDocument.name,
      version: version.versionNumber,
      signed,
      requestId: request?.id ?? null,
    });
  }
  return forms;
}
export async function getPublicEnrollmentForms(args: {
  workspaceId: string;
  enrollmentId: string;
  actorUserId: string;
  ensure?: boolean;
  db?: PrismaClient;
}) {
  return (args.db ?? prisma).$transaction(async (db) => {
    await lockClassSchedule(db, args.workspaceId);
    const enrollment = await db.publicEnrollment.findFirst({
      where: { id: args.enrollmentId, workspaceId: args.workspaceId },
    });
    if (!enrollment) throw new PublicEnrollmentError("Registration not found.");
    return publicEnrollmentFormsTx(
      db,
      enrollment,
      args.actorUserId,
      args.ensure,
    );
  });
}
