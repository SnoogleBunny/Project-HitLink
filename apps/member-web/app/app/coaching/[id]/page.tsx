import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getCoachingDetail, getWorkspaceDateString } from "@flowstate/db";
import { Badge, Money, Notice } from "@flowstate/ui";
import { MemberShell } from "../../../_components/member-shell";
import { requireMemberPortalContext } from "../../../../lib/member-auth";
import {
  CoachingField as Field,
  coachingDay,
  coachingLabel,
  coachingTime,
} from "../../../../lib/coaching-fields";
import { CoachingPauseFields } from "../../../../lib/coaching-pause-fields";
import { CoachingForm } from "../form";

export default async function CoachingProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; payment?: string }>;
}) {
  const context = await requireMemberPortalContext({ scope: "account" });
  const { id } = await params;
  const [data, feedback] = await Promise.all([
    getCoachingDetail(
      { workspaceId: context.workspace.id, userId: context.session.userId },
      id,
    ),
    searchParams,
  ]);
  const form = { enrollmentId: id, version: data.version };
  const plan = data.proposedPlan ?? data.plan;
  const today = getWorkspaceDateString(new Date(), data.timezone);
  return (
    <MemberShell
      context={context}
      title={data.programName}
      description={`Your coach: ${data.coachName}`}
      actions={<Link href="/app/coaching">My programs</Link>}
    >
      {feedback.error ? (
        <Notice tone="danger">{feedback.error}</Notice>
      ) : feedback.saved ? (
        <Notice tone="success">Saved.</Notice>
      ) : null}
      {feedback.payment === "returned" || feedback.payment === "pending" ? (
        <Notice>
          Payment is awaiting confirmation. Use “Check payment status” below;
          returning from checkout does not activate your program.
        </Notice>
      ) : feedback.payment === "paid" ? (
        <Notice tone="success">
          Payment confirmed. Your program starts on {coachingDay(data.startsOn)}
          .
        </Notice>
      ) : feedback.payment === "cancelled" ? (
        <Notice>Checkout was cancelled. Your program remains unpaid.</Notice>
      ) : null}
      <section className="member-card">
        <div className="member-stack-heading">
          <h2>My program</h2>
          <Badge>{coachingLabel(data.status)}</Badge>
        </div>
        <p>
          {coachingDay(data.startsOn)} – {coachingDay(data.endsOn)} ·{" "}
          {data.timezone}
        </p>
        {data.plan ? (
          <>
            <p>
              Notes on{" "}
              {data.plan.deliveryWeekdays
                .map(
                  (day) =>
                    [
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ][day],
                )
                .join(", ")}
              . Replies within {data.plan.responseHours} hours.
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{data.plan.goals}</p>
          </>
        ) : null}
        {data.pauseStartsOn && data.pauseEndsOn ? (
          <p>
            Agreed pause: {coachingDay(data.pauseStartsOn)} –{" "}
            {coachingDay(data.pauseEndsOn)}. Delivery resumes automatically
            afterward.
          </p>
        ) : null}
        {data.closedAt ? (
          <p>
            Service is closed. Your published record remains available until{" "}
            {data.retrievalUntil
              ? coachingTime(data.retrievalUntil, data.timezone)
              : "the agreed retrieval deadline"}
            . Settlement: {coachingLabel(data.settlementState)}.
          </p>
        ) : null}
      </section>
      {!data.closedAt && !data.contactVerified ? (
        <section className="member-card">
          <h2>Verify your own contact</h2>
          <p>
            Coaching uses your account email. Family booking permissions do not
            grant access to this program.
          </p>
          <CoachingForm
            {...form}
            operationId={randomUUID()}
            kind="sendVerification"
            submit="Send verification email"
          />
          <CoachingForm
            {...form}
            operationId={randomUUID()}
            kind="verifyContact"
            submit="Verify contact"
          >
            <Field label="One-use code from your email" name="code" />
          </CoachingForm>
        </section>
      ) : null}
      {data.proposedCoachName && !data.closedAt ? (
        <section className="member-card">
          <h2>Choose who can review your program</h2>
          <p>
            {data.proposedCoachName} is proposed as your intake reviewer and
            coach. Accepting lets them read your intake, shared plan and
            published notes from the date you choose. Another coach’s private
            notes are never shared.
          </p>
          <CoachingForm
            {...form}
            operationId={randomUUID()}
            kind="acceptCoach"
            submit={`Accept ${data.proposedCoachName}`}
          >
            <Field
              label="Share published history from this date"
              name="historyFromDate"
              type="date"
              value={coachingDay(data.startsOn)}
            />
          </CoachingForm>
          <CoachingForm
            {...form}
            operationId={randomUUID()}
            kind="declineCoach"
            submit="Decline coach"
          />
        </section>
      ) : null}
      {data.coachAccepted && data.contactVerified && !data.closedAt ? (
        <section className="member-card">
          <details open={!data.accepted}>
          <summary>My intake</summary>
          <p>
            Your accepted coach can read this. Include only what you want to
            share for this program.
          </p>
          <CoachingForm
            {...form}
            operationId={randomUUID()}
            kind="submitIntake"
            submit={data.intake ? "Update intake" : "Submit intake"}
          >
            <Field
              label="Goals, current situation and what you would like help with"
              name="body"
              type="textarea"
              value={data.intake?.content}
            />
          </CoachingForm>
          </details>
        </section>
      ) : null}
      {plan && (!data.accepted || data.proposedPlan) ? (
        <section className="member-card">
          <h2>
            {data.proposedPlan ? "Proposed plan change" : "Review your plan"}
          </h2>
          <p>
            Version {plan.number} ·{" "}
            {coachingDay(data.proposedStartsOn ?? data.startsOn)} –{" "}
            {coachingDay(data.proposedEndsOn ?? data.endsOn)}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{plan.goals}</p>
          <ul>
            {plan.milestones.map((milestone, index) => (
              <li key={index}>{milestone}</li>
            ))}
          </ul>
          <p>
            {plan.appointmentUnits
              ? `${plan.appointmentUnits} appointments of ${plan.appointmentMinutes} minutes. Cancel at least ${plan.cancellationHours} hours ahead to return the unit.`
              : "This program is delivered through coach notes and has no appointments."}
          </p>
          <p>
            Upfront price:{" "}
            <Money amountMinor={plan.priceCents} currency={plan.currency} />.
            Record retrieval: {plan.retrievalDays} days after service closure.
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{plan.terms}</p>
          <CoachingForm
            {...form}
            operationId={randomUUID()}
            kind="acceptPlan"
            submit={
              data.proposedPlan ? "Accept revised plan" : "Accept program"
            }
          >
            <label>
              <input type="checkbox" name="acceptTerms" required /> I agree to
              this program, its delivery calendar, response window, privacy
              access and commercial terms.
            </label>
          </CoachingForm>
        </section>
      ) : null}
      {data.accepted && !data.closedAt && data.paymentState !== "PAID" ? (
        <section className="member-card">
          <h2>Program payment</h2>
          <p>
            Payment: {coachingLabel(data.paymentState)}. Service starts after
            payment is confirmed and your start date arrives.
          </p>
          <CoachingForm
            {...form}
            operationId={randomUUID()}
            kind="pay"
            submit="Open secure payment"
          />
          {data.checkoutAvailable ? (
            <CoachingForm
              {...form}
              operationId={randomUUID()}
              kind="checkPayment"
              submit="Check payment status"
            />
          ) : null}
        </section>
      ) : null}
      {data.status === "ACTIVE" ||
      data.status === "PAUSED" ||
      data.status === "END_REVIEW" ||
      data.closedAt ? (
        <section className="member-card">
          <h2>My day</h2>
          {data.published.some(
            (note) => coachingDay(note.localDate) === today,
          ) ? (
            data.published
              .filter((note) => coachingDay(note.localDate) === today)
              .map((note) => (
                <article key={note.id}>
                  <h3>Today’s note</h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>
                    {note.revisions[0]?.body}
                  </p>
                  <p>
                    Published{" "}
                    {note.publishedAt
                      ? coachingTime(note.publishedAt, data.timezone)
                      : ""}
                  </p>
                </article>
              ))
          ) : (
            <p>
              {data.status === "PAUSED"
                ? "Your program is paused today."
                : data.closedAt || data.status === "END_REVIEW"
                  ? "Program delivery has ended. Your published notes are below."
                  : "No note has been published for today yet. Check your agreed delivery days and response window above."}
            </p>
          )}
          {data.milestones.length ? (
            <>
              <h3>Milestones</h3>
              {data.milestones.map((milestone) => (
                <p key={milestone.id}>
                  {milestone.title}{" "}
                  <Badge tone={milestone.completedAt ? "success" : "neutral"}>
                    {milestone.completedAt ? "Complete" : "In progress"}
                  </Badge>
                </p>
              ))}
            </>
          ) : null}
        </section>
      ) : null}
      {data.published.length ? (
        <section className="member-card">
          <h2>Published notes</h2>
          {data.published.map((note) => (
            <article className="member-stack-item" key={note.id}>
              <div>
                <h3>{coachingDay(note.localDate)}</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {note.revisions[0]?.body}
                </p>
                <p>
                  Published{" "}
                  {note.revisions[0]
                    ? coachingTime(note.revisions[0].publishedAt, data.timezone)
                    : ""}
                </p>
                {note.revisions.length > 1 ? (
                  <details>
                    <summary>Earlier published revisions</summary>
                    {note.revisions.slice(1).map((revision) => (
                      <div key={revision.number}>
                        <p>
                          Revision {revision.number}, published{" "}
                          {coachingTime(revision.publishedAt, data.timezone)}
                        </p>
                        <p style={{ whiteSpace: "pre-wrap" }}>
                          {revision.body}
                        </p>
                      </div>
                    ))}
                  </details>
                ) : null}
              </div>
            </article>
          ))}
          <a href={`/app/coaching/${id}/export`}>
            Download my published program record
          </a>
        </section>
      ) : null}
      {data.includedUnits > 0 ? (
        <section className="member-card">
          <h2>My appointments</h2>
          <p>
            {data.includedUnits - data.reservedOrUsedUnits} of{" "}
            {data.includedUnits} appointments available. Reservations and
            disputed appointments hold a unit until resolved.
          </p>
          {!data.closedAt &&
          (data.status === "ACTIVE" || data.status === "SCHEDULED") ? (
            <CoachingForm
              {...form}
              operationId={randomUUID()}
              kind="bookAppointment"
              submit="Book appointment"
            >
              <Field label="Available time" name="availabilityId">
                <option value="">Choose a time</option>
                {data.availability.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {coachingTime(slot.startsAt, data.timezone)} ·{" "}
                    {slot.room?.name ?? "Online"}
                  </option>
                ))}
              </Field>
            </CoachingForm>
          ) : null}
          {data.appointments.map((appointment) => (
            <article className="member-stack-item" key={appointment.id}>
              <div>
                <h3>{coachingTime(appointment.startsAt, data.timezone)}</h3>
                <p>
                  {appointment.room?.name ?? "Online"} ·{" "}
                  {coachingLabel(appointment.status)} ·{" "}
                  {coachingLabel(appointment.unitState)}
                </p>
                {appointment.virtualUrl && appointment.status === "BOOKED" ? (
                  <a
                    href={appointment.virtualUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open meeting
                  </a>
                ) : null}
                {appointment.status === "BOOKED" ? (
                  <>
                    <details>
                      <summary>Move appointment</summary>
                      <p>
                        The existing reservation stays in place if the new time
                        cannot be booked.
                      </p>
                      <CoachingForm
                        {...form}
                        operationId={randomUUID()}
                        kind="moveAppointment"
                        submit="Move appointment"
                      >
                        <input
                          type="hidden"
                          name="appointmentId"
                          value={appointment.id}
                        />
                        <Field label="New time" name="availabilityId">
                          <option value="">Choose a time</option>
                          {data.availability.map((slot) => (
                            <option key={slot.id} value={slot.id}>
                              {coachingTime(slot.startsAt, data.timezone)}
                            </option>
                          ))}
                        </Field>
                      </CoachingForm>
                    </details>
                    <details>
                      <summary>Cancel appointment</summary>
                      <p>
                        Cancel at least {data.plan?.cancellationHours} hours
                        ahead to return the unit. Later cancellations consume it
                        under your accepted terms.
                      </p>
                      <CoachingForm
                        {...form}
                        operationId={randomUUID()}
                        kind="cancelAppointment"
                        submit="Confirm cancellation"
                      >
                        <input
                          type="hidden"
                          name="appointmentId"
                          value={appointment.id}
                        />
                        <input
                          type="hidden"
                          name="appointmentVersion"
                          value={appointment.version}
                        />
                        <Field label="Reason" name="reason" />
                      </CoachingForm>
                    </details>
                  </>
                ) : null}
                {appointment.unitState !== "RELEASED" &&
                appointment.unitState !== "DISPUTED" ? (
                  <details>
                    <summary>Ask for an appointment review</summary>
                    <p>
                      The unit remains held while the owner reviews attendance
                      or delivery. Private working notes are not part of routine
                      review.
                    </p>
                    <CoachingForm
                      {...form}
                      operationId={randomUUID()}
                      kind="disputeAppointment"
                      submit="Request review"
                    >
                      <input
                        type="hidden"
                        name="appointmentId"
                        value={appointment.id}
                      />
                      <input
                        type="hidden"
                        name="appointmentVersion"
                        value={appointment.version}
                      />
                      <Field
                        label="What should the owner review?"
                        name="reason"
                        type="textarea"
                      />
                    </CoachingForm>
                  </details>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {!data.closedAt && data.accepted ? (
        <section className="member-card">
          <h2>Program changes</h2>
          <details>
            <summary>Pause my program</summary>
            <p>
              Delivery pauses for the dates you choose. The end date moves by
              the number of paused delivery days.
            </p>
            <CoachingForm
              {...form}
              operationId={randomUUID()}
              kind="pause"
              submit="Confirm pause"
            >
              <CoachingPauseFields
                endDate={coachingDay(data.endsOn)}
                weekdays={data.plan?.deliveryWeekdays ?? []}
                appointments={data.appointments
                  .filter((item) => item.status === "BOOKED")
                  .map((item) => ({
                    date: getWorkspaceDateString(item.startsAt, data.timezone),
                    label: coachingTime(item.startsAt, data.timezone),
                  }))}
              />
            </CoachingForm>
          </details>
          <details>
            <summary>Close my program</summary>
            <p>
              Delivery stops now and future appointments are cancelled.
              Remaining obligations and money are reviewed separately; unused
              units are not silently forfeited. Your gym membership stays
              unchanged.
            </p>
            <CoachingForm
              {...form}
              operationId={randomUUID()}
              kind="close"
              submit="Close my program"
            >
              <Field label="Reason" name="reason" />
              <label>
                <input type="checkbox" name="confirmConsequences" required /> I
                reviewed my remaining appointments and want service to stop now.
              </label>
            </CoachingForm>
          </details>
        </section>
      ) : null}
    </MemberShell>
  );
}
