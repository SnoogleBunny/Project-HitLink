import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  getCoachingDetail,
  getCoachingWorkspace,
  getCoachingSettlement,
  getCoachingExportHistory,
  getWorkspaceDateString,
} from "@flowstate/db";
import { Badge, Money, Notice } from "@flowstate/ui";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOperationsWorkspaceContext } from "../../../../lib/operations-workspace";
import {
  CoachingField as Field,
  coachingDay,
  coachingLabel,
  coachingTime,
} from "../../../../lib/coaching-fields";
import { CoachingForm } from "../form";
import { CoachingRecordsPanel } from "./records-panel";

export default async function CoachingClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const context = await requireOperationsWorkspaceContext();
  const { id } = await params;
  const actor = {
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  };
  const [data, list, feedback, settlement, exports] = await Promise.all([
    getCoachingDetail(actor, id),
    getCoachingWorkspace(actor),
    searchParams,
    getCoachingSettlement(actor, id),
    getCoachingExportHistory(actor, id),
  ]);
  const form = { enrollmentId: id, version: data.version };
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title={data.memberName}
      description={`${data.programName} · ${data.coachName}`}
      actions={<Link href="/dashboard/coaching">All clients</Link>}
    >
      {feedback.error ? (
        <Notice tone="danger">{feedback.error}</Notice>
      ) : feedback.saved ? (
        <Notice tone="success">Saved.</Notice>
      ) : null}
      <section className="management-card">
        <div className="member-stack-heading">
          <h2>Program</h2>
          <Badge>{coachingLabel(data.status)}</Badge>
        </div>
        <p>
          {coachingDay(data.startsOn)} – {coachingDay(data.endsOn)} ·{" "}
          {data.timezone}
        </p>
        <p>
          Payment: {coachingLabel(data.paymentState)}. Settlement:{" "}
          {coachingLabel(data.settlementState)}.
        </p>
        {data.proposedCoachName ? (
          <p>Waiting for the client to accept {data.proposedCoachName}.</p>
        ) : null}
        {data.plan ? (
          <>
            <h3>Agreed plan, version {data.plan.number}</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{data.plan.goals}</p>
            <p>
              Reply window: {data.plan.responseHours} hours. Upfront price:{" "}
              <Money
                amountMinor={data.plan.priceCents}
                currency={data.plan.currency}
              />
              .
            </p>
            <details>
              <summary>Program terms</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{data.plan.terms}</p>
            </details>
          </>
        ) : (
          <p>
            Coaching content is available to the client and their accepted
            coach. Operational access does not include intake or notes.
          </p>
        )}
        {data.settlementNote ? <p>{data.settlementNote}</p> : null}
      </section>
      {data.coach ? (
        <>
          <section className="management-card">
            <h2>Intake and milestones</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>
              {data.intake?.content ??
                "The client has not submitted their intake yet."}
            </p>
            {data.milestones.map((milestone) => (
              <div className="member-stack-item" key={milestone.id}>
                <div>
                  <h3>{milestone.title}</h3>
                  <Badge tone={milestone.completedAt ? "success" : "neutral"}>
                    {milestone.completedAt ? "Complete" : "In progress"}
                  </Badge>
                </div>
                {!data.closedAt && !milestone.completedAt ? (
                  <CoachingForm
                    {...form}
                    operationId={randomUUID()}
                    kind="completeMilestone"
                    submit="Mark complete"
                  >
                    <input
                      type="hidden"
                      name="milestoneId"
                      value={milestone.id}
                    />
                  </CoachingForm>
                ) : null}
              </div>
            ))}
          </section>
          <section className="management-card">
            <h2>Client notes</h2>
            <p>
              Save a draft, review the named client and date, then publish. The
              client only sees published revisions.
            </p>
            {data.drafts.map((note) => (
              <article className="member-stack-item" key={note.id}>
                <div style={{ width: "100%" }}>
                  <h3>
                    {coachingDay(note.localDate)}{" "}
                    <Badge>{coachingLabel(note.status)}</Badge>
                  </h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>{note.draftBody}</p>
                  {!data.closedAt ? (
                    <>
                      <details>
                        <summary>Edit draft</summary>
                        <CoachingForm
                          {...form}
                          operationId={randomUUID()}
                          kind="saveDailyNote"
                          submit="Save draft"
                        >
                          <input
                            type="hidden"
                            name="localDate"
                            value={coachingDay(note.localDate)}
                          />
                          <input
                            type="hidden"
                            name="noteVersion"
                            value={note.version}
                          />
                          <Field
                            label="Client note"
                            name="body"
                            type="textarea"
                            value={note.draftBody}
                          />
                        </CoachingForm>
                      </details>
                      <CoachingForm
                        {...form}
                        operationId={randomUUID()}
                        kind="publishDailyNote"
                        submit={
                          note.publishedAt
                            ? "Publish amendment"
                            : "Publish to client"
                        }
                      >
                        <input
                          type="hidden"
                          name="localDate"
                          value={coachingDay(note.localDate)}
                        />
                        <input
                          type="hidden"
                          name="noteVersion"
                          value={note.version}
                        />
                        <input
                          type="hidden"
                          name="confirmClientId"
                          value={data.memberId}
                        />
                        <label>
                          <input
                            type="checkbox"
                            name="confirmPublish"
                            required
                          />{" "}
                          I reviewed this note for {data.memberName}, dated{" "}
                          {coachingDay(note.localDate)}.
                        </label>
                      </CoachingForm>
                      {note.publishedAt ? (
                        <details>
                          <summary>Withdraw mistaken publication</summary>
                          <p>
                            This stops future reads and queued note notices.
                            Existing copies cannot be recalled. The records
                            reviewer must review the incident.
                          </p>
                          <CoachingForm
                            {...form}
                            operationId={randomUUID()}
                            kind="withdrawDailyNote"
                            submit="Withdraw note"
                          >
                            <input
                              type="hidden"
                              name="localDate"
                              value={coachingDay(note.localDate)}
                            />
                            <input
                              type="hidden"
                              name="noteVersion"
                              value={note.version}
                            />
                            <Field
                              label="Incident reason (no private note text)"
                              name="reason"
                            />
                          </CoachingForm>
                        </details>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </article>
            ))}
            {!data.closedAt ? (
              <details>
                <summary>Write a client note</summary>
                <CoachingForm
                  {...form}
                  operationId={randomUUID()}
                  kind="saveDailyNote"
                  submit="Save draft"
                >
                  <Field
                    label="Program date"
                    name="localDate"
                    type="date"
                    value={getWorkspaceDateString(new Date(), data.timezone)}
                  />
                  <input type="hidden" name="noteVersion" value="-1" />
                  <Field
                    label={`Note for ${data.memberName}`}
                    name="body"
                    type="textarea"
                  />
                </CoachingForm>
              </details>
            ) : null}
          </section>
          <section className="management-card">
            <h2>Your private working notes</h2>
            <p>
              Visible only to you while you are the accepted coach. These notes
              are never included in routine exports or handed to a replacement
              coach.
            </p>
            {data.privateNotes.map((note) => (
              <details key={note.id}>
                <summary>{coachingDay(note.localDate)}</summary>
                <p style={{ whiteSpace: "pre-wrap" }}>{note.body}</p>
                {!data.closedAt ? (
                  <CoachingForm
                    {...form}
                    operationId={randomUUID()}
                    kind="savePrivateNote"
                    submit="Save private note"
                  >
                    <input
                      type="hidden"
                      name="localDate"
                      value={coachingDay(note.localDate)}
                    />
                    <input
                      type="hidden"
                      name="noteVersion"
                      value={note.version}
                    />
                    <Field
                      label="Private note"
                      name="body"
                      type="textarea"
                      value={note.body}
                    />
                  </CoachingForm>
                ) : null}
              </details>
            ))}
            {!data.closedAt ? (
              <details>
                <summary>Add a private note</summary>
                <CoachingForm
                  {...form}
                  operationId={randomUUID()}
                  kind="savePrivateNote"
                  submit="Save private note"
                >
                  <Field
                    label="Program date"
                    name="localDate"
                    type="date"
                    value={getWorkspaceDateString(new Date(), data.timezone)}
                  />
                  <input type="hidden" name="noteVersion" value="-1" />
                  <Field
                    label="Private working note"
                    name="body"
                    type="textarea"
                  />
                </CoachingForm>
              </details>
            ) : null}
          </section>
        </>
      ) : null}
      {data.published.length ? (
        <section className="management-card">
          <h2>Published record</h2>
          {data.published.map((note) => (
            <details key={note.id}>
              <summary>
                {coachingDay(note.localDate)} · {coachingLabel(note.status)}
              </summary>
              {note.revisions.map((revision) => (
                <article key={revision.number}>
                  <p>
                    Revision {revision.number}, published{" "}
                    {coachingTime(revision.publishedAt, data.timezone)}
                  </p>
                  <p style={{ whiteSpace: "pre-wrap" }}>{revision.body}</p>
                </article>
              ))}
            </details>
          ))}
        </section>
      ) : null}
      {data.includedUnits > 0 ? (
        <section className="management-card">
          <h2>Appointments</h2>
          <p>
            {data.includedUnits - data.reservedOrUsedUnits} of{" "}
            {data.includedUnits} units available. Held or disputed units are
            reserved until resolved.
          </p>
          {data.coach && !data.closedAt ? (
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
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open meeting
                  </a>
                ) : null}
                {appointment.status === "BOOKED" ? (
                  <>
                    <details>
                      <summary>Move appointment</summary>
                      <p>
                        Late moves consume the old unit and reserve another. An
                        owner can record a reasoned waiver. The current booking
                        stays unchanged if the new slot fails.
                      </p>
                      <CoachingForm
                        {...form}
                        kind="moveAppointment"
                        operationId={randomUUID()}
                        submit="Confirm move"
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
                          name="availabilityId"
                          label="New appointment time"
                        >
                          <option value="">Choose a time</option>
                          {data.availability.map((slot) => (
                            <option value={slot.id} key={slot.id}>
                              {coachingTime(slot.startsAt, data.timezone)}
                            </option>
                          ))}
                        </Field>
                        <Field name="reason" label="Reason for this move" />
                        <label className="field-checkbox">
                          <input
                            name="confirmConsequences"
                            type="checkbox"
                            required
                          />
                          <span>
                            I reviewed the deadline and resulting unit use.
                          </span>
                        </label>
                        {data.owner ? (
                          <label className="field-checkbox">
                            <input name="waiveLatePenalty" type="checkbox" />
                            <span>
                              Owner exception: return the original unit for the
                              reason above.
                            </span>
                          </label>
                        ) : null}
                      </CoachingForm>
                    </details>
                    <details>
                      <summary>Cancel appointment</summary>
                      <CoachingForm
                        {...form}
                        operationId={randomUUID()}
                        kind="cancelAppointment"
                        submit="Cancel and return unit"
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
                    {data.coach ? (
                      <details>
                        <summary>Record attendance</summary>
                        <CoachingForm
                          {...form}
                          operationId={randomUUID()}
                          kind="completeAppointment"
                          submit="Confirm attendance"
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
                            label="Attendance note (no private coaching details)"
                            name="reason"
                          />
                          <label>
                            <input type="checkbox" name="noShow" /> Client did
                            not attend
                          </label>
                        </CoachingForm>
                      </details>
                    ) : null}
                  </>
                ) : null}
                {appointment.unitState === "DISPUTED" && data.owner ? (
                  <CoachingForm
                    {...form}
                    operationId={randomUUID()}
                    kind="resolveAppointment"
                    submit="Record resolution"
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
                    <Field label="Unit outcome" name="unitState">
                      <option value="RELEASED">Return unit</option>
                      <option value="CONSUMED">Consume unit</option>
                    </Field>
                    <Field
                      label="Decision and evidence (no private notes)"
                      name="reason"
                    />
                  </CoachingForm>
                ) : null}
                {appointment.events.length ? (
                  <details>
                    <summary>Appointment history</summary>
                    {appointment.events.map((event) => (
                      <p key={event.id}>
                        {coachingTime(event.createdAt, data.timezone)} ·{" "}
                        {coachingLabel(event.kind)}
                        {event.reason ? ` · ${event.reason}` : ""}
                      </p>
                    ))}
                  </details>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {data.owner ? (
        <section className="management-card">
          <h2>Program administration</h2>
          {!data.closedAt ? (
            <>
              <details>
                <summary>Replace or remove coach</summary>
                <p>
                  The current coach loses access immediately. Future
                  appointments are cancelled and their units returned. The
                  client must accept a replacement and their history access.
                </p>
                <CoachingForm
                  {...form}
                  operationId={randomUUID()}
                  kind="proposeCoach"
                  submit="Propose replacement"
                >
                  <Field label="Replacement coach" name="coachId">
                    <option value="">Choose a coach</option>
                    {list.coaches.map((coach) => (
                      <option key={coach.id} value={coach.id}>
                        {coach.user.fullName ?? coach.user.email}
                      </option>
                    ))}
                  </Field>
                  <Field label="Reason" name="reason" />
                </CoachingForm>
                <CoachingForm
                  {...form}
                  operationId={randomUUID()}
                  kind="revokeCoach"
                  submit="Remove coach now"
                >
                  <Field label="Reason" name="reason" />
                </CoachingForm>
              </details>
              <details>
                <summary>Close service</summary>
                <p>
                  Future appointments are cancelled and their units retained for
                  settlement. Delivery stops now. Money and record access are
                  tracked separately.
                </p>
                <CoachingForm
                  {...form}
                  operationId={randomUUID()}
                  kind="close"
                  submit="Close service"
                >
                  <Field label="Reason" name="reason" />
                  <label>
                    <input
                      type="checkbox"
                      name="confirmConsequences"
                      required
                    />{" "}
                    I reviewed the remaining{" "}
                    {data.includedUnits - data.reservedOrUsedUnits} unreserved
                    units and future bookings.
                  </label>
                </CoachingForm>
              </details>
            </>
          ) : null}
          <details>
            <summary>
              {data.closedAt
                ? "Propose reopening"
                : "Propose extension or revised plan"}
            </summary>
            <p>
              The client must accept before the dates or terms change. Price
              changes require a new purchased program.
            </p>
            <CoachingForm
              {...form}
              operationId={randomUUID()}
              kind="proposePlan"
              submit="Send proposal"
            >
              <Field label="Program version" name="programVersionId">
                <option value="">Choose a version</option>
                {list.programs.flatMap((program) =>
                  program.versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {program.name} · version {version.number}
                    </option>
                  )),
                )}
              </Field>
              <Field
                label="Start date"
                name="startsOn"
                type="date"
                value={coachingDay(data.startsOn)}
              />
              <Field
                label="End date"
                name="endsOn"
                type="date"
                value={coachingDay(data.endsOn)}
              />
            </CoachingForm>
          </details>
          {exports.length ? (
            <div>
              <h3>Client record delivery</h3>
              {exports.map((job) => (
                <p key={job.id}>
                  {coachingLabel(job.status)} ·{" "}
                  {coachingTime(job.createdAt, data.timezone)}
                  {job.failureCode
                    ? ` · Assigned records review: ${job.id}`
                    : ""}
                  {job.receiptConfirmedAt ? " · Client confirmed receipt" : ""}
                </p>
              ))}
              <p>
                Only the adult client downloads this archive from their own
                portal. Failed jobs retain the assigned records reviewer and can
                be prepared again after the cause is resolved.
              </p>
            </div>
          ) : null}
          {data.closedAt && settlement ? (
            <div className="form-stack">
              <h3>Final settlement</h3>
              <p>
                {settlement.snapshot.unusedUnits} unused appointment units and{" "}
                {settlement.snapshot.undeliveredDays.length} undelivered note
                days remain in the review. Closing delivery does not forfeit
                these obligations.
              </p>
              <CoachingForm
                {...form}
                operationId={randomUUID()}
                kind="proposeSettlement"
                submit="Propose settlement"
              >
                <input
                  type="hidden"
                  name="obligationHash"
                  value={settlement.obligationHash}
                />
                <Field label="Settlement" name="settlementKind">
                  <option value="NO_ADJUSTMENT">
                    No money adjustment; client accepts the stated outcome
                  </option>
                  <option value="REFUND">Verified refund</option>
                  <option value="ACCOUNT_CREDIT">Account credit</option>
                </Field>
                <Field
                  label="Agreed amount in cents (zero for no adjustment)"
                  name="amountCents"
                  type="number"
                  value={0}
                />
                <Field
                  label="Commercial decision and how unused obligations are resolved (no private content)"
                  name="reason"
                  type="textarea"
                />
                <p>
                  The client must accept this proposal. A refund or credit is
                  completed through Billing, then verified here.
                </p>
              </CoachingForm>
              {settlement.decisions.map((decision) => (
                <article key={decision.id} className="member-stack-item">
                  <div>
                    <h4>
                      {coachingLabel(decision.kind)} ·{" "}
                      {coachingLabel(decision.status)}
                    </h4>
                    <p>{decision.reason}</p>
                    <Money
                      amountMinor={decision.amountCents}
                      currency={decision.currency}
                    />
                    {decision.status === "ACCEPTED" ? (
                      <CoachingForm
                        {...form}
                        operationId={randomUUID()}
                        kind="confirmSettlement"
                        submit="Verify final settlement"
                      >
                        <input
                          type="hidden"
                          name="decisionId"
                          value={decision.id}
                        />
                        <Field
                          label="Refund IDs or credit operation IDs (leave blank for no adjustment)"
                          name="evidenceIds"
                          required={false}
                        />
                        <p>
                          Only completed records for this program or its
                          authorized payer can satisfy the accepted amount.
                        </p>
                      </CoachingForm>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {data.status === "END_REVIEW" ? (
            <CoachingForm
              {...form}
              operationId={randomUUID()}
              kind="recordSettlement"
              submit="Record settlement review"
            >
              <Field
                label="Decision, remaining obligations and next action"
                name="reason"
                type="textarea"
              />
              <p>
                This records the review. Refunds remain pending until the
                payment provider confirms them.
              </p>
            </CoachingForm>
          ) : null}
        </section>
      ) : null}
      {data.deliveryExceptions.length ? (
        <section className="management-card">
          <h2>Delivery needs review</h2>
          {data.deliveryExceptions.map((issue) => (
            <article key={issue.id}>
              <h3>
                {coachingDay(issue.localDate)} · {coachingLabel(issue.kind)}
              </h3>
              <p>{coachingLabel(issue.status)}</p>
              {issue.status === "OPEN" ? (
                <CoachingForm
                  {...form}
                  kind="resolveDeliveryException"
                  operationId={randomUUID()}
                  submit="Record agreed recovery"
                >
                  <input type="hidden" name="exceptionId" value={issue.id} />
                  <Field
                    name="reason"
                    label="Agreed replacement delivery or money review"
                    type="textarea"
                  />
                  <p>
                    This records the delivery review; it does not create a
                    refund or mark a missing note delivered.
                  </p>
                </CoachingForm>
              ) : (
                <p>{issue.resolution}</p>
              )}
            </article>
          ))}
        </section>
      ) : null}
      <CoachingRecordsPanel
        actor={actor}
        enrollmentId={id}
        version={data.version}
        owner={data.owner}
        coaches={list.coaches}
      />
    </AdminShell>
  );
}
