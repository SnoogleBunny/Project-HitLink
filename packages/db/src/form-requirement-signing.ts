import {
  Prisma,
  type PrismaClient,
  type RequirementTarget,
} from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import {
  lockStaffAuthorityTx,
  normalizeAuthoritySerializationError,
} from "./staff-access.js";
import {
  listEffectiveFormAssignments,
  signableFormBinding,
} from "./form-requirement-bindings.js";
import {
  getSignerKindForTarget,
  isRequirementTargetApplicable,
  buildSignatureRequestToken,
  type ResolvedRequiredFormStatusResult,
  type RecordLocalFormSignatureResult,
  type IssuedMagicLinkRequest,
} from "./forms.js";

type Tx = Prisma.TransactionClient;
const memberInclude = { familyLinks: { include: { guardian: true } } } as const;
export async function hasPublishedFormRequirements(
  db: Tx | PrismaClient,
  workspaceId: string,
) {
  return !!(await db.formRequirementRevision.findFirst({
    where: { workspaceId },
    select: { id: true },
  }));
}
async function transaction<T>(db: PrismaClient, work: (tx: Tx) => Promise<T>) {
  for (let attempt = 0; ; attempt++)
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        timeout: 30000,
      });
    } catch (caught) {
      const error = normalizeAuthoritySerializationError(caught);
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 3
      )
        throw error;
    }
}

