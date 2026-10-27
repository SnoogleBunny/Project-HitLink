export type CoachingView = "notes" | "program" | "appointments";

export function coachingView(value: unknown): CoachingView {
  return value === "program" || value === "appointments" ? value : "notes";
}

export function coachingViewForAction(kind: string): CoachingView {
  return [
    "bookAppointment",
    "moveAppointment",
    "cancelAppointment",
    "disputeAppointment",
  ].includes(kind)
    ? "appointments"
    : "program";
}

export function coachingHref(id: string, view: CoachingView = "notes") {
  return `/app/coaching/${encodeURIComponent(id)}?view=${view}`;
}

export function coachingReturnPath(args: {
  enrollmentId: string;
  kind: string;
  returnView?: unknown;
  payerGrantId?: string;
}) {
  if (args.payerGrantId)
    return `/app/coaching/payments/${encodeURIComponent(args.payerGrantId)}`;
  return args.enrollmentId
    ? coachingHref(
        args.enrollmentId,
        args.returnView
          ? coachingView(args.returnView)
          : coachingViewForAction(args.kind),
      )
    : "/app/coaching";
}

export function coachingFeedback(path: string, key: string, value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams({ [key]: value })}`;
}
