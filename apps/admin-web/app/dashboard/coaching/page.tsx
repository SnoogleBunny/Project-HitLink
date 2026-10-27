import { resolveDisplayLocale } from "@flowstate/ui";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getCoachingWorkspace, getCoachingReviewInbox } from "@flowstate/db";
import { Badge, Money, Notice } from "@flowstate/ui";
import { AdminShell } from "../../_components/admin-shell";
import { requireOperationsWorkspaceContext } from "../../../lib/operations-workspace";
import {
  CoachingField as Field,
  ProgramFields,
  coachingDayLabel as knownCoachingDayLabel,
  coachingLabel,
  coachingTime as knownCoachingTime,
} from "../../../lib/coaching-fields";
import { CoachingForm } from "./form";

export default async function CoachingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const context = await requireOperationsWorkspaceContext();
  const locale = resolveDisplayLocale(context.workspace.settings?.locale);
  const coachingDayLabel = (value: Date) =>
    knownCoachingDayLabel(value, locale);
  const coachingTime = (value: Date, timezone: string) =>
    knownCoachingTime(value, timezone, locale);
  const data = await getCoachingWorkspace({
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  });
  const feedback = await searchParams;
  const reviews = await getCoachingReviewInbox({
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  });
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Clients"
      description="Adult one-to-one programs, client notes and appointments."
    >
      {feedback.error ? (
        <Notice tone="danger">{feedback.error}</Notice>
      ) : feedback.saved ? (
        <Notice tone="success">Saved.</Notice>
      ) : null}
      {reviews.length ? (
        <section className="management-card">
          <h2>Restricted review requests</h2>
          {reviews.map((review) => (
            <p key={review.id}>
              <Link href={`/dashboard/coaching/reviews/${review.id}`}>
                {review.purpose}
              </Link>{" "}
              · expires{" "}
              {coachingTime(review.expiresAt, context.location.timezone)}
            </p>
          ))}
        </section>
      ) : null}
      <section className="management-card">
        <h2>Clients</h2>
        {data.enrollments.length ? (
          <div className="member-stack-list">
            {data.enrollments.map((e) => (
              <article className="member-stack-item" key={e.id}>
                <div>
                  <h3>
                    <Link href={`/dashboard/coaching/${e.id}`}>
                      {e.memberName}
                    </Link>
                  </h3>
                  <p>
                    {e.programName} · {e.coachName}
                  </p>
                  <p>
                    {coachingDayLabel(e.startsOn)} –{" "}
                    {coachingDayLabel(e.endsOn)}
                  </p>
                </div>
                <Badge>{coachingLabel(e.status)}</Badge>
              </article>
            ))}
          </div>
        ) : (
          <p>
            No programs yet. Offer a program to an adult member with their own
            login.
          </p>
        )}
      </section>
      {data.isOwner ? (
        <div className="management-grid">
          <section className="management-card">
            <h2>Offer a program</h2>
            <p>
              The client verifies their contact, accepts a named coach and
              reviews the plan before payment.
            </p>
            <CoachingForm
              kind="enroll"
              operationId={randomUUID()}
              submit="Send program offer"
            >
              <Field label="Client" name="memberId">
                <option value="">Choose a client</option>
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName}
                  </option>
                ))}
              </Field>
              <Field label="Program version" name="programVersionId">
                <option value="">Choose a program</option>
                {data.programs.map((program) =>
                  program.versions[0] ? (
                    <option key={program.id} value={program.versions[0].id}>
                      {program.name} · version {program.versions[0].number}
                    </option>
                  ) : null,
                )}
              </Field>
              <Field
                label="Named intake reviewer and proposed coach"
                name="coachId"
              >
                <option value="">Choose a coach</option>
                {data.coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.user.fullName ?? coach.user.email}
                  </option>
                ))}
              </Field>
              <Field
                label="First delivery date (gym timezone)"
                name="startsOn"
                type="date"
              />
            </CoachingForm>
          </section>
          <section className="management-card">
            <h2>Program templates</h2>
            {data.programs.map((program) => (
              <div key={program.id}>
                <h3>{program.name}</h3>
                {program.versions[0] ? (
                  <p>
                    Version {program.versions[0].number} ·{" "}
                    {program.versions[0].durationDays} days ·{" "}
                    <Money
                      amountMinor={program.versions[0].priceCents}
                      currency={program.versions[0].currency}
                    />
                  </p>
                ) : null}
                <details>
                  <summary>Publish a revised template</summary>
                  <p>
                    Existing clients keep their agreed version until they accept
                    a proposed change.
                  </p>
                  <CoachingForm
                    kind="reviseProgram"
                    operationId={randomUUID()}
                    version={program.version}
                    submit="Publish new version"
                  >
                    <input type="hidden" name="programId" value={program.id} />
                    <ProgramFields />
                  </CoachingForm>
                </details>
              </div>
            ))}
            <details>
              <summary>Create a program template</summary>
              <CoachingForm
                kind="createProgram"
                operationId={randomUUID()}
                submit="Publish program"
              >
                <Field label="Program name" name="name" />
                <ProgramFields />
              </CoachingForm>
            </details>
          </section>
        </div>
      ) : null}
      <section className="management-card">
        <h2>Your appointment availability</h2>
        <p>
          Publish specific times for programs that include appointments. All
          times use {context.location.timezone}.
        </p>
        {data.availability.map((slot) => (
          <div key={slot.id}>
            <p>
              {coachingTime(slot.startsAt, context.location.timezone)} ·{" "}
              {slot.room?.name ?? "Online"}
            </p>
            <CoachingForm
              kind="withdrawAvailability"
              operationId={randomUUID()}
              submit="Withdraw time"
            >
              <input type="hidden" name="availabilityId" value={slot.id} />
            </CoachingForm>
          </div>
        ))}
        {data.bookingRules ? <div>
          <p>Confirmed appointment rules · version {data.bookingRules.version}: book between {data.bookingRules.policy.appointments.maxAdvanceMinutes} and {data.bookingRules.policy.appointments.minimumLeadMinutes} minutes before the start. Minimum buffer: {data.bookingRules.policy.appointments.minimumBufferMinutes} minutes before and after.</p>
          <details><summary>Appointment service hours</summary><ul>{data.bookingRules.policy.appointments.weeklyHours.map(day=><li key={day.weekday}>{coachingLabel(day.weekday)}: {day.intervals.length?day.intervals.map(interval=>`${Math.floor(interval.startMinute/60).toString().padStart(2,'0')}:${(interval.startMinute%60).toString().padStart(2,'0')}–${Math.floor(interval.endMinute/60).toString().padStart(2,'0')}:${(interval.endMinute%60).toString().padStart(2,'0')}`).join(', '):'Closed'}</li>)}</ul><p>Hours follow the gym timezone effective on the appointment date.</p></details>
        </div> : <Notice tone="warning">The owner must confirm appointment booking rules before you can publish new times. Existing appointments remain unchanged.</Notice>}
        <details>
          <summary>Add an appointment time</summary>
          <p>New times use the owner’s confirmed appointment service hours, booking window and minimum buffer. Buffers protect the coach and any recorded room outside the service interval. {data.isOwner?<Link href="/dashboard/settings/coaching-booking">Review appointment booking rules</Link>:'Ask the owner to review these rules when needed.'}</p>
          <CoachingForm
            kind="createAvailability"
            operationId={randomUUID()}
            submit="Make time available"
          >
            <Field label="Starts" name="startsAt" type="datetime-local" />
            <Field label="Ends" name="endsAt" type="datetime-local" />
            <Field
              label="Buffer before and after, in minutes"
              name="bufferMinutes"
              type="number"
              value={0}
            />
            <Field label="Room" name="roomId" required={false}>
              <option value="">Online appointment</option>
              {data.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </Field>
            <Field
              label="Private HTTPS meeting link (for online appointments)"
              name="virtualUrl"
              type="url"
              required={false}
            />
          </CoachingForm>
        </details>
      </section>
    </AdminShell>
  );
}
