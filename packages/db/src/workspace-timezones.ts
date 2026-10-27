import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "./client.js";
import { toDateOnlyString } from "./occurrences.js";

export interface TimezoneRevision {
  version: number;
  previousTimezone: string;
  timezone: string;
  effectiveFromDate: Date | string;
  effectiveAt: Date;
}

/** Date keys are business calendar identities, never parsed as viewer-local dates. */
export function timezoneForOccurrenceDate(baselineTimezone: string, revisions: readonly TimezoneRevision[], date: string): string {
  return [...revisions]
    .filter(revision => (typeof revision.effectiveFromDate === "string" ? revision.effectiveFromDate : toDateOnlyString(revision.effectiveFromDate)) <= date)
    .sort((a, b) => b.version - a.version)[0]?.timezone ?? baselineTimezone;
}

export function timezoneAtInstant(baselineTimezone: string, revisions: readonly TimezoneRevision[], instant: Date): string {
  return [...revisions].filter(revision => revision.effectiveAt <= instant).sort((a, b) => b.version - a.version)[0]?.timezone ?? baselineTimezone;
}

export function canonicalWorkspaceTimezone(value: string): string | null {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value.trim())) return null;
  try { return new Intl.DateTimeFormat("en", { timeZone: value.trim() }).resolvedOptions().timeZone; }
  catch { return null; }
}

type TimezoneDatabase = Pick<Prisma.TransactionClient, "workspaceTimezoneRevision">;

/** Resolve the current clock; accepted membership/coaching timezones stay on their contracts. */
export async function resolveWorkspaceClockTimezone(args: { workspaceId: string; baselineTimezone: string; now?: Date; db?: TimezoneDatabase | PrismaClient }): Promise<string> {
  const db = args.db ?? prisma;
  // Legacy injected read-only adapters have no revision delegate; live Prisma always does.
  const revisions = await db.workspaceTimezoneRevision?.findMany({ where: { workspaceId: args.workspaceId }, orderBy: { version: "asc" } }) ?? [];
  return timezoneAtInstant(args.baselineTimezone, revisions, args.now ?? new Date());
}
