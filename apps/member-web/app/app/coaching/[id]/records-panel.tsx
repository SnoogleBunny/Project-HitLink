import { randomUUID } from "node:crypto";
import {
  getCoachingRecordReview,
  getCoachingReviewAuthorization,
  type CoachingActor,
} from "@flowstate/db";
import { coachingDay, coachingTime } from "../../../../lib/coaching-fields";
import { CoachingForm } from "../form";

export async function CoachingRecordsPanel({
  actor,
  enrollmentId,
  version,
  timezone,
}: {
  actor: CoachingActor;
  enrollmentId: string;
  version: number;
  timezone: string;
}) {
  const data = await getCoachingRecordReview(actor, enrollmentId);
  const grants = await Promise.all(
    data.grants.map((grant) => getCoachingReviewAuthorization(actor, grant.id)),
  );
  if (!data.withdrawals.length && !grants.length) return null;
  const form = { enrollmentId, version };
  return (
    <section className="member-card">
      <h2>Record corrections and consent</h2>
      {data.withdrawals.map((note) => (
        <p key={note.id}>
          The note for {coachingDay(note.localDate)} was withdrawn. Contact your
          coach about a corrected version. Any copy you already downloaded is
          unchanged.
        </p>
      ))}
      {grants.map((grant) => (
        <article key={grant.id}>
          <h3>Private-record review request</h3>
          <p>{grant.purpose}</p>
          <p>
            Reviewer: {grant.reviewerName}. Author: {grant.authorName}. Exact
            dates:{" "}
            {grant.notes.map((note) => coachingDay(note.localDate)).join(", ")}.
            Expires {coachingTime(grant.expiresAt, timezone)}.
          </p>
          <p>
            This allows only the named reviewer to read these private notes for
            the stated purpose. It does not add private notes to your download.
          </p>
          {!grant.revokedAt && grant.expiresAt > new Date() ? (
            <>
              {!grant.clientApprovedAt ? (
                <CoachingForm
                  {...form}
                  kind="approveRecordReview"
                  operationId={randomUUID()}
                  submit="Give my consent"
                >
                  <input type="hidden" name="grantId" value={grant.id} />
                  <label className="checkbox-field">
                    <input
                      name="confirmConsequences"
                      type="checkbox"
                      required
                    />
                    I have reviewed the person, exact records, purpose and
                    expiry and consent to this review.
                  </label>
                </CoachingForm>
              ) : (
                <p>Your consent was recorded.</p>
              )}
              <CoachingForm
                {...form}
                kind="revokeRecordReview"
                operationId={randomUUID()}
                submit="Revoke review access"
              >
                <input type="hidden" name="grantId" value={grant.id} />
              </CoachingForm>
            </>
          ) : (
            <p>{grant.revokedAt ? "Revoked" : "Expired"}.</p>
          )}
        </article>
      ))}
    </section>
  );
}
