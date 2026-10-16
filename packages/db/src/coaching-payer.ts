import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  CoachingError,
  type CoachingActor,
  type CoachingCommand,
} from "./coaching.js";
import { lockFinancialAccount } from "./financial-operations.js";

const shared = globalThis as typeof globalThis & {
  coachingPrisma?: PrismaClient;
};
const prisma = shared.coachingPrisma ?? new PrismaClient({ log: [] });
shared.coachingPrisma = prisma;
type Tx = Prisma.TransactionClient;
function fail(message: string): never {
  throw new CoachingError(message);
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const commercial = (e: {
  memberId: string;
  programVersionId: string;
  programVersion: { priceCents: number; currency: string; terms: string };
}) => ({
  beneficiaryMemberId: e.memberId,
  programVersionId: e.programVersionId,
  amountCents: e.programVersion.priceCents,
  currency: e.programVersion.currency,
  terms: e.programVersion.terms,
});
function adult(date: Date | null) {
  if (!date) return false;
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 18);
  return date <= cutoff;
}
async function enrollment(tx: Tx, actor: CoachingActor, id: string) {
  return (
    (await tx.coachingEnrollment.findFirst({
      where: {
        id,
        workspaceId: actor.workspaceId,
        workspace: { status: { not: "DISABLED" } },
      },
      include: {
        programVersion: { include: { program: true } },
        member: { include: { user: true } },
        currentCoach: true,
      },
    })) ?? fail("Program payment not found.")
  );
}
async function payer(tx: Tx, actor: CoachingActor) {
  const member = await tx.member.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      user: {
        workspaceUsers: {
          some: {
            workspaceId: actor.workspaceId,
            role: "CUSTOMER",
            isActive: true,
          },
        },
      },
    },
    include: { user: true },
  });
  if (!member?.user || !adult(member.dateOfBirth))
    fail("An adult with their own active member account is required.");
  return member;
}