/** Read and issue only exact published cycles. No renewal duplicates the PDF. */
export async function resolveRevisionFormStatuses(args: {
  workspaceId: string;
  memberId: string;
  targets?: RequirementTarget[];
  ensureRequests?: boolean;
  serviceAt?: Date;
  includeUpcoming?: boolean;
  db?: PrismaClient | Tx;
  now?: Date;
}): Promise<ResolvedRequiredFormStatusResult> {
  const db = args.db ?? prisma,
    now = args.now ?? new Date();
  const member = await db.member.findFirst({
    where: { id: args.memberId, workspaceId: args.workspaceId },
    include: memberInclude,
  });
  if (!member) return { items: [], history: [] };
  const bindings = (
    await listEffectiveFormAssignments({ ...args, db, now })
  ).filter((binding) =>
    isRequirementTargetApplicable({
      requirementTarget: binding.requirementTarget,
      memberStatus: member.status,
      guardianCount: member.familyLinks.length,
    }),
  );
  const signatures = await db.signedDocument.findMany({
    where: { workspaceId: args.workspaceId, memberId: args.memberId },
    include: {
      guardian: true,
      formVersion: { include: { formDocument: true } },
    },
    orderBy: [{ signedAt: "desc" }, { id: "asc" }],
  });
  const items = [];
  for (const binding of bindings) {
    const at =
      args.serviceAt ?? (binding.upcoming ? binding.effectiveAt! : now);
    const signerKind = getSignerKindForTarget(
      binding.requirementTarget,
      member,
      at,
    );
    const proof = signatures.find(
      (row) =>
        row.formVersionId === binding.formDocument.currentVersionId &&
        row.acceptanceCycleKey === binding.acceptanceCycleKey &&
        row.requirementRevisionId === binding.requirementRevisionId &&
        row.signerKind === signerKind &&
        row.signedAt <= now &&
        (!row.validUntil || row.validUntil > at),
    );
    const expired =
      !!binding.consentValidUntil && binding.consentValidUntil <= at;
    if (!proof && !expired && args.ensureRequests !== false) {
      const guardians =
        signerKind === "GUARDIAN"
          ? member.familyLinks.map((link) => link.guardian.id)
          : [null];
      for (const guardianId of guardians) {
        const open = await db.signatureRequest.findFirst({
          where: {
            workspaceId: args.workspaceId,
            memberId: member.id,
            formVersionId: binding.formDocument.currentVersionId,
            acceptanceCycleKey: binding.acceptanceCycleKey,
            signerKind,
            guardianId,
            status: "OPEN",
            accessMethod: "PORTAL",
          },
          select: { id: true },
        });
        if (!open)
          await db.signatureRequest.create({
            data: {
              workspaceId: args.workspaceId,
              memberId: member.id,
              formVersionId: binding.formDocument.currentVersionId,
              requirementRevisionId: binding.requirementRevisionId,
              acceptanceCycleKey: binding.acceptanceCycleKey,
              signerKind,
              guardianId,
              accessMethod: "PORTAL",
            },
          });
      }
    }
    const open = !expired
      ? await db.signatureRequest.findMany({
          where: {
            workspaceId: args.workspaceId,
            memberId: member.id,
            formVersionId: binding.formDocument.currentVersionId,
            acceptanceCycleKey: binding.acceptanceCycleKey,
            signerKind,
            status: "OPEN",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          orderBy: { id: "asc" },
        })
      : [];
    const previous = signatures.find(
      (row) =>
        row.formVersion.formDocumentId === binding.formDocument.id &&
        row.signerKind === signerKind,
    );
    items.push({
      assignmentId: binding.id,
      requirementTarget: binding.requirementTarget,
      requirementRevisionId: binding.requirementRevisionId,
      acceptanceCycleKey: binding.acceptanceCycleKey,
      effectiveAt: binding.effectiveAt,
      consentValidUntil: binding.consentValidUntil,
      upcoming: binding.upcoming,
      formDocumentId: binding.formDocument.id,
      formName: binding.formDocument.name,
      formType: binding.formDocument.formType,
      description: binding.formDocument.description,
      signerKind,
      currentVersionId: binding.formDocument.currentVersionId,
      currentVersionNumber: binding.formDocument.currentVersion.versionNumber,
      currentVersionCreatedAt: binding.formDocument.currentVersion.createdAt,
      status: expired
        ? ("EXPIRED" as const)
        : proof
          ? ("SIGNED" as const)
          : previous
            ? previous.formVersionId === binding.formDocument.currentVersionId
              ? ("RENEWAL_REQUIRED" as const)
              : ("SUPERSEDED" as const)
            : open.length
              ? ("PENDING" as const)
              : ("MISSING" as const),
      signedAt: proof?.signedAt ?? null,
      signedDocumentId: proof?.id ?? null,
      signedByName:
        proof?.signerNameSnapshot ?? previous?.signerNameSnapshot ?? null,
      openRequests: open.map((row) => ({
        requestId: row.id,
        accessMethod: row.accessMethod,
        signerKind: row.signerKind,
        guardianId: row.guardianId,
        guardianName:
          member.familyLinks.find((link) => link.guardian.id === row.guardianId)
            ?.guardian.fullName ?? null,
        expiresAt: row.expiresAt,
      })),
    });
  }
  return {
    items,
    history: signatures.map((row) => ({
      signedDocumentId: row.id,
      requirementRevisionId: row.requirementRevisionId,
      acceptanceCycleKey: row.acceptanceCycleKey,
      consentValidUntil: row.validUntil,
      formDocumentId: row.formVersion.formDocumentId,
      formName: row.formVersion.formDocument.name,
      formType: row.formVersion.formDocument.formType,
      versionId: row.formVersionId,
      versionNumber: row.formVersion.versionNumber,
      signerKind: row.signerKind,
      guardianId: row.guardianId,
      guardianName: row.guardian?.fullName ?? null,
      signerNameSnapshot: row.signerNameSnapshot,
      signerEmailSnapshot: row.signerEmailSnapshot,
      signedAt: row.signedAt,
    })),
  };
}

/** Public trial keeps its existing bearer contract, now bound to the exact cycle. */
export async function issueRevisionTrialLinks(args: {
  workspaceId: string;
  memberId: string;
  db?: PrismaClient;
  now?: Date;
}): Promise<IssuedMagicLinkRequest[]> {
  const db = args.db ?? prisma,
    now = args.now ?? new Date();
  const result = await resolveRevisionFormStatuses({
    ...args,
    db,
    now,
    targets: ["TRIAL", "GUARDIAN"],
    includeUpcoming: true,
    ensureRequests: false,
  });
  const member = await db.member.findFirst({
    where: { id: args.memberId, workspaceId: args.workspaceId },
    include: memberInclude,
  });
  if (!member) return [];
  const links: IssuedMagicLinkRequest[] = [];
  for (const item of result.items.filter(
    (row) => row.status !== "SIGNED" && row.status !== "EXPIRED",
  )) {
    for (const guardianId of item.signerKind === "GUARDIAN"
      ? member.familyLinks.map((link) => link.guardian.id)
      : [null]) {
      let request = await db.signatureRequest.findFirst({
        where: {
          workspaceId: args.workspaceId,
          memberId: member.id,
          formVersionId: item.currentVersionId,
          acceptanceCycleKey: item.acceptanceCycleKey,
          guardianId,
          signerKind: item.signerKind,
          accessMethod: "MAGIC_LINK",
          status: "OPEN",
          expiresAt: { gt: now },
        },
      });
      if (!request) {
        request = await db.signatureRequest.create({
          data: {
            workspaceId: args.workspaceId,
            memberId: member.id,
            formVersionId: item.currentVersionId,
            requirementRevisionId: item.requirementRevisionId,
            acceptanceCycleKey: item.acceptanceCycleKey,
            guardianId,
            signerKind: item.signerKind,
            accessMethod: "MAGIC_LINK",
            expiresAt: new Date(
              Math.min(
                +now + 7 * 86400000,
                item.consentValidUntil ? +item.consentValidUntil : Infinity,
              ),
            ),
          },
        });
        const { createHash } = await import("node:crypto");
        await db.signatureRequest.update({
          where: { id: request.id },
          data: {
            tokenHash: createHash("sha256")
              .update(buildSignatureRequestToken(request.id))
              .digest("hex"),
          },
        });
      }
      if (links.some((link) => link.requestId === request.id)) continue;
      links.push({
        requestId: request.id,
        token: buildSignatureRequestToken(request.id),
        formDocumentId: item.formDocumentId,
        formName: item.formName,
        formType: item.formType,
        versionId: item.currentVersionId,
        versionNumber: item.currentVersionNumber,
        signerKind: item.signerKind,
        guardianId,
        guardianName:
          member.familyLinks.find((link) => link.guardian.id === guardianId)
            ?.guardian.fullName ?? null,
        expiresAt: request.expiresAt!,
      });
    }
  }
  return links;
}

/** Existing token HMAC/hash validation is performed by recordLocalFormSignature before dispatch here. */
/** A published MEMBER form may be accepted before the same verified person
 * becomes ACTIVE. This capability is derived from persisted registration, never
 * a posted flag, email match, payer record or another household participant. */
export async function membershipEnrollmentSigningIntentTx(
  tx: Tx,
  request: {
    workspaceId: string;
    memberId: string;
    guardianId: string | null;
    accessMethod: string;
  },
  actorUserId: string | undefined,
  now: Date,
) {
  if (!actorUserId || request.accessMethod !== "PORTAL") return false;
  const enrollments = await tx.publicEnrollment.findMany({
    where: {
      workspaceId: request.workspaceId,
      memberId: request.memberId,
      kind: "MEMBERSHIP",
      status: { in: ["VERIFIED", "FORMS_REQUIRED", "PAYMENT_PENDING"] },
      OR: [
        { createdAt: { gt: new Date(now.getTime() - 24 * 3600000) } },
        { operationId: { not: null } },
      ],
      participant: { path: ["accountUserId"], equals: actorUserId },
    },
    orderBy: { createdAt: "desc" },
    take: 51,
  });
  if (enrollments.length > 50) return false;
  for (const candidate of enrollments) {
    await tx.$queryRaw`SELECT id FROM public_enrollments WHERE id=${candidate.id} AND "workspaceId"=${request.workspaceId} FOR SHARE`;
    // The legacy signature path uses ReadCommitted. A lock wait there does not
    // invalidate the earlier candidate snapshot, so read its current row again.
    const enrollment = await tx.publicEnrollment.findFirst({
      where: {
        id: candidate.id,
        workspaceId: request.workspaceId,
        memberId: request.memberId,
        kind: "MEMBERSHIP",
      },
    });
    if (!enrollment) continue;
    const participant = enrollment.participant as Prisma.JsonObject;
    if (
      !enrollment.verifiedAt ||
      !["VERIFIED", "FORMS_REQUIRED", "PAYMENT_PENDING"].includes(
        enrollment.status,
      ) ||
      participant.accountUserId !== actorUserId ||
      (participant.guardianId ?? null) !== request.guardianId
    )
      continue;
    if (enrollment.createdAt.getTime() + 24 * 3600000 > now.getTime())
      return true;
    if (!enrollment.operationId) continue;
    await tx.$queryRaw`SELECT id FROM financial_operations WHERE id=${enrollment.operationId} AND "workspaceId"=${request.workspaceId} FOR SHARE`;
    const operation = await tx.financialOperation.findFirst({
      where: {
        id: enrollment.operationId,
        workspaceId: request.workspaceId,
        actorUserId,
        beneficiaryMemberId: request.memberId,
        kind: "CHECKOUT",
        status: {
          in: ["RESERVED", "SUBMITTED", "REVIEW_REQUIRED", "SUCCEEDED"],
        },
      },
    });
    const accepted = operation?.payload as Prisma.JsonObject | undefined;
    if (
      accepted?.purpose === "public_membership" &&
      accepted.enrollmentId === enrollment.id
    )
      return true;
  }
  return false;
}
export async function recordRevisionSignature(args: {
  db: PrismaClient;
  requestId: string;
  token?: string;
  actorUserId?: string;
  workspaceId?: string;
  memberId?: string;
  guardianId?: string | null;
  signerName: string;
  signerEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  now: Date;
}): Promise<RecordLocalFormSignatureResult> {
  const deny = (message: string): RecordLocalFormSignatureResult => ({
    status: "error",
    message,
  });
  const initial = await args.db.signatureRequest.findUnique({
    where: { id: args.requestId },
    include: { formVersion: { select: { formDocumentId: true } } },
  });
  if (!initial) return deny("Signature request not found.");
  return transaction(args.db, async (tx) => {
    await lockClassSchedule(tx, initial.workspaceId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${initial.workspaceId}`}))`;
    if (args.actorUserId)
      await lockStaffAuthorityTx(tx, {
        workspaceId: initial.workspaceId,
        userId: args.actorUserId,
      });
    await tx.$queryRaw`SELECT id FROM form_documents WHERE id=${initial.formVersion.formDocumentId} AND "workspaceId"=${initial.workspaceId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM signature_requests WHERE id=${initial.id} FOR UPDATE`;
    const request = await tx.signatureRequest.findUnique({
      where: { id: initial.id },
    });
    if (
      !request ||
      request.workspaceId !== initial.workspaceId ||
      request.formVersionId !== initial.formVersionId ||
      request.requirementRevisionId !== initial.requirementRevisionId
    )
      return deny("Signature request not found.");
    if (
      args.workspaceId &&
      (args.workspaceId !== request.workspaceId ||
        args.memberId !== request.memberId)
    )
      return deny("Signature request not found.");
    await tx.$queryRaw`SELECT id FROM members WHERE id=${request.memberId} AND "workspaceId"=${request.workspaceId} FOR SHARE`;
    const member = await tx.member.findFirst({
      where: { id: request.memberId, workspaceId: request.workspaceId },
      include: memberInclude,
    });
    if (!member) return deny("Signature request not found.");
    // Lock exact grant/link authority before any scope read under this fixed snapshot.
    await tx.$queryRaw`SELECT id FROM member_portal_grants WHERE "workspaceId"=${request.workspaceId} AND "memberId"=${request.memberId} ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM family_links WHERE "workspaceId"=${request.workspaceId} AND "childMemberId"=${request.memberId} ORDER BY id FOR SHARE`;
    if (args.token) {
      const { createHash } = await import("node:crypto");
      if (
        request.accessMethod !== "MAGIC_LINK" ||
        request.tokenHash !==
          createHash("sha256").update(args.token).digest("hex")
      )
        return deny("Signature request not found.");
      if (request.signerKind === "GUARDIAN") {
        if (
          !request.guardianId ||
          !(await tx.familyLink.findFirst({
            where: {
              workspaceId: request.workspaceId,
              childMemberId: request.memberId,
              guardianId: request.guardianId,
            },
          }))
        )
          return deny("Guardian access is no longer active.");
        const grants = await tx.memberPortalGrant.findMany({
          where: {
            workspaceId: request.workspaceId,
            memberId: request.memberId,
            guardianId: request.guardianId,
          },
        });
        if (
          grants.length &&
          !grants.some(
            (grant) => !grant.revokedAt && grant.canSign && grant.verifiedAt,
          )
        )
          return deny("Guardian signing access is no longer active.");
      }
    } else if (request.signerKind === "GUARDIAN") {
      if (
        !args.actorUserId ||
        request.guardianId !== args.guardianId ||
        !(await tx.memberPortalGrant.findFirst({
          where: {
            workspaceId: request.workspaceId,
            memberId: request.memberId,
            userId: args.actorUserId,
            guardianId: request.guardianId!,
            canSign: true,
            revokedAt: null,
            user: {
              workspaceUsers: {
                some: {
                  workspaceId: request.workspaceId,
                  role: "CUSTOMER",
                  isActive: true,
                },
              },
            },
          },
        })) ||
        !(await tx.familyLink.findFirst({
          where: {
            workspaceId: request.workspaceId,
            childMemberId: request.memberId,
            guardianId: request.guardianId!,
          },
        }))
      )
        return deny("Guardian signing access is no longer active.");
    } else if (
      !args.actorUserId ||
      member.userId !== args.actorUserId ||
      args.guardianId ||
      !(await tx.workspaceUser.findFirst({
        where: {
          workspaceId: request.workspaceId,
          userId: args.actorUserId,
          role: "CUSTOMER",
          isActive: true,
        },
      }))
    )
      return deny("You do not have permission to sign this request.");
    if (
      request.signerKind === "MEMBER" &&
      getSignerKindForTarget("MEMBER", member, args.now) === "GUARDIAN"
    )
      return deny(
        "A verified guardian must sign while this participant is a minor.",
      );
    const bindings = await signableFormBinding({
      db: tx,
      workspaceId: request.workspaceId,
      memberId: request.memberId,
      formVersionId: request.formVersionId,
      requirementRevisionId: request.requirementRevisionId,
      acceptanceCycleKey: request.acceptanceCycleKey,
      now: args.now,
    });
    const membershipIntent =
      member.status === "TRIAL" &&
      bindings.some((row) => row.requirementTarget === "MEMBER")
        ? await membershipEnrollmentSigningIntentTx(
            tx,
            request,
            args.actorUserId,
            args.now,
          )
        : false;
    const binding = bindings.find(
      (row) =>
        (isRequirementTargetApplicable({
          requirementTarget: row.requirementTarget,
          memberStatus: member.status,
          guardianCount: member.familyLinks.length,
        }) ||
          (row.requirementTarget === "MEMBER" && membershipIntent)) &&
        getSignerKindForTarget(
          row.requirementTarget,
          member,
          row.upcoming ? row.effectiveAt! : args.now,
        ) === request.signerKind,
    );
    if (!binding)
      return deny(
        "This requirement changed. Open its currently published acceptance cycle.",
      );
    const prior = await tx.signedDocument.findFirst({
      where: {
        workspaceId: request.workspaceId,
        memberId: request.memberId,
        formVersionId: request.formVersionId,
        signerKind: request.signerKind,
        acceptanceCycleKey: request.acceptanceCycleKey,
      },
      select: { id: true },
    });
    if (prior) return { status: "already_signed", signedDocumentId: prior.id };
    if (
      request.status !== "OPEN" ||
      (request.expiresAt && request.expiresAt <= args.now)
    )
      return deny("This signing request is no longer active.");
    const changed = await tx.signatureRequest.updateMany({
      where: { id: request.id, status: "OPEN" },
      data: { status: "COMPLETED", completedAt: args.now },
    });
    if (changed.count !== 1)
      return deny("This signing request changed. Refresh before trying again.");
    const signed = await tx.signedDocument.create({
      data: {
        workspaceId: request.workspaceId,
        formVersionId: request.formVersionId,
        requirementRevisionId: request.requirementRevisionId,
        acceptanceCycleKey: request.acceptanceCycleKey,
        validUntil: binding.consentValidUntil,
        memberId: request.memberId,
        guardianId: request.guardianId,
        signerKind: request.signerKind,
        signedFromRequestId: request.id,
        signerNameSnapshot: args.signerName.trim(),
        signerEmailSnapshot: args.signerEmail?.trim() || null,
        signatureMethod: "LOCAL_TYPED_NAME",
        ipAddress: args.ipAddress?.trim() || null,
        userAgent: args.userAgent?.trim() || null,
        signedAt: args.now,
      },
    });
    await tx.signatureRequest.updateMany({
      where: {
        workspaceId: request.workspaceId,
        memberId: request.memberId,
        formVersionId: request.formVersionId,
        signerKind: request.signerKind,
        acceptanceCycleKey: request.acceptanceCycleKey,
        status: "OPEN",
      },
      data: { status: "CANCELLED" },
    });
    // Consent does not silently waive the accepted booking's recovery choices.
    // The participant can explicitly retain it, or choose a remedy before class.
    return { status: "signed", signedDocumentId: signed.id };
  });
}
