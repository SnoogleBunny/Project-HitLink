import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import {
  classOccurrenceInclude,
  lockClassSchedule,
  resolveClassOccurrence,
} from "./class-occurrences.js";
import {
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  toDateOnlyString,
} from "./occurrences.js";
import { resolveWorkspaceClockTimezone } from "./workspace-timezones.js";
import { evaluateClassPrerequisites } from "./program-progress-policy.js";
import {
  lockStaffAuthorityTx,
  normalizeAuthoritySerializationError,
} from "./staff-access.js";

export class MemberProfileError extends Error {}
export interface MemberProfileActor {
  workspaceId: string;
  userId: string;
  occurrence?: { classTemplateId: string; date: string };
}
type Tx = Prisma.TransactionClient;
type Options = { db?: PrismaClient; now?: Date };
export interface MemberBasicsInput {
  fullName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
}
export interface EmergencyContactInput {
  fullName: string;
  relationshipLabel?: string;
  phone: string;
  email?: string;
}
const fail = (message: string): never => {
  throw new MemberProfileError(message);
};
const denied = () =>
  fail(
    "These emergency contacts are unavailable for this account. Ask the gym to review your access.",
  );
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function text(value: string | undefined, max: number, field: string) {
  const result = value?.trim() ?? "";
  if (result.length > max) fail(`${field} must be ${max} characters or fewer.`);
  return result || null;
}
function email(value: string | undefined) {
  const result = text(value, 254, "Email")?.toLowerCase() ?? null;
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    fail("Enter a valid contact email address.");
  return result;
}
function phone(value: string | undefined, required = false) {
  const result = text(value, 60, "Phone");
  if (
    (required && !result) ||
    (result &&
      (!/^[+\d\s().#x/-]+$/i.test(result) ||
        result.replace(/\D/g, "").length < 3))
  )
    fail("Enter a usable contact phone number.");
  return result;
}
export function validateMemberBasics(input: MemberBasicsInput, today: string) {
  const fullName = text(input.fullName, 200, "Full name");
  if (!fullName) fail("Member full name is required.");
  const birth = text(input.dateOfBirth, 10, "Date of birth");
  let dateOfBirth: Date | null = null;
  if (birth) {
    dateOfBirth = new Date(`${birth}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(birth) ||
      !Number.isFinite(+dateOfBirth) ||
      toDateOnlyString(dateOfBirth) !== birth ||
      birth > today
    )
      fail("Enter a valid date of birth that is not in the future.");
  }
  return {
    fullName: fullName!,
    email: email(input.email),
    phone: phone(input.phone),
    dateOfBirth,
  };
}
export function validateEmergencyContact(input: EmergencyContactInput) {
  const fullName = text(input.fullName, 200, "Emergency contact name");
  if (!fullName) fail("Emergency contact name is required.");
  return {
    fullName: fullName!,
    relationshipLabel: text(input.relationshipLabel, 100, "Relationship"),
    phone: phone(input.phone, true)!,
    email: email(input.email),
  };
}
function request(
  input: { operationId: string; expectedVersion?: number; reason?: string },
  correction: boolean,
) {
  if (!/^[a-zA-Z0-9:_-]{16,150}$/.test(input.operationId))
    fail("Reload this page before saving the member.");
  if (
    input.expectedVersion !== undefined &&
    (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
  )
    fail("Reload this member before saving changes.");
  const reason = text(input.reason, 500, "Correction reason");
  if (correction && (!reason || reason.length < 5))
    fail("Explain the change using 5 to 500 characters.");
  return reason;
}
export function isAdultMember(dateOfBirth: Date | null, today: string) {
  if (!dateOfBirth) return false;
  const [year, month, day] = today.split("-").map(Number);
  const age =
    year! -
    dateOfBirth.getUTCFullYear() -
    (month! < dateOfBirth.getUTCMonth() + 1 ||
    (month === dateOfBirth.getUTCMonth() + 1 && day! < dateOfBirth.getUTCDate())
      ? 1
      : 0);
  return age >= 18;
}
async function lock(tx: Tx, workspaceId: string) {
  await lockClassSchedule(tx, workspaceId);
  await tx.$queryRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1))::text",
    `family-access:${workspaceId}`,
  );
}
async function actorRow(tx: Tx, actor: MemberProfileActor) {
  await lockStaffAuthorityTx(tx, actor);
  const row = await tx.workspaceUser.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      isActive: true,
      workspace: { status: { not: "DISABLED" } },
    },
    include: {
      user: { select: { fullName: true, email: true } },
      workspace: { select: { location: { select: { timezone: true } } } },
    },
  });
  return row ?? denied();
}
async function todayFor(
  tx: Tx,
  staff: Awaited<ReturnType<typeof actorRow>>,
  now: Date,
) {
  const timezone = await resolveWorkspaceClockTimezone({
    workspaceId: staff.workspaceId,
    baselineTimezone: staff.workspace.location?.timezone ?? "UTC",
    db: tx,
    now,
  });
  return getWorkspaceDateString(now, timezone);
}
const memberSelect = {
  id: true,
  workspaceId: true,
  userId: true,
  fullName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
  profileVersion: true,
  archivedAt: true,
} as const;
async function memberRow(tx: Tx, workspaceId: string, memberId: string) {
  try {
    await tx.$queryRaw`
      SELECT "id" FROM "members"
      WHERE "workspaceId" = ${workspaceId} AND "id" = ${memberId} FOR SHARE
    `;
  } catch (error) {
    throw normalizeAuthoritySerializationError(error);
  }
  return (
    (await tx.member.findFirst({
      where: { id: memberId, workspaceId },
      select: memberSelect,
    })) ?? denied()
  );
}

/** Caller must hold schedule then family-access locks, including download checks. */
export async function authorizeMemberEmergencyContactsTx(
  tx: Tx,
  actor: MemberProfileActor,
  memberId: string,
  options: { intent?: "READ" | "MANAGE"; now?: Date } = {},
) {
  const staff = await actorRow(tx, actor),
    member = await memberRow(tx, actor.workspaceId, memberId);
  const today = await todayFor(tx, staff, options.now ?? new Date());
  if (staff.role === "OWNER") return { staff, member, canEdit: true };
  if (
    staff.role === "COACH" &&
    options.intent !== "MANAGE" &&
    actor.occurrence &&
    /^\d{4}-\d{2}-\d{2}$/.test(actor.occurrence.date)
  ) {
    const template = await tx.classTemplate.findFirst({
      where: {
        id: actor.occurrence.classTemplateId,
        workspaceId: actor.workspaceId,
      },
      include: classOccurrenceInclude,
    });
    const occurrence =
      template &&
      resolveClassOccurrence({
        template,
        scheduledForDate: actor.occurrence.date,
      });
    const booking =
      occurrence &&
      occurrence.coachWorkspaceUserId === staff.id &&
      (await tx.classBooking.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          memberId: member.id,
          classTemplateId: template!.id,
          scheduledForDate: new Date(`${actor.occurrence.date}T00:00:00.000Z`),
          status: { in: ["BOOKED", "ATTENDED", "ABSENT", "NO_SHOW"] },
        },
        select: { id: true },
      }));
    if (booking) return { staff, member, canEdit: false };
  }
  if (staff.role !== "CUSTOMER") return denied();
  if (
    member.userId === actor.userId &&
    isAdultMember(member.dateOfBirth, today)
  )
    return { staff, member, canEdit: true };
  if (!member.dateOfBirth || isAdultMember(member.dateOfBirth, today))
    return denied();
  try {
    // Grant bits/revocation and the verified family relationship can change
    // while the advisory locks are waited. Lock their exact identities before
    // filtering active authority, so an older snapshot retries then denies.
    await tx.$queryRaw`
      SELECT "id" FROM "member_portal_grants"
      WHERE "workspaceId" = ${actor.workspaceId} AND "userId" = ${actor.userId}
        AND "memberId" = ${member.id} FOR SHARE
    `;
    await tx.$queryRaw`
      SELECT f."id" FROM "family_links" f
      JOIN "member_portal_grants" g
        ON g."workspaceId" = f."workspaceId" AND g."guardianId" = f."guardianId"
      WHERE g."workspaceId" = ${actor.workspaceId} AND g."userId" = ${actor.userId}
        AND g."memberId" = ${member.id} AND f."childMemberId" = ${member.id}
      FOR SHARE OF f
    `;
  } catch (error) {
    throw normalizeAuthoritySerializationError(error);
  }
  const grant = await tx.memberPortalGrant.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      memberId: member.id,
      revokedAt: null,
      canManageEmergencyContacts: true,
      guardian: {
        workspaceId: actor.workspaceId,
        familyLinks: {
          some: { workspaceId: actor.workspaceId, childMemberId: member.id },
        },
      },
    },
    select: { id: true, verifiedAt: true },
  });
  if (!grant?.verifiedAt) return denied();
  return { staff, member, canEdit: true };
}
const contactSelect = {
  id: true,
  fullName: true,
  relationshipLabel: true,
  phone: true,
  email: true,
  retiredAt: true,
  version: true,
} as const;
function basicsSnapshot(member: {
  fullName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
}) {
  return {
    fullName: member.fullName,
    email: member.email,
    phone: member.phone,
    dateOfBirth: member.dateOfBirth
      ? toDateOnlyString(member.dateOfBirth)
      : null,
  };
}
async function previous(
  tx: Tx,
  actor: MemberProfileActor,
  operationId: string,
  inputHash: string,
  memberId?: string,
) {
  const event = await tx.memberProfileEvent.findUnique({
    where: {
      workspaceId_operationId: { workspaceId: actor.workspaceId, operationId },
    },
  });
  if (!event) return null;
  if (
    event.actorUserId !== actor.userId ||
    event.inputHash !== inputHash ||
    (memberId && event.memberId !== memberId)
  )
    fail(
      "This save request was already used for a different change. Reload the page.",
    );
  return {
    memberId: event.memberId,
    profileVersion: event.profileVersion,
    contactId: event.emergencyContactId,
  };
}
async function event(
  tx: Tx,
  args: {
    actor: MemberProfileActor;
    staff: Awaited<ReturnType<typeof actorRow>>;
    memberId: string;
    contactId?: string;
    operationId: string;
    inputHash: string;
    kind: string;
    profileVersion: number;
    before: unknown;
    after: unknown;
    reason: string | null;
  },
) {
  await tx.memberProfileEvent.create({
    data: {
      workspaceId: args.actor.workspaceId,
      memberId: args.memberId,
      emergencyContactId: args.contactId,
      actorUserId: args.actor.userId,
      actorWorkspaceUserId: args.staff.id,
      actorNameSnapshot: args.staff.user.fullName ?? args.staff.user.email,
      actorRoleSnapshot: args.staff.role,
      operationId: args.operationId,
      inputHash: args.inputHash,
      kind: args.kind,
      profileVersion: args.profileVersion,
      before: json(args.before),
      after: json(args.after),
      reason: args.reason,
    },
  });
}
async function command<T>(
  db: PrismaClient,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        timeout: 20_000,
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

export async function createMemberProfile(
  actor: MemberProfileActor,
  input: MemberBasicsInput & { operationId: string },
  options: Options = {},
) {
  request(input, false);
  return command(options.db ?? prisma, async (tx) => {
    await lock(tx, actor.workspaceId);
    const staff = await actorRow(tx, actor);
    if (staff.role !== "OWNER")
      fail("Only an active owner can create member profiles.");
    const value = validateMemberBasics(
      input,
      await todayFor(tx, staff, options.now ?? new Date()),
    );
    const inputHash = hash({
      kind: "MEMBER_CREATED",
      value: basicsSnapshot(value),
    });
    const replay = await previous(tx, actor, input.operationId, inputHash);
    if (replay) return replay;
    const member = await tx.member.create({
      data: {
        workspaceId: actor.workspaceId,
        ...value,
        profileVersion: 1,
        status: "TRIAL",
      },
    });
    await event(tx, {
      actor,
      staff,
      memberId: member.id,
      operationId: input.operationId,
      inputHash,
      kind: "MEMBER_CREATED",
      profileVersion: 1,
      before: {},
      after: basicsSnapshot(member),
      reason: null,
    });
    return { memberId: member.id, profileVersion: 1, contactId: null };
  });
}

async function validateBirthChange(
  tx: Tx,
  actor: MemberProfileActor,
  member: Awaited<ReturnType<typeof memberRow>>,
  dateOfBirth: Date | null,
  now: Date,
  today: string,
) {
  if (
    member.dateOfBirth?.getTime() === dateOfBirth?.getTime() ||
    (!member.dateOfBirth && !dateOfBirth)
  )
    return;
  if (
    isAdultMember(member.dateOfBirth, today) !==
    isAdultMember(dateOfBirth, today)
  ) {
    const [grants, coaching] = await Promise.all([
      tx.memberPortalGrant.count({
        where: {
          workspaceId: actor.workspaceId,
          memberId: member.id,
          revokedAt: null,
        },
      }),
      tx.coachingEnrollment.count({
        where: {
          workspaceId: actor.workspaceId,
          memberId: member.id,
          closedAt: null,
        },
      }),
    ]);
    if (grants || coaching)
      fail(
        "This birth date changes adult or guardian authority. Resolve current family grants and coaching service before correcting it.",
      );
  }
  // The current business clock can be two calendar dates ahead of a future
  // occurrence retained in its original zone. Only the exact instant below
  // decides whether a booking is past; this bound just narrows candidates.
  const candidateFrom = new Date(`${today}T00:00:00.000Z`);
  candidateFrom.setUTCDate(candidateFrom.getUTCDate() - 2);
  const bookings = await tx.classBooking.findMany({
    where: {
      workspaceId: actor.workspaceId,
      memberId: member.id,
      status: { in: ["BOOKED", "PENDING_PAYMENT"] },
      scheduledForDate: { gte: candidateFrom },
    },
    include: { classTemplate: { include: classOccurrenceInclude } },
    take: 1001,
  });
  if (bookings.length > 1000)
    fail(
      "This member needs a larger booking review before changing the birth date.",
    );
  for (const booking of bookings) {
    const date = toDateOnlyString(booking.scheduledForDate),
      occurrence = resolveClassOccurrence({
        template: booking.classTemplate,
        scheduledForDate: date,
      });
    if (!occurrence || occurrence.status !== "ACTIVE") continue;
    if (
      getZonedDateTimeAsUtc({
        dateString: date,
        minutes: occurrence.startTimeMinutes,
        timezone: occurrence.timezone ?? "UTC",
      }) <= now
    )
      continue;
    const promotion = await tx.programPromotion.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        memberId: member.id,
        programId: occurrence.programId,
        effectiveOn: { lte: booking.scheduledForDate },
      },
      orderBy: [{ effectiveOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    const record = await tx.member.findUniqueOrThrow({
      where: { id: member.id },
      select: { tags: true },
    });
    const outcome = evaluateClassPrerequisites({
      policy: occurrence.program.rankPolicy,
      rules: occurrence.prerequisites,
      date,
      dateOfBirth,
      tags: record.tags,
      rank: promotion,
    });
    if (!outcome.eligible)
      fail(
        `This birth date affects the booked class on ${date}. Resolve that booking and its eligibility before saving.`,
      );
  }
}

export async function updateMemberProfile(
  actor: MemberProfileActor,
  input: MemberBasicsInput & {
    memberId: string;
    expectedVersion: number;
    operationId: string;
    reason: string;
  },
  options: Options = {},
) {
  const reason = request(input, true),
    now = options.now ?? new Date();
  return command(options.db ?? prisma, async (tx) => {
    await lock(tx, actor.workspaceId);
    const staff = await actorRow(tx, actor);
    if (staff.role !== "OWNER")
      fail("Only an active owner can edit member profiles.");
    const member = await memberRow(tx, actor.workspaceId, input.memberId);
    const today = await todayFor(tx, staff, now),
      value = validateMemberBasics(input, today);
    const inputHash = hash({
      kind: "MEMBER_PROFILE_UPDATED",
      memberId: member.id,
      expectedVersion: input.expectedVersion,
      value: basicsSnapshot(value),
      reason,
    });
    const replay = await previous(
      tx,
      actor,
      input.operationId,
      inputHash,
      member.id,
    );
    if (replay) return replay;
    if (member.profileVersion !== input.expectedVersion)
      fail(
        "This member changed. Reload and review the current details before saving.",
      );
    await validateBirthChange(tx, actor, member, value.dateOfBirth, now, today);
    const profileVersion = member.profileVersion + 1;
    await tx.member.update({
      where: { id: member.id },
      data: { ...value, profileVersion },
    });
    await event(tx, {
      actor,
      staff,
      memberId: member.id,
      operationId: input.operationId,
      inputHash,
      kind: "MEMBER_PROFILE_UPDATED",
      profileVersion,
      before: basicsSnapshot(member),
      after: basicsSnapshot(value),
      reason,
    });
    return { memberId: member.id, profileVersion, contactId: null };
  });
}

export async function getMemberEmergencyProfile(
  actor: MemberProfileActor,
  memberId: string,
  options: Options = {},
) {
  return command(options.db ?? prisma, async (tx) => {
    await lock(tx, actor.workspaceId);
    const access = await authorizeMemberEmergencyContactsTx(
      tx,
      actor,
      memberId,
      { now: options.now },
    );
    const contacts = await tx.memberEmergencyContact.findMany({
      where: { workspaceId: actor.workspaceId, memberId, retiredAt: null },
      select: contactSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return {
      memberId: access.member.id,
      memberName: access.member.fullName,
      profileVersion: access.member.profileVersion,
      canEdit: access.canEdit,
      contacts,
    };
  });
}

export async function getRosterEmergencyContacts(
  actor: MemberProfileActor & {
    occurrence: { classTemplateId: string; date: string };
  },
  options: Options = {},
) {
  return command(options.db ?? prisma, async (tx) => {
    await lock(tx, actor.workspaceId);
    const staff = await actorRow(tx, actor);
    if (!["OWNER", "COACH"].includes(staff.role)) return denied();
    const template = await tx.classTemplate.findFirst({
      where: {
        id: actor.occurrence.classTemplateId,
        workspaceId: actor.workspaceId,
      },
      include: classOccurrenceInclude,
    });
    const occurrence =
      template &&
      resolveClassOccurrence({
        template,
        scheduledForDate: actor.occurrence.date,
      });
    if (
      !occurrence ||
      (staff.role === "COACH" && occurrence.coachWorkspaceUserId !== staff.id)
    )
      return denied();
    const bookings = await tx.classBooking.findMany({
      where: {
        workspaceId: actor.workspaceId,
        classTemplateId: template!.id,
        scheduledForDate: new Date(`${actor.occurrence.date}T00:00:00.000Z`),
        status: { in: ["BOOKED", "ATTENDED", "ABSENT", "NO_SHOW"] },
      },
      select: { memberId: true },
    });
    return tx.memberEmergencyContact.findMany({
      where: {
        workspaceId: actor.workspaceId,
        memberId: { in: bookings.map((booking) => booking.memberId) },
        retiredAt: null,
      },
      select: {
        memberId: true,
        fullName: true,
        phone: true,
        email: true,
        relationshipLabel: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });
}

export async function changeMemberEmergencyContact(
  actor: MemberProfileActor,
  input: {
    memberId: string;
    contactId?: string;
    expectedVersion: number;
    expectedContactVersion?: number;
    operationId: string;
    operation: "ADD" | "UPDATE" | "RETIRE";
    reason?: string;
  } & Partial<EmergencyContactInput>,
  options: Options = {},
) {
  if (!["ADD", "UPDATE", "RETIRE"].includes(input.operation))
    fail("Choose an emergency contact change.");
  const reason = request(input, input.operation !== "ADD"),
    now = options.now ?? new Date();
  const value =
    input.operation === "RETIRE"
      ? null
      : validateEmergencyContact({
          fullName: input.fullName ?? "",
          phone: input.phone ?? "",
          relationshipLabel: input.relationshipLabel,
          email: input.email,
        });
  return command(options.db ?? prisma, async (tx) => {
    await lock(tx, actor.workspaceId);
    const { staff, member } = await authorizeMemberEmergencyContactsTx(
      tx,
      actor,
      input.memberId,
      { intent: "MANAGE", now },
    );
    const inputHash = hash({
      kind: input.operation,
      memberId: member.id,
      contactId: input.contactId ?? null,
      expectedVersion: input.expectedVersion,
      expectedContactVersion: input.expectedContactVersion ?? null,
      value,
      reason,
    });
    const replay = await previous(
      tx,
      actor,
      input.operationId,
      inputHash,
      member.id,
    );
    if (replay) return replay;
    if (member.profileVersion !== input.expectedVersion)
      fail(
        "This member changed. Reload and review the current details before saving.",
      );
    const contact =
      input.operation === "ADD"
        ? null
        : await tx.memberEmergencyContact.findFirst({
            where: {
              id: input.contactId,
              workspaceId: actor.workspaceId,
              memberId: member.id,
            },
            select: contactSelect,
          });
    if (
      input.operation !== "ADD" &&
      (!input.contactId ||
        !contact ||
        contact.retiredAt ||
        contact.version !== input.expectedContactVersion)
    )
      fail(
        "This contact changed. Reload and review the current emergency information.",
      );
    const next =
      input.operation === "ADD"
        ? await tx.memberEmergencyContact.create({
            data: {
              workspaceId: actor.workspaceId,
              memberId: member.id,
              ...value!,
            },
            select: contactSelect,
          })
        : await tx.memberEmergencyContact.update({
            where: { id: contact!.id },
            data:
              input.operation === "RETIRE"
                ? { retiredAt: now, version: { increment: 1 } }
                : { ...value!, version: { increment: 1 } },
            select: contactSelect,
          });
    const profileVersion = member.profileVersion + 1;
    await tx.member.update({
      where: { id: member.id },
      data: { profileVersion },
    });
    await event(tx, {
      actor,
      staff,
      memberId: member.id,
      contactId: next.id,
      operationId: input.operationId,
      inputHash,
      kind:
        input.operation === "ADD"
          ? "EMERGENCY_CONTACT_ADDED"
          : input.operation === "UPDATE"
            ? "EMERGENCY_CONTACT_UPDATED"
            : "EMERGENCY_CONTACT_RETIRED",
      profileVersion,
      before: contact ?? {},
      after: next,
      reason,
    });
    return { memberId: member.id, profileVersion, contactId: next.id };
  });
}

export async function getMemberProfileHistory(
  actor: MemberProfileActor,
  memberId: string,
  options: Options = {},
) {
  return command(options.db ?? prisma, async (tx) => {
    await lock(tx, actor.workspaceId);
    const staff = await actorRow(tx, actor);
    if (staff.role !== "OWNER")
      fail("Only an active owner can view member profile history.");
    await memberRow(tx, actor.workspaceId, memberId);
    return tx.memberProfileEvent.findMany({
      where: { workspaceId: actor.workspaceId, memberId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        kind: true,
        actorNameSnapshot: true,
        actorRoleSnapshot: true,
        profileVersion: true,
        before: true,
        after: true,
        reason: true,
        createdAt: true,
      },
    });
  });
}
