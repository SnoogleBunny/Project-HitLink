import { createHash } from "node:crypto";
import {
  createImportedClassBookingTx,
  dateOnlyStringToUtcDate,
  getZonedDateTimeAsUtc,
  membershipAllowanceWindows,
  readAcceptedMembershipTerms,
  readPunchCardTerms,
  type ImportRecordKind,
  type Prisma,
  type StagingRecord,
} from "@flowstate/db";
import {
  buildEntitlementStagedRow,
  MigrationEntitlementError,
} from "./migration-entitlement-parser";

function fail(message: string): never {
  throw new MigrationEntitlementError(message);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonical(v)]),
    );
  return value;
}
export const importPayloadHash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
type Args = {
  db: Prisma.TransactionClient;
  workspaceId: string;
  importJobId: string;
  actorId: string;
  stagingRecord: StagingRecord;
  now?: Date;
};
type Data = Record<string, Prisma.JsonValue>;
function text(data: Data, key: string): string {
  const value = data[key];
  if (typeof value !== "string") fail(`Missing source ${key}.`);
  return value;
}
async function identity(
  args: Args,
  kind: ImportRecordKind,
  externalId: string,
) {
  return args.db.migrationImportedRecord.findUnique({
    where: {
      workspaceId_recordKind_externalId: {
        workspaceId: args.workspaceId,
        recordKind: kind,
        externalId,
      },
    },
  });
}
async function linkedId(
  args: Args,
  kind: ImportRecordKind,
  externalId: string,
  model: string,
) {
  const link = await identity(args, kind, externalId);
  if (!link || link.importedModel !== model)
    fail(`Import and reconcile ${kind} source identity ${externalId} first.`);
  return link.importedRecordId;
}
async function mark(args: Args, externalId: string, model: string, id: string) {
  const key = {
    workspaceId: args.workspaceId,
    recordKind: args.stagingRecord.recordKind,
    externalId,
  };
  const prior = await identity(args, key.recordKind, externalId);
  if (!prior)
    await args.db.migrationImportedRecord.create({
      data: {
        ...key,
        importJobId: args.importJobId,
        stagingRecordId: args.stagingRecord.id,
        importedModel: model,
        importedRecordId: id,
      },
    });
  await args.db.stagingRecord.update({
    where: { id: args.stagingRecord.id },
    data: {
      importedAt: args.now ?? new Date(),
      importedModel: model,
      importedRecordId: id,
    },
  });
}
function sameSnapshot(snapshot: unknown, hash: string) {
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    !("sourceRowHash" in snapshot) ||
    snapshot.sourceRowHash !== hash
  )
    fail(
      "This source identity already has different imported details. Review the correction without replacing live terms or balances.",
    );
}
async function checkPrograms(args: Args, terms: Prisma.JsonObject) {
  const ids = terms.programIds as string[];
  if (
    (await args.db.program.count({
      where: { workspaceId: args.workspaceId, id: { in: ids } },
    })) !== ids.length
  )
    fail("Every accepted program must map to this workspace.");
}

