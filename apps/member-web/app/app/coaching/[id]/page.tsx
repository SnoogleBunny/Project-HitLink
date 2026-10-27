import { resolveDisplayLocale } from "@flowstate/ui";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCoachingDetail,
  getCoachingSettlement,
  getCoachingExportHistory,
  getWorkspaceDateString,
} from "@flowstate/db";
import { Badge, Money, Notice } from "@flowstate/ui";
import { MemberShell } from "../../../_components/member-shell";
import { requireMemberPortalContext } from "../../../../lib/member-auth";
import {
  CoachingField as Field,
  coachingDay,
  coachingDayLabel as knownCoachingDayLabel,
  coachingLabel,
  coachingTime as knownCoachingTime,
} from "../../../../lib/coaching-fields";
import { CoachingPauseFields } from "../../../../lib/coaching-pause-fields";
import { CoachingForm } from "../form";
import { CoachingRecordsPanel } from "./records-panel";
import { coachingHref, coachingView } from "../navigation";
import { CoachingBookingAvailability } from "../booking-availability";

export default async function CoachingProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    payment?: string;
    view?: string;
  }>;
}) {
  const context = await requireMemberPortalContext({ scope: "account" });
  const locale = resolveDisplayLocale(context.workspace.settings?.locale);
  const coachingDayLabel = (value: Date) =>
    knownCoachingDayLabel(value, locale);
  const coachingTime = (value: Date, timezone: string) =>
    knownCoachingTime(value, timezone, locale);
  const { id } = await params;
  const [data, feedback, settlement, exports] = await Promise.all([
    getCoachingDetail(
      { workspaceId: context.workspace.id, userId: context.session.userId },
      id,
    ),
    searchParams,
    getCoachingSettlement(
      { workspaceId: context.workspace.id, userId: context.session.userId },
      id,
    ),
    getCoachingExportHistory(
      { workspaceId: context.workspace.id, userId: context.session.userId },
      id,
    ),
  ]);
  const view = feedback.payment ? "program" : coachingView(feedback.view);
  if (view === "appointments" && data.includedUnits === 0)
    redirect(coachingHref(id, "program"));
  const form = { enrollmentId: id, version: data.version, returnView: view };
  const plan = data.proposedPlan ?? data.plan;
  const today = getWorkspaceDateString(new Date(), data.timezone);
  const todayNotes = data.published.filter(
    (note) => coachingDay(note.localDate) === today,
  );
  const earlierNotes = data.published.filter(
    (note) => coachingDay(note.localDate) !== today,
  );
  return (
    <MemberShell
      context={context}
      title={
        view === "notes"
          ? "My day"
          : view === "program"
            ? "My program"
            : "My appointment"
      }
      description={`${data.programName} · Your coach: ${data.coachName}`}
      actions={<Link href="/app/coaching">All programs</Link>}
    >
      <nav
        className="hl-section-nav"
        aria-label="Coaching sections"
        data-coaching-view={view}
      >
        <Link
          href={coachingHref(id)}
          aria-current={view === "notes" ? "page" : undefined}
        >
          My day
        </Link>
        <Link
          href={coachingHref(id, "program")}
          aria-current={view === "program" ? "page" : undefined}
        >
          My program
        </Link>
        {data.includedUnits > 0 ? (
          <Link
            href={coachingHref(id, "appointments")}
            aria-current={view === "appointments" ? "page" : undefined}
          >
            My appointment
          </Link>
        ) : null}
      </nav>
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
          Payment confirmed. Your program starts on{" "}
          {coachingDayLabel(data.startsOn)}.
        </Notice>
      ) : feedback.payment === "cancelled" ? (
        <Notice>Checkout was cancelled. Your program remains unpaid.</Notice>
      ) : null}
      {view === "program" ? (
        <>
          <section className="member-card">
            <div className="member-stack-heading">
              <h2>My program</h2>
              <Badge>{coachingLabel(data.status)}</Badge>
            </div>
            <p>
              {coachingDayLabel(data.startsOn)} –{" "}
              {coachingDayLabel(data.endsOn)} · {data.timezone}
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
                {data.accepted ? (
                  <>
                    <p>
                      Accepted plan version {data.plan.number} ·{" "}
                      <Money
                        amountMinor={data.plan.priceCents}
                        currency={data.plan.currency}
                      />{" "}
                      upfront.
                    </p>
                    <p>
                      {data.includedUnits > 0
                        ? `${data.includedUnits} appointments. Cancel at least ${data.plan.cancellationHours} hours ahead to return the unit.`
                        : "This program is delivered through coach notes and has no appointments."}
                    </p>
                    <details>
                      <summary>Accepted program terms</summary>
                      <p style={{ whiteSpace: "pre-wrap" }}>
                        {data.plan.terms}
                      </p>
                    </details>
                  </>
                ) : null}
              </>
            ) : null}
            {data.pauseStartsOn && data.pauseEndsOn ? (
              <p>
                Agreed pause: {coachingDayLabel(data.pauseStartsOn)} –{" "}
                {coachingDayLabel(data.pauseEndsOn)}. Delivery resumes
                automatically afterward.
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
                Coaching uses your account email. Family booking permissions do
                not grant access to this program.
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
                published notes from the date you choose. Another coach’s
                private notes are never shared.
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
                  Your accepted coach can read this. Include only what you want
                  to share for this program.
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
          {plan && !data.closedAt ? <CoachingBookingAvailability data={data.proposedBookingAvailability??data.bookingAvailability} units={plan.appointmentUnits} minutes={plan.appointmentMinutes} locale={locale}/> : null}
          {plan && (!data.accepted || data.proposedPlan) ? (
            <section className="member-card">
              <h2>
                {data.proposedPlan
                  ? "Proposed plan change"
                  : "Review your plan"}
              </h2>
              <p>
                Version {plan.number} ·{" "}
                {coachingDayLabel(data.proposedStartsOn ?? data.startsOn)} –{" "}
                {coachingDayLabel(data.proposedEndsOn ?? data.endsOn)}
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
                <Money amountMinor={plan.priceCents} currency={plan.currency} />
                . Record retrieval: {plan.retrievalDays} days after service
                closure.
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
                  <input type="checkbox" name="acceptTerms" required /> I agree
                  to this program, its delivery calendar, response window,
                  privacy access and commercial terms. {plan.appointmentUnits>0?"I have reviewed the current appointment availability and booking-help contact; displayed times are not held.":""}
                </label>
              </CoachingForm>
            </section>
          ) : null}
          {data.accepted && !data.closedAt && data.paymentState !== "PAID" ? (
            <section className="member-card">
              <h2>Program payment</h2>
              <p>
                Payment: {coachingLabel(data.paymentState)}. Service starts
                after payment and current consent are confirmed and your start
                date arrives.
              </p>
              {data.paymentState === "REVIEW_REQUIRED" ? (
                <p>
                  The gym must review this payment before service can start.
                  Your recorded payment is retained; do not pay again.
                </p>
              ) : !data.payerGrantId ? (
                <CoachingForm
                  {...form}
                  operationId={randomUUID()}
                  kind="pay"
                  submit="Open secure payment"
                />
              ) : (
                <Link href={`/app/coaching/payments/${data.payerGrantId}`}>
                  Review the invited payer&apos;s payment request
                </Link>
              )}
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
        </>
      ) : null}
      {view === "notes" &&
      !(
        data.status === "ACTIVE" ||
        data.status === "PAUSED" ||
        data.status === "END_REVIEW" ||
        data.closedAt
      ) ? (
        <section className="member-card">
          <h2>Your next step</h2>
          <p>
            Your program is {coachingLabel(data.status).toLowerCase()}. Review
            your plan, consent and payment before delivery starts.
          </p>
          <Link href={coachingHref(id, "program")}>Review my program</Link>
        </section>
      ) : null}
      {view === "notes" &&
      (data.status === "ACTIVE" ||
        data.status === "PAUSED" ||
        data.status === "END_REVIEW" ||
        data.closedAt) ? (
        <section className="member-card">
          <h2>Today’s note</h2>
          {todayNotes.length ? (
            todayNotes.map((note) => (
              <article key={note.id}>
                <h3>{coachingDayLabel(note.localDate)}</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {note.revisions[0]?.body}
                </p>
                {note.revisions.length > 1 ? (
                  <details>
                    <summary>Earlier published revisions</summary>
                    {note.revisions.slice(1).map((revision) => (
                      <article key={revision.number}>
                        <p>
                          Revision {revision.number}, published{" "}
                          {coachingTime(revision.publishedAt, data.timezone)}
                        </p>
                        <p style={{ whiteSpace: "pre-wrap" }}>
                          {revision.body}
                        </p>
                      </article>
                    ))}
                  </details>
                ) : null}
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
                  : "No note has been published for today yet. Your agreed delivery days and response window are in My program."}
            </p>
          )}
        </section>
      ) : null}
      {view === "program" && data.closedAt && settlement ? (
        <section className="member-card">
          <h2>Final settlement</h2>
          <p>
            {settlement.snapshot.unusedUnits} unused appointments and{" "}
            {settlement.snapshot.undeliveredDays.length} undelivered note days
            are included in this review.
          </p>
          {settlement.decisions.length ? (
            settlement.decisions.map((decision) => (
              <article key={decision.id} className="member-stack-item">
                <div>
                  <h3>
                    {coachingLabel(decision.kind)} ·{" "}
                    {coachingLabel(decision.status)}
                  </h3>
                  <p>{decision.reason}</p>
                  <Money
                    amountMinor={decision.amountCents}
                    currency={decision.currency}
                  />
                  {decision.status === "PROPOSED" ? (
                    <CoachingForm
                      {...form}
                      operationId={randomUUID()}
                      kind="acceptSettlement"
                      submit="Accept settlement"
                    >
                      <input
                        type="hidden"
                        name="decisionId"
                        value={decision.id}
                      />
                      <label className="field-checkbox">
                        <input
                          type="checkbox"
                          name="confirmConsequences"
                          required
                        />
                        <span>
                          I accept this outcome for the unused services and
                          stated money adjustment.
                        </span>
                      </label>
                      <p>
                        Acceptance does not claim a refund or credit is
                        complete. The gym must verify the actual records.
                      </p>
                    </CoachingForm>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p>
              The gym is reviewing your remaining services and money. Your
              record access remains separate.
            </p>
          )}
        </section>
      ) : null}
      {view === "notes" && earlierNotes.length ? (
        <section className="member-card">
          <h2>Published notes</h2>
          {earlierNotes.map((note) => (
            <article className="member-stack-item" key={note.id}>
              <div>
                <h3>{coachingDayLabel(note.localDate)}</h3>
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
        </section>
      ) : null}
      {view === "program" ? (
        <section className="member-card">
          <h2>My program records</h2>
          <p>
            Your archive contains accepted plans, your submitted intake,
            agreements, milestones, published notes, appointments and this
            program&apos;s transactions. Private working notes and unpublished
            drafts are excluded.
          </p>
          <a href={`/app/coaching/${id}/export`}>Download my program archive</a>
          {exports.map((job) => (
            <article key={job.id} className="member-stack-item">
              <div>
                <h3>{coachingLabel(job.status)}</h3>
                <p>{coachingTime(job.createdAt, data.timezone)}</p>
                {job.failureCode ? (
                  <p>
                    The gym&apos;s records reviewer is assigned to this failed
                    export. Reference: {job.id}.
                  </p>
                ) : null}
                {job.checksum ? (
                  <p
                    className="management-copy"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    SHA-256: {job.checksum}
                  </p>
                ) : null}
                {job.status === "READY" &&
                job.downloadedAt &&
                job.expiresAt > new Date() ? (
                  <CoachingForm
                    {...form}
                    operationId={randomUUID()}
                    kind="confirmExportReceipt"
                    submit="Confirm receipt"
                  >
                    <input type="hidden" name="exportId" value={job.id} />
                    <input
                      type="hidden"
                      name="checksum"
                      value={job.checksum ?? ""}
                    />
                    <label className="field-checkbox">
                      <input
                        name="confirmConsequences"
                        type="checkbox"
                        required
                      />
                      <span>I downloaded and checked this archive.</span>
                    </label>
                  </CoachingForm>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {view === "appointments" && data.includedUnits > 0 ? (
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
                        <input
                          type="hidden"
                          name="appointmentVersion"
                          value={appointment.version}
                        />
                        <Field label="Move reason" name="reason" />
                        <label className="field-checkbox">
                          <input
                            type="checkbox"
                            name="confirmConsequences"
                            required
                          />
                          <span>
                            A move after the accepted cancellation deadline
                            consumes this unit and reserves another. If another
                            unit or time is unavailable, this booking stays
                            unchanged.
                          </span>
                        </label>
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
      {view === "program" && data.milestones.length ? (
        <section className="member-card">
          <h2>Milestones</h2>
          {data.milestones.map((milestone) => (
            <p key={milestone.id}>
              {milestone.title}{" "}
              <Badge tone={milestone.completedAt ? "success" : "neutral"}>
                {milestone.completedAt ? "Complete" : "In progress"}
              </Badge>
            </p>
          ))}
        </section>
      ) : null}
      {view === "program" && !data.closedAt && data.accepted ? (
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
      {view === "program" &&
      !data.closedAt &&
      data.accepted &&
      data.paymentState !== "PAID" ? (
        <section className="member-card">
          <h2>Choose who pays</h2>
          {data.payerGrantId ? (
            <p>
              <Link href={`/app/coaching/payments/${data.payerGrantId}`}>
                Review or revoke the current payer request
              </Link>
            </p>
          ) : null}
          <details>
            <summary>Invite another adult to pay</summary>
            <p>
              They need their own active account at this gym. The invitation
              shares only your name, the amount and payment terms. Share the
              request with them through your usual contact method.
            </p>
            <CoachingForm
              {...form}
              kind="inviteCoachingPayer"
              operationId={randomUUID()}
              submit="Create payment request"
            >
              <Field
                name="payerEmail"
                label="Payer's account email"
                type="email"
              />
              <label className="field-checkbox">
                <input name="confirmConsequences" type="checkbox" required />
                <span>
                  I consent to this adult paying for my program and seeing these
                  commercial details. My coaching records stay private.
                </span>
              </label>
            </CoachingForm>
          </details>
        </section>
      ) : null}
      {view === "program" ? (
        <CoachingRecordsPanel
          locale={locale}
          actor={{
            workspaceId: context.workspace.id,
            userId: context.session.userId,
          }}
          enrollmentId={id}
          version={data.version}
          timezone={data.timezone}
          returnView={view}
        />
      ) : null}
    </MemberShell>
  );
}
