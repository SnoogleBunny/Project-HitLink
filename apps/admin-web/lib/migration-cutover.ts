import { createHash } from "node:crypto";
import {
  Prisma,
  prisma,
  readAcceptedMembershipTerms,
  readPunchCardTerms,
  type PrismaClient,
} from "@flowstate/db";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export interface CutoverTotals {
  members: number;
  currentMemberships: number;
  packUnits: number;
  futureBookings: number;
  familyLinks: number;
  verifiedPortalGrants: number;
  allowanceReserved: number;
  allowanceUsed: number;
  invoiceBalances: Record<string, number>;
}
export interface CutoverEvidence {
  version: 1;
  sourceTotals: CutoverTotals;
  sourceReferences: {
    people: string;
    contracts: string;
    money: string;
    units: string;
    futureBookings: string;
    familyAuthority: string;
    consent: string;
  };
  recordDisposition: {
    sourceCount: number;
    importedCount: number;
    excluded: Array<{
      sourceId: string;
      reason: string;
      nonessential: boolean;
    }>;
    quarantinedCount: number;
  };
  billingOwners: Array<{
    membershipId: string;
    nextBillingDate: string;
    owner: "SOURCE" | "HITLINK";
    sourceStopOrTransferEvidence: string;
    payerAuthorizationEvidence: string;
  }>;
  backupReference: string;
  restoreRehearsalReference: string;
  finalDeltaReference: string;
  supportContact: string;
}
export async function captureCutoverState(
  db: Prisma.TransactionClient | PrismaClient,
  workspaceId: string,
) {
  const [
    migration,
    jobs,
    members,
    memberships,
    packs,
    bookings,
    links,
    grants,
    signatures,
    invoices,
    allocations,
    entries,
    identities,
  ] = await Promise.all([
    db.workspaceMigration.findUnique({
      where: { workspaceId },
      select: { goLiveScheduledFor: true },
    }),
    db.importJob.findMany({
      where: { workspaceId },
      include: {
        sourceFiles: { select: { id: true, fileSha256: true } },
        stagingRecords: {
          select: {
            id: true,
            recordKind: true,
            externalId: true,
            isReadyForImport: true,
            importedAt: true,
            importedRecordId: true,
          },
        },
        reconciliationReports: true,
        validationIssues: true,
      },
      orderBy: { id: "asc" },
    }),
    db.member.findMany({
      where: { workspaceId },
      select: { id: true, status: true, dateOfBirth: true, userId: true },
      orderBy: { id: "asc" },
    }),
    db.memberMembership.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    }),
    db.memberPunchCard.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    }),
    db.classBooking.findMany({
      where: { workspaceId, status: { in: ["BOOKED", "PENDING_PAYMENT"] } },
      orderBy: { id: "asc" },
    }),
    db.familyLink.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
    db.memberPortalGrant.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    }),
    db.signedDocument.findMany({
      where: { workspaceId },
      select: {
        id: true,
        memberId: true,
        signedFromRequestId: true,
        createdAt: true,
      },
      orderBy: { id: "asc" },
    }),
    db.invoice.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
    db.membershipAllowanceAllocation.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    }),
    db.punchCardEntry.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    }),
    db.migrationImportedRecord.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    }),
  ]);
  const current = memberships.filter(
    (m) =>
      m.currentMembershipSlot === "CURRENT" &&
      !["CANCELLED", "ENDED"].includes(m.status),
  );
  const live = migration?.goLiveScheduledFor ?? new Date();
  const future = bookings.filter((b) => b.scheduledForDate >= live);
  const invoiceBalances: Record<string, number> = {};
  for (const invoice of invoices)
    if (!["PAID", "VOID"].includes(invoice.status))
      invoiceBalances[invoice.currency] =
        (invoiceBalances[invoice.currency] ?? 0) +
        Math.max(0, invoice.totalCents - invoice.amountPaidCents);
  const activeAllocations = allocations.filter((a) => a.periodEnd > live);
  const totals: CutoverTotals = {
    members: members.length,
    currentMemberships: current.length,
    packUnits: packs
      .filter((p) => p.status !== "ARCHIVED")
      .reduce((sum, p) => sum + p.remainingPunches, 0),
    futureBookings: future.length,
    familyLinks: links.length,
    verifiedPortalGrants: grants.filter((g) => !g.revokedAt).length,
    allowanceReserved: activeAllocations.filter((a) => a.state === "RESERVED")
      .length,
    allowanceUsed: activeAllocations.filter((a) => a.state === "USED").length,
    invoiceBalances: Object.fromEntries(Object.entries(invoiceBalances).sort()),
  };
  const problems: string[] = [];
  if (
    current.some(
      (m) =>
        !readAcceptedMembershipTerms(m.acceptedTerms) ||
        !m.allowanceAnchorDate ||
        !m.allowanceTimezone ||
        !m.nextBillingDate,
    )
  )
    problems.push(
      "Imported memberships need verified accepted terms, original allowance anchors/timezones, and billing boundaries.",
    );
  if (
    packs.some(
      (p) =>
        p.status !== "ARCHIVED" &&
        (!readPunchCardTerms(p.acceptedTerms) ||
          !entries.some((e) => e.memberPunchCardId === p.id)),
    )
  )
    problems.push(
      "Imported class packs need accepted terms and an opening unit ledger.",
    );
  if (future.some((b) => b.status === "PENDING_PAYMENT"))
    problems.push("Resolve pending future booking payments before cutover.");
  for (const member of members) {
    if (
      member.dateOfBirth &&
      new Date(
        Date.UTC(
          member.dateOfBirth.getUTCFullYear() + 18,
          member.dateOfBirth.getUTCMonth(),
          member.dateOfBirth.getUTCDate(),
        ),
      ) > live &&
      !grants.some(
        (g) =>
          g.memberId === member.id &&
          !g.revokedAt &&
          g.canBook &&
          g.canSign &&
          links.some(
            (l) =>
              l.guardianId === g.guardianId && l.childMemberId === member.id,
          ),
      )
    )
      problems.push(
        `Verify guardian booking and signing authority for member ${member.id}.`,
      );
  }
  return {
    fingerprint: digest({
      migration,
      jobs,
      members,
      memberships,
      packs,
      bookings,
      links,
      grants,
      signatures,
      invoices,
      allocations,
      entries,
      identities,
    }),
    totals,
    problems,
    currentMemberships: current,
    importedSourceCount: new Set(
      identities
        .filter((i) => i.recordKind !== "GUARDIAN")
        .map((i) => `${i.recordKind}:${i.externalId}`),
    ).size,
  };
}
export function validateCutoverEvidence(
  value: unknown,
  state: Awaited<ReturnType<typeof captureCutoverState>>,
) {
  const errors = [...state.problems],
    e = value as CutoverEvidence;
  if (
    !e ||
    e.version !== 1 ||
    !e.sourceTotals ||
    !e.sourceReferences ||
    !e.recordDisposition ||
    !Array.isArray(e.billingOwners)
  )
    return [
      "Provide the structured source reconciliation and billing ownership evidence.",
    ];
  for (const key of [
    "members",
    "currentMemberships",
    "packUnits",
    "futureBookings",
    "familyLinks",
    "verifiedPortalGrants",
    "allowanceReserved",
    "allowanceUsed",
  ] as const)
    if (
      !Number.isSafeInteger(e.sourceTotals[key]) ||
      e.sourceTotals[key] !== state.totals[key]
    )
      errors.push(`${key}: source and destination totals must match exactly.`);
  const money = (input: Record<string, number>) =>
    JSON.stringify(Object.entries(input ?? {}).sort());
  if (
    money(e.sourceTotals.invoiceBalances) !==
    money(state.totals.invoiceBalances)
  )
    errors.push("Invoice balances must match exactly in every currency.");
  for (const key of [
    "people",
    "contracts",
    "money",
    "units",
    "futureBookings",
    "familyAuthority",
    "consent",
  ] as const)
    if (
      typeof e.sourceReferences[key] !== "string" ||
      !e.sourceReferences[key].trim()
    )
      errors.push(
        `Record the ${key} source evidence reference, including an explicit none when not applicable.`,
      );
  const disposition = e.recordDisposition;
  if (
    !Array.isArray(disposition.excluded) ||
    disposition.excluded.some(
      (row) =>
        !row.sourceId?.trim() ||
        !row.reason?.trim() ||
        row.nonessential !== true,
    ) ||
    disposition.quarantinedCount !== 0 ||
    disposition.importedCount !== state.importedSourceCount ||
    !Number.isSafeInteger(disposition.sourceCount) ||
    disposition.sourceCount !==
      disposition.importedCount + disposition.excluded.length
  )
    errors.push(
      "Account for every source record. Critical quarantines cannot be excluded from activation.",
    );
  for (const contract of state.currentMemberships) {
    const owners = e.billingOwners.filter(
      (row) => row.membershipId === contract.id,
    );
    if (owners.length !== 1) {
      errors.push(
        `Assign exactly one billing owner for membership ${contract.id}.`,
      );
      continue;
    }
    const owner = owners[0]!;
    if (
      owner.nextBillingDate !== contract.nextBillingDate?.toISOString() ||
      !["SOURCE", "HITLINK"].includes(owner.owner) ||
      !owner.payerAuthorizationEvidence?.trim()
    )
      errors.push(
        `Verify the exact renewal boundary and payer authority for ${contract.id}.`,
      );
    if (
      owner.owner === "HITLINK" &&
      !owner.sourceStopOrTransferEvidence?.trim()
    )
      errors.push(
        `Verify source stop or transfer for ${contract.id} before HitLink charges.`,
      );
    if (owner.owner === "SOURCE" && contract.stripeSubscriptionId)
      errors.push(
        `Membership ${contract.id} has a destination subscription but names the source as billing owner.`,
      );
  }
  if (e.billingOwners.length !== state.currentMemberships.length)
    errors.push(
      "Billing ownership evidence must match the current membership set.",
    );
  for (const key of [
    "backupReference",
    "restoreRehearsalReference",
    "finalDeltaReference",
    "supportContact",
  ] as const)
    if (typeof e[key] !== "string" || !e[key].trim())
      errors.push(`Record ${key} before cutover.`);
  return [...new Set(errors)];
}
export async function recordMigrationCutoverEvidence(args: {
  workspaceId: string;
  actor: { type: string; actorId: string };
  evidence: CutoverEvidence;
  db?: PrismaClient;
}) {
  if (args.actor.type !== "FLOWSTATE_OPERATOR" || !args.actor.actorId.trim())
    throw new Error(
      "Only an authorized migration operator can record cutover evidence.",
    );
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await (args.db ?? prisma).$transaction(
        async (db) => {
          const migration = await db.workspaceMigration.findUnique({
            where: { workspaceId: args.workspaceId },
          });
          if (
            !migration ||
            migration.ownerReviewAcknowledgedAt ||
            migration.stage === "COMPLETE"
          )
            throw new Error(
              "Cutover evidence is locked after owner acknowledgment.",
            );
          const state = await captureCutoverState(db, args.workspaceId),
            errors = validateCutoverEvidence(args.evidence, state);
          if (errors.length) throw new Error(errors.join(" "));
          return db.migrationCutoverSnapshot.create({
            data: {
              workspaceId: args.workspaceId,
              actorOperatorId: args.actor.actorId.trim(),
              sourceFingerprint: state.fingerprint,
              evidence: args.evidence as unknown as Prisma.InputJsonValue,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        !(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2034"
        ) ||
        attempt === 6
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(250, 15 * 2 ** attempt) + Math.floor(Math.random() * 20),
        ),
      );
    }
  }
  throw new Error("Cutover snapshot retry exhausted.");
}
export async function inspectMigrationCutoverSnapshot(
  db: Prisma.TransactionClient | PrismaClient,
  workspaceId: string,
  snapshotId?: string | null,
) {
  const snapshot = await db.migrationCutoverSnapshot.findFirst({
    where: { workspaceId, ...(snapshotId ? { id: snapshotId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (!snapshot)
    return {
      snapshot: null,
      errors: [
        "An operator must record the final cutover reconciliation before owner review.",
      ],
    };
  const state = await captureCutoverState(db, workspaceId);
  return {
    snapshot,
    errors: [
      ...(state.fingerprint !== snapshot.sourceFingerprint
        ? [
            "Migration evidence changed after the reviewed snapshot. Reconcile and review a new snapshot.",
          ]
        : []),
      ...validateCutoverEvidence(snapshot.evidence, state),
    ],
  };
}
