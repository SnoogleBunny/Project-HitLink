export type CoachingView = "plan" | "notes" | "appointments" | "manage";

export function coachingView(value: unknown): CoachingView {
  return value === "notes" || value === "appointments" || value === "manage"
    ? value
    : "plan";
}

export function coachingViewForAction(kind: string): CoachingView {
  if (
    [
      "saveDailyNote",
      "publishDailyNote",
      "withdrawDailyNote",
      "savePrivateNote",
      "approveRecordReview",
      "revokeRecordReview",
    ].includes(kind)
  )
    return "notes";
  if (
    [
      "bookAppointment",
      "moveAppointment",
      "cancelAppointment",
      "completeAppointment",
      "resolveAppointment",
    ].includes(kind)
  )
    return "appointments";
  if (
    [
      "proposeCoach",
      "revokeCoach",
      "close",
      "proposePlan",
      "proposeSettlement",
      "confirmSettlement",
      "recordSettlement",
      "resolveDeliveryException",
      "proposeRecordReview",
      "resolveRecordIncident",
    ].includes(kind)
  )
    return "manage";
  return "plan";
}

export function coachingHref(id: string, view: CoachingView = "plan") {
  return `/dashboard/coaching/${encodeURIComponent(id)}?view=${view}`;
}

export function coachingReturnPath(args: {
  enrollmentId: string;
  kind: string;
  returnView?: unknown;
  returnReviewId?: string;
}) {
  if (
    args.returnReviewId &&
    ["approveRecordReview", "revokeRecordReview"].includes(args.kind)
  )
    return `/dashboard/coaching/reviews/${encodeURIComponent(args.returnReviewId)}`;
  return args.enrollmentId
    ? coachingHref(
        args.enrollmentId,
        args.returnView
          ? coachingView(args.returnView)
          : coachingViewForAction(args.kind),
      )
    : "/dashboard/coaching";
}

export function coachingFeedback(path: string, key: string, value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams({ [key]: value })}`;
}