export const coachingPayerCommands = new Set([
  "inviteCoachingPayer",
  "sendPayerVerification",
  "verifyPayerContact",
  "acceptPayerTerms",
  "revokeCoachingPayer",
]);
export async function executeCoachingPayer(
  tx: Tx,
  actor: CoachingActor,
  command: CoachingCommand,
) {
  const e = await enrollment(tx, actor, command.enrollmentId ?? "");
  if (e.version !== command.expectedVersion)
    fail("The program changed. Reload the payment request.");
  const who = await payer(tx, actor);
  const own = who.id === e.memberId;
  const now = new Date();
  const input = command.input;
  if (command.kind === "inviteCoachingPayer") {
    if (
      !own ||
      input.confirmConsequences !== true ||
      !e.contactVerifiedAt ||
      !e.acceptedAt ||
      e.closedAt ||
      e.paymentState === "PAID"
    )
      fail(
        "The verified adult client must accept their plan and explicitly consent before inviting a payer.",
      );
    if (
      e.checkoutSessionId ||
      (await tx.financialOperation.count({
        where: {
          workspaceId: actor.workspaceId,
          targetId: e.id,
          kind: "CHECKOUT",
          status: { in: ["SUBMITTED", "RESERVED", "REVIEW_REQUIRED"] },
        },
      }))
    )
      fail("Resolve the existing payment attempt before changing the payer.");
    const email = String(input.payerEmail ?? "")
      .trim()
      .toLowerCase();
    const candidate = await tx.member.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        user: {
          email,
          workspaceUsers: {
            some: {
              workspaceId: actor.workspaceId,
              role: "CUSTOMER",
              isActive: true,
            },
          },
        },
      },
      include: { user: true },
    });
    if (
      !candidate?.user ||
      !adult(candidate.dateOfBirth) ||
      candidate.id === who.id
    )
      fail(
        "Choose another adult who already has their own active account at this gym.",
      );
    await tx.coachingPayerGrant.updateMany({
      where: {
        enrollmentId: e.id,
        workspaceId: actor.workspaceId,
        activeSlot: "ACTIVE",
      },
      data: {
        activeSlot: null,
        revokedAt: now,
        revokedByUserId: actor.userId,
        version: { increment: 1 },
      },
    });
    const grant = await tx.coachingPayerGrant.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
        payerUserId: candidate.userId!,
        payerMemberId: candidate.id,
        clientUserId: actor.userId,
        clientConsentedAt: now,
        acceptedTerms: commercial(e),
      },
    });
    await tx.coachingEnrollment.update({
      where: { id: e.id },
      data: { currentPayerGrantId: grant.id, version: { increment: 1 } },
    });
    return grant.id;
  }
  const grant =
    (await tx.coachingPayerGrant.findFirst({
      where: {
        id: String(input.grantId),
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
      },
    })) ?? fail("Payer request not found.");
  const isPayer =
    grant.payerUserId === actor.userId && grant.payerMemberId === who.id;
  if (!own && !isPayer) fail("This account cannot access the payer request.");
  if (command.kind === "revokeCoachingPayer") {
    await lockFinancialAccount(tx, actor.workspaceId);
    await tx.coachingPayerGrant.update({
      where: { id: grant.id },
      data: {
        activeSlot: null,
        revokedAt: grant.revokedAt ?? now,
        revokedByUserId: actor.userId,
        verificationHash: null,
        version: { increment: 1 },
      },
    });
    const operations = await tx.financialOperation.findMany({
      where: {
        workspaceId: actor.workspaceId,
        targetId: e.id,
        kind: "CHECKOUT",
        status: { in: ["SUBMITTED", "RESERVED", "REVIEW_REQUIRED"] },
      },
    });
    for (const operation of operations) {
      await tx.financialOperation.update({
        where: { id: operation.id },
        data: {
          status: "REVIEW_REQUIRED",
          providerUrl: null,
          lastError:
            "Payer consent was revoked; inspect any provider payment before resolving access.",
        },
      });
      await tx.financialReviewCase.upsert({
        where: {
          workspaceId_sourceKey: {
            workspaceId: actor.workspaceId,
            sourceKey: `coaching-payer-revoked:${operation.id}`,
          },
        },
        create: {
          workspaceId: actor.workspaceId,
          sourceKey: `coaching-payer-revoked:${operation.id}`,
          reason: "Coaching payer consent revoked during a payment attempt.",
          memberId: e.memberId,
          payerAccountId: operation.payerAccountId,
          operationId: operation.id,
        },
        update: {},
      });
    }
  } else {
    if (
      !isPayer ||
      grant.revokedAt ||
      grant.activeSlot !== "ACTIVE" ||
      e.currentPayerGrantId !== grant.id ||
      e.closedAt
    )
      fail("This payer authorization is no longer active.");
    if (JSON.stringify(grant.acceptedTerms) !== JSON.stringify(commercial(e))) {
      // JSONB object key order is not significant; compare the exact commercial values.
      const saved = grant.acceptedTerms as ReturnType<typeof commercial> | null;
      if (
        !saved ||
        Object.entries(commercial(e)).some(
          ([key, value]) => saved[key as keyof typeof saved] !== value,
        )
      )
        fail(
          "The accepted program terms changed. The client must issue a new payer request.",
        );
    }
    if (command.kind === "sendPayerVerification") {
      if (
        grant.verificationSentAt &&
        now.getTime() - grant.verificationSentAt.getTime() < 60000
      )
        fail("Wait one minute before requesting another verification email.");
      const code = randomBytes(24).toString("hex"),
        verificationHash = hash(code),
        expiresAt = new Date(now.getTime() + 30 * 60000);
      await tx.coachingPayerGrant.update({
        where: { id: grant.id },
        data: {
          verificationHash,
          verificationExpiresAt: expiresAt,
          verificationSentAt: now,
          version: { increment: 1 },
        },
      });
      await tx.notificationJob.create({
        data: {
          workspaceId: actor.workspaceId,
          recipientEmail: who.user!.email,
          templateKind: "ANNOUNCEMENT",
          subject: "Verify your coaching payment contact",
          body: `Enter this one-use code on your signed-in HitLink payment request: ${code}\nIt expires in 30 minutes.`,
          status: "PENDING",
          nextAttemptAt: now,
          expiresAt,
          dedupeKey: `coaching-payer:${grant.id}:${now.toISOString()}`,
          context: {
            kind: "COACHING_PAYER_VERIFICATION",
            grantId: grant.id,
            verificationHash,
            issuedAt: now.toISOString(),
          },
        },
      });
    } else if (command.kind === "verifyPayerContact") {
      const candidate = hash(String(input.code ?? ""));
      if (
        !grant.verificationHash ||
        !grant.verificationExpiresAt ||
        grant.verificationExpiresAt <= now ||
        !timingSafeEqual(
          Buffer.from(candidate),
          Buffer.from(grant.verificationHash),
        )
      )
        fail("This verification code is invalid or expired.");
      await tx.coachingPayerGrant.update({
        where: { id: grant.id },
        data: {
          payerContactVerifiedAt: now,
          verificationHash: null,
          verificationExpiresAt: null,
          version: { increment: 1 },
        },
      });
    } else if (command.kind === "acceptPayerTerms") {
      if (!grant.payerContactVerifiedAt || input.confirmConsequences !== true)
        fail(
          "Verify your contact and explicitly accept the exact payment terms.",
        );
      await tx.coachingPayerGrant.update({
        where: { id: grant.id },
        data: { payerAcceptedAt: now, version: { increment: 1 } },
      });
    }
  }
  await tx.coachingEnrollment.update({
    where: { id: e.id },
    data: { version: { increment: 1 } },
  });
  return grant.id;
}

