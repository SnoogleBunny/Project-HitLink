export interface MembershipLifecyclePolicy {
  version: number;
  noticeLength: number;
  noticeUnit: "CALENDAR_MONTHS" | "BILLING_CYCLES" | "DAYS";
  alignment: "EXACT_DATE" | "NEXT_BILLING_BOUNDARY";
  noticeBilling: "CONTINUE" | "OWNER_REVIEW";
  approvalRequired: boolean;
  collectExistingDebt: boolean;
  allowMemberCancellation: boolean;
  allowMemberFreeze: boolean;
  freezeEnabled: boolean;
  freezeMaxCycles: number;
}
export const defaultMembershipLifecyclePolicy: MembershipLifecyclePolicy = {
  version: 1, noticeLength: 2, noticeUnit: "CALENDAR_MONTHS", alignment: "NEXT_BILLING_BOUNDARY",
  noticeBilling: "CONTINUE", approvalRequired: true, collectExistingDebt: false,
  allowMemberCancellation: true, allowMemberFreeze: true, freezeEnabled: true, freezeMaxCycles: 12,
};
/** Missing legacy terms never acquire a new notice period merely because settings changed. */
export function parseMembershipLifecyclePolicy(value: unknown): MembershipLifecyclePolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as MembershipLifecyclePolicy;
  if (!Number.isSafeInteger(v.version) || v.version < 1 || !Number.isSafeInteger(v.noticeLength) || v.noticeLength < 0 ||
      !["CALENDAR_MONTHS", "BILLING_CYCLES", "DAYS"].includes(v.noticeUnit) || !["EXACT_DATE", "NEXT_BILLING_BOUNDARY"].includes(v.alignment) ||
      !["CONTINUE", "OWNER_REVIEW"].includes(v.noticeBilling) || !Number.isSafeInteger(v.freezeMaxCycles) || v.freezeMaxCycles < 1 ||
      ![v.approvalRequired, v.collectExistingDebt, v.allowMemberCancellation, v.allowMemberFreeze, v.freezeEnabled].every((b) => typeof b === "boolean")) return null;
  return { version: v.version, noticeLength: v.noticeLength, noticeUnit: v.noticeUnit, alignment: v.alignment, noticeBilling: v.noticeBilling,
    approvalRequired: v.approvalRequired, collectExistingDebt: v.collectExistingDebt, allowMemberCancellation: v.allowMemberCancellation,
    allowMemberFreeze: v.allowMemberFreeze, freezeEnabled: v.freezeEnabled, freezeMaxCycles: v.freezeMaxCycles };
}
