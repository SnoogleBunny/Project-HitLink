import type { Prisma, RequirementTarget } from "@prisma/client";
import {
  getSignerKindForTarget,
  isRequirementTargetApplicable,
} from "./forms.js";
import {
  listEffectiveFormAssignments,
  type EffectiveFormAssignment,
} from "./form-requirement-bindings.js";
import {
  requireActiveStaffAccessTx,
  type StaffAccessActor,
} from "./staff-access.js";

export type RequiredFormsMemberState =
  | "COMPLETE"
  | "ACTION_REQUIRED"
  | "EXPIRED";
export interface RequiredFormsMemberSummary {
  state: RequiredFormsMemberState;
  requiredCount: number;
  missingCount: number;
  expiredCount: number;
  nextExpiryAt: Date | null;
  upcomingCount: number;
}
type Scope = {
  db: Prisma.TransactionClient;
  actor: StaffAccessActor;
  now?: Date;
  targets?: RequirementTarget[];
};
const and = (
  ...conditions: Prisma.MemberWhereInput[]
): Prisma.MemberWhereInput => ({ AND: conditions });
function applicable(
  target: RequirementTarget,
  workspaceId: string,
): Prisma.MemberWhereInput {
  if (target === "TRIAL") return { status: "TRIAL" };
  if (target === "MEMBER") return { status: { not: "TRIAL" } };
  if (target === "GUARDIAN") return { familyLinks: { some: { workspaceId } } };
  return {};
}
function guardianRequired(
  workspaceId: string,
  at: Date,
): Prisma.MemberWhereInput {
  // Mirrors getSignerKindForTarget's UTC eighteenth birthday, including leap days.
  const adultBirthCutoff = new Date(at);
  adultBirthCutoff.setUTCFullYear(adultBirthCutoff.getUTCFullYear() - 18);
  return {
    OR: [
      { dateOfBirth: { not: null, gt: adultBirthCutoff } },
      {
        dateOfBirth: null,
        userId: null,
        familyLinks: { some: { workspaceId } },
      },
    ],
  };
}
function missingBinding(
  binding: EffectiveFormAssignment,
  workspaceId: string,
  now: Date,
): Prisma.MemberWhereInput {
  const applies = applicable(binding.requirementTarget, workspaceId);
  if (binding.consentValidUntil && binding.consentValidUntil <= now)
    return applies;
  const proof = (
    signerKind: "GUARDIAN" | "MEMBER",
  ): Prisma.MemberWhereInput => ({
    NOT: {
      signedDocuments: {
        some: {
          workspaceId,
          formVersionId: binding.formDocument.currentVersionId,
          requirementRevisionId: binding.requirementRevisionId,
          acceptanceCycleKey: binding.acceptanceCycleKey,
          signerKind,
          signedAt: {
            lte: now,
            ...(binding.publishedAt ? { gte: binding.publishedAt } : {}),
          },
          validUntil: binding.consentValidUntil,
        },
      },
    },
  });
  if (binding.requirementTarget === "GUARDIAN")
    return and(applies, proof("GUARDIAN"));
  const minor = guardianRequired(workspaceId, now);
  return and(applies, {
    OR: [and(minor, proof("GUARDIAN")), and({ NOT: minor }, proof("MEMBER"))],
  });
}
/** Compose this predicate into BOTH count and findMany before cursor pagination.
 * Read-only: never creates a signature request or touches recipient/contact data. */
export async function buildRequiredFormsMemberFilterTx(
  args: Scope & { state: RequiredFormsMemberState },
): Promise<Prisma.MemberWhereInput> {
  await requireActiveStaffAccessTx(args.db, {
    ...args.actor,
    capability: "OPERATIONS",
  });
  const now = args.now ?? new Date();
  const bindings = await listEffectiveFormAssignments({
    db: args.db,
    workspaceId: args.actor.workspaceId,
    now,
    targets: args.targets,
  });
  const predicates = bindings
    .filter(
      (binding) =>
        args.state !== "EXPIRED" ||
        (!!binding.consentValidUntil && binding.consentValidUntil <= now),
    )
    .map((binding) =>
      args.state === "EXPIRED"
        ? applicable(binding.requirementTarget, args.actor.workspaceId)
        : missingBinding(binding, args.actor.workspaceId, now),
    );
  const anyMissing: Prisma.MemberWhereInput = predicates.length
    ? { OR: predicates }
    : { id: { in: [] } };
  return and(
    { workspaceId: args.actor.workspaceId },
    args.state === "COMPLETE" ? { NOT: anyMissing } : anyMissing,
  );
}
/** Bounded page summary: one binding read, one member read and one proof read,
 * independent of page size. Only aggregate operational state leaves the module. */
