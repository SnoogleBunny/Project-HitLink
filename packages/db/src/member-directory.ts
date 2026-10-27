import { createHash } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type MemberStatus,
  type CoachingEnrollment,
} from "@prisma/client";
import { prisma } from "./client.js";
import {
  requireActiveStaffAccessTx,
  type StaffAccessActor,
} from "./staff-access.js";
import { getWorkspaceDateString, toDateOnlyString } from "./occurrences.js";
import { coachingStatus } from "./coaching.js";
import { membershipCanFundDate } from "./class-access.js";
import { readPunchCardTerms } from "./punch-card-ledger.js";
import { sourceBillingCoversDate } from "./source-billing.js";
import {
  summarizeMembershipAllowancesForMembersTx,
  type MembershipAllowancePageSummary,
} from "./membership-allowances.js";
// Integration dependency: WF07's actual read-only, role-checked API. Do not replace with a placeholder or per-member resolver.
import {
  buildRequiredFormsMemberFilterTx,
  summarizeRequiredFormsForMembersTx,
  type RequiredFormsMemberState,
  type RequiredFormsMemberSummary,
} from "./form-requirement-summary.js";

export class MemberDirectoryInputError extends Error {}

export const DIRECTORY_CONDITIONS = {
  CLASS_BOOKED: "Recorded class reservation",
  WAITLISTED: "Active waitlist entry",
  MEMBERSHIP_PAYMENT: "Membership payment or source review",
  MEMBERSHIP_FREEZE: "Membership freeze recorded",
  MEMBERSHIP_ENDING: "Membership cancellation scheduled",
  PACK_BALANCE: "Recorded pack balance",
  COACHING_OPEN: "Open coaching engagement",
  DEBT_OPEN: "Unpaid beneficiary invoice",
} as const;
export type DirectoryCondition = keyof typeof DIRECTORY_CONDITIONS;
export type MemberDirectoryFilters = {
  query: string;
  profileLabel?: MemberStatus;
  archived: boolean;
  classProgram: string;
  coachingProgram: string;
  cohortLabel: string;
  operationalTag: string;
  condition?: DirectoryCondition;
  forms?: RequiredFormsMemberState;
};
const statuses: MemberStatus[] = [
  "ACTIVE",
  "TRIAL",
  "OVERDUE",
  "FROZEN",
  "CANCELLED",
  "WAITLISTED",
];
function searchText(value: unknown, max = 120): string {
  if (value === undefined || value === null) return "";
  if (
    typeof value !== "string" ||
    value.length > max ||
    Array.from(value).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new MemberDirectoryInputError(
      "Use a shorter directory search without control characters.",
    );
  return value.trim();
}
export function parseMemberDirectoryFilters(
  params: Record<string, unknown>,
): MemberDirectoryFilters {
  const profileLabel = statuses.find((status) => status === params.status);
  if (params.status && !profileLabel)
    throw new MemberDirectoryInputError("Choose a supported profile label.");
  const condition =
    typeof params.condition === "string" &&
    Object.hasOwn(DIRECTORY_CONDITIONS, params.condition)
      ? (params.condition as DirectoryCondition)
      : undefined;
  if (params.condition && !condition)
    throw new MemberDirectoryInputError(
      "Choose a supported operational condition.",
    );
  const forms = ["COMPLETE", "ACTION_REQUIRED", "EXPIRED"].find(
    (state) => state === params.forms,
  ) as RequiredFormsMemberState | undefined;
  if (params.forms && !forms)
    throw new MemberDirectoryInputError("Choose a supported forms condition.");
  return {
    query: searchText(params.q),
    profileLabel,
    archived: params.archived === "1",
    classProgram: searchText(params.classProgram),
    coachingProgram: searchText(params.coachingProgram),
    cohortLabel: searchText(params.cohortLabel, 80),
    operationalTag: searchText(params.operationalTag, 40),
    condition,
    forms,
  };
}
export function buildMemberDirectoryWhere(
  workspaceId: string,
  filters: MemberDirectoryFilters,
): Prisma.MemberWhereInput {
  const AND: Prisma.MemberWhereInput[] = [
    { workspaceId, archivedAt: filters.archived ? { not: null } : null },
  ];
  if (filters.profileLabel) AND.push({ status: filters.profileLabel });
  if (filters.query)
    AND.push({
      OR: [
        { fullName: { contains: filters.query, mode: "insensitive" } },
        { email: { contains: filters.query, mode: "insensitive" } },
        { phone: { contains: filters.query, mode: "insensitive" } },
      ],
    });
  // These are participation/enrollment filters, deliberately not entitlement claims based on a mutable catalog.
  if (filters.classProgram)
    AND.push({
      classBookings: {
        some: {
          workspaceId,
          status: { in: ["BOOKED", "ATTENDED", "ABSENT", "NO_SHOW"] },
          classTemplate: {
            program: {
              name: { contains: filters.classProgram, mode: "insensitive" },
            },
          },
        },
      },
    });
  if (filters.coachingProgram)
    AND.push({
      coachingEnrollments: {
        some: {
          workspaceId,
          programVersion: {
            program: {
              name: { contains: filters.coachingProgram, mode: "insensitive" },
            },
          },
        },
      },
    });
  // MF06 keeps cohort labels and unclassified legacy labels in Member.tags. New operational tags never enter this projection.
  if (filters.cohortLabel) AND.push({ tags: { has: filters.cohortLabel } });
  // Only a current head can match. The generated exact-stream predecessor relation
  // prevents a retracted, superseded or differently purposed historical revision from resurfacing.
  if (filters.operationalTag)
    AND.push({
      operationalRevisions: {
        some: {
          workspaceId,
          recordKey: `tag:OPERATIONAL:${createHash("sha256").update(filters.operationalTag).digest("hex")}`,
          recordKind: "TAG",
          tagPurpose: "OPERATIONAL",
          tagLabel: filters.operationalTag,
          action: { not: "RETRACT" },
          successorRevisions: { none: {} },
        },
      },
    });
  switch (filters.condition) {
    case "CLASS_BOOKED":
      AND.push({ classBookings: { some: { workspaceId, status: "BOOKED" } } });
      break;
    case "WAITLISTED":
      AND.push({
        waitlistEntries: { some: { workspaceId, status: "ACTIVE" } },
      });
      break;
    case "MEMBERSHIP_PAYMENT":
      AND.push({
        memberships: {
          some: {
            workspaceId,
            currentMembershipSlot: "CURRENT",
            OR: [
              { sourceAccessHeld: true },
              {
                billingState: {
                  status: {
                    in: [
                      "PENDING_PAYMENT_METHOD",
                      "PAST_DUE",
                      "PAYMENT_FAILED",
                      "ACTION_REQUIRED",
                    ],
                  },
                },
              },
            ],
          },
        },
      });
      break;
    case "MEMBERSHIP_FREEZE":
      AND.push({
        memberships: {
          some: {
            workspaceId,
            currentMembershipSlot: "CURRENT",
            OR: [
              { status: "FROZEN" },
              { frozenFrom: { not: null }, frozenUntil: { not: null } },
            ],
          },
        },
      });
      break;
    case "MEMBERSHIP_ENDING":
      AND.push({
        memberships: {
          some: {
            workspaceId,
            currentMembershipSlot: "CURRENT",
            cancelAtPeriodEnd: true,
          },
        },
      });
      break;
    case "PACK_BALANCE":
      AND.push({
        punchCards: {
          some: { workspaceId, status: "ACTIVE", remainingPunches: { gt: 0 } },
        },
      });
      break;
    case "COACHING_OPEN":
      AND.push({
        coachingEnrollments: { some: { workspaceId, closedAt: null } },
      });
      break;
    case "DEBT_OPEN":
      AND.push({
        invoices: {
          some: {
            workspaceId,
            amountDueCents: { gt: 0 },
            status: { in: ["OPEN", "UNCOLLECTIBLE"] },
          },
        },
      });
      break;
  }
  return { AND };
}

const membershipServiceSelect = {
  id: true,
  memberId: true,
  status: true,
  startedAt: true,
  endedAt: true,
  nextBillingDate: true,
  cancelAtPeriodEnd: true,
  frozenFrom: true,
  frozenUntil: true,
  allowanceTimezone: true,
  sourceBillingManaged: true,
  sourceAccessHeld: true,
  sourceBillingEvidence: { select: { paidFrom: true, paidThrough: true } },
  billingState: { select: { status: true, gracePeriodEndsAt: true } },
  membershipPlan: { select: { name: true } },
} as const satisfies Prisma.MemberMembershipSelect;
type MembershipRow = Prisma.MemberMembershipGetPayload<{
  select: typeof membershipServiceSelect;
}>;
export function describeMembershipService(
  membership: MembershipRow,
  now: Date,
  timezone: string,
  held: boolean,
  allowance: MembershipAllowancePageSummary,
) {
  const date = getWorkspaceDateString(
    now,
    membership.allowanceTimezone ?? timezone,
  );
  const local = (value: Date) =>
    getWorkspaceDateString(value, membership.allowanceTimezone ?? timezone);
  let contractState =
    membership.status === "PAST_DUE" ? "ACTIVE" : (membership.status as string);
  if (membership.endedAt && date >= local(membership.endedAt))
    contractState = "ENDED";
  else if (membership.status === "CANCELLED" || membership.status === "ENDED")
    contractState = membership.status;
  else if (
    membership.cancelAtPeriodEnd &&
    membership.nextBillingDate &&
    date >= local(membership.nextBillingDate)
  )
    contractState = "ENDED";
  else if (date < local(membership.startedAt)) contractState = "SCHEDULED";
  else if (
    membership.frozenFrom &&
    membership.frozenUntil &&
    date >= toDateOnlyString(membership.frozenFrom) &&
    date < toDateOnlyString(membership.frozenUntil)
  )
    contractState = "FROZEN";
  else if (
    membership.status === "FROZEN" &&
    membership.frozenFrom &&
    membership.frozenUntil
  )
    contractState = "ACTIVE";
  // Debt and payment review are separate from the contract and never rewrite a freeze, cancellation or archive fact.
  const billing = membership.billingState;
  const paymentState =
    billing?.status ??
    (membership.status === "PAST_DUE" ? "PAYMENT_REVIEW" : "NOT_READY");
  const graceUntil =
    billing &&
    ["GRACE_PERIOD", "PAST_DUE", "PAYMENT_FAILED"].includes(billing.status) &&
    billing.gracePeriodEndsAt &&
    billing.gracePeriodEndsAt > now
      ? billing.gracePeriodEndsAt.toISOString()
      : null;
  const sourceDateCovered = sourceBillingCoversDate(membership, date);
  const fundingState = held
    ? "HELD"
    : ["ENDED", "CANCELLED"].includes(contractState)
      ? "ENDED"
      : contractState === "SCHEDULED"
        ? "SCHEDULED"
        : contractState === "FROZEN"
          ? "FROZEN"
          : !sourceDateCovered
            ? "SOURCE_REVIEW"
            : !membershipCanFundDate(membership, date, now)
              ? "PAYMENT_OR_CONTRACT_REVIEW"
              : allowance.state !== "READY"
                ? "TERMS_OR_DATE_REVIEW"
                : allowance.summary.windows.some(
                      (window) => window.remaining < 1,
                    )
                  ? "ALLOWANCE_EXHAUSTED"
                  : "AVAILABLE_FOR_COVERED_PROGRAM";
  return {
    id: membership.id,
    name: membership.membershipPlan.name,
    contractState,
    fundingState,
    paymentState,
    graceUntil,
    endsOn: membership.endedAt
      ? local(membership.endedAt)
      : membership.cancelAtPeriodEnd && membership.nextBillingDate
        ? local(membership.nextBillingDate)
        : null,
    cancellationScheduled: membership.cancelAtPeriodEnd,
    held,
    sourceDateCovered,
    allowance,
  };
}

type PackRow = {
  id: string;
  memberId: string;
  name: string;
  status: string;
  remainingPunches: number;
  expiresOn: Date | null;
  acceptedTerms: unknown;
  held: boolean;
  displayOrder: bigint;
};
type CoachingRow = Pick<
  CoachingEnrollment,
  | "id"
  | "memberId"
  | "closedAt"
  | "status"
  | "acceptedAt"
  | "contactVerifiedAt"
  | "currentCoachWorkspaceUserId"
  | "paymentState"
  | "timezone"
  | "startsOn"
  | "endsOn"
  | "pauseStartsOn"
  | "pauseEndsOn"
  | "settlementState"
  | "exportState"
> & {
  name: string;
  coachIsActive: boolean | null;
  held: boolean;
  displayOrder: bigint;
};
type TagRow = {
  memberId: string;
  tagLabel: string;
  tagPurpose: string;
  displayOrder: bigint;
};
export type MemberServiceSummary = {
  archived: boolean;
  membership: ReturnType<typeof describeMembershipService> | null;
  packs: Array<{
    id: string;
    name: string;
    recordedUnits: number;
    state: string;
    expiresOn: string | null;
    held: boolean;
  }>;
  coaching: Array<{
    id: string;
    name: string;
    state: string;
    paymentState: string;
    held: boolean;
    settlementState: string;
    exportState: string;
  }>;
  operationalTags: string[];
  latestTrial: { title: string; date: string; status: string } | null;
  morePacks: boolean;
  moreCoaching: boolean;
  moreTags: boolean;
};
/** One page only. Historical notes, intake, goals, private notes, provider payloads and payer data are never selected. */
export async function summarizeMemberServicesTx(args: {
  db: Prisma.TransactionClient;
  actor: StaffAccessActor;
  memberIds: string[];
  timezone: string;
  now?: Date;
}): Promise<Map<string, MemberServiceSummary>> {
  await requireActiveStaffAccessTx(args.db, {
    ...args.actor,
    capability: "OWNER",
  });
  const memberIds = [...new Set(args.memberIds)];
  if (memberIds.length > 50 || memberIds.some((id) => !id || id.length > 150))
    throw new MemberDirectoryInputError(
      "Choose at most 50 people for a service summary.",
    );
  if (!memberIds.length) return new Map<string, MemberServiceSummary>();
  const now = args.now ?? new Date(),
    workspaceId = args.actor.workspaceId;
  const profiles = await args.db.member.findMany({
    where: { workspaceId, id: { in: memberIds } },
    select: { id: true, archivedAt: true },
  });
  const ownedMemberIds = profiles.map((profile) => profile.id);
  const result = new Map<string, MemberServiceSummary>(
    profiles.map((profile) => [
      profile.id,
      {
        archived: !!profile.archivedAt,
        membership: null,
        packs: [],
        coaching: [],
        operationalTags: [],
        latestTrial: null,
        morePacks: false,
        moreCoaching: false,
        moreTags: false,
      },
    ]),
  );
  if (!ownedMemberIds.length) return result;
  // Exact tenant/member scoping applies independently to every read and exact target holds are never member-wide.
  const [memberships, allowances, packs, enrollments, tags, trials] =
    await Promise.all([
      args.db.memberMembership.findMany({
        where: {
          workspaceId,
          memberId: { in: ownedMemberIds },
          currentMembershipSlot: "CURRENT",
        },
        select: membershipServiceSelect,
      }),
      summarizeMembershipAllowancesForMembersTx({
        db: args.db,
        workspaceId,
        memberIds,
        scheduledForDate: getWorkspaceDateString(now, args.timezone),
        occurrenceStartsAt: now,
        timezone: args.timezone,
      }),
      args.db.$queryRaw<PackRow[]>(Prisma.sql`
      WITH cards AS (SELECT c."id", c."memberId", p."name", c."status", c."remainingPunches", c."expiresOn", c."acceptedTerms",
        EXISTS (SELECT 1 FROM "financial_entitlement_holds" h WHERE h."workspaceId" = ${workspaceId} AND h."targetKind" = 'PUNCH_CARD' AND h."targetId" = c."id" AND h."activeSlot" = 'ACTIVE') AS held,
        row_number() OVER (PARTITION BY c."memberId" ORDER BY c."purchasedAt" DESC, c."id" DESC) AS "displayOrder"
        FROM "member_punch_cards" c JOIN "punch_card_products" p ON p."id" = c."punchCardProductId" AND p."workspaceId" = c."workspaceId"
        WHERE c."workspaceId" = ${workspaceId} AND c."memberId" IN (${Prisma.join(ownedMemberIds)}) AND c."status" <> 'ARCHIVED')
      SELECT * FROM cards WHERE "displayOrder" <= 11 ORDER BY "memberId", "displayOrder"`),
      args.db.$queryRaw<CoachingRow[]>(Prisma.sql`
      WITH programs AS (SELECT e."id", e."memberId", e."closedAt", e."status", e."acceptedAt", e."contactVerifiedAt", e."currentCoachWorkspaceUserId", e."paymentState", e."timezone", e."startsOn", e."endsOn", e."pauseStartsOn", e."pauseEndsOn", e."settlementState", e."exportState", p."name", w."isActive" AS "coachIsActive",
        EXISTS (SELECT 1 FROM "financial_entitlement_holds" h WHERE h."workspaceId" = ${workspaceId} AND h."targetKind" = 'COACHING_ENROLLMENT' AND h."targetId" = e."id" AND h."activeSlot" = 'ACTIVE') AS held,
        row_number() OVER (PARTITION BY e."memberId" ORDER BY (e."closedAt" IS NULL) DESC, e."createdAt" DESC, e."id" DESC) AS "displayOrder"
        FROM "coaching_enrollments" e JOIN "coaching_program_versions" v ON v."id" = e."programVersionId" JOIN "coaching_programs" p ON p."id" = v."programId" AND p."workspaceId" = e."workspaceId"
        LEFT JOIN "workspace_users" w ON w."id" = e."currentCoachWorkspaceUserId" AND w."workspaceId" = e."workspaceId"
        WHERE e."workspaceId" = ${workspaceId} AND e."memberId" IN (${Prisma.join(ownedMemberIds)}))
      SELECT * FROM programs WHERE "displayOrder" <= 11 ORDER BY "memberId", "displayOrder"`),
      args.db.$queryRaw<TagRow[]>(Prisma.sql`
      WITH latest AS (SELECT DISTINCT ON ("memberId", "recordKey") "memberId", "recordKey", "recordKind", "action", "tagPurpose", "tagLabel", "createdAt", "id", "version"
        FROM "member_operational_revisions" WHERE "workspaceId" = ${workspaceId} AND "memberId" IN (${Prisma.join(ownedMemberIds)}) ORDER BY "memberId", "recordKey", "version" DESC),
      tags AS (SELECT "memberId", "tagLabel", "tagPurpose", row_number() OVER (PARTITION BY "memberId" ORDER BY "createdAt" DESC, "id" DESC) AS "displayOrder"
        FROM latest WHERE "recordKind" = 'TAG' AND "action" <> 'RETRACT' AND "tagPurpose" = 'OPERATIONAL')
      SELECT * FROM tags WHERE "displayOrder" <= 21 ORDER BY "memberId", "displayOrder"`),
      args.db.$queryRaw<
        Array<{
          memberId: string;
          title: string;
          scheduledForDate: Date;
          status: string;
        }>
      >(Prisma.sql`
      SELECT DISTINCT ON (b."memberId") b."memberId", COALESCE(t."title", p."name") AS title, b."scheduledForDate", b."status"
      FROM "class_bookings" b JOIN "class_templates" t ON t."id" = b."classTemplateId" AND t."workspaceId" = b."workspaceId"
      JOIN "programs" p ON p."id" = t."programId" AND p."workspaceId" = b."workspaceId"
      WHERE b."workspaceId" = ${workspaceId} AND b."memberId" IN (${Prisma.join(ownedMemberIds)}) AND b."bookingType" = 'TRIAL'
      ORDER BY b."memberId", b."scheduledForDate" DESC, b."createdAt" DESC, b."id" DESC`),
    ]);
  const membershipIds = memberships.map((row) => row.id);
  const heldMemberships = membershipIds.length
    ? await args.db.financialEntitlementHold.findMany({
        where: {
          workspaceId,
          targetKind: "MEMBERSHIP",
          targetId: { in: membershipIds },
          activeSlot: "ACTIVE",
        },
        select: { targetId: true },
      })
    : [];
  const heldIds = new Set(heldMemberships.map((row) => row.targetId));
  for (const membership of memberships)
    result.get(membership.memberId)!.membership = describeMembershipService(
      membership,
      now,
      args.timezone,
      heldIds.has(membership.id),
      allowances.get(membership.memberId) ?? { state: "NONE" },
    );
  for (const summary of result.values())
    if (summary.archived && summary.membership)
      summary.membership.fundingState = "ARCHIVED";
  const today = getWorkspaceDateString(now, args.timezone);
  for (const card of packs) {
    const target = result.get(card.memberId)!;
    if (card.displayOrder > 10n) {
      target.morePacks = true;
      continue;
    }
    const termsInvalid =
      card.acceptedTerms !== null && !readPunchCardTerms(card.acceptedTerms);
    const expired =
      !!card.expiresOn && today >= toDateOnlyString(card.expiresOn);
    target.packs.push({
      id: card.id,
      name: card.name,
      recordedUnits: card.remainingPunches,
      state: termsInvalid
        ? "TERMS_REVIEW"
        : expired
          ? "EXPIRED"
          : card.status !== "ACTIVE" || card.remainingPunches <= 0
            ? "DEPLETED"
            : "RECORDED_BALANCE",
      expiresOn: card.expiresOn ? toDateOnlyString(card.expiresOn) : null,
      held: card.held,
    });
  }
  for (const enrollment of enrollments) {
    const target = result.get(enrollment.memberId)!;
    if (enrollment.displayOrder > 10n) {
      target.moreCoaching = true;
      continue;
    }
    target.coaching.push({
      id: enrollment.id,
      name: enrollment.name,
      state: coachingStatus(
        {
          ...enrollment,
          currentCoach:
            enrollment.coachIsActive === null
              ? null
              : { isActive: enrollment.coachIsActive },
        },
        now,
      ),
      paymentState: enrollment.paymentState,
      held: enrollment.held,
      settlementState: enrollment.settlementState,
      exportState: enrollment.exportState,
    });
  }
  for (const tag of tags) {
    const target = result.get(tag.memberId)!;
    if (tag.displayOrder > 20n) target.moreTags = true;
    else target.operationalTags.push(tag.tagLabel);
  }
  for (const trial of trials)
    result.get(trial.memberId)!.latestTrial = {
      title: trial.title,
      date: toDateOnlyString(trial.scheduledForDate),
      status: trial.status,
    };
  return result;
}

export type MemberDirectoryCursor = {
  fullName: string;
  id: string;
  filterHash: string;
};
const fingerprint = (filters: MemberDirectoryFilters) =>
  createHash("sha256").update(JSON.stringify(filters)).digest("hex");
export function encodeMemberDirectoryCursor(cursor: MemberDirectoryCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
export function decodeMemberDirectoryCursor(
  value: string | undefined,
  filters: MemberDirectoryFilters,
): MemberDirectoryCursor | null {
  if (!value) return null;
  try {
    if (value.length > 1500) throw new Error();
    const cursor = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as MemberDirectoryCursor;
    if (
      typeof cursor.fullName !== "string" ||
      cursor.fullName.length > 500 ||
      typeof cursor.id !== "string" ||
      !cursor.id ||
      cursor.id.length > 150 ||
      cursor.filterHash !== fingerprint(filters)
    )
      throw new Error();
    return cursor;
  } catch {
    throw new MemberDirectoryInputError(
      "These directory filters changed. Return to the first page.",
    );
  }
}
export async function readOwnerMemberDirectory(
  actor: StaffAccessActor,
  args: {
    filters: MemberDirectoryFilters;
    after?: string;
    now?: Date;
    pageSize?: number;
    db?: PrismaClient;
  },
) {
  const db = args.db ?? prisma,
    now = args.now ?? new Date(),
    limit = args.pageSize ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
    throw new MemberDirectoryInputError(
      "Choose a directory page size between 1 and 50.",
    );
  // Re-normalize at the domain boundary. Callers cannot smuggle an unsupported condition or label.
  const filters = parseMemberDirectoryFilters({
    q: args.filters.query,
    status: args.filters.profileLabel,
    archived: args.filters.archived ? "1" : "0",
    classProgram: args.filters.classProgram,
    coachingProgram: args.filters.coachingProgram,
    cohortLabel: args.filters.cohortLabel,
    operationalTag: args.filters.operationalTag,
    condition: args.filters.condition,
    forms: args.filters.forms,
  });
  const cursor = decodeMemberDirectoryCursor(args.after, filters);
  return db.$transaction(
    async (tx) => {
      await requireActiveStaffAccessTx(tx, { ...actor, capability: "OWNER" });
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: actor.workspaceId },
        select: { location: { select: { timezone: true } } },
      });
      if (!workspace.location)
        throw new Error(
          "Complete the business location before reading the directory.",
        );
      const { resolveWorkspaceClockTimezone } =
        await import("./workspace-timezones.js");
      const timezone = await resolveWorkspaceClockTimezone({
        workspaceId: actor.workspaceId,
        baselineTimezone: workspace.location.timezone,
        db: tx,
        now,
      });
      const AND: Prisma.MemberWhereInput[] = [
        buildMemberDirectoryWhere(actor.workspaceId, filters),
      ];
      if (filters.forms)
        AND.push(
          await buildRequiredFormsMemberFilterTx({
            db: tx,
            actor,
            state: filters.forms,
            now,
          }),
        );
      if (cursor)
        AND.push({
          OR: [
            { fullName: { gt: cursor.fullName } },
            { fullName: cursor.fullName, id: { gt: cursor.id } },
          ],
        });
      const rows = await tx.member.findMany({
        where: { AND },
        orderBy: [{ fullName: "asc" }, { id: "asc" }],
        take: limit + 1,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          archivedAt: true,
          tags: true,
          _count: { select: { familyLinks: true } },
        },
      });
      const hasMore = rows.length > limit;
      if (hasMore) rows.pop();
      const memberIds = rows.map((row) => row.id);
      const [services, forms] = await Promise.all([
        summarizeMemberServicesTx({ db: tx, actor, memberIds, timezone, now }),
        summarizeRequiredFormsForMembersTx({
          db: tx,
          actor,
          memberIds,
          now,
          includeUpcoming: true,
        }),
      ]);
      const last = rows.at(-1);
      return {
        members: rows.map((row) => ({
          ...row,
          services: services.get(row.id)!,
          forms: forms.get(row.id) as RequiredFormsMemberSummary,
        })),
        nextCursor:
          hasMore && last
            ? encodeMemberDirectoryCursor({
                fullName: last.fullName,
                id: last.id,
                filterHash: fingerprint(filters),
              })
            : null,
      };
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
}
/** Exact-owner profile panel: directory financial/contract summaries are not a coach, payer or household capability. */
export async function readOwnerMemberServiceSummary(
  actor: StaffAccessActor,
  memberId: string,
  options: { db?: PrismaClient; now?: Date } = {},
) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  return db.$transaction(
    async (tx) => {
      await requireActiveStaffAccessTx(tx, { ...actor, capability: "OWNER" });
      const member = await tx.member.findFirst({
        where: { id: memberId, workspaceId: actor.workspaceId },
        select: { id: true, archivedAt: true },
      });
      if (!member) return null;
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: actor.workspaceId },
        select: { location: { select: { timezone: true } } },
      });
      if (!workspace.location)
        throw new Error(
          "Complete the business location before reading service summaries.",
        );
      const { resolveWorkspaceClockTimezone } =
        await import("./workspace-timezones.js");
      const timezone = await resolveWorkspaceClockTimezone({
        workspaceId: actor.workspaceId,
        baselineTimezone: workspace.location.timezone,
        db: tx,
        now,
      });
      return {
        archived: !!member.archivedAt,
        services: (
          await summarizeMemberServicesTx({
            db: tx,
            actor,
            memberIds: [memberId],
            timezone,
            now,
          })
        ).get(memberId)!,
      };
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
}
