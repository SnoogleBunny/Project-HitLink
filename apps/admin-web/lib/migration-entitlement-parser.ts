import {
  parseDateOnlyString,
  parseMembershipLifecyclePolicy,
  type Prisma,
} from "@flowstate/db";
type Kind =
  | "MEMBER_MEMBERSHIP"
  | "PUNCH_CARD_BALANCE"
  | "ALLOWANCE_USAGE"
  | "FUTURE_BOOKING";
type Json = Record<string, unknown>;
export interface EntitlementStagedRow {
  externalId: string | null;
  rawData: Prisma.JsonObject;
  mappedData: Prisma.JsonObject;
  issues: Array<{
    severity: "ERROR";
    code: string;
    message: string;
    fieldName?: string;
  }>;
}
export class MigrationEntitlementError extends Error {}
function fail(message: string): never {
  throw new MigrationEntitlementError(message);
}
function required(row: Record<string, string>, key: string) {
  const value = row[key]?.trim();
  if (!value) fail(`${key} is required; source values cannot be guessed.`);
  return value;
}
function object(value: unknown, name: string): Json {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${name} must be an object.`);
  return value as Json;
}
function whole(value: unknown, name: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    fail(`${name} must be a whole number of at least ${minimum}.`);
  return value as number;
}
function integer(row: Record<string, string>, key: string, minimum = 0) {
  const value = required(row, key);
  if (!/^\d+$/.test(value)) fail(`${key} must be a whole number.`);
  return whole(Number(value), key, minimum);
}
function day(row: Record<string, string>, key: string) {
  const value = required(row, key);
  if (parseDateOnlyString(value).status === "error")
    fail(`${key} must be an exact YYYY-MM-DD source date.`);
  return value;
}
function boolean(value: unknown, name: string) {
  if (typeof value !== "boolean")
    fail(`${name} must be explicitly true or false.`);
  return value;
}
function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  name: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    fail(`${name} must be one of ${choices.join(", ")}.`);
  return value as T;
}
function parseJson(row: Record<string, string>, key: string) {
  try {
    return object(JSON.parse(required(row, key)), key);
  } catch (error) {
    if (error instanceof MigrationEntitlementError) throw error;
    return fail(`${key} must contain valid JSON.`);
  }
}
function currency(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z]{3}$/.test(value))
    fail("Accepted terms must include an explicit three-letter currency.");
  return value.toLowerCase();
}
function sourceTerms(row: Record<string, string>, kind: "MEMBERSHIP" | "PACK") {
  const source = parseJson(row, "accepted_terms");
  whole(source.version, "Accepted version", 1);
  if (
    typeof source.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(source.capturedAt))
  )
    fail("Accepted terms require the original acceptance timestamp.");
  if (
    !Array.isArray(source.programIds) ||
    !source.programIds.every((id) => typeof id === "string" && id.trim())
  )
    fail(
      "Map source programs to explicit destination programIds; use [] only for unrestricted access.",
    );
  if (new Set(source.programIds).size !== source.programIds.length)
    fail("Accepted program IDs must be unique.");
  const common: Json = {
    ...source,
    currency: currency(source.currency),
    programIds: [...source.programIds].sort(),
  };
  if (kind === "PACK") {
    whole(source.originalPunches, "Accepted original punches", 1);
    whole(source.priceCents, "Accepted price cents");
    choice(
      source.restrictionMode,
      ["GENERAL", "PROGRAM_RESTRICTED"] as const,
      "Pack restriction mode",
    );
    if (
      source.restrictionMode === "PROGRAM_RESTRICTED" &&
      !source.programIds.length
    )
      fail("Restricted packs need at least one mapped program.");
    if (source.restrictionMode === "GENERAL" && source.programIds.length)
      fail("General packs cannot silently retain a program restriction.");
    boolean(
      source.lateCancellationConsumesPunch,
      "Accepted late-cancel policy",
    );
    boolean(source.noShowConsumesPunch, "Accepted no-show policy");
  } else {
    whole(source.monthlyPriceCents, "Accepted monthly price cents");
    for (const key of ["weeklyClassLimit", "monthlyClassLimit"])
      if (source[key] !== null) whole(source[key], key, 1);
    choice(
      source.allowanceCountingMode,
      ["RESERVATION", "ATTENDANCE"] as const,
      "Accepted counting mode",
    );
    boolean(
      source.lateCancellationConsumesClass,
      "Accepted late-cancel policy",
    );
    boolean(source.noShowConsumesClass, "Accepted no-show policy");
    if (!parseMembershipLifecyclePolicy(source.lifecyclePolicy))
      fail(
        "Map the complete accepted cancellation/freeze policy; today's defaults are not source acceptance.",
      );
  }
  return common;
}
export function buildEntitlementStagedRow(
  kind: Kind,
  row: Record<string, string>,
): EntitlementStagedRow {
  const issues: EntitlementStagedRow["issues"] = [];
  const externalId = row.external_id?.trim() || row.id?.trim() || null;
  let mapped: Json = {};
  try {
    if (!externalId) fail("external_id is required for safe replay.");
    const sourceEvidence = required(row, "source_evidence");
    if (kind === "MEMBER_MEMBERSHIP") {
      const allowanceTimezone = required(row, "allowance_timezone");
      try {
        new Intl.DateTimeFormat("en", { timeZone: allowanceTimezone }).format();
      } catch {
        fail("allowance_timezone must be a named valid timezone.");
      }
      const startedOn = day(row, "started_on"),
        nextBillingDate = day(row, "next_billing_date"),
        paidThrough = day(row, "paid_through"),
        paidFrom = day(row, "paid_from");
      if (
        !(
          startedOn <= paidFrom &&
          paidFrom < paidThrough &&
          paidThrough <= nextBillingDate
        )
      )
        fail("Source start, paid interval and next billing date do not agree.");
      mapped = {
        externalId,
        memberExternalId: required(row, "member_external_id"),
        planExternalId: required(row, "membership_plan_external_id"),
        status: choice(
          required(row, "status"),
          ["ACTIVE"] as const,
          "Current source-billed contract status",
        ),
        startedOn,
        nextBillingDate,
        allowanceAnchorDate: day(row, "allowance_anchor_date"),
        allowanceTimezone,
        paidFrom,
        paidThrough,
        sourceSystem: required(row, "source_system"),
        sourceAccountReference: required(row, "source_account_reference"),
        sourceContractReference: required(row, "source_contract_reference"),
        sourceEvidence,
        acceptanceEvidence: required(row, "acceptance_evidence"),
        payerAuthorityEvidence: required(row, "payer_authority_evidence"),
        acceptedTerms: sourceTerms(row, "MEMBERSHIP"),
      };
    } else if (kind === "PUNCH_CARD_BALANCE") {
      const acceptedTerms = sourceTerms(row, "PACK"),
        available = integer(row, "available_punches"),
        reserved = integer(row, "reserved_punches"),
        purchasedOn = day(row, "purchased_on");
      if (available + reserved > (acceptedTerms.originalPunches as number))
        fail(
          "Available and reserved source punches exceed the accepted original pack.",
        );
      const expiry = required(row, "expires_on"),
        expiresOn = expiry === "NONE" ? null : day(row, "expires_on");
      if (expiresOn && expiresOn < purchasedOn)
        fail("Pack expiry precedes purchase.");
      mapped = {
        externalId,
        memberExternalId: required(row, "member_external_id"),
        productExternalId: required(row, "product_external_id"),
        productName: required(row, "product_name"),
        available,
        reserved,
        purchasedOn,
        expiresOn,
        sourceEvidence,
        acceptanceEvidence: required(row, "acceptance_evidence"),
        acceptedTerms,
      };
    } else if (kind === "ALLOWANCE_USAGE") {
      const periodStart = day(row, "period_start"),
        periodEnd = day(row, "period_end"),
        asOfDate = day(row, "as_of_date");
      if (!(periodStart <= asOfDate && asOfDate < periodEnd))
        fail("Opening usage must belong to the exact current source window.");
      mapped = {
        externalId,
        membershipExternalId: required(row, "membership_external_id"),
        kind: choice(
          required(row, "period_kind"),
          ["WEEK", "BILLING_MONTH"] as const,
          "Allowance kind",
        ),
        periodStart,
        periodEnd,
        asOfDate,
        usedCount: integer(row, "used_count"),
        sourceEvidence,
      };
    } else {
      const fundingType = choice(
        required(row, "funding_type"),
        ["MEMBERSHIP", "PUNCH_CARD", "TRIAL", "SOURCE_PAYMENT"] as const,
        "Booking funding type",
      );
      mapped = {
        externalId,
        memberExternalId: required(row, "member_external_id"),
        templateExternalId: required(row, "class_template_external_id"),
        scheduledForDate: day(row, "scheduled_for_date"),
        fundingType,
        fundingExternalId:
          fundingType === "TRIAL" ? null : required(row, "funding_external_id"),
        guardianExternalId: row.guardian_external_id?.trim() || null,
        sourceEvidence,
      };
      if (fundingType === "SOURCE_PAYMENT")
        mapped = {
          ...mapped,
          sourceSystem: required(row, "source_system"),
          dropInProductExternalId: required(row, "drop_in_product_external_id"),
          amountCents: integer(row, "amount_cents", 1),
          currency: currency(required(row, "currency")),
          allocationReference: required(row, "source_allocation_reference"),
        };
    }
  } catch (error) {
    issues.push({
      severity: "ERROR",
      code: "SOURCE_ENTITLEMENT_REVIEW",
      message:
        error instanceof Error
          ? error.message
          : "Source entitlement needs review.",
    });
  }
  return {
    externalId,
    rawData: row,
    mappedData: JSON.parse(JSON.stringify(mapped)) as Prisma.JsonObject,
    issues,
  };
}
