import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import { lockFinancialAccount } from "./financial-operations.js";
import { readAcceptedMembershipTerms } from "./membership-allowances.js";
import { readPunchCardTerms } from "./punch-card-ledger.js";
import {
  requireWorkspaceDataOwner,
  WorkspaceDataError,
  type WorkspaceDataActor,
} from "./workspace-data.js";
type Tx = Prisma.TransactionClient;
type Options = { db?: PrismaClient; now?: Date };
export type BillingHandoverMode =
  | "STOP_AND_REAUTHORIZE"
  | "RETAIN_GYM_PROCESSOR";
export interface SourceHandoverDeclaration {
  evidenceId: string;
  sourceAccountReference: string;
  sourceContractReference: string;
  disposition: "STOP" | "CONTINUE_WITH_RECEIVER";
  effectiveAt: string;
  evidenceReference: string;
}
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}
const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
function fail(message: string): never {
  throw new WorkspaceDataError(message);
}
function text(value: string, label: string, max = 1000) {
  const result = value.trim();
  if (!result || result.length > max)
    fail(`${label} is required (up to ${max} characters).`);
  return result;
}
function acceptedMembershipTerms(value: unknown) {
  const terms = readAcceptedMembershipTerms(value);
  if (
    !terms ||
    terms.version < 1 ||
    !Number.isSafeInteger(terms.monthlyPriceCents) ||
    terms.monthlyPriceCents < 0 ||
    !/^[a-z]{3}$/i.test(terms.currency) ||
    !terms.programIds.every((id) => typeof id === "string") ||
    typeof terms.lateCancellationConsumesClass !== "boolean" ||
    typeof terms.noShowConsumesClass !== "boolean" ||
    !Number.isFinite(+new Date(terms.capturedAt))
  )
    return null;
  return {
    version: terms.version,
    monthlyPriceCents: terms.monthlyPriceCents,
    currency: terms.currency,
    weeklyClassLimit: terms.weeklyClassLimit,
    monthlyClassLimit: terms.monthlyClassLimit,
    allowanceCountingMode: terms.allowanceCountingMode,
    programIds: terms.programIds,
    capturedAt: terms.capturedAt,
  };
}
async function lock(db: Tx, workspaceId: string) {
  await lockClassSchedule(db, workspaceId);
  await lockFinancialAccount(db, workspaceId);
}
async function transaction<T>(db: PrismaClient, work: (tx: Tx) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        timeout: 120000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 3
      )
        throw error;
    }
  }
}
/** Explicit obligations only: no forms, coaching content, source blobs or payment-method data. */
export async function workspaceBillingObligations(
  db: Tx,
  workspaceId: string,
  accessEndsAt: Date,
) {
  const [
    memberships,
    packs,
    credits,
    invoices,
    source,
    importedMoney,
    settings,
    location,
  ] = await Promise.all([
    db.memberMembership.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        memberId: true,
        membershipPlanId: true,
        status: true,
        payerAccountId: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
        sourceBillingManaged: true,
        startedAt: true,
        endedAt: true,
        nextBillingDate: true,
        cancelAtPeriodEnd: true,
        frozenFrom: true,
        frozenUntil: true,
        acceptedTerms: true,
      },
    }),
    db.memberPunchCard.findMany({
      where: { workspaceId, remainingPunches: { gt: 0 } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        memberId: true,
        punchCardProductId: true,
        status: true,
        originalPunches: true,
        remainingPunches: true,
        purchasePriceCents: true,
        purchaseCurrency: true,
        purchasedAt: true,
        expiresOn: true,
        acceptedTerms: true,
      },
    }),
    db.accountCredit.findMany({
      where: { workspaceId, status: "ACTIVE", remainingAmountCents: { gt: 0 } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        payerAccountId: true,
        currency: true,
        originalAmountCents: true,
        remainingAmountCents: true,
        expiresAt: true,
      },
    }),
    db.invoice.findMany({
      where: { workspaceId, status: { in: ["OPEN", "UNCOLLECTIBLE"] } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        memberId: true,
        payerAccountId: true,
        source: true,
        status: true,
        amountDueCents: true,
        currency: true,
      },
    }),
    db.sourceBillingEvidence.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        memberMembershipId: true,
        sourceSystem: true,
        sourceContractReference: true,
        paidFrom: true,
        paidThrough: true,
        nextRenewalOn: true,
        sourceFileHash: true,
        sourceRowHash: true,
        sourceReceiptHash: true,
      },
    }),
    db.importedFinancialEvidence.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        sourceSystem: true,
        sourceAccountReference: true,
        sourceRecordKind: true,
        sourceExternalId: true,
        sourceStatus: true,
        billingOwner: true,
        refundOwner: true,
        payerMemberId: true,
        beneficiaryMemberId: true,
        amountCents: true,
        paidCents: true,
        refundedCents: true,
        currency: true,
        parentEvidenceId: true,
        sourceFileHash: true,
        sourceRowHash: true,
      },
    }),
    db.workspaceStripeSettings.findUnique({
      where: { workspaceId },
      select: { stripeAccountId: true },
    }),
    db.location.findUnique({
      where: { workspaceId },
      select: { timezone: true },
    }),
  ]);
  // Terms are fingerprinted, but private or unknown JSON is never disclosed to the receiver.
  if (credits.some((credit) => !credit.payerAccountId))
    fail(
      "Reconcile the exact payer for every monetary credit before handover.",
    );
  const safeMemberships = memberships.map(({ acceptedTerms, ...record }) => ({
    ...record,
    acceptedTermsHash: hash(acceptedTerms),
    acceptedTerms: acceptedMembershipTerms(acceptedTerms),
  }));
  const safePacks = packs.map(({ acceptedTerms, ...record }) => {
    const terms = readPunchCardTerms(acceptedTerms);
    if (!terms || !Number.isFinite(+new Date(terms.capturedAt)))
      fail(
        "Record the exact accepted terms of every remaining class pack before handover.",
      );
    return {
      ...record,
      acceptedTermsHash: hash(acceptedTerms),
      acceptedTerms: {
        version: terms.version,
        restrictionMode: terms.restrictionMode,
        programIds: terms.programIds,
        lateCancellationConsumesPunch: terms.lateCancellationConsumesPunch,
        noShowConsumesPunch: terms.noShowConsumesPunch,
        capturedAt: terms.capturedAt,
      },
    };
  });
  const boundary = new Intl.DateTimeFormat("en-CA", {
    timeZone: location?.timezone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(accessEndsAt);
  const bookings = await db.classBooking.findMany({
    where: {
      workspaceId,
      status: { in: ["BOOKED", "PENDING_PAYMENT"] },
      scheduledForDate: { gte: new Date(`${boundary}T00:00:00Z`) },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      memberId: true,
      classTemplateId: true,
      scheduledForDate: true,
      status: true,
      bookingType: true,
      memberPunchCardId: true,
      fundingMembershipId: true,
      fundedByBookingId: true,
      fundingRevision: true,
    },
  });
  const payerIds = [
    ...new Set(
      [...memberships, ...credits, ...invoices]
        .map((item) => item.payerAccountId)
        .filter((id): id is string => !!id),
    ),
  ];
  const payers = await db.financialAccount.findMany({
    where: { workspaceId, id: { in: payerIds } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      userId: true,
      memberId: true,
      stripeAccountId: true,
      stripeCustomerId: true,
      member: { select: { workspaceId: true, userId: true } },
    },
  });
  if (
    payers.length !== payerIds.length ||
    payers.some(
      (payer) =>
        payer.member.workspaceId !== workspaceId ||
        payer.userId !== payer.member.userId,
    )
  )
    fail("Reconcile every payer identity before preparing a billing handover.");
  const members = await db.member.findMany({
    where: {
      workspaceId,
      id: {
        in: [
          ...new Set(
            [...memberships, ...packs, ...invoices, ...bookings, ...payers]
              .map((item) => item.memberId)
              .concat(
                importedMoney.flatMap((item) => [
                  item.payerMemberId,
                  item.beneficiaryMemberId,
                ]),
              )
              .filter((id): id is string => !!id),
          ),
        ],
      },
    },
    select: { id: true, fullName: true },
    orderBy: { id: "asc" },
  });
  return JSON.parse(
    JSON.stringify({
      version: 1,
      workspaceId,
      accessEndsAt,
      accountId: settings?.stripeAccountId ?? null,
      memberships: safeMemberships,
      packs: safePacks,
      credits,
      invoices,
      bookings,
      source,
      importedMoney,
      members,
      payers: payers.map((payer) => ({
        id: payer.id,
        memberId: payer.memberId,
        stripeAccountId: payer.stripeAccountId,
        stripeCustomerId: payer.stripeCustomerId,
      })),
    }),
  ) as {
    version: number;
    workspaceId: string;
    accessEndsAt: string;
    accountId: string | null;
    memberships: Array<
      Omit<
        (typeof safeMemberships)[number],
        | "startedAt"
        | "endedAt"
        | "nextBillingDate"
        | "frozenFrom"
        | "frozenUntil"
      > & { startedAt: string; endedAt: string | null }
    >;
    packs: Array<
      Omit<(typeof safePacks)[number], "purchasedAt" | "expiresOn"> & {
        purchasedAt: string;
        expiresOn: string | null;
      }
    >;
    credits: typeof credits;
    invoices: typeof invoices;
    bookings: typeof bookings;
    source: Array<
      Omit<
        (typeof source)[number],
        "paidFrom" | "paidThrough" | "nextRenewalOn"
      > & { paidFrom: string; paidThrough: string; nextRenewalOn: string }
    >;
    importedMoney: typeof importedMoney;
    members: typeof members;
    payers: Array<{
      id: string;
      memberId: string;
      stripeAccountId: string | null;
      stripeCustomerId: string | null;
    }>;
  };
}
type Obligations = Awaited<ReturnType<typeof workspaceBillingObligations>>;
export interface BillingHandoverSnapshot {
  version: 1;
  obligations: Obligations;
  sourceDeclarations: SourceHandoverDeclaration[];
}
function sourceDeclarations(
  input: SourceHandoverDeclaration[],
  obligations: Obligations,
  mode: BillingHandoverMode,
) {
  if (!Array.isArray(input) || input.length !== obligations.source.length)
    fail(
      "Record one exact source billing disposition for every imported receipt before handover.",
    );
  const declarations = input
    .map((row) => {
      if (!row || typeof row !== "object")
        fail("Review the source billing dispositions.");
      const receipt = obligations.source.find(
        (item) => item.id === row.evidenceId,
      );
      if (
        !receipt ||
        row.sourceContractReference !== receipt.sourceContractReference
      )
        fail(
          "A source disposition does not match its exact imported contract.",
        );
      if (
        !["STOP", "CONTINUE_WITH_RECEIVER"].includes(row.disposition) ||
        (mode === "STOP_AND_REAUTHORIZE" && row.disposition !== "STOP")
      )
        fail(
          "Stop-and-reauthorize requires evidence that each source contract stops.",
        );
      const at = new Date(row.effectiveAt);
      if (!Number.isFinite(+at) || at > new Date(obligations.accessEndsAt))
        fail("The source stop or handover must take effect by the access end.");
      return {
        evidenceId: receipt.id,
        sourceContractReference: receipt.sourceContractReference,
        sourceAccountReference: text(
          row.sourceAccountReference,
          "Exact source account reference",
          250,
        ),
        disposition: row.disposition,
        effectiveAt: at.toISOString(),
        evidenceReference: text(
          row.evidenceReference,
          "Source provider stop or transfer receipt reference",
        ),
      };
    })
    .sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  if (
    new Set(declarations.map((row) => row.evidenceId)).size !==
    obligations.source.length
  )
    fail("Each source receipt needs its own exact disposition.");
  return declarations;
}
async function currentPlan(
  db: Tx,
  workspaceId: string,
  expectedVersion: number,
) {
  const plan = await db.workspaceOffboarding.findUnique({
    where: { workspaceId },
  });
  if (!plan || plan.version !== expectedVersion || plan.accessRevokedAt)
    fail("The exit plan changed. Review its current version before handover.");
  if (
    await db.financialOperation.count({
      where: {
        workspaceId,
        targetId: workspaceId,
        status: { in: ["RESERVED", "SUBMITTED", "REVIEW_REQUIRED"] },
      },
    })
  )
    fail(
      "Reconcile the platform billing operation before changing the exit plan.",
    );
  return plan;
}
export async function saveWorkspaceBillingHandover(
  actor: WorkspaceDataActor,
  input: {
    requestId: string;
    expectedPlanVersion: number;
    destinationName: string;
    receiverUserId: string;
    evidenceReference: string;
    payerAuthorityEvidence: string;
    processorMode: BillingHandoverMode;
    processorAccountId?: string;
    sourceDeclarations: SourceHandoverDeclaration[];
  },
  options: Options = {},
) {
  if (
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      input.requestId,
    )
  )
    fail("Reload before preparing this handover.");
  if (
    !["STOP_AND_REAUTHORIZE", "RETAIN_GYM_PROCESSOR"].includes(
      input.processorMode,
    )
  )
    fail("Choose a supported billing handover mode.");
  return transaction(options.db ?? prisma, async (db) => {
    await lock(db, actor.workspaceId);
    await requireWorkspaceDataOwner(db, actor);
    const prior = await db.workspaceBillingHandover.findUnique({
      where: { id: input.requestId },
    });
    if (prior) {
      if (
        prior.workspaceId !== actor.workspaceId ||
        prior.recordedByUserId !== actor.userId ||
        prior.destinationName !== input.destinationName.trim() ||
        prior.receiverUserId !== input.receiverUserId ||
        prior.processorMode !== input.processorMode ||
        prior.evidenceReference !== input.evidenceReference.trim() ||
        prior.payerAuthorityEvidence !== input.payerAuthorityEvidence.trim()
      )
        fail(
          "This request ID already belongs to a different handover. Reload before changing it.",
        );
      const saved =
        prior.obligationSnapshot as unknown as BillingHandoverSnapshot;
      if (
        prior.offboardingPlanVersion !== input.expectedPlanVersion + 1 ||
        (input.processorMode === "RETAIN_GYM_PROCESSOR" &&
          input.processorAccountId !== prior.processorAccountId) ||
        hash(
          sourceDeclarations(
            input.sourceDeclarations,
            saved.obligations,
            input.processorMode,
          ),
        ) !== hash(saved.sourceDeclarations)
      )
        fail(
          "This request ID already belongs to different source or processor terms.",
        );
      return prior;
    }
    const plan = await currentPlan(
      db,
      actor.workspaceId,
      input.expectedPlanVersion,
    );
    if (
      !(await db.user.findUnique({
        where: { id: input.receiverUserId },
        select: { id: true },
      }))
    )
      fail("Choose a named receiving account that already exists.");
    const obligations = await workspaceBillingObligations(
      db,
      actor.workspaceId,
      plan.accessEndsAt,
    );
    if (
      input.processorMode === "RETAIN_GYM_PROCESSOR" &&
      (!obligations.accountId ||
        input.processorAccountId !== obligations.accountId)
    )
      fail(
        "Retained billing must use the gym's exact existing connected processor account.",
      );
    const snapshot: BillingHandoverSnapshot = {
      version: 1,
      obligations,
      sourceDeclarations: sourceDeclarations(
        input.sourceDeclarations,
        obligations,
        input.processorMode,
      ),
    };
    const nextVersion = plan.version + 1;
    const handover = await db.workspaceBillingHandover.create({
      data: {
        id: input.requestId,
        workspaceId: actor.workspaceId,
        offboardingPlanId: plan.id,
        offboardingPlanVersion: nextVersion,
        destinationName: text(
          input.destinationName,
          "Receiving service or gym",
          250,
        ),
        receiverUserId: input.receiverUserId,
        recordedByUserId: actor.userId,
        evidenceReference: text(
          input.evidenceReference,
          "Handover agreement reference",
        ),
        payerAuthorityEvidence: text(
          input.payerAuthorityEvidence,
          "Payer authority evidence reference",
        ),
        processorMode: input.processorMode,
        processorAccountId: obligations.accountId,
        obligationSnapshot: json(snapshot),
        obligationFingerprint: hash(snapshot),
      },
    });
    await db.workspaceBillingHandover.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        id: { not: handover.id },
        state: { not: "SUPERSEDED" },
      },
      data: { state: "SUPERSEDED" },
    });
    await db.workspaceOffboarding.update({
      where: { id: plan.id },
      data: {
        version: nextVersion,
        state: "REVIEW",
        customerBillingDisposition: "HANDOVER",
        customerBillingHandoverId: handover.id,
        customerBillingEvidence: Prisma.JsonNull,
        ownerConfirmedAt: null,
        ownerConfirmedByUserId: null,
        platformBillingConfirmedAt: null,
      },
    });
    await db.workspaceDataEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        kind: "BILLING_HANDOVER_PREPARED",
        metadata: {
          handoverId: handover.id,
          planVersion: nextVersion,
          fingerprint: handover.obligationFingerprint,
          receiverUserId: handover.receiverUserId,
        },
      },
    });
    return handover;
  });
}
async function authorizedHandover(db: Tx, userId: string, id: string) {
  const handover = await db.workspaceBillingHandover.findUnique({
    where: { id },
  });
  if (!handover) fail("This billing handover is unavailable for this account.");
  const plan = await db.workspaceOffboarding.findUnique({
    where: { workspaceId: handover.workspaceId },
    select: { version: true, customerBillingHandoverId: true },
  });
  const current =
    handover.state !== "SUPERSEDED" &&
    plan?.version === handover.offboardingPlanVersion &&
    plan.customerBillingHandoverId === handover.id;
  if (handover.receiverUserId !== userId || !current)
    await requireWorkspaceDataOwner(db, {
      workspaceId: handover.workspaceId,
      userId,
    });
  return handover;
}
export async function getWorkspaceBillingHandover(
  userId: string,
  id: string,
  options: Options = {},
) {
  const db = options.db ?? prisma,
    handover = await authorizedHandover(db, userId, id);
  const plan = await db.workspaceOffboarding.findUnique({
    where: { workspaceId: handover.workspaceId },
    select: {
      version: true,
      accessRevokedAt: true,
      customerBillingHandoverId: true,
    },
  });
  return {
    handover,
    current:
      plan?.version === handover.offboardingPlanVersion &&
      plan.customerBillingHandoverId === handover.id &&
      handover.state !== "SUPERSEDED",
    accessRevokedAt: plan?.accessRevokedAt ?? null,
  };
}
export async function acceptWorkspaceBillingHandover(
  userId: string,
  id: string,
  fingerprint: string,
  evidence: string,
  options: Options = {},
) {
  return transaction(options.db ?? prisma, async (db) => {
    const initial = await authorizedHandover(db, userId, id);
    await lock(db, initial.workspaceId);
    const handover = await authorizedHandover(db, userId, id);
    if (handover.receiverUserId !== userId)
      fail("Only the named receiving account may accept these obligations.");
    const plan = await currentPlan(
      db,
      handover.workspaceId,
      handover.offboardingPlanVersion,
    );
    if (
      plan.customerBillingHandoverId !== id ||
      handover.state === "SUPERSEDED" ||
      fingerprint !== handover.obligationFingerprint
    )
      fail(
        "This handover changed. Review its current snapshot before accepting.",
      );
    const saved =
      handover.obligationSnapshot as unknown as BillingHandoverSnapshot;
    const obligations = await workspaceBillingObligations(
      db,
      handover.workspaceId,
      plan.accessEndsAt,
    );
    if (hash({ ...saved, obligations }) !== handover.obligationFingerprint)
      fail(
        "Obligations changed after this handover was prepared. Ask the owner to prepare a new version.",
      );
    if (handover.receiverAcceptedAt) {
      if (handover.receiverEvidence !== evidence.trim())
        fail(
          "This snapshot already has a different immutable acceptance receipt.",
        );
      return handover;
    }
    const result = await db.workspaceBillingHandover.update({
      where: { id },
      data: {
        state: "ACCEPTED",
        receiverAcceptedAt: options.now ?? new Date(),
        receiverEvidence: text(
          evidence,
          "Receiving account acknowledgement reference",
        ),
      },
    });
    await db.workspaceDataEvent.create({
      data: {
        workspaceId: handover.workspaceId,
        actorUserId: userId,
        kind: "BILLING_HANDOVER_ACCEPTED",
        metadata: { handoverId: id, fingerprint },
      },
    });
    return result;
  });
}
/** Used by the exit inventory under its transaction lock. It never clears a balance. */
export async function inspectWorkspaceBillingHandover(
  db: Tx,
  plan: {
    id: string;
    workspaceId: string;
    version: number;
    customerBillingHandoverId: string | null;
    accessEndsAt: Date;
  },
  now: Date,
) {
  const handover = plan.customerBillingHandoverId
    ? await db.workspaceBillingHandover.findFirst({
        where: {
          id: plan.customerBillingHandoverId,
          workspaceId: plan.workspaceId,
          offboardingPlanId: plan.id,
          offboardingPlanVersion: plan.version,
        },
      })
    : null;
  if (
    !handover ||
    !handover.receiverAcceptedAt ||
    handover.state !== "VERIFIED" ||
    !handover.confirmedAt ||
    !handover.providerVerifiedAt ||
    +now - +handover.providerVerifiedAt > 300000
  )
    return {
      valid: false,
      reason:
        "Have the named receiver accept the exact handover and freshly verify its processor evidence.",
    };
  if (
    !(await db.user.findUnique({
      where: { id: handover.receiverUserId },
      select: { id: true },
    }))
  )
    return {
      valid: false,
      reason:
        "The named receiving account no longer exists. Prepare a new handover.",
    };
  const snapshot =
    handover.obligationSnapshot as unknown as BillingHandoverSnapshot;
  let obligations: Obligations;
  try {
    obligations = await workspaceBillingObligations(
      db,
      plan.workspaceId,
      plan.accessEndsAt,
    );
  } catch (error) {
    if (error instanceof WorkspaceDataError)
      return { valid: false, reason: error.message };
    throw error;
  }
  if (hash({ ...snapshot, obligations }) !== handover.obligationFingerprint)
    return {
      valid: false,
      reason:
        "Billing obligations changed. Prepare a new handover and obtain fresh receiver and owner confirmations.",
    };
  return { valid: true, handover, snapshot };
}
export interface HandoverSubscription {
  id: string;
  customerId: string;
  status: string;
  cancelAt: number | null;
  endedAt: number | null;
  workspaceId: string | null;
  openInvoiceCount: number;
}
/** Called only with fresh canonical processor reads from the payment service, never form input. */
export async function recordWorkspaceBillingHandoverVerification(
  actor: WorkspaceDataActor,
  version: number,
  evidence: {
    accountId: string;
    accountVerified: boolean;
    subscriptions: HandoverSubscription[];
  },
  options: Options = {},
) {
  return transaction(options.db ?? prisma, async (db) => {
    await lock(db, actor.workspaceId);
    await requireWorkspaceDataOwner(db, actor);
    const plan = await currentPlan(db, actor.workspaceId, version);
    const handover = await db.workspaceBillingHandover.findFirst({
      where: {
        id: plan.customerBillingHandoverId ?? "",
        workspaceId: actor.workspaceId,
        offboardingPlanVersion: version,
      },
    });
    if (
      !handover ||
      !handover.receiverAcceptedAt ||
      handover.state === "SUPERSEDED"
    )
      fail("The named receiver must accept the current handover first.");
    if (
      !(await db.user.findUnique({
        where: { id: handover.receiverUserId },
        select: { id: true },
      }))
    )
      fail(
        "The named receiving account no longer exists. Prepare a new handover.",
      );
    const saved =
      handover.obligationSnapshot as unknown as BillingHandoverSnapshot;
    const obligations = await workspaceBillingObligations(
      db,
      actor.workspaceId,
      plan.accessEndsAt,
    );
    if (hash({ ...saved, obligations }) !== handover.obligationFingerprint)
      fail(
        "Obligations changed. Prepare a new handover before checking billing.",
      );
    if (
      evidence.accountId !== handover.processorAccountId ||
      evidence.accountId !== obligations.accountId ||
      !evidence.accountVerified
    )
      fail(
        "The processor has not verified the exact existing connected account.",
      );
    if (
      new Set(evidence.subscriptions.map((sub) => sub.id)).size !==
      evidence.subscriptions.length
    )
      fail("Processor evidence contains duplicate subscription identities.");
    for (const membership of obligations.memberships.filter(
      (item) => item.stripeSubscriptionId,
    )) {
      const sub = evidence.subscriptions.find(
        (item) => item.id === membership.stripeSubscriptionId,
      );
      if (
        !sub ||
        sub.customerId !== membership.stripeCustomerId ||
        (sub.workspaceId && sub.workspaceId !== actor.workspaceId)
      )
        fail(
          "A customer subscription does not match its exact gym contract and processor customer.",
        );
      if (
        handover.processorMode === "RETAIN_GYM_PROCESSOR" &&
        !["canceled", "incomplete_expired"].includes(sub.status)
      ) {
        if (
          !membership.acceptedTerms ||
          !["ACTIVE", "FROZEN", "PAST_DUE"].includes(membership.status) ||
          (membership.endedAt &&
            new Date(membership.endedAt) <= (options.now ?? new Date()))
        )
          fail(
            "An active processor subscription lacks current accepted renewal authority. Reconcile the ended contract or missing terms first.",
          );
        if (
          membership.endedAt &&
          !(
            sub.cancelAt !== null &&
            sub.cancelAt <= +new Date(membership.endedAt) / 1000
          )
        )
          fail(
            "The processor renewal stop exceeds the accepted contract end. Reconcile it before retaining billing.",
          );
        const payer = obligations.payers.find(
          (item) => item.id === membership.payerAccountId,
        );
        if (
          !payer ||
          payer.stripeAccountId !== evidence.accountId ||
          payer.stripeCustomerId !== sub.customerId ||
          membership.sourceBillingManaged
        )
          fail(
            "Reconcile the retained subscription's exact payer binding before handover.",
          );
      }
    }
    if (
      evidence.subscriptions.some(
        (sub) =>
          sub.openInvoiceCount > 0 ||
          (sub.workspaceId && sub.workspaceId !== actor.workspaceId),
      )
    )
      fail(
        "Reconcile outstanding invoices and foreign-workspace subscriptions before handover.",
      );
    const end = Math.floor(+plan.accessEndsAt / 1000);
    if (
      handover.processorMode === "STOP_AND_REAUTHORIZE" &&
      evidence.subscriptions.some(
        (sub) =>
          !["canceled", "incomplete_expired"].includes(sub.status) &&
          !(sub.cancelAt !== null && sub.cancelAt <= end),
      )
    )
      fail(
        "Every old processor renewal must stop by the access end before new payer authorization elsewhere.",
      );
    if (
      handover.processorMode === "RETAIN_GYM_PROCESSOR" &&
      evidence.subscriptions.some(
        (sub) =>
          !["canceled", "incomplete_expired"].includes(sub.status) &&
          !obligations.memberships.some(
            (item) =>
              item.stripeSubscriptionId === sub.id &&
              item.stripeCustomerId === sub.customerId,
          ),
      )
    )
      fail(
        "An active processor subscription is not mapped to an exact accepted gym contract.",
      );
    const now = options.now ?? new Date();
    await db.workspaceBillingHandover.update({
      where: { id: handover.id },
      data: {
        state: "VERIFIED",
        confirmedAt: now,
        providerVerifiedAt: now,
        providerEvidence: json({
          ...evidence,
          verifiedAt: now.toISOString(),
          fingerprint: handover.obligationFingerprint,
          sourceProof:
            "Explicit external provider references; not Stripe evidence",
        }),
      },
    });
    await db.workspaceOffboarding.update({
      where: { id: plan.id },
      data: {
        customerBillingEvidence: json({
          verifiedAt: now.toISOString(),
          version,
          accountId: evidence.accountId,
          handoverId: handover.id,
          fingerprint: handover.obligationFingerprint,
        }),
      },
    });
    await db.workspaceDataEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        kind: "BILLING_HANDOVER_VERIFIED",
        metadata: {
          handoverId: handover.id,
          version,
          fingerprint: handover.obligationFingerprint,
        },
      },
    });
    return { status: "VERIFIED", count: evidence.subscriptions.length };
  });
}
