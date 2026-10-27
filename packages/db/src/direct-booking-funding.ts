import { createHash } from "node:crypto";

export type DirectBookingFunding =
  | { kind: "MEMBERSHIP"; id: string; version: string; classReservations: 1 }
  | { kind: "PUNCH_CARD"; id: string; version: string; units: 1 }
  | {
      kind: "DROP_IN";
      id: string;
      version: string;
      amountCents: number;
      currency: string;
    };

export interface DirectBookingFundingReview {
  schemaVersion: 1;
  workspaceId: string;
  memberId: string;
  classTemplateId: string;
  scheduledForDate: string;
  occurrence: {
    programId: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    cancellationCutoffMinutes: number;
  };
  funding: DirectBookingFunding;
  reviewHash: string;
}

export const directBookingReviewMessage =
  "The class or reviewed funding changed. Refresh booking choices and review this class again. No new booking or payment was created.";

export class DirectBookingFundingReviewError extends Error {
  constructor() {
    super(directBookingReviewMessage);
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

/** A stale-commercial-version comparison; never an authority or payment credential. */
export function directBookingCommercialVersion(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export function buildDirectBookingFundingReview(
  value: Omit<DirectBookingFundingReview, "schemaVersion" | "reviewHash">,
): DirectBookingFundingReview {
  const body = {
    schemaVersion: 1 as const,
    workspaceId: value.workspaceId,
    memberId: value.memberId,
    classTemplateId: value.classTemplateId,
    scheduledForDate: value.scheduledForDate,
    occurrence: value.occurrence,
    funding: value.funding,
  };
  return { ...body, reviewHash: directBookingCommercialVersion(body) };
}

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const text = (value: unknown, max = 150): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const instant = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

/** Strictly bounded posted input. Authentication and current participant authority remain separate. */
export function parseDirectBookingFundingReview(
  value: unknown,
): DirectBookingFundingReview {
  const invalid = (): never => {
    throw new DirectBookingFundingReviewError();
  };
  let parsed = value;
  if (typeof value === "string") {
    if (value.length > 4096) return invalid();
    try {
      parsed = JSON.parse(value);
    } catch {
      return invalid();
    }
  }
  const root = object(parsed),
    occurrence = object(root?.occurrence),
    funding = object(root?.funding);
  if (
    !root ||
    !exact(root, [
      "schemaVersion",
      "workspaceId",
      "memberId",
      "classTemplateId",
      "scheduledForDate",
      "occurrence",
      "funding",
      "reviewHash",
    ]) ||
    root.schemaVersion !== 1 ||
    !text(root.workspaceId) ||
    !text(root.memberId) ||
    !text(root.classTemplateId) ||
    typeof root.scheduledForDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(root.scheduledForDate) ||
    !occurrence ||
    !exact(occurrence, [
      "programId",
      "startsAt",
      "endsAt",
      "timezone",
      "cancellationCutoffMinutes",
    ]) ||
    !text(occurrence.programId) ||
    !instant(occurrence.startsAt) ||
    !instant(occurrence.endsAt) ||
    occurrence.startsAt >= occurrence.endsAt ||
    !text(occurrence.timezone, 100) ||
    !Number.isSafeInteger(occurrence.cancellationCutoffMinutes) ||
    Number(occurrence.cancellationCutoffMinutes) < 0 ||
    !funding ||
    !text(funding.id) ||
    !hash(funding.version) ||
    !hash(root.reviewHash)
  )
    return invalid();
  if (funding.kind === "MEMBERSHIP") {
    if (
      !exact(funding, ["kind", "id", "version", "classReservations"]) ||
      funding.classReservations !== 1
    )
      return invalid();
  } else if (funding.kind === "PUNCH_CARD") {
    if (
      !exact(funding, ["kind", "id", "version", "units"]) ||
      funding.units !== 1
    )
      return invalid();
  } else if (funding.kind === "DROP_IN") {
    if (
      !exact(funding, ["kind", "id", "version", "amountCents", "currency"]) ||
      !Number.isSafeInteger(funding.amountCents) ||
      Number(funding.amountCents) < 0 ||
      typeof funding.currency !== "string" ||
      !/^[a-z]{3}$/.test(funding.currency)
    )
      return invalid();
  } else return invalid();
  const review = root as unknown as DirectBookingFundingReview;
  const current = buildDirectBookingFundingReview({
    workspaceId: review.workspaceId,
    memberId: review.memberId,
    classTemplateId: review.classTemplateId,
    scheduledForDate: review.scheduledForDate,
    occurrence: review.occurrence,
    funding: review.funding,
  });
  if (current.reviewHash !== review.reviewHash) return invalid();
  return current;
}