/** Invoked by the operator-only migration transaction while its workspace schedule lock is held. */
export async function importEntitlement(
  args: Args,
): Promise<"created" | "updated" | "skipped"> {
  const kind = args.stagingRecord.recordKind;
  if (
    ![
      "MEMBER_MEMBERSHIP",
      "PUNCH_CARD_BALANCE",
      "ALLOWANCE_USAGE",
      "FUTURE_BOOKING",
    ].includes(kind)
  )
    fail("Unsupported entitlement import kind.");
  const raw = args.stagingRecord.rawData;
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    Object.values(raw).some((v) => typeof v !== "string")
  )
    fail("Preserve the original source row for review.");
  const parsed = buildEntitlementStagedRow(
    kind as Parameters<typeof buildEntitlementStagedRow>[0],
    raw as Record<string, string>,
  );
  if (parsed.issues.length) fail(parsed.issues[0]!.message);
  if (
    importPayloadHash(parsed.mappedData) !==
    importPayloadHash(args.stagingRecord.mappedData)
  )
    fail("The staged mapping changed. Validate the source row again.");
  const data = parsed.mappedData as Data,
    externalId = parsed.externalId!,
    sourceRowHash = importPayloadHash(data);
  const sourceFile = await args.db.importSourceFile.findFirst({
    where: {
      id: args.stagingRecord.importSourceFileId ?? "",
      workspaceId: args.workspaceId,
      importJobId: args.importJobId,
    },
  });
  if (!sourceFile?.fileSha256) fail("The source file checksum is required.");
  const proof = {
    sourceFileHash: sourceFile.fileSha256,
    sourceRowHash,
    importJobId: args.importJobId,
    stagingRecordId: args.stagingRecord.id,
    actorId: args.actorId,
  };
  const snapshot = {
    version: 1,
    sourceRowHash,
    data,
  } as Prisma.InputJsonObject;
  const workspace = await args.db.workspace.findUnique({
    where: { id: args.workspaceId },
    include: { location: true, migration: true },
  });
  if (
    !workspace ||
    workspace.status === "ACTIVE" ||
    !workspace.migration ||
    workspace.migration.ownerReviewAcknowledgedAt ||
    workspace.migration.stage === "COMPLETE"
  )
    fail(
      "Entitlements can only be imported in the staged migration workspace.",
    );
  const timezone = workspace.location?.timezone ?? "UTC";
  const instant = (dateString: string, zone = timezone) =>
    getZonedDateTimeAsUtc({ dateString, minutes: 0, timezone: zone });
  if (kind === "MEMBER_MEMBERSHIP") {
    const prior = await identity(args, kind, externalId);
    if (prior) {
      const old = await args.db.memberMembership.findFirst({
        where: { id: prior.importedRecordId, workspaceId: args.workspaceId },
      });
      sameSnapshot(old?.importSnapshot, sourceRowHash);
      await mark(args, externalId, "MemberMembership", old!.id);
      return "skipped";
    }
    const memberId = await linkedId(
      args,
      "MEMBER",
      text(data, "memberExternalId"),
      "Member",
    );
    const planId = await linkedId(
      args,
      "MEMBERSHIP_PLAN",
      text(data, "planExternalId"),
      "MembershipPlan",
    );
    if (
      !(await args.db.member.findFirst({
        where: { id: memberId, workspaceId: args.workspaceId },
      })) ||
      !(await args.db.membershipPlan.findFirst({
        where: { id: planId, workspaceId: args.workspaceId },
      }))
    )
      fail("The member and plan must belong to this workspace.");
    if (
      await args.db.memberMembership.findFirst({
        where: {
          workspaceId: args.workspaceId,
          memberId,
          currentMembershipSlot: "CURRENT",
        },
      })
    )
      fail(
        "This member already has a current contract. Do not replace it with another source identity.",
      );
    const terms = data.acceptedTerms as Prisma.JsonObject;
    await checkPrograms(args, terms);
    const zone = text(data, "allowanceTimezone");
    const membership = await args.db.memberMembership.create({
      data: {
        workspaceId: args.workspaceId,
        memberId,
        membershipPlanId: planId,
        status: "ACTIVE",
        startedAt: instant(text(data, "startedOn"), zone),
        nextBillingDate: instant(text(data, "nextBillingDate"), zone),
        allowanceAnchorDate: dateOnlyStringToUtcDate(
          text(data, "allowanceAnchorDate"),
        ),
        allowanceTimezone: zone,
        acceptedTerms: terms,
        sourceBillingManaged: true,
        importSnapshot: snapshot,
      },
    });
    await args.db.sourceBillingEvidence.create({
      data: {
        workspaceId: args.workspaceId,
        memberMembershipId: membership.id,
        sourceSystem: text(data, "sourceSystem"),
        sourceAccountReference: text(data, "sourceAccountReference"),
        sourceContractReference: text(data, "sourceContractReference"),
        paidFrom: dateOnlyStringToUtcDate(text(data, "paidFrom")),
        paidThrough: dateOnlyStringToUtcDate(text(data, "paidThrough")),
        nextRenewalOn: dateOnlyStringToUtcDate(text(data, "nextBillingDate")),
        sourceEvidence: text(data, "sourceEvidence"),
        acceptanceEvidence: text(data, "acceptanceEvidence"),
        payerAuthorityEvidence: text(data, "payerAuthorityEvidence"),
        operationKey: `import-contract:${externalId}`,
        ...proof,
      },
    });
    await mark(args, externalId, "MemberMembership", membership.id);
    return "created";
  }
  if (kind === "PUNCH_CARD_BALANCE") {
    const balanceKey = `balance:${externalId}`,
      prior = await identity(args, kind, balanceKey);
    if (prior) {
      const old = await args.db.memberPunchCard.findFirst({
        where: { id: prior.importedRecordId, workspaceId: args.workspaceId },
      });
      sameSnapshot(old?.importSnapshot, sourceRowHash);
      await mark(args, balanceKey, "MemberPunchCard", old!.id);
      return "skipped";
    }
    const memberId = await linkedId(
      args,
      "MEMBER",
      text(data, "memberExternalId"),
      "Member",
    );
    if (
      !(await args.db.member.findFirst({
        where: { id: memberId, workspaceId: args.workspaceId },
      }))
    )
      fail("The pack participant must belong to this workspace.");
    const terms = readPunchCardTerms(data.acceptedTerms);
    if (!terms) fail("Source pack terms are incomplete.");
    await checkPrograms(args, data.acceptedTerms as Prisma.JsonObject);
    const productKey = `product:${text(data, "productExternalId")}`,
      productLink = await identity(args, kind, productKey);
    let productId = productLink?.importedRecordId;
    if (
      productId &&
      !(await args.db.punchCardProduct.findFirst({
        where: { id: productId, workspaceId: args.workspaceId },
      }))
    )
      fail("The source pack product mapping is outside this workspace.");
    if (!productId) {
      const product = await args.db.punchCardProduct.create({
        data: {
          workspaceId: args.workspaceId,
          name: text(data, "productName"),
          punchesIncluded: terms.originalPunches,
          priceCents: terms.priceCents,
          currency: terms.currency,
          restrictionMode: terms.restrictionMode,
          isEnabled: false,
          programRestrictions: {
            create: terms.programIds.map((programId) => ({
              workspaceId: args.workspaceId,
              programId,
            })),
          },
        },
      });
      productId = product.id;
      await args.db.migrationImportedRecord.create({
        data: {
          workspaceId: args.workspaceId,
          recordKind: kind,
          externalId: productKey,
          importedModel: "PunchCardProduct",
          importedRecordId: productId,
          importJobId: args.importJobId,
          stagingRecordId: args.stagingRecord.id,
        },
      });
    }
    const opening = (data.available as number) + (data.reserved as number);
    const card = await args.db.memberPunchCard.create({
      data: {
        workspaceId: args.workspaceId,
        memberId,
        punchCardProductId: productId,
        originalPunches: terms.originalPunches,
        remainingPunches: opening,
        status: opening ? "ACTIVE" : "DEPLETED",
        purchasePriceCents: terms.priceCents,
        purchaseCurrency: terms.currency,
        purchasedAt: instant(text(data, "purchasedOn")),
        expiresOn: data.expiresOn
          ? dateOnlyStringToUtcDate(text(data, "expiresOn"))
          : null,
        acceptedTerms: data.acceptedTerms as Prisma.InputJsonObject,
        importSnapshot: snapshot,
      },
    });
    await args.db.punchCardEntry.create({
      data: {
        workspaceId: args.workspaceId,
        memberId,
        memberPunchCardId: card.id,
        operationKey: `opening:${card.id}`,
        delta: opening,
        reason: `Imported source available ${data.available} plus reserved ${data.reserved}; ${text(data, "sourceEvidence")}`,
      },
    });
    await mark(args, balanceKey, "MemberPunchCard", card.id);
    return "created";
  }
  if (kind === "ALLOWANCE_USAGE") {
    const prior = await identity(args, kind, externalId);
    if (prior) {
      const old = await args.db.membershipAllowanceOpeningBalance.findFirst({
        where: { id: prior.importedRecordId, workspaceId: args.workspaceId },
      });
      if (old?.sourceRowHash !== sourceRowHash)
        fail(
          "This opening usage already has different source details. Review a correction without resetting live usage.",
        );
      await mark(args, externalId, "MembershipAllowanceOpeningBalance", old.id);
      return "skipped";
    }
    const membershipId = await linkedId(
      args,
      "MEMBER_MEMBERSHIP",
      text(data, "membershipExternalId"),
      "MemberMembership",
    );
    const membership = await args.db.memberMembership.findFirst({
        where: { id: membershipId, workspaceId: args.workspaceId },
      }),
      terms = readAcceptedMembershipTerms(membership?.acceptedTerms);
    if (!membership?.allowanceAnchorDate || !terms)
      fail("Import exact contract terms and allowance anchor before usage.");
    const windows = membershipAllowanceWindows({
      anchorDate: membership.allowanceAnchorDate.toISOString().slice(0, 10),
      scheduledForDate: text(data, "asOfDate"),
      ...terms,
    });
    const window = windows.find(
      (w) =>
        w.kind === data.kind &&
        w.startsOn === data.periodStart &&
        w.endsOn === data.periodEnd,
    );
    if (!window || (data.usedCount as number) > window.limit)
      fail(
        "Opening usage must match an accepted billing-anchored window and its class limit.",
      );
    if (
      await args.db.membershipAllowanceAllocation.count({
        where: {
          memberMembershipId: membershipId,
          kind: window.kind,
          periodStart: dateOnlyStringToUtcDate(window.startsOn),
        },
      })
    )
      fail(
        "Import opening usage before reservations in this allowance window.",
      );
    const opening = await args.db.membershipAllowanceOpeningBalance.create({
      data: {
        workspaceId: args.workspaceId,
        memberMembershipId: membershipId,
        kind: window.kind,
        periodStart: dateOnlyStringToUtcDate(window.startsOn),
        periodEnd: dateOnlyStringToUtcDate(window.endsOn),
        asOfDate: dateOnlyStringToUtcDate(text(data, "asOfDate")),
        usedCount: data.usedCount as number,
        sourceExternalId: externalId,
        sourceEvidence: text(data, "sourceEvidence"),
        ...proof,
      },
    });
    await mark(
      args,
      externalId,
      "MembershipAllowanceOpeningBalance",
      opening.id,
    );
    return "created";
  }
  const prior = await identity(args, kind, externalId);
  if (prior) {
    const old = await args.db.classBooking.findFirst({
      where: { id: prior.importedRecordId, workspaceId: args.workspaceId },
    });
    sameSnapshot(old?.importSnapshot, sourceRowHash);
    await mark(args, externalId, "ClassBooking", old!.id);
    return "skipped";
  }
  const memberId = await linkedId(
      args,
      "MEMBER",
      text(data, "memberExternalId"),
      "Member",
    ),
    classTemplateId = await linkedId(
      args,
      "SCHEDULE_TEMPLATE",
      text(data, "templateExternalId"),
      "ClassTemplate",
    );
  const member = await args.db.member.findFirst({
    where: { id: memberId, workspaceId: args.workspaceId },
  });
  if (!member) fail("The booking participant must belong to this workspace.");
  let guardianId: string | undefined;
  if (data.guardianExternalId)
    guardianId = await linkedId(
      args,
      "GUARDIAN",
      text(data, "guardianExternalId"),
      "Guardian",
    );
  const now = args.now ?? new Date(),
    adultOn = member.dateOfBirth
      ? new Date(
          Date.UTC(
            member.dateOfBirth.getUTCFullYear() + 18,
            member.dateOfBirth.getUTCMonth(),
            member.dateOfBirth.getUTCDate(),
          ),
        )
      : null;
  if (
    guardianId ||
    (adultOn && adultOn > now) ||
    (!member.userId &&
      (await args.db.familyLink.count({
        where: { workspaceId: args.workspaceId, childMemberId: memberId },
      })))
  ) {
    const grant = guardianId
      ? await args.db.memberPortalGrant.findFirst({
          where: {
            workspaceId: args.workspaceId,
            memberId,
            guardianId,
            revokedAt: null,
            canBook: true,
            canSign: true,
            user: {
              workspaceUsers: {
                some: {
                  workspaceId: args.workspaceId,
                  role: "CUSTOMER",
                  isActive: true,
                },
              },
            },
          },
        })
      : null;
    if (
      !grant ||
      !(await args.db.familyLink.findFirst({
        where: {
          workspaceId: args.workspaceId,
          childMemberId: memberId,
          guardianId,
        },
      }))
    )
      fail(
        "Verify the named guardian's current booking and signing authority before importing this reservation.",
      );
  }
  const fundingType = data.fundingType as
    | "MEMBERSHIP"
    | "PUNCH_CARD"
    | "TRIAL"
    | "SOURCE_PAYMENT";
  if (fundingType === "SOURCE_PAYMENT") {
    const evidence = await args.db.importedFinancialEvidence.findUnique({
      where: {
        workspaceId_sourceSystem_sourceRecordKind_sourceExternalId: {
          workspaceId: args.workspaceId,
          sourceSystem: text(data, "sourceSystem"),
          sourceRecordKind: "PAYMENT",
          sourceExternalId: text(data, "fundingExternalId"),
        },
      },
    });
    const productId = await linkedId(
      args,
      "DROP_IN_PRODUCT",
      text(data, "dropInProductExternalId"),
      "DropInProduct",
    );
    if (
      !evidence ||
      evidence.beneficiaryMemberId !== memberId ||
      evidence.currency !== data.currency ||
      evidence.sourceStatus !== "SUCCEEDED" ||
      evidence.billingOwner !== "SOURCE" ||
      evidence.refundOwner !== "SOURCE" ||
      !evidence.paymentId
    )
      fail(
        "The reviewed source payment must cover this participant, currency and source refund ownership.",
      );
    const allocated = await args.db.importedBookingFunding.aggregate({
      where: { workspaceId: args.workspaceId, evidenceId: evidence.id },
      _sum: { amountCents: true },
    });
    if (
      (allocated._sum.amountCents ?? 0) + (data.amountCents as number) >
      evidence.paidCents - evidence.refundedCents
    )
      fail("The source payment has insufficient unallocated net paid money.");
    const result = await createImportedClassBookingTx({
      sourceProof: {
        stagingRecordId: args.stagingRecord.id,
        importJobId: args.importJobId,
        sourceRowHash,
        actorId: args.actorId,
      },
      db: args.db,
      workspaceId: args.workspaceId,
      memberId,
      guardianId,
      classTemplateId,
      scheduledForDate: text(data, "scheduledForDate"),
      timezone,
      now,
      funding: {
        type: "SOURCE_PAYMENT",
        id: evidence.id,
        productId,
        amountCents: data.amountCents as number,
        currency: text(data, "currency"),
      },
    });
    if (result.status === "error") fail(result.message);
    await args.db.classBooking.update({
      where: { id: result.bookingId },
      data: {
        importSnapshot: snapshot,
        status: "BOOKED",
        pendingPaymentExpiresAt: null,
        dropInPaidAt: evidence.occurredAt,
      },
    });
    await args.db.importedBookingFunding.create({
      data: {
        workspaceId: args.workspaceId,
        bookingId: result.bookingId,
        evidenceId: evidence.id,
        amountCents: data.amountCents as number,
        currency: text(data, "currency"),
        sourceAllocationReference: text(data, "allocationReference"),
        sourceRowHash,
        actorId: args.actorId,
      },
    });
    await mark(args, externalId, "ClassBooking", result.bookingId);
    return "created";
  }
  const id =
    fundingType === "TRIAL"
      ? undefined
      : await linkedId(
          args,
          fundingType === "MEMBERSHIP"
            ? "MEMBER_MEMBERSHIP"
            : "PUNCH_CARD_BALANCE",
          `${fundingType === "PUNCH_CARD" ? "balance:" : ""}${text(data, "fundingExternalId")}`,
          fundingType === "MEMBERSHIP" ? "MemberMembership" : "MemberPunchCard",
        );
  const result = await createImportedClassBookingTx({
    sourceProof: {
      stagingRecordId: args.stagingRecord.id,
      importJobId: args.importJobId,
      sourceRowHash,
      actorId: args.actorId,
    },
    db: args.db,
    workspaceId: args.workspaceId,
    memberId,
    guardianId,
    classTemplateId,
    scheduledForDate: text(data, "scheduledForDate"),
    timezone,
    now,
    funding: { type: fundingType, id },
  });
  if (result.status === "error" || result.status === "payment_required")
    fail(
      result.status === "error"
        ? result.message
        : "Source money requires reconciliation before reservation.",
    );
  await args.db.classBooking.update({
    where: { id: result.bookingId },
    data: { importSnapshot: snapshot },
  });
  await mark(args, externalId, "ClassBooking", result.bookingId);
  return "created";
}