export async function summarizeRequiredFormsForMembersTx(
  args: Scope & { memberIds: string[]; includeUpcoming?: boolean },
): Promise<Map<string, RequiredFormsMemberSummary>> {
  await requireActiveStaffAccessTx(args.db, {
    ...args.actor,
    capability: "OPERATIONS",
  });
  const memberIds = [...new Set(args.memberIds)];
  if (memberIds.length > 500 || memberIds.some((id) => !id || id.length > 200))
    throw new Error("Forms summary accepts at most 500 scoped member IDs.");
  const result = new Map<string, RequiredFormsMemberSummary>();
  if (!memberIds.length) return result;
  const now = args.now ?? new Date(),
    workspaceId = args.actor.workspaceId;
  const bindings = await listEffectiveFormAssignments({
    db: args.db,
    workspaceId,
    now,
    targets: args.targets,
    includeUpcoming: args.includeUpcoming,
  });
  const members = await args.db.member.findMany({
    where: { workspaceId, id: { in: memberIds } },
    select: {
      id: true,
      workspaceId: true,
      fullName: true,
      email: true,
      userId: true,
      status: true,
      dateOfBirth: true,
      familyLinks: {
        select: {
          guardian: { select: { id: true, fullName: true, email: true } },
        },
      },
    },
  });
  const proofs = await args.db.signedDocument.findMany({
    where: {
      workspaceId,
      memberId: { in: members.map((member) => member.id) },
      formVersionId: {
        in: [
          ...new Set(
            bindings.map((binding) => binding.formDocument.currentVersionId),
          ),
        ],
      },
      signedAt: { lte: now },
    },
    select: {
      memberId: true,
      formVersionId: true,
      requirementRevisionId: true,
      acceptanceCycleKey: true,
      signerKind: true,
      signedAt: true,
      validUntil: true,
    },
  });
  const byMember = new Map<string, typeof proofs>();
  for (const proof of proofs) {
    const rows = byMember.get(proof.memberId) ?? [];
    rows.push(proof);
    byMember.set(proof.memberId, rows);
  }
  for (const member of members) {
    const summary: RequiredFormsMemberSummary = {
      state: "COMPLETE",
      requiredCount: 0,
      missingCount: 0,
      expiredCount: 0,
      nextExpiryAt: null,
      upcomingCount: 0,
    };
    const seen = new Set<string>();
    for (const binding of bindings) {
      if (
        !isRequirementTargetApplicable({
          requirementTarget: binding.requirementTarget,
          memberStatus: member.status,
          guardianCount: member.familyLinks.length,
        })
      )
        continue;
      const at = binding.upcoming ? binding.effectiveAt! : now;
      const signerKind = getSignerKindForTarget(
        binding.requirementTarget,
        member,
        at,
      );
      const key = `${binding.formDocument.id}:${binding.acceptanceCycleKey}:${signerKind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (binding.upcoming) {
        summary.upcomingCount++;
        continue;
      }
      summary.requiredCount++;
      const expired =
        !!binding.consentValidUntil && binding.consentValidUntil <= now;
      const proof = (byMember.get(member.id) ?? []).some(
        (row) =>
          row.formVersionId === binding.formDocument.currentVersionId &&
          row.requirementRevisionId === binding.requirementRevisionId &&
          row.acceptanceCycleKey === binding.acceptanceCycleKey &&
          row.signerKind === signerKind &&
          (!binding.publishedAt || row.signedAt >= binding.publishedAt) &&
          (row.validUntil?.getTime() ?? null) ===
            (binding.consentValidUntil?.getTime() ?? null),
      );
      if (expired) summary.expiredCount++;
      if (expired || !proof) summary.missingCount++;
      if (
        !expired &&
        proof &&
        binding.consentValidUntil &&
        (!summary.nextExpiryAt ||
          binding.consentValidUntil < summary.nextExpiryAt)
      )
        summary.nextExpiryAt = binding.consentValidUntil;
    }
    summary.state = summary.expiredCount
      ? "EXPIRED"
      : summary.missingCount
        ? "ACTION_REQUIRED"
        : "COMPLETE";
    result.set(member.id, summary);
  }
  return result;
}
