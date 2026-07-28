import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import {
  Prisma,
  prisma,
  type ImportJobStatus,
  type ImportRecordKind,
  type MigrationStage,
  type MemberMembershipStatus,
  type MemberStatus,
  type Weekday,
} from "@flowstate/db";
import { isMigrationCorrectionChannelAvailable } from "./migration-correction-channel";

type MigrationDatabase = typeof prisma;

export const migrationStages: MigrationStage[] = [
  "INTAKE_RECEIVED",
  "EXPORTS_NEEDED",
  "MIGRATION_IN_PROGRESS",
  "REVIEW_READY",
  "GO_LIVE_SCHEDULED",
  "COMPLETE",
];

export const migrationDataScopeOptions = [
  "Members and contact details",
  "Guardians and family links",
  "Memberships and billing status",
  "Punch-card balances",
  "Drop-in products",
  "Programs and weekly schedule",
  "Forms and waivers",
  "Historical billing records",
  "Attendance history",
] as const;

export const migrationRecordKindOptions: Array<{
  value: ImportRecordKind;
  label: string;
  description: string;
}> = [
  {
    value: "MEMBER",
    label: "Members and guardians",
    description: "Creates member profiles and optional guardian family links.",
  },
  {
    value: "MEMBERSHIP_PLAN",
    label: "Membership plans",
    description: "Creates recurring membership plan records.",
  },
  {
    value: "MEMBER_MEMBERSHIP",
    label: "Current memberships",
    description: "Assigns imported members to imported membership plans.",
  },
  {
    value: "PUNCH_CARD_BALANCE",
    label: "Punch-card balances",
    description: "Creates punch-card products and member punch balances.",
  },
  {
    value: "DROP_IN_PRODUCT",
    label: "Drop-in products",
    description: "Creates enabled drop-in products.",
  },
  {
    value: "SCHEDULE_TEMPLATE",
    label: "Weekly schedule",
    description: "Creates programs, rooms, and recurring class templates.",
  },
  {
    value: "BILLING_HISTORY",
    label: "Historical billing",
    description: "Stages historical billing for review only in this version.",
  },
  {
    value: "ATTENDANCE",
    label: "Attendance history",
    description:
      "Stages old attendance records for review only in this version.",
  },
  {
    value: "NOTE",
    label: "Notes",
    description: "Stages historical notes for review only in this version.",
  },
];

const productionImportKinds = new Set<ImportRecordKind>([
  "MEMBER",
  "MEMBERSHIP_PLAN",
  "MEMBER_MEMBERSHIP",
  "PUNCH_CARD_BALANCE",
  "DROP_IN_PRODUCT",
  "SCHEDULE_TEMPLATE",
]);

const defaultNextOwnerAction =
  "Share export access or handoff instructions so Flowstate can prepare your migration service.";
const defaultFlowstateResponsibility =
  "Flowstate will collect exports, stage records, validate the import, reconcile issues, and coordinate go-live.";
const defaultExpectedMilestone =
  "Flowstate will confirm the migration review schedule after access or exports are received.";

type MigrationResultAttempt = {
  status: ImportJobStatus;
  reconciliationReports: ReadonlyArray<{ summary: unknown }>;
};

export type OwnerMigrationResultsProjection =
  | { status: "results-in-progress" }
  | {
      status: "ready";
      recordsAdded: number;
      recordsUpdated: number;
      recordsNotImported: number;
      earlierIncompleteAttemptCount: number;
    }
  | { status: "no-results-recorded" }
  | { status: "needs-flowstate-review" };

function normalizedMigrationResultSummary(value: unknown): {
  created: number;
  updated: number;
  skipped: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const { created, updated, skipped } = value as Record<string, unknown>;

  if (
    !Number.isSafeInteger(created) ||
    !Number.isSafeInteger(updated) ||
    !Number.isSafeInteger(skipped) ||
    (created as number) < 0 ||
    (updated as number) < 0 ||
    (skipped as number) < 0
  ) {
    return null;
  }

  return {
    created: created as number,
    updated: updated as number,
    skipped: skipped as number,
  };
}

export function projectOwnerMigrationResults(input: {
  migrationStage: MigrationStage | null;
  attempts: ReadonlyArray<MigrationResultAttempt>;
}): OwnerMigrationResultsProjection {
  if (
    input.attempts.some(
      (attempt) =>
        attempt.status !== "COMPLETED" &&
        attempt.status !== "FAILED" &&
        attempt.status !== "CANCELLED",
    )
  ) {
    return { status: "results-in-progress" };
  }

  if (!input.migrationStage && input.attempts.length > 0) {
    return { status: "needs-flowstate-review" };
  }

  let earlierIncompleteAttemptCount = 0;
  let completedAttemptCount = 0;
  let recordedSummaryCount = 0;
  const totals = {
    recordsAdded: 0,
    recordsUpdated: 0,
    recordsNotImported: 0,
  };

  for (const attempt of input.attempts) {
    if (attempt.status === "FAILED" || attempt.status === "CANCELLED") {
      earlierIncompleteAttemptCount += 1;
      continue;
    }

    if (attempt.status !== "COMPLETED") {
      continue;
    }

    completedAttemptCount += 1;
    const report = attempt.reconciliationReports[0];

    if (!report) {
      continue;
    }

    recordedSummaryCount += 1;
    const summary = normalizedMigrationResultSummary(report.summary);

    if (!summary) {
      return { status: "needs-flowstate-review" };
    }

    const nextRecordsAdded = totals.recordsAdded + summary.created;
    const nextRecordsUpdated = totals.recordsUpdated + summary.updated;
    const nextRecordsNotImported = totals.recordsNotImported + summary.skipped;

    if (
      !Number.isSafeInteger(nextRecordsAdded) ||
      !Number.isSafeInteger(nextRecordsUpdated) ||
      !Number.isSafeInteger(nextRecordsNotImported)
    ) {
      return { status: "needs-flowstate-review" };
    }

    totals.recordsAdded = nextRecordsAdded;
    totals.recordsUpdated = nextRecordsUpdated;
    totals.recordsNotImported = nextRecordsNotImported;
  }

  if (recordedSummaryCount === 0) {
    return input.migrationStage === "COMPLETE"
      ? { status: "no-results-recorded" }
      : { status: "results-in-progress" };
  }

  if (recordedSummaryCount !== completedAttemptCount) {
    return { status: "needs-flowstate-review" };
  }

  return {
    status: "ready",
    ...totals,
    earlierIncompleteAttemptCount,
  };
}

export type MigrationScheduleFailureReason =
  | "schedule-missing"
  | "schedule-passed"
  | "launch-timezone-invalid";

export type MigrationScheduleClassification =
  | { status: "current"; scheduledDateKey: string; localDateKey: string }
  | { status: "invalid"; reason: MigrationScheduleFailureReason };

