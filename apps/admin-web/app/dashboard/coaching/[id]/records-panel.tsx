import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getCoachingRecordReview, type CoachingActor } from "@flowstate/db";
import {
  CoachingField as Field,
  coachingDay,
  coachingDayLabel as knownCoachingDayLabel,
} from "../../../../lib/coaching-fields";
import { CoachingForm } from "../form";
import type { CoachingView } from "../navigation";

export async function CoachingRecordsPanel({
  actor,
  enrollmentId,
  version,
  owner,
  coaches,
  returnView,
  locale = "en-CA",
}: {
  actor: CoachingActor;
  enrollmentId: string;
  version: number;
  owner: boolean;
  coaches: { id: string; user: { fullName: string | null; email: string } }[];
  returnView?: CoachingView;
  locale?: string;
}) {
  const coachingDayLabel = (value: Date) =>
    knownCoachingDayLabel(value, locale);
  const data = await getCoachingRecordReview(actor, enrollmentId);
  const form = { enrollmentId, version, returnView };
  return (
    <section className="management-card">
      <h2>Record corrections and review</h2>
      {data.withdrawals.map((note) => (
        <p key={note.id}>
          The publication for {coachingDayLabel(note.localDate)} was withdrawn.
          Previous copies cannot be recalled.
        </p>
      ))}
      {owner ? (
        <>
          <p>
            Owners can contain a publication and review its delivery. This does
            not reveal coaching content or private notes.
          </p>
          {data.publications.map((note) => (
            <details key={note.id}>
              <summary>
                Withdraw publication for {coachingDayLabel(note.localDate)}
              </summary>
              <CoachingForm
                {...form}
                kind="withdrawDailyNote"
                operationId={randomUUID()}
                submit="Withdraw publication"
              >
                <input
                  type="hidden"
                  name="localDate"
                  value={coachingDay(note.localDate)}
                />
                <input type="hidden" name="noteVersion" value={note.version} />
                <Field
                  name="reason"
                  label="Incident reason, without private content"
                  type="textarea"
                />
              </CoachingForm>
            </details>
          ))}
          {data.incidents.map((incident) => (
            <article key={incident.id}>
              <h3>Publication review · {incident.status.toLowerCase()}</h3>
              <p>{incident.reason}</p>
              {incident.status !== "RESOLVED" ? (
                <CoachingForm
                  {...form}
                  kind="resolveRecordIncident"
                  operationId={randomUUID()}
                  submit="Record communication review"
                >
                  <input type="hidden" name="incidentId" value={incident.id} />
                  <Field
                    name="reason"
                    label="Recipient communication and follow-up, without private content"
                    type="textarea"
                  />
                </CoachingForm>
              ) : (
                <p>{incident.communicationReview}</p>
              )}
            </article>
          ))}
          {data.privateMetadata.length ? (
            <details>
              <summary>Propose exceptional private-record review</summary>
              <p>
                Both the adult client and the author must consent. Only the
                named reviewer can read the exact records, for at most one hour.
                Private text never enters exports.
              </p>
              <ul>
                {data.privateMetadata.map((note) => (
                  <li key={note.id}>
                    {coachingDayLabel(note.localDate)} · {note.id} · author{" "}
                    {coaches.find(
                      (person) => person.id === note.authorWorkspaceUserId,
                    )?.user.fullName ?? "Former coach"}
                  </li>
                ))}
              </ul>
              <CoachingForm
                {...form}
                kind="proposeRecordReview"
                operationId={randomUUID()}
                submit="Request explicit consent"
              >
                <Field
                  name="privateNoteIds"
                  label="Exact record IDs from one author, separated by commas"
                />
                <Field name="reviewerId" label="Named reviewer">
                  {coaches.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.user.fullName ?? person.user.email}
                    </option>
                  ))}
                </Field>
                <Field
                  name="reason"
                  label="Specific purpose, without private content"
                  type="textarea"
                />
                <Field
                  name="expiresInMinutes"
                  label="Authorization window in minutes (1–60)"
                  type="number"
                  value={30}
                />
              </CoachingForm>
            </details>
          ) : null}
        </>
      ) : null}
      {data.grants.map((grant) => (
        <p key={grant.id}>
          <Link href={`/dashboard/coaching/reviews/${grant.id}`}>
            {grant.purpose}
          </Link>
        </p>
      ))}
      {!data.withdrawals.length &&
      !data.incidents.length &&
      !data.grants.length ? (
        <p>No open record corrections or review requests.</p>
      ) : null}
    </section>
  );
}