/** No intake, goals, notes, coach identity or program history leaves this boundary. */
export async function getCoachingPayerRequests(actor: CoachingActor) {
  const who = await prisma.member.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      workspace: { status: { not: "DISABLED" } },
      user: {
        workspaceUsers: {
          some: {
            workspaceId: actor.workspaceId,
            role: "CUSTOMER",
            isActive: true,
          },
        },
      },
    },
    select: { id: true, dateOfBirth: true },
  });
  if (!who || !adult(who.dateOfBirth)) return [];
  return prisma.coachingPayerGrant.findMany({
    where: {
      workspaceId: actor.workspaceId,
      payerUserId: actor.userId,
      payerMemberId: who.id,
      revokedAt: null,
    },
    select: { id: true, enrollmentId: true, createdAt: true },
  });
}
export async function getCoachingPayerView(
  actor: CoachingActor,
  grantId: string,
) {
  return prisma.$transaction(async (tx) => {
    const who = await payer(tx, actor);
    const grant =
      (await tx.coachingPayerGrant.findFirst({
        where: { id: grantId, workspaceId: actor.workspaceId },
      })) ?? fail("Payer request not found.");
    const e = await enrollment(tx, actor, grant.enrollmentId);
    if (
      who.id !== e.memberId &&
      (grant.payerUserId !== actor.userId || grant.payerMemberId !== who.id)
    )
      fail("This payment request is not addressed to this account.");
    const terms = grant.acceptedTerms as ReturnType<typeof commercial> | null;
    if (
      !terms ||
      typeof terms.amountCents !== "number" ||
      typeof terms.currency !== "string" ||
      typeof terms.terms !== "string"
    )
      fail(
        "This payment request needs its original accepted terms restored before it can be read.",
      );
    return {
      id: grant.id,
      enrollmentId: e.id,
      version: e.version,
      clientName: e.member.fullName,
      amountCents: terms.amountCents,
      currency: terms.currency,
      terms: terms.terms,
      verified: !!grant.payerContactVerifiedAt,
      accepted: !!grant.payerAcceptedAt,
      revoked: !!grant.revokedAt || e.currentPayerGrantId !== grant.id,
      paymentState:
        e.currentPayerGrantId === grant.id
          ? e.paymentState
          : "AUTHORIZATION_REPLACED",
      client: who.id === e.memberId,
      closed: !!e.closedAt,
    };
  });
}

export async function requireCoachingPaymentViewer(
  actor: CoachingActor,
  enrollmentId: string,
) {
  return prisma.$transaction(async (tx) => {
    const e = await enrollment(tx, actor, enrollmentId),
      who = await payer(tx, actor);
    const granted = await tx.coachingPayerGrant.findFirst({
      where: {
        enrollmentId,
        workspaceId: actor.workspaceId,
        payerUserId: actor.userId,
        payerMemberId: who.id,
        id: e.currentPayerGrantId ?? "",
      },
    });
    if (who.id !== e.memberId && !granted)
      fail(
        "Check payment from the client's or authorized payer's own account.",
      );
    return { own: who.id === e.memberId, payer: !!granted };
  });
}

/** Called under class-schedule then family-access lock at prepare, dispatch and settlement. */
export async function requireCoachingPaymentAuthority(
  tx: Tx,
  actor: CoachingActor,
  enrollmentId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${actor.workspaceId}`}))`;
  const e = await enrollment(tx, actor, enrollmentId);
  const who = await payer(tx, actor);
  if (
    !e.acceptedAt ||
    !e.contactVerifiedAt ||
    !e.currentCoach?.isActive ||
    e.closedAt ||
    !(await tx.workspaceUser.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        userId: e.member.userId ?? "",
        role: "CUSTOMER",
        isActive: true,
      },
    }))
  )
    fail(
      "The client's program acceptance or account access needs review before payment.",
    );
  const grant = e.currentPayerGrantId
    ? await tx.coachingPayerGrant.findFirst({
        where: {
          id: e.currentPayerGrantId,
          enrollmentId: e.id,
          workspaceId: actor.workspaceId,
        },
      })
    : null;
  if (who.id !== e.memberId) {
    if (
      !grant ||
      grant.revokedAt ||
      grant.activeSlot !== "ACTIVE" ||
      grant.clientUserId !== e.member.userId ||
      grant.payerUserId !== actor.userId ||
      grant.payerMemberId !== who.id ||
      !grant.payerContactVerifiedAt ||
      !grant.payerAcceptedAt
    )
      fail(
        "The adult client and verified payer must both consent before payment.",
      );
    const terms = grant.acceptedTerms as ReturnType<typeof commercial> | null;
    if (
      !terms ||
      Object.entries(commercial(e)).some(
        ([key, value]) => terms[key as keyof typeof terms] !== value,
      )
    )
      fail("The payment terms changed. Obtain fresh client and payer consent.");
  } else if (grant && !grant.revokedAt)
    fail(
      "The invited payer must pay this request, or revoke that invitation before paying yourself.",
    );
  await lockFinancialAccount(tx, actor.workspaceId);
  const account = await tx.financialAccount.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
      },
    },
    create: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      memberId: who.id,
    },
    update: {},
  });
  if (account.memberId !== who.id) fail("The payer account needs review.");
  return {
    enrollment: e,
    payerAccountId: account.id,
    payerUserId: actor.userId,
    payerEmail: who.user!.email,
    payerGrantId: who.id !== e.memberId ? grant!.id : null,
    payerGrantVersion: who.id !== e.memberId ? grant!.version : null,
  };
}
