import { createHash } from "node:crypto";
import { readDatabaseFailure,
  Prisma,
  prisma,
  readAcceptedMembershipTerms,
  readPunchCardTerms,
  sourceBillingCoversDate,
  membershipAllowanceWindows,
  resolveRequiredFormStatusesForMember,
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
    sourceEvidence,
    openings,
    formAssignments,
    formVersions,
    moneyEvidence,
    bookingFunding,
    sourceSignatures,
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
      include: {
        guardian: { select: { workspaceId: true } },
        user: {
          select: {
            id: true,
            workspaceUsers: {
              where: { workspaceId },
              select: { id: true, role: true, isActive: true },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    db.signedDocument.findMany({
      where: { workspaceId },
      select: {
        id: true,
        memberId: true,
        signedFromRequestId: true,
        createdAt: true,
        formVersionId: true,
        guardianId: true,
        signerKind: true,
        signedAt: true,
        signatureMethod: true,
        providerReference: true,
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
    db.sourceBillingEvidence.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    }),
    db.membershipAllowanceOpeningBalance.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    }),
    db.requiredFormAssignment.findMany({
      where: { workspaceId },
      include: { formDocument: true },
      orderBy: { id: "asc" },
    }),
    db.formVersion.findMany({
      where: { workspaceId },
      select: {
        id: true,
        formDocumentId: true,
        versionNumber: true,
        fileSha256: true,
      },
      orderBy: { id: "asc" },
    }),
    db.importedFinancialEvidence.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    }),
    db.importedBookingFunding.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    }),
    db.importedSignatureEvidence.findMany({
      where: { workspaceId },
      select: {
        id: true,
        sourceSystem: true,
        sourceExternalId: true,
        memberId: true,
        guardianId: true,
        formVersionId: true,
        signedDocumentId: true,
        sourceDocumentHash: true,
        signatureReceiptHash: true,
        sourceSignerReference: true,
        sourceBeneficiaryReference: true,
        signerAuthorityEvidence: true,
        sourceSignedAt: true,
        sourceFileHash: true,
        sourceRowHash: true,
      },
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
  const currentGrant = (g: (typeof grants)[number]) =>
    !g.revokedAt &&
    g.guardian.workspaceId === workspaceId &&
    g.user.workspaceUsers.some((a) => a.role === "CUSTOMER" && a.isActive);
  const totals: CutoverTotals = {
    members: members.length,
    currentMemberships: current.length,
    packUnits: packs
      .filter((p) => p.status !== "ARCHIVED")
      .reduce((sum, p) => sum + p.remainingPunches, 0),
    futureBookings: future.length,
    familyLinks: links.length,
    verifiedPortalGrants: grants.filter(currentGrant).length,
    allowanceReserved: activeAllocations.filter((a) => a.state === "RESERVED")
      .length,
    allowanceUsed:
      activeAllocations.filter((a) => a.state === "USED").length +
      openings
        .filter((o) => o.periodEnd > live)
        .reduce((sum, o) => sum + o.usedCount, 0),
    invoiceBalances: Object.fromEntries(Object.entries(invoiceBalances).sort()),
  };
  const problems: string[] = [];
  const liveDate = live.toISOString().slice(0, 10);
  for (const record of moneyEvidence) {
    if (
      record.billingOwner === "UNRESOLVED" ||
      record.refundOwner === "UNRESOLVED"
    )
      problems.push(
        `Resolve source billing/refund ownership for ${record.sourceRecordKind} ${record.sourceExternalId}.`,
      );
    const children = moneyEvidence.filter(
      (e) => e.parentEvidenceId === record.id,
    );
    if (
      record.sourceRecordKind === "INVOICE" &&
      children
        .filter((e) => e.sourceRecordKind === "PAYMENT")
        .reduce((sum, e) => sum + e.paidCents, 0) !== record.paidCents
    )
      problems.push(
        `Source invoice ${record.sourceExternalId} paid total needs its exact payment chain.`,
      );
    if (
      record.sourceRecordKind === "PAYMENT" &&
      children
        .filter((e) => e.sourceRecordKind === "REFUND")
        .reduce((sum, e) => sum + e.amountCents, 0) !== record.refundedCents
    )
      problems.push(
        `Source payment ${record.sourceExternalId} refunded total needs its exact receipt chain.`,
      );
    if (
      record.sourceRecordKind === "PAYMENT" &&
      bookingFunding
        .filter((f) => f.evidenceId === record.id)
        .reduce((sum, f) => sum + f.amountCents, 0) >
        record.paidCents - record.refundedCents
    )
      problems.push(
        `Source payment ${record.sourceExternalId} is overallocated to classes.`,
      );
  }
  if (
    formAssignments.some(
      (a) =>
        a.isActive &&
        !a.formDocument.archivedAt &&
        !a.formDocument.currentVersionId,
    )
  )
    problems.push(
      "A required form has no current document version. Publish the exact form before cutover.",
    );
  for (const contract of current) {
    const evidence = sourceEvidence.filter(
      (r) => r.memberMembershipId === contract.id,
    );
    if (
      contract.sourceBillingManaged &&
      !sourceBillingCoversDate(
        { ...contract, sourceBillingEvidence: evidence },
        liveDate,
      )
    )
      problems.push(
        `Membership ${contract.id} needs reviewed source payment evidence covering go-live.`,
      );
    const terms = readAcceptedMembershipTerms(contract.acceptedTerms);
    if (contract.importSnapshot && terms && contract.allowanceAnchorDate) {
      for (const window of membershipAllowanceWindows({
        anchorDate: contract.allowanceAnchorDate.toISOString().slice(0, 10),
        scheduledForDate: liveDate,
        ...terms,
      })) {
        if (
          !openings.some(
            (o) =>
              o.memberMembershipId === contract.id &&
              o.kind === window.kind &&
              o.periodStart.toISOString().slice(0, 10) === window.startsOn &&
              o.asOfDate.toISOString().slice(0, 10) === liveDate,
          )
        )
          problems.push(
            `Membership ${contract.id} needs explicit source opening usage (including zero) for ${window.kind} at go-live.`,
          );
      }
    }
  }
  for (const pack of packs) {
    const snapshot = pack.importSnapshot as {
      data?: { available?: number; reserved?: number };
    } | null;
    if (snapshot?.data) {
      const reserved = future.filter(
        (b) =>
          b.memberPunchCardId === pack.id &&
          b.status === "BOOKED" &&
          b.consumedPunchCount === 1,
      ).length;
      if (
        pack.remainingPunches !== snapshot.data.available ||
        reserved !== snapshot.data.reserved
      )
        problems.push(
          `Pack ${pack.id} source available and reserved balances need final reconciliation.`,
        );
    }
  }
  for (const booking of future) {
    if (booking.bookingType === "DROP_IN" && booking.importSnapshot) {
      const allocation = bookingFunding.find(
        (f) => f.bookingId === (booking.fundedByBookingId ?? booking.id),
      );
      const evidence = moneyEvidence.find(
        (e) => e.id === allocation?.evidenceId,
      );
      if (
        !allocation ||
        !evidence ||
        evidence.sourceStatus !== "SUCCEEDED" ||
        evidence.beneficiaryMemberId !== booking.memberId ||
        allocation.currency !== booking.dropInCurrency ||
        allocation.amountCents !== booking.dropInPriceCents
      )
        problems.push(
          `Booking ${booking.id} needs its exact reviewed source cash allocation.`,
        );
    }
    if (booking.bookingType === "MEMBERSHIP") {
      const contract = current.find(
        (m) =>
          m.id === booking.fundingMembershipId &&
          m.memberId === booking.memberId,
      );
      if (
        !contract ||
        !sourceBillingCoversDate(
          {
            ...contract,
            sourceBillingEvidence: sourceEvidence.filter(
              (r) => r.memberMembershipId === contract.id,
            ),
          },
          booking.scheduledForDate.toISOString().slice(0, 10),
        )
      )
        problems.push(
          `Booking ${booking.id} is outside verified contract funding.`,
        );
    }
    if (booking.memberPunchCardId) {
      const pack = packs.find(
        (p) =>
          p.id === booking.memberPunchCardId && p.memberId === booking.memberId,
      );
      if (
        !pack ||
        (pack.expiresOn && booking.scheduledForDate >= pack.expiresOn)
      )
        problems.push(
          `Booking ${booking.id} is outside its named pack's access dates.`,
        );
    }
  }
  const consent = [];
  for (const member of members.filter(
    (m) =>
      current.some((c) => c.memberId === m.id) ||
      future.some((b) => b.memberId === m.id),
  )) {
    const status = await resolveRequiredFormStatusesForMember({
      workspaceId,
      memberId: member.id,
      db: db as PrismaClient,
      now: live,
      ensureRequests: false,
    });
    consent.push({ memberId: member.id, items: status.items });
    if (status.items.some((item) => item.status !== "SIGNED"))
      problems.push(
        `Member ${member.id} needs current required-form signatures before cutover.`,
      );
  }

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
          currentGrant(g) &&
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
      sourceEvidence,
      openings,
      formAssignments,
      formVersions,
      consent,
      moneyEvidence,
      bookingFunding,
      sourceSignatures,
    }),
    totals,
    problems,
    currentMemberships: current,
    importedSourceCount: new Set(
      identities
        .filter(
          (i) =>
            i.recordKind !== "GUARDIAN" &&
            !(
              i.recordKind === "PUNCH_CARD_BALANCE" &&
              i.importedModel === "PunchCardProduct"
            ),
        )
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
    if (
      (owner.owner === "SOURCE" &&
        (!contract.sourceBillingManaged || contract.stripeSubscriptionId)) ||
      (owner.owner === "HITLINK" &&
        (contract.sourceBillingManaged || !contract.stripeSubscriptionId))
    )
      errors.push(
        `Membership ${contract.id} does not have verified billing consistent with its named billing owner.`,
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
        readDatabaseFailure(error)?.code !== "P2034" ||
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