function storedDateOnlyKey(value: Date | null): string | null {
  if (!value || Number.isNaN(value.getTime())) {
    return null;
  }

  return [
    value.getUTCFullYear().toString().padStart(4, "0"),
    (value.getUTCMonth() + 1).toString().padStart(2, "0"),
    value.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function localDateKey(value: Date, timezone: string | null): string | null {
  if (!timezone?.trim() || Number.isNaN(value.getTime())) {
    return null;
  }

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      calendar: "iso8601",
      day: "2-digit",
      month: "2-digit",
      numberingSystem: "latn",
      timeZone: timezone,
      year: "numeric",
    }).formatToParts(value);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get("year");
    const month = values.get("month");
    const day = values.get("day");

    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

export function classifyMigrationSchedule(args: {
  goLiveScheduledFor: Date | null;
  launchTimezone: string | null;
  now: Date;
}): MigrationScheduleClassification {
  const todayKey = localDateKey(args.now, args.launchTimezone);

  if (!todayKey) {
    return { status: "invalid", reason: "launch-timezone-invalid" };
  }

  const scheduledDateKey = storedDateOnlyKey(args.goLiveScheduledFor);

  if (!scheduledDateKey) {
    return { status: "invalid", reason: "schedule-missing" };
  }

  return scheduledDateKey < todayKey
    ? { status: "invalid", reason: "schedule-passed" }
    : { status: "current", scheduledDateKey, localDateKey: todayKey };
}

function classifyAcknowledgedSchedule(args: {
  goLiveScheduledFor: Date | null;
  launchTimezone: string | null;
  ownerReviewAcknowledgedAt: Date;
}): MigrationScheduleClassification {
  const acknowledgmentDateKey = localDateKey(
    args.ownerReviewAcknowledgedAt,
    args.launchTimezone,
  );

  if (!acknowledgmentDateKey) {
    return { status: "invalid", reason: "launch-timezone-invalid" };
  }

  const scheduledDateKey = storedDateOnlyKey(args.goLiveScheduledFor);

  if (!scheduledDateKey) {
    return { status: "invalid", reason: "schedule-missing" };
  }

  return scheduledDateKey < acknowledgmentDateKey
    ? { status: "invalid", reason: "schedule-passed" }
    : {
        status: "current",
        scheduledDateKey,
        localDateKey: acknowledgmentDateKey,
      };
}

interface OwnerReviewPresentationInput {
  migration: {
    stage: MigrationStage;
    workspaceStatus: string;
    goLiveScheduledFor?: Date | null;
    launchTimezone?: string | null;
    ownerReviewAcknowledgedAt: Date | null;
    ownerReviewAcknowledgedByUserId: string | null;
    operationallyReadyAt: Date | null;
    operationallyReadyByUserId: string | null;
  } | null;
  now?: Date;
  blockingValidationIssueCount: number;
  unresolvedJobCount: number;
}

export type OwnerReviewPresentation =
  | { status: "unavailable"; reason?: MigrationScheduleFailureReason }
  | { status: "eligible" }
  | {
      status: "blocked";
      blockingValidationIssueCount: number;
      unresolvedJobCount: number;
    }
  | { status: "acknowledged" };

export function getOwnerReviewPresentation(
  input: OwnerReviewPresentationInput,
): OwnerReviewPresentation {
  const { migration } = input;

  if (!migration) {
    return { status: "unavailable" };
  }

  if (
    migration.stage === "COMPLETE" &&
    migration.workspaceStatus === "ACTIVE" &&
    migration.ownerReviewAcknowledgedAt &&
    migration.ownerReviewAcknowledgedByUserId?.trim() &&
    migration.operationallyReadyAt &&
    migration.operationallyReadyByUserId?.trim()
  ) {
    return { status: "acknowledged" };
  }

  if (
    migration.stage !== "GO_LIVE_SCHEDULED" ||
    migration.workspaceStatus !== "SETUP_INCOMPLETE" ||
    migration.operationallyReadyAt ||
    migration.operationallyReadyByUserId
  ) {
    return { status: "unavailable" };
  }

  if (
    migration.ownerReviewAcknowledgedAt &&
    migration.ownerReviewAcknowledgedByUserId?.trim()
  ) {
    return { status: "acknowledged" };
  }

  if (
    migration.ownerReviewAcknowledgedAt ||
    migration.ownerReviewAcknowledgedByUserId?.trim()
  ) {
    return { status: "unavailable" };
  }

  const schedule = classifyMigrationSchedule({
    goLiveScheduledFor: migration.goLiveScheduledFor ?? null,
    launchTimezone: migration.launchTimezone ?? null,
    now: input.now ?? new Date(),
  });

  if (schedule.status === "invalid") {
    return { status: "unavailable", reason: schedule.reason };
  }

  if (input.blockingValidationIssueCount > 0 || input.unresolvedJobCount > 0) {
    return {
      status: "blocked",
      blockingValidationIssueCount: input.blockingValidationIssueCount,
      unresolvedJobCount: input.unresolvedJobCount,
    };
  }

  return { status: "eligible" };
}

function activeBlockingValidationIssueWhere(workspaceId: string) {
  return {
    severity: "ERROR" as const,
    importJob: {
      workspaceId,
      NOT: {
        status: "CANCELLED" as const,
        cancelledAt: { not: null },
        cancelledByOperatorId: { not: null },
        cancellationReason: { not: null },
      },
    },
  };
}

function unresolvedImportJobWhere(workspaceId: string) {
  return {
    workspaceId,
    NOT: {
      OR: [
        {
          status: "COMPLETED" as const,
          reconciliationReports: { some: {} },
        },
        {
          status: "CANCELLED" as const,
          cancelledAt: { not: null },
          cancelledByOperatorId: { not: null },
          cancellationReason: { not: null },
        },
      ],
    },
  };
}

export interface MigrationIntakeInput {
  currentSoftware?: string;
  targetGoLiveDate?: string;
  memberCountEstimate?: string;
  billingStatus?: string;
  scheduleComplexity?: string;
  formsAndWaivers?: string;
  dataScope?: string[];
  accessInstructions?: string;
}

export interface MigrationUploadInput {
  recordKind: string;
  fileName: string;
  mimeType?: string | null;
  fileSizeBytes: number;
  fileData: Uint8Array;
}

export interface StageTransitionInput {
  stage: string;
  nextOwnerAction?: string;
  flowstateResponsibility?: string;
  expectedNextMilestone?: string;
  expectedNextMilestoneAt?: string;
  goLiveScheduledFor?: string;
}

export type MigrationReadinessActor =
  | {
      type: "FLOWSTATE_OPERATOR";
      actorId: string;
    }
  | {
      type: "WORKSPACE_USER";
      actorId: string;
      role: "OWNER" | "COACH" | "CUSTOMER";
    };

const internalMigrationOperationError = {
  status: "error" as const,
  message:
    "Only an authorized Flowstate operator can run migration operations.",
};

type MutationResult =
  | {
      status: "ok";
      message?: string;
    }
  | {
      status: "error";
      message: string;
      reason?:
        | MigrationScheduleFailureReason
        | "correction-channel-unavailable";
    };

function getFlowstateOperatorId(actor: MigrationReadinessActor): string | null {
  if (actor.type !== "FLOWSTATE_OPERATOR") {
    return null;
  }

  return cleanNullable(actor.actorId);
}

function isPrismaSerializationConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

async function runSerializableWithRetry<T>(
  db: MigrationDatabase,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (!isPrismaSerializationConflict(error) || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error("Unreachable migration transaction retry state.");
}

interface StagedRow {
  externalId: string | null;
  mappedData: Prisma.JsonObject;
  rawData: Prisma.JsonObject;
  issues: Array<{
    severity: "INFO" | "WARNING" | "ERROR";
    code: string;
    message: string;
    fieldName?: string;
  }>;
}

interface ImportedIdentity {
  id: string;
  importedRecordId: string;
  importedModel: string;
}

function cleanNullable(value: string | undefined | null): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function parseDateOnly(value: string | undefined | null): Date | null {
  const dateString = cleanNullable(value);

  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return null;
  }

  const parsed = new Date(`${dateString}T00:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOptionalDateTime(value: string | undefined | null): Date | null {
  const text = cleanNullable(value);

  if (!text) {
    return null;
  }

  const parsed = new Date(text);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOptionalPositiveInt(
  value: string | undefined | null,
): number | null {
  const text = cleanNullable(value);

  if (!text) {
    return null;
  }

  const parsed = Number.parseInt(text, 10);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseRequiredInt(
  value: string | undefined,
  fieldName: string,
  issues: StagedRow["issues"],
): number | null {
  const parsed = parseOptionalPositiveInt(value);

  if (parsed === null) {
    issues.push({
      severity: "ERROR",
      code: "INVALID_NUMBER",
      message: `${fieldName} must be a whole number greater than or equal to 0.`,
      fieldName,
    });
  }

  return parsed;
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeKey(key)] = String(value ?? "").trim();
  }

  return normalized;
}

function readValue(
  row: Record<string, string>,
  aliases: string[],
): string | undefined {
  for (const alias of aliases) {
    const value = cleanNullable(row[normalizeKey(alias)]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function requireValue(
  row: Record<string, string>,
  aliases: string[],
  fieldName: string,
  issues: StagedRow["issues"],
): string | undefined {
  const value = readValue(row, aliases);

  if (!value) {
    issues.push({
      severity: "ERROR",
      code: "MISSING_REQUIRED_FIELD",
      message: `${fieldName} is required.`,
      fieldName,
    });
  }

  return value;
}

function getExternalId(
  row: Record<string, string>,
  issues: StagedRow["issues"],
): string | null {
  return (
    requireValue(
      row,
      ["external_id", "id", "source_id", "legacy_id"],
      "external_id",
      issues,
    ) ?? null
  );
}

function jsonObject(value: Record<string, unknown>): Prisma.JsonObject {
  return value as Prisma.JsonObject;
}

function isMemberStatus(value: string | undefined): value is MemberStatus {
  return Boolean(
    value &&
    [
      "ACTIVE",
      "TRIAL",
      "OVERDUE",
      "FROZEN",
      "CANCELLED",
      "WAITLISTED",
    ].includes(value),
  );
}

function normalizeMemberStatus(value: string | undefined): MemberStatus {
  const status = value
    ?.trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  return isMemberStatus(status) ? status : "ACTIVE";
}

function isMemberMembershipStatus(
  value: string | undefined,
): value is MemberMembershipStatus {
  return Boolean(
    value &&
    [
      "ACTIVE",
      "PENDING_PAYMENT_METHOD",
      "PAST_DUE",
      "FROZEN",
      "CANCELLED",
      "ENDED",
    ].includes(value),
  );
}

function normalizeMembershipStatus(
  value: string | undefined,
): MemberMembershipStatus {
  const status = value
    ?.trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  return isMemberMembershipStatus(status) ? status : "ACTIVE";
}

function normalizeWeekday(value: string | undefined): Weekday | null {
  const normalized = value?.trim().toUpperCase();
  const aliases: Record<string, Weekday> = {
    MON: "MONDAY",
    MONDAY: "MONDAY",
    TUE: "TUESDAY",
    TUES: "TUESDAY",
    TUESDAY: "TUESDAY",
    WED: "WEDNESDAY",
    WEDNESDAY: "WEDNESDAY",
    THU: "THURSDAY",
    THUR: "THURSDAY",
    THURS: "THURSDAY",
    THURSDAY: "THURSDAY",
    FRI: "FRIDAY",
    FRIDAY: "FRIDAY",
    SAT: "SATURDAY",
    SATURDAY: "SATURDAY",
    SUN: "SUNDAY",
    SUNDAY: "SUNDAY",
  };

  return normalized ? (aliases[normalized] ?? null) : null;
}

function parseTimeMinutes(value: string | undefined): number | null {
  const text = cleanNullable(value);

  if (!text) {
    return null;
  }

  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text);

  if (!match) {
    return null;
  }

  let hours = Number.parseInt(match[1] ?? "", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === "pm" && hours < 12) {
    hours += 12;
  }

  if (meridiem === "am" && hours === 12) {
    hours = 0;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function hashBytes(value: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

function isMigrationStage(value: string): value is MigrationStage {
  return migrationStages.includes(value as MigrationStage);
}

function isImportRecordKind(value: string): value is ImportRecordKind {
  return migrationRecordKindOptions.some((option) => option.value === value);
}

export function sanitizeMigrationIntakeInput(input: MigrationIntakeInput) {
  return {
    currentSoftware: cleanNullable(input.currentSoftware),
    targetGoLiveDate: parseDateOnly(input.targetGoLiveDate),
    memberCountEstimate: parseOptionalPositiveInt(input.memberCountEstimate),
    billingStatus: cleanNullable(input.billingStatus),
    scheduleComplexity: cleanNullable(input.scheduleComplexity),
    formsAndWaivers: cleanNullable(input.formsAndWaivers),
    dataScope: (input.dataScope ?? [])
      .map((value) => value.trim())
      .filter((value) =>
        migrationDataScopeOptions.includes(
          value as (typeof migrationDataScopeOptions)[number],
        ),
      ),
    accessInstructions: cleanNullable(input.accessInstructions),
  };
}

export function buildInitialMigrationData(input: MigrationIntakeInput) {
  return {
    ...sanitizeMigrationIntakeInput(input),
    stage: "INTAKE_RECEIVED" as const,
    nextOwnerAction: defaultNextOwnerAction,
    flowstateResponsibility: defaultFlowstateResponsibility,
    expectedNextMilestone: defaultExpectedMilestone,
  };
}

export function getMigrationStageLabel(stage: MigrationStage): string {
  const labels: Record<MigrationStage, string> = {
    INTAKE_RECEIVED: "Intake received",
    EXPORTS_NEEDED: "Exports needed",
    MIGRATION_IN_PROGRESS: "Migration in progress",
    REVIEW_READY: "Review ready",
    GO_LIVE_SCHEDULED: "Go-live scheduled",
    COMPLETE: "Complete",
  };

  return labels[stage];
}

export function isWorkspaceMigrationReady(args: {
  workspaceStatus: string;
  migrationStage?: string | null;
  ownerReviewAcknowledgedAt?: Date | null;
  ownerReviewAcknowledgedByUserId?: string | null;
  operationallyReadyAt?: Date | null;
  operationallyReadyByUserId?: string | null;
}): boolean {
  return (
    args.workspaceStatus === "ACTIVE" &&
    args.migrationStage === "COMPLETE" &&
    Boolean(args.ownerReviewAcknowledgedAt) &&
    Boolean(args.ownerReviewAcknowledgedByUserId?.trim()) &&
    Boolean(args.operationallyReadyAt) &&
    Boolean(args.operationallyReadyByUserId?.trim())
  );
}

function parseCsvRows(fileData: Uint8Array): Record<string, string>[] {
  const rawContent = new TextDecoder("utf-8").decode(fileData);
  const parsed = parse(rawContent, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[];

  return parsed.map(normalizeRow);
}

function buildMemberStagedRow(row: Record<string, string>): StagedRow {
  const issues: StagedRow["issues"] = [];
  const externalId = getExternalId(row, issues);
  const fullName = requireValue(
    row,
    ["full_name", "name", "member_name"],
    "full_name",
    issues,
  );
  const dateOfBirth = readValue(row, ["date_of_birth", "birthdate", "dob"]);
  const parsedBirthdate = dateOfBirth ? parseDateOnly(dateOfBirth) : null;

  if (dateOfBirth && !parsedBirthdate) {
    issues.push({
      severity: "WARNING",
      code: "INVALID_DATE",
      message: "date_of_birth was not imported because it is not YYYY-MM-DD.",
      fieldName: "date_of_birth",
    });
  }

  const mappedData = {
    externalId,
    fullName,
    email: readValue(row, ["email", "member_email"]) ?? null,
    phone: readValue(row, ["phone", "mobile", "member_phone"]) ?? null,
    dateOfBirth: parsedBirthdate ? parsedBirthdate.toISOString() : null,
    status: normalizeMemberStatus(readValue(row, ["status", "member_status"])),
    notes: readValue(row, ["notes", "note"]) ?? null,
    tags:
      readValue(row, ["tags"])
        ?.split(",")
        .map((tag) => tag.trim())
        .filter(Boolean) ?? [],
    guardianExternalId:
      readValue(row, ["guardian_external_id", "parent_external_id"]) ?? null,
    guardianFullName:
      readValue(row, ["guardian_full_name", "parent_name", "guardian_name"]) ??
      null,
    guardianEmail: readValue(row, ["guardian_email", "parent_email"]) ?? null,
    guardianPhone: readValue(row, ["guardian_phone", "parent_phone"]) ?? null,
    relationshipLabel:
      readValue(row, ["relationship", "relationship_label"]) ?? null,
    isPrimaryGuardian: ["true", "yes", "1", "primary"].includes(
      (
        readValue(row, ["primary_guardian", "is_primary_guardian"]) ?? ""
      ).toLowerCase(),
    ),
  };

  return {
    externalId,
    mappedData: jsonObject(mappedData),
    rawData: jsonObject(row),
    issues,
  };
}

function buildMembershipPlanStagedRow(row: Record<string, string>): StagedRow {
  const issues: StagedRow["issues"] = [];
  const externalId = getExternalId(row, issues);
  const name = requireValue(row, ["name", "plan_name"], "name", issues);
  const monthlyPriceCents = parseRequiredInt(
    readValue(row, ["monthly_price_cents", "price_cents", "amount_cents"]),
    "monthly_price_cents",
    issues,
  );

  return {
    externalId,
    mappedData: jsonObject({
      externalId,
      name,
      description: readValue(row, ["description"]) ?? null,
      monthlyPriceCents,
      currency: (readValue(row, ["currency"]) ?? "usd").toLowerCase(),
    }),
    rawData: jsonObject(row),
    issues,
  };
}

function buildMemberMembershipStagedRow(
  row: Record<string, string>,
): StagedRow {
  const issues: StagedRow["issues"] = [];
  const externalId = getExternalId(row, issues);
  const memberExternalId = requireValue(
    row,
    ["member_external_id", "member_id"],
    "member_external_id",
    issues,
  );
  const planExternalId = requireValue(
    row,
    ["membership_plan_external_id", "plan_external_id", "plan_id"],
    "membership_plan_external_id",
    issues,
  );

  return {
    externalId,
    mappedData: jsonObject({
      externalId,
      memberExternalId,
      membershipPlanExternalId: planExternalId,
      status: normalizeMembershipStatus(
        readValue(row, ["status", "membership_status"]),
      ),
      startedAt:
        parseDateOnly(
          readValue(row, ["started_at", "start_date"]),
        )?.toISOString() ?? null,
      nextBillingDate:
        parseDateOnly(
          readValue(row, ["next_billing_date", "billing_date"]),
        )?.toISOString() ?? null,
    }),
    rawData: jsonObject(row),
    issues,
  };
}

function buildPunchCardBalanceStagedRow(
  row: Record<string, string>,
): StagedRow {
  const issues: StagedRow["issues"] = [];
  const externalId = getExternalId(row, issues);
  const memberExternalId = requireValue(
    row,
    ["member_external_id", "member_id"],
    "member_external_id",
    issues,
  );
  const productName = requireValue(
    row,
    ["product_name", "punch_card_name", "name"],
    "product_name",
    issues,
  );
  const originalPunches = parseRequiredInt(
    readValue(row, ["original_punches", "punches_included", "total_punches"]),
    "original_punches",
    issues,
  );
  const remainingPunches = parseRequiredInt(
    readValue(row, ["remaining_punches", "balance", "punches_remaining"]),
    "remaining_punches",
    issues,
  );

  return {
    externalId,
    mappedData: jsonObject({
      externalId,
      memberExternalId,
      productExternalId:
        readValue(row, ["product_external_id", "punch_card_external_id"]) ??
        `name:${productName}`,
      productName,
      originalPunches,
      remainingPunches,
      priceCents:
        parseOptionalPositiveInt(
          readValue(row, ["price_cents", "purchase_price_cents"]),
        ) ?? 0,
      currency: (readValue(row, ["currency"]) ?? "usd").toLowerCase(),
      purchasedAt:
        parseDateOnly(
          readValue(row, ["purchased_at", "purchase_date"]),
        )?.toISOString() ?? null,
    }),
    rawData: jsonObject(row),
    issues,
  };
}

function buildDropInProductStagedRow(row: Record<string, string>): StagedRow {
  const issues: StagedRow["issues"] = [];
  const externalId = getExternalId(row, issues);
  const name = requireValue(row, ["name", "product_name"], "name", issues);
  const priceCents = parseRequiredInt(
    readValue(row, ["price_cents", "amount_cents"]),
    "price_cents",
    issues,
  );

  return {
    externalId,
    mappedData: jsonObject({
      externalId,
      name,
      description: readValue(row, ["description"]) ?? null,
      priceCents,
      currency: (readValue(row, ["currency"]) ?? "usd").toLowerCase(),
    }),
    rawData: jsonObject(row),
    issues,
  };
}

function buildScheduleTemplateStagedRow(
  row: Record<string, string>,
): StagedRow {
  const issues: StagedRow["issues"] = [];
  const externalId = getExternalId(row, issues);
  const programName = requireValue(
    row,
    ["program_name", "program"],
    "program_name",
    issues,
  );
  const roomName = requireValue(
    row,
    ["room_name", "room"],
    "room_name",
    issues,
  );
  const weekday = normalizeWeekday(
    requireValue(row, ["weekday", "day"], "weekday", issues),
  );
  const startTimeMinutes = parseTimeMinutes(
    requireValue(row, ["start_time", "starts_at"], "start_time", issues),
  );
  const endTimeMinutes = parseTimeMinutes(
    requireValue(row, ["end_time", "ends_at"], "end_time", issues),
  );

  if (!weekday) {
    issues.push({
      severity: "ERROR",
      code: "INVALID_WEEKDAY",
      message: "weekday must be a day name such as Monday or MONDAY.",
      fieldName: "weekday",
    });
  }

  if (startTimeMinutes === null || endTimeMinutes === null) {
    issues.push({
      severity: "ERROR",
      code: "INVALID_TIME",
      message: "start_time and end_time must be times such as 18:00 or 6:00pm.",
      fieldName: "start_time",
    });
  } else if (endTimeMinutes <= startTimeMinutes) {
    issues.push({
      severity: "ERROR",
      code: "INVALID_TIME_RANGE",
      message: "end_time must be after start_time.",
      fieldName: "end_time",
    });
  }

  return {
    externalId,
    mappedData: jsonObject({
      externalId,
      programName,
      roomName,
      title: readValue(row, ["title", "class_name"]) ?? null,
      weekday,
      startTimeMinutes,
      endTimeMinutes,
      capacityOverride: parseOptionalPositiveInt(
        readValue(row, ["capacity", "capacity_override"]),
      ),
      bookingCutoffMinutes:
        parseOptionalPositiveInt(readValue(row, ["booking_cutoff_minutes"])) ??
        60,
      cancellationCutoffMinutes:
        parseOptionalPositiveInt(
          readValue(row, ["cancellation_cutoff_minutes"]),
        ) ?? 120,
    }),
    rawData: jsonObject(row),
    issues,
  };
}

function buildReviewOnlyStagedRow(row: Record<string, string>): StagedRow {
  const issues: StagedRow["issues"] = [
    {
      severity: "INFO",
      code: "REVIEW_ONLY",
      message: "This record type is staged for review only in this version.",
    },
  ];
  const externalId =
    readValue(row, ["external_id", "id", "source_id", "legacy_id"]) ?? null;

  return {
    externalId,
    mappedData: jsonObject(row),
    rawData: jsonObject(row),
    issues,
  };
}

function buildStagedRow(
  recordKind: ImportRecordKind,
  row: Record<string, string>,
): StagedRow {
  switch (recordKind) {
    case "MEMBER":
      return buildMemberStagedRow(row);
    case "MEMBERSHIP_PLAN":
      return buildMembershipPlanStagedRow(row);
    case "MEMBER_MEMBERSHIP":
      return buildMemberMembershipStagedRow(row);
    case "PUNCH_CARD_BALANCE":
      return buildPunchCardBalanceStagedRow(row);
    case "DROP_IN_PRODUCT":
      return buildDropInProductStagedRow(row);
    case "SCHEDULE_TEMPLATE":
      return buildScheduleTemplateStagedRow(row);
    default:
      return buildReviewOnlyStagedRow(row);
  }
}

function hasBlockingIssues(stagedRow: StagedRow): boolean {
  return stagedRow.issues.some((issue) => issue.severity === "ERROR");
}

async function findIdentity(args: {
  db: Prisma.TransactionClient;
  workspaceId: string;
  recordKind: ImportRecordKind;
  externalId: string;
}): Promise<ImportedIdentity | null> {
  return args.db.migrationImportedRecord.findUnique({
    where: {
      workspaceId_recordKind_externalId: {
        workspaceId: args.workspaceId,
        recordKind: args.recordKind,
        externalId: args.externalId,
      },
    },
    select: {
      id: true,
      importedRecordId: true,
      importedModel: true,
    },
  });
}

async function upsertIdentity(args: {
  db: Prisma.TransactionClient;
  workspaceId: string;
  importJobId: string;
  stagingRecordId?: string | null;
  recordKind: ImportRecordKind;
  externalId: string;
  importedModel: string;
  importedRecordId: string;
}): Promise<void> {
  await args.db.migrationImportedRecord.upsert({
    where: {
      workspaceId_recordKind_externalId: {
        workspaceId: args.workspaceId,
        recordKind: args.recordKind,
        externalId: args.externalId,
      },
    },
    create: {
      workspaceId: args.workspaceId,
      importJobId: args.importJobId,
      stagingRecordId: args.stagingRecordId,
      recordKind: args.recordKind,
      externalId: args.externalId,
      importedModel: args.importedModel,
      importedRecordId: args.importedRecordId,
    },
    update: {
      importJobId: args.importJobId,
      stagingRecordId: args.stagingRecordId,
      importedModel: args.importedModel,
      importedRecordId: args.importedRecordId,
    },
  });
}

function mapped<T extends Prisma.JsonObject>(value: Prisma.JsonValue): T {
  return value as T;
}

async function importMember(args: {
  db: Prisma.TransactionClient;
  workspaceId: string;
  importJobId: string;
  stagingRecord: {
    id: string;
    externalId: string | null;
    mappedData: Prisma.JsonValue | null;
  };
}): Promise<"created" | "updated" | "skipped"> {
  if (!args.stagingRecord.externalId || !args.stagingRecord.mappedData) {
    return "skipped";
  }

  const data = mapped<{
    fullName?: string;
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
    status?: MemberStatus;
    notes?: string | null;
    tags?: string[];
    guardianExternalId?: string | null;
    guardianFullName?: string | null;
    guardianEmail?: string | null;
    guardianPhone?: string | null;
    relationshipLabel?: string | null;
    isPrimaryGuardian?: boolean;
  }>(args.stagingRecord.mappedData);
  const identity = await findIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    recordKind: "MEMBER",
    externalId: args.stagingRecord.externalId,
  });
  const memberData = {
    fullName: data.fullName ?? "",
    email: data.email ?? null,
    phone: data.phone ?? null,
    dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
    status: data.status ?? "ACTIVE",
    notes: data.notes ?? null,
    tags: data.tags ?? [],
  };
  let memberId = identity?.importedRecordId;
  let result: "created" | "updated" = "updated";

  if (memberId) {
    await args.db.member.updateMany({
      where: {
        id: memberId,
        workspaceId: args.workspaceId,
      },
      data: memberData,
    });
  } else {
    const member = await args.db.member.create({
      data: {
        workspaceId: args.workspaceId,
        ...memberData,
      },
      select: {
        id: true,
      },
    });
    memberId = member.id;
    result = "created";
  }

  await upsertIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    importJobId: args.importJobId,
    stagingRecordId: args.stagingRecord.id,
    recordKind: "MEMBER",
    externalId: args.stagingRecord.externalId,
    importedModel: "Member",
    importedRecordId: memberId,
  });

  if (data.guardianFullName) {
    const guardianExternalId =
      data.guardianExternalId ?? `${args.stagingRecord.externalId}:guardian`;
    const guardianIdentity = await findIdentity({
      db: args.db,
      workspaceId: args.workspaceId,
      recordKind: "GUARDIAN",
      externalId: guardianExternalId,
    });
    let guardianId = guardianIdentity?.importedRecordId;

    if (guardianId) {
      await args.db.guardian.updateMany({
        where: {
          id: guardianId,
          workspaceId: args.workspaceId,
        },
        data: {
          fullName: data.guardianFullName,
          email: data.guardianEmail ?? null,
          phone: data.guardianPhone ?? null,
        },
      });
    } else {
      const guardian = await args.db.guardian.create({
        data: {
          workspaceId: args.workspaceId,
          fullName: data.guardianFullName,
          email: data.guardianEmail ?? null,
          phone: data.guardianPhone ?? null,
        },
        select: {
          id: true,
        },
      });
      guardianId = guardian.id;
    }

    await upsertIdentity({
      db: args.db,
      workspaceId: args.workspaceId,
      importJobId: args.importJobId,
      stagingRecordId: args.stagingRecord.id,
      recordKind: "GUARDIAN",
      externalId: guardianExternalId,
      importedModel: "Guardian",
      importedRecordId: guardianId,
    });

    const existingLink = await args.db.familyLink.findFirst({
      where: {
        workspaceId: args.workspaceId,
        guardianId,
        childMemberId: memberId,
      },
      select: {
        id: true,
      },
    });

    if (!existingLink) {
      await args.db.familyLink.create({
        data: {
          workspaceId: args.workspaceId,
          guardianId,
          childMemberId: memberId,
          relationshipLabel: data.relationshipLabel ?? null,
          isPrimary: Boolean(data.isPrimaryGuardian),
        },
      });
    }
  }

  await args.db.stagingRecord.update({
    where: {
      id: args.stagingRecord.id,
    },
    data: {
      importedAt: new Date(),
      importedModel: "Member",
      importedRecordId: memberId,
    },
  });

  return result;
}

async function importMembershipPlan(args: {
  db: Prisma.TransactionClient;
  workspaceId: string;
  importJobId: string;
  stagingRecord: {
    id: string;
    externalId: string | null;
    mappedData: Prisma.JsonValue | null;
  };
}): Promise<"created" | "updated" | "skipped"> {
  if (!args.stagingRecord.externalId || !args.stagingRecord.mappedData) {
    return "skipped";
  }

  const data = mapped<{
    name?: string;
    description?: string | null;
    monthlyPriceCents?: number;
    currency?: string;
  }>(args.stagingRecord.mappedData);
  const identity = await findIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    recordKind: "MEMBERSHIP_PLAN",
    externalId: args.stagingRecord.externalId,
  });
  const planData = {
    name: data.name ?? "",
    description: data.description ?? null,
    monthlyPriceCents: data.monthlyPriceCents ?? 0,
    currency: data.currency ?? "usd",
  };
  let planId = identity?.importedRecordId;
  let result: "created" | "updated" = "updated";

  if (planId) {
    await args.db.membershipPlan.updateMany({
      where: {
        id: planId,
        workspaceId: args.workspaceId,
      },
      data: planData,
    });
  } else {
    const plan = await args.db.membershipPlan.create({
      data: {
        workspaceId: args.workspaceId,
        ...planData,
      },
      select: {
        id: true,
      },
    });
    planId = plan.id;
    result = "created";
  }

  await upsertIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    importJobId: args.importJobId,
    stagingRecordId: args.stagingRecord.id,
    recordKind: "MEMBERSHIP_PLAN",
    externalId: args.stagingRecord.externalId,
    importedModel: "MembershipPlan",
    importedRecordId: planId,
  });

  await args.db.stagingRecord.update({
    where: {
      id: args.stagingRecord.id,
    },
    data: {
      importedAt: new Date(),
      importedModel: "MembershipPlan",
      importedRecordId: planId,
    },
  });

  return result;
}

async function importMemberMembership(args: {
  db: Prisma.TransactionClient;
  workspaceId: string;
  importJobId: string;
  stagingRecord: {
    id: string;
    externalId: string | null;
    mappedData: Prisma.JsonValue | null;
  };
}): Promise<"created" | "updated" | "skipped"> {
  if (!args.stagingRecord.externalId || !args.stagingRecord.mappedData) {
    return "skipped";
  }

  const data = mapped<{
    memberExternalId?: string;
    membershipPlanExternalId?: string;
    status?: MemberMembershipStatus;
    startedAt?: string | null;
    nextBillingDate?: string | null;
  }>(args.stagingRecord.mappedData);

  if (!data.memberExternalId || !data.membershipPlanExternalId) {
    return "skipped";
  }

  const [memberIdentity, planIdentity, membershipIdentity] = await Promise.all([
    findIdentity({
      db: args.db,
      workspaceId: args.workspaceId,
      recordKind: "MEMBER",
      externalId: data.memberExternalId,
    }),
    findIdentity({
      db: args.db,
      workspaceId: args.workspaceId,
      recordKind: "MEMBERSHIP_PLAN",
      externalId: data.membershipPlanExternalId,
    }),
    findIdentity({
      db: args.db,
      workspaceId: args.workspaceId,
      recordKind: "MEMBER_MEMBERSHIP",
      externalId: args.stagingRecord.externalId,
    }),
  ]);

  if (!memberIdentity || !planIdentity) {
    return "skipped";
  }

  const membershipData = {
    memberId: memberIdentity.importedRecordId,
    membershipPlanId: planIdentity.importedRecordId,
    status: data.status ?? "ACTIVE",
    startedAt: data.startedAt ? new Date(data.startedAt) : new Date(),
    nextBillingDate: data.nextBillingDate
      ? new Date(data.nextBillingDate)
      : null,
  };
  let membershipId = membershipIdentity?.importedRecordId;
  let result: "created" | "updated" = "updated";

  if (membershipId) {
    await args.db.memberMembership.updateMany({
      where: {
        id: membershipId,
        workspaceId: args.workspaceId,
      },
      data: membershipData,
    });
  } else {
    const existingCurrent = await args.db.memberMembership.findFirst({
      where: {
        workspaceId: args.workspaceId,
        memberId: memberIdentity.importedRecordId,
        currentMembershipSlot: "CURRENT",
      },
      select: {
        id: true,
      },
    });

    if (existingCurrent) {
      membershipId = existingCurrent.id;
      await args.db.memberMembership.updateMany({
        where: {
          id: membershipId,
          workspaceId: args.workspaceId,
        },
        data: membershipData,
      });
    } else {
      const membership = await args.db.memberMembership.create({
        data: {
          workspaceId: args.workspaceId,
          currentMembershipSlot: "CURRENT",
          ...membershipData,
        },
        select: {
          id: true,
        },
      });
      membershipId = membership.id;
      result = "created";
    }
  }

  await upsertIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    importJobId: args.importJobId,
    stagingRecordId: args.stagingRecord.id,
    recordKind: "MEMBER_MEMBERSHIP",
    externalId: args.stagingRecord.externalId,
    importedModel: "MemberMembership",
    importedRecordId: membershipId,
  });

  await args.db.stagingRecord.update({
    where: {
      id: args.stagingRecord.id,
    },
    data: {
      importedAt: new Date(),
      importedModel: "MemberMembership",
      importedRecordId: membershipId,
    },
  });

  return result;
}

async function importPunchCardBalance(args: {
  db: Prisma.TransactionClient;
  workspaceId: string;
  importJobId: string;
  stagingRecord: {
    id: string;
    externalId: string | null;
    mappedData: Prisma.JsonValue | null;
  };
}): Promise<"created" | "updated" | "skipped"> {
  if (!args.stagingRecord.externalId || !args.stagingRecord.mappedData) {
    return "skipped";
  }

  const data = mapped<{
    memberExternalId?: string;
    productExternalId?: string;
    productName?: string;
    originalPunches?: number;
    remainingPunches?: number;
    priceCents?: number;
    currency?: string;
    purchasedAt?: string | null;
  }>(args.stagingRecord.mappedData);

  if (!data.memberExternalId || !data.productExternalId || !data.productName) {
    return "skipped";
  }

  const memberIdentity = await findIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    recordKind: "MEMBER",
    externalId: data.memberExternalId,
  });

  if (!memberIdentity) {
    return "skipped";
  }

  const productExternalId = `product:${data.productExternalId}`;
  const productIdentity = await findIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    recordKind: "PUNCH_CARD_BALANCE",
    externalId: productExternalId,
  });
  let productId = productIdentity?.importedRecordId;

  if (productId) {
    await args.db.punchCardProduct.updateMany({
      where: {
        id: productId,
        workspaceId: args.workspaceId,
      },
      data: {
        name: data.productName,
        punchesIncluded: data.originalPunches ?? data.remainingPunches ?? 0,
        priceCents: data.priceCents ?? 0,
        currency: data.currency ?? "usd",
      },
    });
  } else {
    const product = await args.db.punchCardProduct.create({
      data: {
        workspaceId: args.workspaceId,
        name: data.productName,
        punchesIncluded: data.originalPunches ?? data.remainingPunches ?? 0,
        priceCents: data.priceCents ?? 0,
        currency: data.currency ?? "usd",
      },
      select: {
        id: true,
      },
    });
    productId = product.id;

    await upsertIdentity({
      db: args.db,
      workspaceId: args.workspaceId,
      importJobId: args.importJobId,
      stagingRecordId: args.stagingRecord.id,
      recordKind: "PUNCH_CARD_BALANCE",
      externalId: productExternalId,
      importedModel: "PunchCardProduct",
      importedRecordId: productId,
    });
  }

  const balanceExternalId = `balance:${args.stagingRecord.externalId}`;
  const balanceIdentity = await findIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    recordKind: "PUNCH_CARD_BALANCE",
    externalId: balanceExternalId,
  });
  const balanceData = {
    memberId: memberIdentity.importedRecordId,
    punchCardProductId: productId,
    originalPunches: data.originalPunches ?? data.remainingPunches ?? 0,
    remainingPunches: data.remainingPunches ?? 0,
    purchasePriceCents: data.priceCents ?? 0,
    purchaseCurrency: data.currency ?? "usd",
    purchasedAt: data.purchasedAt ? new Date(data.purchasedAt) : new Date(),
  };
  let balanceId = balanceIdentity?.importedRecordId;
  let result: "created" | "updated" = "updated";

  if (balanceId) {
    await args.db.memberPunchCard.updateMany({
      where: {
        id: balanceId,
        workspaceId: args.workspaceId,
      },
      data: balanceData,
    });
  } else {
    const balance = await args.db.memberPunchCard.create({
      data: {
        workspaceId: args.workspaceId,
        ...balanceData,
      },
      select: {
        id: true,
      },
    });
    balanceId = balance.id;
    result = "created";
  }

  await upsertIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    importJobId: args.importJobId,
    stagingRecordId: args.stagingRecord.id,
    recordKind: "PUNCH_CARD_BALANCE",
    externalId: balanceExternalId,
    importedModel: "MemberPunchCard",
    importedRecordId: balanceId,
  });

  await args.db.stagingRecord.update({
    where: {
      id: args.stagingRecord.id,
    },
    data: {
      importedAt: new Date(),
      importedModel: "MemberPunchCard",
      importedRecordId: balanceId,
    },
  });

  return result;
}

async function importDropInProduct(args: {
  db: Prisma.TransactionClient;
  workspaceId: string;
  importJobId: string;
  stagingRecord: {
    id: string;
    externalId: string | null;
    mappedData: Prisma.JsonValue | null;
  };
}): Promise<"created" | "updated" | "skipped"> {
  if (!args.stagingRecord.externalId || !args.stagingRecord.mappedData) {
    return "skipped";
  }

  const data = mapped<{
    name?: string;
    description?: string | null;
    priceCents?: number;
    currency?: string;
  }>(args.stagingRecord.mappedData);
  const identity = await findIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    recordKind: "DROP_IN_PRODUCT",
    externalId: args.stagingRecord.externalId,
  });
  const productData = {
    name: data.name ?? "",
    description: data.description ?? null,
    priceCents: data.priceCents ?? 0,
    currency: data.currency ?? "usd",
  };
  let productId = identity?.importedRecordId;
  let result: "created" | "updated" = "updated";

  if (productId) {
    await args.db.dropInProduct.updateMany({
      where: {
        id: productId,
        workspaceId: args.workspaceId,
      },
      data: productData,
    });
  } else {
    const product = await args.db.dropInProduct.create({
      data: {
        workspaceId: args.workspaceId,
        ...productData,
      },
      select: {
        id: true,
      },
    });
    productId = product.id;
    result = "created";
  }

  await upsertIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    importJobId: args.importJobId,
    stagingRecordId: args.stagingRecord.id,
    recordKind: "DROP_IN_PRODUCT",
    externalId: args.stagingRecord.externalId,
    importedModel: "DropInProduct",
    importedRecordId: productId,
  });

  await args.db.stagingRecord.update({
    where: {
      id: args.stagingRecord.id,
    },
    data: {
      importedAt: new Date(),
      importedModel: "DropInProduct",
      importedRecordId: productId,
    },
  });

  return result;
}

async function importScheduleTemplate(args: {
  db: Prisma.TransactionClient;
  workspaceId: string;
  locationId: string;
  importJobId: string;
  stagingRecord: {
    id: string;
    externalId: string | null;
    mappedData: Prisma.JsonValue | null;
  };
}): Promise<"created" | "updated" | "skipped"> {
  if (!args.stagingRecord.externalId || !args.stagingRecord.mappedData) {
    return "skipped";
  }

  const data = mapped<{
    programName?: string;
    roomName?: string;
    title?: string | null;
    weekday?: Weekday;
    startTimeMinutes?: number;
    endTimeMinutes?: number;
    capacityOverride?: number | null;
    bookingCutoffMinutes?: number;
    cancellationCutoffMinutes?: number;
  }>(args.stagingRecord.mappedData);

  if (!data.programName || !data.roomName || !data.weekday) {
    return "skipped";
  }

  const owner = await args.db.workspaceUser.findFirst({
    where: {
      workspaceId: args.workspaceId,
      role: "OWNER",
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!owner) {
    return "skipped";
  }

  const program = await args.db.program.upsert({
    where: {
      workspaceId_name: {
        workspaceId: args.workspaceId,
        name: data.programName,
      },
    },
    create: {
      workspaceId: args.workspaceId,
      name: data.programName,
    },
    update: {},
    select: {
      id: true,
    },
  });
  const room = await args.db.room.upsert({
    where: {
      locationId_name: {
        locationId: args.locationId,
        name: data.roomName,
      },
    },
    create: {
      locationId: args.locationId,
      name: data.roomName,
    },
    update: {},
    select: {
      id: true,
    },
  });
  const identity = await findIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    recordKind: "SCHEDULE_TEMPLATE",
    externalId: args.stagingRecord.externalId,
  });
  const templateData = {
    programId: program.id,
    roomId: room.id,
    coachWorkspaceUserId: owner.id,
    title: data.title ?? null,
    weekday: data.weekday,
    startTimeMinutes: data.startTimeMinutes ?? 0,
    endTimeMinutes: data.endTimeMinutes ?? 0,
    capacityOverride: data.capacityOverride ?? null,
    bookingCutoffMinutes: data.bookingCutoffMinutes ?? 60,
    cancellationCutoffMinutes: data.cancellationCutoffMinutes ?? 120,
  };
  let templateId = identity?.importedRecordId;
  let result: "created" | "updated" = "updated";

  if (templateId) {
    await args.db.classTemplate.updateMany({
      where: {
        id: templateId,
        workspaceId: args.workspaceId,
      },
      data: templateData,
    });
  } else {
    const template = await args.db.classTemplate.create({
      data: {
        workspaceId: args.workspaceId,
        ...templateData,
      },
      select: {
        id: true,
      },
    });
    templateId = template.id;
    result = "created";
  }

  await upsertIdentity({
    db: args.db,
    workspaceId: args.workspaceId,
    importJobId: args.importJobId,
    stagingRecordId: args.stagingRecord.id,
    recordKind: "SCHEDULE_TEMPLATE",
    externalId: args.stagingRecord.externalId,
    importedModel: "ClassTemplate",
    importedRecordId: templateId,
  });

  await args.db.stagingRecord.update({
    where: {
      id: args.stagingRecord.id,
    },
    data: {
      importedAt: new Date(),
      importedModel: "ClassTemplate",
      importedRecordId: templateId,
    },
  });

  return result;
}

async function updateMigrationStageForImport(args: {
  db: Prisma.TransactionClient;
  workspaceId: string;
  stage: MigrationStage;
}): Promise<void> {
  await args.db.workspaceMigration.update({
    where: {
      workspaceId: args.workspaceId,
    },
    data: {
      stage: args.stage,
      nextOwnerAction:
        args.stage === "REVIEW_READY"
          ? "Review the imported data with Flowstate and confirm what should change before go-live."
          : defaultNextOwnerAction,
      flowstateResponsibility:
        args.stage === "REVIEW_READY"
          ? "Flowstate will reconcile the staged records, resolve validation notes, and prepare the launch handoff."
          : defaultFlowstateResponsibility,
      expectedNextMilestone:
        args.stage === "REVIEW_READY"
          ? "Review call and go-live checklist."
          : defaultExpectedMilestone,
    },
  });
}

export async function getMigrationDashboard(args: {
  workspaceId: string;
  db?: MigrationDatabase;
  now?: Date;
}) {
  const db = args.db ?? prisma;
  const now = args.now ?? new Date();
  const [
    migration,
    importJobs,
    migrationResultAttempts,
    blockingValidationIssueCount,
    unresolvedJobCount,
  ] = await Promise.all([
    db.workspaceMigration.findUnique({
      where: {
        workspaceId: args.workspaceId,
      },
      include: {
        workspace: {
          select: {
            status: true,
            location: { select: { timezone: true } },
          },
        },
      },
    }),
    db.importJob.findMany({
      where: {
        workspaceId: args.workspaceId,
      },
      include: {
        sourceFiles: {
          orderBy: {
            createdAt: "desc",
          },
        },
        validationIssues: {
          orderBy: [
            {
              severity: "desc",
            },
            {
              createdAt: "desc",
            },
            {
              id: "asc",
            },
          ],
          take: 10,
        },
        stagingRecords: {
          select: {
            id: true,
            recordKind: true,
            isReadyForImport: true,
            importedAt: true,
          },
        },
        reconciliationReports: {
          orderBy: {
            generatedAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
    }),
    db.importJob.findMany({
      where: {
        workspaceId: args.workspaceId,
      },
      select: {
        status: true,
        reconciliationReports: {
          select: {
            summary: true,
          },
          orderBy: {
            generatedAt: "desc",
          },
          take: 1,
        },
      },
    }),
    db.validationIssue.count({
      where: activeBlockingValidationIssueWhere(args.workspaceId),
    }),
    db.importJob.count({
      where: unresolvedImportJobWhere(args.workspaceId),
    }),
  ]);

  const validationIssueCounts =
    importJobs.length === 0
      ? []
      : await db.validationIssue.groupBy({
          by: ["importJobId", "severity"],
          where: {
            workspaceId: args.workspaceId,
            importJobId: {
              in: importJobs.map((job) => job.id),
            },
          },
          _count: {
            _all: true,
          },
        });
  const issueCountsByImportJob = new Map<
    string,
    { INFO: number; WARNING: number; ERROR: number }
  >();

  for (const issueCount of validationIssueCounts) {
    const counts = issueCountsByImportJob.get(issueCount.importJobId) ?? {
      INFO: 0,
      WARNING: 0,
      ERROR: 0,
    };

    counts[issueCount.severity] = issueCount._count._all;
    issueCountsByImportJob.set(issueCount.importJobId, counts);
  }

  const ownerReview = getOwnerReviewPresentation({
    migration: migration
      ? {
          stage: migration.stage,
          workspaceStatus: migration.workspace.status,
          goLiveScheduledFor: migration.goLiveScheduledFor,
          launchTimezone: migration.workspace.location?.timezone ?? null,
          ownerReviewAcknowledgedAt: migration.ownerReviewAcknowledgedAt,
          ownerReviewAcknowledgedByUserId:
            migration.ownerReviewAcknowledgedByUserId,
          operationallyReadyAt: migration.operationallyReadyAt,
          operationallyReadyByUserId: migration.operationallyReadyByUserId,
        }
      : null,
    now,
    blockingValidationIssueCount,
    unresolvedJobCount,
  });

  return {
    migration,
    ownerReview,
    migrationResults: projectOwnerMigrationResults({
      migrationStage: migration?.stage ?? null,
      attempts: migrationResultAttempts,
    }),
    importJobs: importJobs.map((job) => {
      const issueCounts = issueCountsByImportJob.get(job.id) ?? {
        INFO: 0,
        WARNING: 0,
        ERROR: 0,
      };

      return {
        ...job,
        stagedCount: job.stagingRecords.length,
        readyCount: job.stagingRecords.filter(
          (record) => record.isReadyForImport,
        ).length,
        importedCount: job.stagingRecords.filter((record) => record.importedAt)
          .length,
        issueCounts,
      };
    }),
  };
}

export async function acknowledgeMigrationOwnerReview(args: {
  workspaceId: string;
  userId: string;
  db?: MigrationDatabase;
  now?: Date;
}): Promise<MutationResult> {
  const db = args.db ?? prisma;
  const now = args.now ?? new Date();

  if (!isMigrationCorrectionChannelAvailable()) {
    return {
      status: "error",
      reason: "correction-channel-unavailable",
      message:
        "Migration correction channel is unavailable. Owner acknowledgment was not recorded.",
    };
  }

  return runSerializableWithRetry(db, async (tx) => {
    const owner = await tx.workspaceUser.findFirst({
      where: {
        workspaceId: args.workspaceId,
        userId: args.userId,
        role: "OWNER",
        isActive: true,
      },
      select: { id: true },
    });

    if (!owner) {
      return {
        status: "error",
        message:
          "Only an active workspace owner can acknowledge migration review.",
      };
    }

    const migration = await tx.workspaceMigration.findUnique({
      where: { workspaceId: args.workspaceId },
      select: {
        stage: true,
        goLiveScheduledFor: true,
        ownerReviewAcknowledgedAt: true,
        ownerReviewAcknowledgedByUserId: true,
        operationallyReadyAt: true,
        operationallyReadyByUserId: true,
        workspace: {
          select: {
            status: true,
            location: { select: { timezone: true } },
          },
        },
      },
    });

    if (
      !migration ||
      migration.stage !== "GO_LIVE_SCHEDULED" ||
      migration.workspace.status !== "SETUP_INCOMPLETE" ||
      migration.operationallyReadyAt ||
      migration.operationallyReadyByUserId
    ) {
      return {
        status: "error",
        message:
          "Migration review can only be acknowledged after Flowstate schedules go-live.",
      };
    }

    if (
      migration.ownerReviewAcknowledgedAt &&
      migration.ownerReviewAcknowledgedByUserId
    ) {
      return { status: "ok" };
    }

    if (
      migration.ownerReviewAcknowledgedAt ||
      migration.ownerReviewAcknowledgedByUserId
    ) {
      return {
        status: "error",
        message: "Migration owner review state is inconsistent.",
      };
    }

    const schedule = classifyMigrationSchedule({
      goLiveScheduledFor: migration.goLiveScheduledFor,
      launchTimezone: migration.workspace.location?.timezone ?? null,
      now,
    });

    if (schedule.status === "invalid") {
      const message =
        schedule.reason === "schedule-missing"
          ? "Flowstate must confirm the go-live schedule before owner review can be acknowledged."
          : schedule.reason === "schedule-passed"
            ? "The scheduled go-live date has passed. Flowstate must confirm the schedule before owner review can be acknowledged."
            : "Flowstate must confirm the launch timezone before owner review can be acknowledged.";

      return { status: "error", reason: schedule.reason, message };
    }

    const blockingValidationIssueCount = await tx.validationIssue.count({
      where: {
        severity: "ERROR",
        importJob: {
          workspaceId: args.workspaceId,
          NOT: {
            status: "CANCELLED",
            cancelledAt: { not: null },
            cancelledByOperatorId: { not: null },
            cancellationReason: { not: null },
          },
        },
      },
    });

    if (blockingValidationIssueCount > 0) {
      return {
        status: "error",
        message:
          "Resolve blocking migration validation issues before acknowledging review.",
      };
    }

    const unresolvedJobCount = await tx.importJob.count({
      where: {
        workspaceId: args.workspaceId,
        NOT: {
          OR: [
            {
              status: "COMPLETED",
              reconciliationReports: { some: {} },
            },
            {
              status: "CANCELLED",
              cancelledAt: { not: null },
              cancelledByOperatorId: { not: null },
              cancellationReason: { not: null },
            },
          ],
        },
      },
    });

    if (unresolvedJobCount > 0) {
      return {
        status: "error",
        message:
          "Complete migration reconciliation before acknowledging review.",
      };
    }

    const acknowledgment = await tx.workspaceMigration.updateMany({
      where: {
        workspaceId: args.workspaceId,
        stage: "GO_LIVE_SCHEDULED",
        goLiveScheduledFor: migration.goLiveScheduledFor,
        ownerReviewAcknowledgedAt: null,
        ownerReviewAcknowledgedByUserId: null,
        operationallyReadyAt: null,
        operationallyReadyByUserId: null,
        workspace: {
          status: "SETUP_INCOMPLETE",
          location: { timezone: migration.workspace.location?.timezone },
        },
      },
      data: {
        ownerReviewAcknowledgedAt: now,
        ownerReviewAcknowledgedByUserId: args.userId,
      },
    });

    if (acknowledgment.count === 1) {
      return { status: "ok" };
    }

    const acknowledged = await tx.workspaceMigration.findUnique({
      where: { workspaceId: args.workspaceId },
      select: {
        ownerReviewAcknowledgedAt: true,
        ownerReviewAcknowledgedByUserId: true,
      },
    });

    return acknowledged?.ownerReviewAcknowledgedAt &&
      acknowledged.ownerReviewAcknowledgedByUserId
      ? { status: "ok" }
      : {
          status: "error",
          message:
            "Migration review eligibility changed. Refresh and try again.",
        };
  });
}

export async function uploadAndStageMigrationCsv(args: {
  workspaceId: string;
  actor: MigrationReadinessActor;
  input: MigrationUploadInput;
  db?: MigrationDatabase;
}): Promise<MutationResult> {
  if (!getFlowstateOperatorId(args.actor)) {
    return internalMigrationOperationError;
  }

  const db = args.db ?? prisma;
  const recordKind = args.input.recordKind.trim();

  if (!isImportRecordKind(recordKind)) {
    return {
      status: "error",
      message: "Select a valid migration file type.",
    };
  }

  if (args.input.fileSizeBytes <= 0) {
    return {
      status: "error",
      message: "Upload a CSV file.",
    };
  }

  if (args.input.fileSizeBytes > 5 * 1024 * 1024) {
    return {
      status: "error",
      message: "Migration CSV files must be 5 MB or smaller.",
    };
  }

  let rows: Record<string, string>[];

  try {
    rows = parseCsvRows(args.input.fileData);
  } catch {
    return {
      status: "error",
      message: "Could not parse the CSV. Check the header row and quoting.",
    };
  }

  if (rows.length === 0) {
    return {
      status: "error",
      message: "The CSV does not contain any rows.",
    };
  }

  const rawContent = new TextDecoder("utf-8").decode(args.input.fileData);
  const result = await runSerializableWithRetry(db, async (tx) => {
    const migration = await tx.workspaceMigration.findUnique({
      where: { workspaceId: args.workspaceId },
      select: {
        stage: true,
        ownerReviewAcknowledgedAt: true,
      },
    });

    if (
      !migration ||
      migration.stage === "COMPLETE" ||
      migration.ownerReviewAcknowledgedAt
    ) {
      return {
        blocked: true as const,
        message: !migration
          ? "Migration workspace not found."
          : migration.ownerReviewAcknowledgedAt
            ? "Migration operations are frozen after owner review acknowledgment."
            : "Completed migrations cannot accept new import jobs.",
      };
    }

    const job = await tx.importJob.create({
      data: {
        workspaceId: args.workspaceId,
        sourceType: "CSV",
        status: "DRAFT",
        name: `${getMigrationStageLabel("MIGRATION_IN_PROGRESS")} - ${
          migrationRecordKindOptions.find(
            (option) => option.value === recordKind,
          )?.label ?? recordKind
        }`,
      },
      select: {
        id: true,
      },
    });
    const sourceFile = await tx.importSourceFile.create({
      data: {
        workspaceId: args.workspaceId,
        importJobId: job.id,
        fileName: args.input.fileName.trim() || "migration.csv",
        mimeType: args.input.mimeType ?? "text/csv",
        fileSizeBytes: args.input.fileSizeBytes,
        fileSha256: hashBytes(args.input.fileData),
        rawContent,
      },
      select: {
        id: true,
      },
    });
    let errorCount = 0;
    let issueCount = 0;

    for (const [index, row] of rows.entries()) {
      const stagedRow = buildStagedRow(recordKind, row);

      if (hasBlockingIssues(stagedRow)) {
        errorCount += 1;
      }

      issueCount += stagedRow.issues.length;

      const stagingRecord = await tx.stagingRecord.create({
        data: {
          workspaceId: args.workspaceId,
          importJobId: job.id,
          importSourceFileId: sourceFile.id,
          recordKind,
          sourceRowNumber: index + 2,
          externalId: stagedRow.externalId,
          rawData: stagedRow.rawData,
          mappedData: stagedRow.mappedData,
          isReadyForImport:
            productionImportKinds.has(recordKind) &&
            !hasBlockingIssues(stagedRow),
        },
        select: {
          id: true,
        },
      });

      for (const issue of stagedRow.issues) {
        await tx.validationIssue.create({
          data: {
            workspaceId: args.workspaceId,
            importJobId: job.id,
            stagingRecordId: stagingRecord.id,
            severity: issue.severity,
            code: issue.code,
            message: issue.message,
            fieldName: issue.fieldName ?? null,
          },
        });
      }
    }

    await tx.importJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: errorCount > 0 ? "MAPPED" : "VALIDATED",
      },
    });

    await tx.workspaceMigration.update({
      where: {
        workspaceId: args.workspaceId,
      },
      data: {
        stage: errorCount > 0 ? "EXPORTS_NEEDED" : "MIGRATION_IN_PROGRESS",
        nextOwnerAction:
          errorCount > 0
            ? "Review the CSV export and upload a corrected file for rows with validation errors."
            : "Flowstate has the exports needed for this import batch.",
        flowstateResponsibility:
          errorCount > 0
            ? "Flowstate will point out the blocking validation issues and help you produce a clean export."
            : "Flowstate will import the validated records and prepare a reconciliation summary.",
        expectedNextMilestone:
          errorCount > 0
            ? "Corrected export uploaded."
            : "Validated records imported and ready for review.",
      },
    });

    return {
      blocked: false as const,
      jobId: job.id,
      rowCount: rows.length,
      errorCount,
      issueCount,
    };
  });

  if (result.blocked) {
    return {
      status: "error",
      message: result.message,
    };
  }

  return {
    status: "ok",
    message: `Staged ${result.rowCount} row${
      result.rowCount === 1 ? "" : "s"
    } with ${result.errorCount} blocking issue${
      result.errorCount === 1 ? "" : "s"
    }.`,
  };
}

export async function runMigrationImport(args: {
  workspaceId: string;
  locationId: string;
  importJobId: string;
  actor: MigrationReadinessActor;
  db?: MigrationDatabase;
}): Promise<MutationResult> {
  if (!getFlowstateOperatorId(args.actor)) {
    return internalMigrationOperationError;
  }

  const db = args.db ?? prisma;

  try {
    return await runSerializableWithRetry(db, async (tx) => {
      const migration = await tx.workspaceMigration.findUnique({
        where: { workspaceId: args.workspaceId },
        select: {
          stage: true,
          ownerReviewAcknowledgedAt: true,
        },
      });

      if (!migration) {
        return {
          status: "error" as const,
          message: "Migration workspace not found.",
        };
      }

      if (migration.ownerReviewAcknowledgedAt) {
        return {
          status: "error" as const,
          message:
            "Migration operations are frozen after owner review acknowledgment.",
        };
      }

      if (migration.stage === "COMPLETE") {
        return {
          status: "error" as const,
          message: "Completed migrations cannot run imports.",
        };
      }

      const job = await tx.importJob.findFirst({
        where: {
          id: args.importJobId,
          workspaceId: args.workspaceId,
        },
        include: {
          validationIssues: true,
          stagingRecords: {
            where: { isReadyForImport: true },
            orderBy: [{ recordKind: "asc" }, { sourceRowNumber: "asc" }],
          },
        },
      });

      if (!job) {
        return { status: "error" as const, message: "Import job not found." };
      }

      if (job.status !== "VALIDATED") {
        return {
          status: "error" as const,
          message: "Only a validated import job can be started.",
        };
      }

      if (
        !productionImportKinds.has(job.stagingRecords[0]?.recordKind ?? "NOTE")
      ) {
        return {
          status: "error" as const,
          message: "This import job is staged for review only.",
        };
      }

      if (job.validationIssues.some((issue) => issue.severity === "ERROR")) {
        return {
          status: "error" as const,
          message: "Resolve blocking validation issues before importing.",
        };
      }

      if (job.stagingRecords.length === 0) {
        return {
          status: "error" as const,
          message: "No validated staging rows are ready for import.",
        };
      }

      const includesScheduleTemplates = job.stagingRecords.some(
        (stagingRecord) => stagingRecord.recordKind === "SCHEDULE_TEMPLATE",
      );
      const scheduleLocation = includesScheduleTemplates
        ? await tx.location.findFirst({
            where: {
              id: args.locationId,
              workspaceId: args.workspaceId,
            },
            select: { id: true },
          })
        : null;

      if (includesScheduleTemplates && !scheduleLocation) {
        return {
          status: "error" as const,
          message:
            "The selected migration location does not belong to this workspace.",
        };
      }

      const importClaim = await tx.importJob.updateMany({
        where: {
          id: job.id,
          workspaceId: args.workspaceId,
          status: "VALIDATED",
        },
        data: {
          status: "IMPORTING",
          startedAt: new Date(),
        },
      });

      if (importClaim.count !== 1) {
        return {
          status: "error" as const,
          message: "This import job is already running or no longer validated.",
        };
      }

      const summary = {
        created: 0,
        updated: 0,
        skipped: 0,
        recordKind: job.stagingRecords[0]?.recordKind ?? null,
      };

      for (const stagingRecord of job.stagingRecords) {
        let result: "created" | "updated" | "skipped";

        switch (stagingRecord.recordKind) {
          case "MEMBER":
            result = await importMember({
              db: tx,
              workspaceId: args.workspaceId,
              importJobId: job.id,
              stagingRecord,
            });
            break;
          case "MEMBERSHIP_PLAN":
            result = await importMembershipPlan({
              db: tx,
              workspaceId: args.workspaceId,
              importJobId: job.id,
              stagingRecord,
            });
            break;
          case "MEMBER_MEMBERSHIP":
            result = await importMemberMembership({
              db: tx,
              workspaceId: args.workspaceId,
              importJobId: job.id,
              stagingRecord,
            });
            break;
          case "PUNCH_CARD_BALANCE":
            result = await importPunchCardBalance({
              db: tx,
              workspaceId: args.workspaceId,
              importJobId: job.id,
              stagingRecord,
            });
            break;
          case "DROP_IN_PRODUCT":
            result = await importDropInProduct({
              db: tx,
              workspaceId: args.workspaceId,
              importJobId: job.id,
              stagingRecord,
            });
            break;
          case "SCHEDULE_TEMPLATE":
            if (!scheduleLocation) {
              throw new Error("Verified migration location is unavailable.");
            }

            result = await importScheduleTemplate({
              db: tx,
              workspaceId: args.workspaceId,
              locationId: scheduleLocation.id,
              importJobId: job.id,
              stagingRecord,
            });
            break;
          default:
            result = "skipped";
        }

        summary[result] += 1;
      }

      await tx.reconciliationReport.create({
        data: {
          workspaceId: args.workspaceId,
          importJobId: job.id,
          summary,
        },
      });
      await tx.importJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
      await updateMigrationStageForImport({
        db: tx,
        workspaceId: args.workspaceId,
        stage: "REVIEW_READY",
      });

      return {
        status: "ok" as const,
        message: `Imported ${summary.created} created, ${summary.updated} updated, and ${summary.skipped} skipped record${summary.skipped === 1 ? "" : "s"}.`,
      };
    });
  } catch {
    return {
      status: "error",
      message: "The import failed. Check the source data and retry.",
    };
  }
}

async function cancelMigrationImportInTransaction(args: {
  db: MigrationDatabase;
  workspaceId: string;
  importJobId: string;
  operatorId: string;
  reason: string;
}): Promise<MutationResult> {
  return runSerializableWithRetry(args.db, async (tx) => {
    const job = await tx.importJob.findFirst({
      where: {
        id: args.importJobId,
        workspaceId: args.workspaceId,
      },
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
        failedAt: true,
        cancelledAt: true,
        cancelledByOperatorId: true,
        cancellationReason: true,
      },
    });

    if (!job) {
      return { status: "error", message: "Import job not found." };
    }

    if (
      job.status === "CANCELLED" &&
      job.cancelledAt &&
      job.cancelledByOperatorId &&
      job.cancellationReason
    ) {
      return { status: "ok" };
    }

    const migration = await tx.workspaceMigration.findUnique({
      where: { workspaceId: args.workspaceId },
      select: { ownerReviewAcknowledgedAt: true },
    });

    if (!migration) {
      return { status: "error", message: "Migration workspace not found." };
    }

    if (migration.ownerReviewAcknowledgedAt) {
      return {
        status: "error",
        message:
          "Migration operations are frozen after owner review acknowledgment.",
      };
    }

    if (job.status !== "MAPPED" && job.status !== "CANCELLED") {
      return {
        status: "error",
        message:
          "Only an invalid mapped job without import side effects can be cancelled.",
      };
    }

    if (job.startedAt || job.completedAt || job.failedAt) {
      return {
        status: "error",
        message:
          "This import job has execution history and cannot be cancelled.",
      };
    }

    const blockingIssueCount = await tx.validationIssue.count({
      where: {
        importJobId: args.importJobId,
        severity: "ERROR",
        importJob: { workspaceId: args.workspaceId },
      },
    });
    const reconciliationCount = await tx.reconciliationReport.count({
      where: {
        importJobId: args.importJobId,
        workspaceId: args.workspaceId,
      },
    });
    const importedStagingCount = await tx.stagingRecord.count({
      where: {
        importJobId: args.importJobId,
        workspaceId: args.workspaceId,
        OR: [
          { importedAt: { not: null } },
          { importedModel: { not: null } },
          { importedRecordId: { not: null } },
        ],
      },
    });
    const importedRecordCount = await tx.migrationImportedRecord.count({
      where: {
        importJobId: args.importJobId,
        workspaceId: args.workspaceId,
      },
    });

    if (blockingIssueCount === 0) {
      return {
        status: "error",
        message:
          "Only a job with a blocking validation error can be cancelled.",
      };
    }

    if (
      reconciliationCount > 0 ||
      importedStagingCount > 0 ||
      importedRecordCount > 0
    ) {
      return {
        status: "error",
        message:
          "This import job has imported side effects and cannot be cancelled.",
      };
    }

    const cancellation = await tx.importJob.updateMany({
      where: {
        id: args.importJobId,
        workspaceId: args.workspaceId,
        status: job.status,
        cancelledAt: null,
        cancelledByOperatorId: null,
        cancellationReason: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledByOperatorId: args.operatorId,
        cancellationReason: args.reason,
      },
    });

    if (cancellation.count !== 1) {
      const current = await tx.importJob.findFirst({
        where: {
          id: args.importJobId,
          workspaceId: args.workspaceId,
        },
        select: {
          status: true,
          cancelledAt: true,
          cancelledByOperatorId: true,
          cancellationReason: true,
        },
      });

      return current?.status === "CANCELLED" &&
        current.cancelledAt &&
        current.cancelledByOperatorId &&
        current.cancellationReason
        ? { status: "ok" }
        : {
            status: "error",
            message: "Import job eligibility changed. Refresh and try again.",
          };
    }

    return { status: "ok" };
  });
}

export async function cancelMigrationImport(args: {
  workspaceId: string;
  importJobId: string;
  reason: string;
  actor: MigrationReadinessActor;
  db?: MigrationDatabase;
}): Promise<MutationResult> {
  const operatorId = getFlowstateOperatorId(args.actor);

  if (!operatorId) {
    return internalMigrationOperationError;
  }

  const reason = cleanNullable(args.reason);

  if (!reason) {
    return {
      status: "error",
      message: "A cancellation reason is required.",
    };
  }

  const db = args.db ?? prisma;
  return cancelMigrationImportInTransaction({
    db,
    workspaceId: args.workspaceId,
    importJobId: args.importJobId,
    operatorId,
    reason,
  });
}

export async function updateMigrationStage(args: {
  workspaceId: string;
  actor: MigrationReadinessActor;
  input: StageTransitionInput;
  db?: MigrationDatabase;
}): Promise<MutationResult> {
  if (!getFlowstateOperatorId(args.actor)) {
    return internalMigrationOperationError;
  }

  const db = args.db ?? prisma;
  const stage = args.input.stage;

  if (!isMigrationStage(stage)) {
    return {
      status: "error",
      message: "Select a valid migration stage.",
    };
  }

  if (stage === "COMPLETE") {
    return {
      status: "error",
      message: "Use the activation operation to complete a migration.",
    };
  }

  return runSerializableWithRetry(db, async (tx) => {
    const currentMigration = await tx.workspaceMigration.findUnique({
      where: { workspaceId: args.workspaceId },
      select: {
        stage: true,
        ownerReviewAcknowledgedAt: true,
      },
    });

    if (!currentMigration) {
      return { status: "error", message: "Migration workspace not found." };
    }

    if (currentMigration.ownerReviewAcknowledgedAt) {
      return {
        status: "error",
        message:
          "Migration operations are frozen after owner review acknowledgment.",
      };
    }

    if (currentMigration.stage === "COMPLETE") {
      return {
        status: "error",
        message:
          "Completed migrations cannot be moved back to an earlier stage.",
      };
    }

    const transition = await tx.workspaceMigration.updateMany({
      where: {
        workspaceId: args.workspaceId,
        stage: {
          not: "COMPLETE",
        },
        ownerReviewAcknowledgedAt: null,
      },
      data: {
        stage,
        nextOwnerAction:
          cleanNullable(args.input.nextOwnerAction) ?? defaultNextOwnerAction,
        flowstateResponsibility:
          cleanNullable(args.input.flowstateResponsibility) ??
          defaultFlowstateResponsibility,
        expectedNextMilestone:
          cleanNullable(args.input.expectedNextMilestone) ??
          defaultExpectedMilestone,
        expectedNextMilestoneAt: parseOptionalDateTime(
          args.input.expectedNextMilestoneAt,
        ),
        goLiveScheduledFor: parseDateOnly(args.input.goLiveScheduledFor),
      },
    });

    if (transition.count === 1) {
      return { status: "ok" };
    }

    const migration = await tx.workspaceMigration.findUnique({
      where: { workspaceId: args.workspaceId },
      select: {
        stage: true,
        ownerReviewAcknowledgedAt: true,
      },
    });

    return {
      status: "error",
      message: !migration
        ? "Migration workspace not found."
        : migration.ownerReviewAcknowledgedAt
          ? "Migration operations are frozen after owner review acknowledgment."
          : "Completed migrations cannot be moved back to an earlier stage.",
    };
  });
}

export async function markMigrationOperationallyReady(args: {
  workspaceId: string;
  actor: MigrationReadinessActor;
  db?: MigrationDatabase;
  now?: Date;
}): Promise<MutationResult> {
  if (args.actor.type !== "FLOWSTATE_OPERATOR") {
    return {
      status: "error",
      message:
        "Only an authorized Flowstate operator can activate daily operations.",
    };
  }

  if (!args.actor.actorId.trim()) {
    return {
      status: "error",
      message: "The Flowstate operator audit identity is required.",
    };
  }

  const operatorId = args.actor.actorId.trim();
  const db = args.db ?? prisma;
  const now = args.now ?? new Date();

  return runSerializableWithRetry(db, async (tx) => {
    const migration = await tx.workspaceMigration.findUnique({
      where: {
        workspaceId: args.workspaceId,
      },
      select: {
        stage: true,
        goLiveScheduledFor: true,
        ownerReviewAcknowledgedAt: true,
        ownerReviewAcknowledgedByUserId: true,
        operationallyReadyAt: true,
        operationallyReadyByUserId: true,
        workspace: {
          select: {
            status: true,
            location: { select: { timezone: true } },
          },
        },
      },
    });

    if (migration?.stage === "COMPLETE") {
      return migration.ownerReviewAcknowledgedAt &&
        migration.ownerReviewAcknowledgedByUserId &&
        migration.operationallyReadyAt &&
        migration.operationallyReadyByUserId &&
        migration.workspace.status === "ACTIVE"
        ? { status: "ok" }
        : {
            status: "error",
            message: "Migration completion state is inconsistent.",
          };
    }

    if (!isMigrationCorrectionChannelAvailable()) {
      return {
        status: "error",
        reason: "correction-channel-unavailable",
        message:
          "The migration correction channel is unavailable. Activation was not recorded.",
      };
    }

    if (
      !migration ||
      migration.stage !== "GO_LIVE_SCHEDULED" ||
      migration.workspace.status !== "SETUP_INCOMPLETE" ||
      migration.operationallyReadyAt ||
      migration.operationallyReadyByUserId
    ) {
      return {
        status: "error",
        message: "Migration activation requires the approved go-live stage.",
      };
    }

    if (
      !migration.ownerReviewAcknowledgedAt ||
      !migration.ownerReviewAcknowledgedByUserId
    ) {
      return {
        status: "error",
        message:
          "Owner migration review must be acknowledged before activation.",
      };
    }

    const schedule = classifyAcknowledgedSchedule({
      goLiveScheduledFor: migration.goLiveScheduledFor,
      launchTimezone: migration.workspace.location?.timezone ?? null,
      ownerReviewAcknowledgedAt: migration.ownerReviewAcknowledgedAt,
    });

    if (schedule.status === "invalid") {
      const message =
        schedule.reason === "schedule-missing"
          ? "Migration activation requires a confirmed go-live schedule."
          : schedule.reason === "schedule-passed"
            ? "The scheduled go-live date was already past when owner review was acknowledged."
            : "Migration activation requires a valid launch timezone.";

      return { status: "error", reason: schedule.reason, message };
    }

    const blockingValidationIssueCount = await tx.validationIssue.count({
      where: {
        severity: "ERROR",
        importJob: {
          workspaceId: args.workspaceId,
          NOT: {
            status: "CANCELLED",
            cancelledAt: { not: null },
            cancelledByOperatorId: { not: null },
            cancellationReason: { not: null },
          },
        },
      },
    });

    if (blockingValidationIssueCount > 0) {
      return {
        status: "error",
        message:
          "Resolve blocking migration validation issues before activation.",
      };
    }

    const reconciledCompletedImportCount = await tx.importJob.count({
      where: {
        workspaceId: args.workspaceId,
        status: "COMPLETED",
        reconciliationReports: {
          some: { workspaceId: args.workspaceId },
        },
      },
    });

    if (reconciledCompletedImportCount === 0) {
      return {
        status: "error",
        message:
          "Complete at least one migration import with reconciliation evidence before activation.",
      };
    }

    const unresolvedReconciliationCount = await tx.importJob.count({
      where: {
        workspaceId: args.workspaceId,
        NOT: {
          OR: [
            {
              status: "COMPLETED",
              reconciliationReports: {
                some: { workspaceId: args.workspaceId },
              },
            },
            {
              status: "CANCELLED",
              cancelledAt: { not: null },
              cancelledByOperatorId: { not: null },
              cancellationReason: { not: null },
            },
          ],
        },
      },
    });

    if (unresolvedReconciliationCount > 0) {
      return {
        status: "error",
        message: "Complete migration reconciliation before activation.",
      };
    }

    const operationallyReadyAt = now;
    const completedMigration = await tx.workspaceMigration.updateMany({
      where: {
        workspaceId: args.workspaceId,
        stage: "GO_LIVE_SCHEDULED",
        goLiveScheduledFor: migration.goLiveScheduledFor,
        ownerReviewAcknowledgedAt: migration.ownerReviewAcknowledgedAt,
        ownerReviewAcknowledgedByUserId:
          migration.ownerReviewAcknowledgedByUserId,
        operationallyReadyAt: null,
        operationallyReadyByUserId: null,
        workspace: {
          status: "SETUP_INCOMPLETE",
          location: { timezone: migration.workspace.location?.timezone },
        },
      },
      data: {
        stage: "COMPLETE",
        operationallyReadyAt,
        operationallyReadyByUserId: operatorId,
        nextOwnerAction:
          "No further owner review is pending. Daily operations are active.",
        flowstateResponsibility:
          "Flowstate completed the reviewed handoff and recorded the workspace as ready for daily operations.",
        expectedNextMilestone: "Daily operations are active in Flowstate.",
      },
    });
    if (completedMigration.count !== 1) {
      throw new Error("Migration activation eligibility changed.");
    }

    const activatedWorkspace = await tx.workspace.updateMany({
      where: {
        id: args.workspaceId,
        status: "SETUP_INCOMPLETE",
      },
      data: {
        status: "ACTIVE",
      },
    });
    if (activatedWorkspace.count !== 1) {
      throw new Error("Workspace activation eligibility changed.");
    }

    return {
      status: "ok",
    };
  });
}
