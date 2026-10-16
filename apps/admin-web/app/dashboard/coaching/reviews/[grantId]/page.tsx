import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  getCoachingReviewAuthorization,
  readExceptionalCoachingNotes,
} from "@flowstate/db";
import { Notice } from "@flowstate/ui";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOperationsWorkspaceContext } from "../../../../../lib/operations-workspace";
import { coachingDay, coachingTime } from "../../../../../lib/coaching-fields";
import { CoachingForm } from "../../form";

export const dynamic = "force-dynamic";
export default async function RecordReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ grantId: string }>;
  searchParams: Promise<{ read?: string; error?: string; saved?: string }>;
}) {
  const context = await requireOperationsWorkspaceContext();
  const { grantId } = await params;
  const query = await searchParams;
  const actor = {
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  };
  const review = await getCoachingReviewAuthorization(actor, grantId);
  const active = !review.revokedAt && review.expiresAt > new Date();
  let read: Awaited<ReturnType<typeof readExceptionalCoachingNotes>> | null =
    null;
  let readError = "";
  if (query.read === "1") {
    try {
      read = await readExceptionalCoachingNotes(actor, grantId);
    } catch {
      readError =
        "The required authorizations are incomplete, expired or revoked. Private records were not opened.";
    }
  }
  const common = { enrollmentId: review.enrollmentId, version: review.version };
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Restricted record review"
      description="An exact, temporary authorization for a named reviewer."
      actions={<Link href="/dashboard/coaching">Coaching</Link>}
    >
      {query.error || readError ? (
        <Notice tone="danger">{query.error || readError}</Notice>
      ) : query.saved ? (
        <Notice tone="success">Saved.</Notice>
      ) : null}
      <section className="management-card">
        <h2>Review authorization</h2>
        <p>{review.purpose}</p>
        <p>
          Reviewer: {review.reviewerName}. Author: {review.authorName}.
        </p>
        <p>
          Expires {coachingTime(review.expiresAt, context.location.timezone)}.{" "}
          {review.revokedAt
            ? "Revoked."
            : active
              ? "Current authorization window."
              : "Expired."}
        </p>
        <p>
          Client consent: {review.clientApprovedAt ? "Received" : "Pending"}.
          Author consent: {review.authorApprovedAt ? "Received" : "Pending"}.
        </p>
        <p>
          Exact records:{" "}
          {review.notes
            .map((note) => `${coachingDay(note.localDate)} (${note.id})`)
            .join(", ")}
        </p>
        {active && review.canConsent ? (
          <CoachingForm
            {...common}
            kind="approveRecordReview"
            operationId={randomUUID()}
            submit="Give my consent"
          >
            <input type="hidden" name="grantId" value={review.id} />
            <input type="hidden" name="returnReviewId" value={review.id} />
            <label className="checkbox-field">
              <input type="checkbox" name="confirmConsequences" required />I
              authorize this named reviewer to read only these records for this
              purpose until the stated expiry.
            </label>
          </CoachingForm>
        ) : null}
        {active ? (
          <CoachingForm
            {...common}
            kind="revokeRecordReview"
            operationId={randomUUID()}
            submit="Revoke review access"
          >
            <input type="hidden" name="grantId" value={review.id} />
            <input type="hidden" name="returnReviewId" value={review.id} />
          </CoachingForm>
        ) : null}
        {active &&
        review.isReviewer &&
        review.clientApprovedAt &&
        review.authorApprovedAt ? (
          <form method="get">
            <input type="hidden" name="read" value="1" />
            <button className="button" type="submit">
              Open authorized records
            </button>
            <p>
              Each read is audited. This authorization does not permit export.
            </p>
          </form>
        ) : null}
      </section>
      {read ? (
        <section className="management-card">
          <h2>Authorized private records</h2>
          {read.notes.map((note) => (
            <article key={note.id}>
              <h3>{coachingDay(note.localDate)}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{note.body}</p>
            </article>
          ))}
        </section>
      ) : null}
    </AdminShell>
  );
}
