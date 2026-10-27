import { randomUUID } from "node:crypto";
import {
  formatMinutesAsTime,
  getOwnerPaymentDispute,
  type PaymentDisputeEvidence,
} from "@flowstate/db";
import { Badge, Money, Notice } from "@flowstate/ui";
import { DisputeForm } from "./dispute-form";
export async function DisputePanel(props: {
  workspaceId: string;
  actorUserId: string;
  disputeId: string;
  locale: string;
  timezone: string;
}) {
  const {
    dispute: d,
    affected,
    owners,
    reviewHash,
  } = await getOwnerPaymentDispute(props);
  const date = (value: Date) =>
    new Intl.DateTimeFormat(props.locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: props.timezone,
    }).format(value);
  const beneficiary = (memberId: string) =>
    d.allocations.find((a) => a.payment.memberId === memberId)?.payment.member
      ?.fullName ?? "Participant";
  const evidence = d.evidence as unknown as PaymentDisputeEvidence;
  const membershipClosureRequired = affected.membershipDetails.some(
    (m) => !["CANCELLED", "ENDED"].includes(m.status),
  );
  return (
    <section className="management-card">
      <h3>Processor dispute</h3>
      <Badge tone={d.resolvedAt ? "success" : "warning"}>
        {d.providerStatus.replaceAll("_", " ")}
      </Badge>
      <dl className="detail-list">
        <div>
          <dt>Disputed amount</dt>
          <dd>
            <Money amountMinor={d.amountCents} currency={d.currency} />
          </dd>
        </div>
        <div>
          <dt>Processor account and mode</dt>
          <dd>
            {d.providerAccountId} · {d.livemode ? "Live" : "Test"}
          </dd>
        </div>
        <div>
          <dt>Verified</dt>
          <dd>
            {d.lastVerifiedAt ? date(d.lastVerifiedAt) : "Not yet verified"}
          </dd>
        </div>
        <div>
          <dt>Response deadline</dt>
          <dd>
            {d.evidenceDueAt
              ? date(d.evidenceDueAt)
              : "Check Stripe for the response deadline"}
          </dd>
        </div>
        <div>
          <dt>Money outcome</dt>
          <dd>{d.moneyState.replaceAll("_", " ").toLowerCase()}</dd>
        </div>
        <div>
          <dt>Access treatment</dt>
          <dd>
            {d.accessState.replaceAll("_", " ").toLowerCase()} ·{" "}
            {d.pendingTreatment.replaceAll("_", " ").toLowerCase()}
          </dd>
        </div>
        <div>
          <dt>Affected future reservations</dt>
          <dd>
            {affected.bookings.length} classes · {affected.appointments.length}{" "}
            appointments
          </dd>
        </div>
      </dl>
      {d.lastError ? (
        <Notice tone="warning">
          {d.lastError === "PAYMENT_LINKAGE_REVIEW"
            ? "The full payment allocation is not yet proven. This case stays open for reconciliation; no beneficiary or proportional entitlement has been assumed."
            : "This outcome needs reconciliation before its access treatment can be confirmed."}
        </Notice>
      ) : null}
      <h4>Verified funded services</h4>
      {d.allocations.length ? (
        <ul>
          {d.allocations.map((a) => (
            <li key={a.id}>
              {a.payment.payerAccount?.member.fullName ?? "Payer not recorded"}{" "}
              pays for {a.payment.member?.fullName ?? "account service"}:{" "}
              <Money
                amountMinor={a.fundedAmountCents}
                currency={a.payment.currency}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p>No exact payment allocation is linked yet.</p>
      )}
      <h4>Reservations included in this review</h4>
      {affected.bookingDetails.length ? (
        <ul>
          {affected.bookingDetails.map((b) => (
            <li key={b.id}>
              {b.title} · {b.scheduledForDate} ·{" "}
              {formatMinutesAsTime(b.startTimeMinutes, props.locale)}–
              {formatMinutesAsTime(b.endTimeMinutes, props.locale)} (
              {b.timezone}) · {b.roomName} · {b.coachName} ·{" "}
              {beneficiary(b.memberId)} ·{" "}
              {b.funding.replaceAll("_", " ").toLowerCase()}
            </li>
          ))}
        </ul>
      ) : (
        <p>No future class reservations are included.</p>
      )}
      {affected.appointments.length ? (
        <ul>
          {affected.appointments.map((a) => {
            const enrollment = affected.enrollments.find(
              (e) => e.id === a.enrollmentId,
            )!;
            return (
              <li key={a.id}>
                {enrollment.programVersion.program.name} appointment ·{" "}
                {new Intl.DateTimeFormat(props.locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: enrollment.timezone,
                }).format(a.startsAt)}{" "}
                ({enrollment.timezone}) ·{" "}
                {a.coach.user.fullName ?? "Assigned coach"} ·{" "}
                {a.room?.name ?? "Online appointment"} ·{" "}
                {beneficiary(enrollment.memberId)} · {a.unitState.toLowerCase()}{" "}
                unit
              </li>
            );
          })}
        </ul>
      ) : (
        <p>No future coaching appointments are included.</p>
      )}
      <h4>Unused access included in this review</h4>
      {affected.cards.map((c) => (
        <p key={c.id}>
          {c.punchCardProduct.name} · {beneficiary(c.memberId)} ·{" "}
          {c.remainingPunches} unreserved of {c.originalPunches} sold visits.
          Releasing future reservations returns their held visits before unused
          access is retired.
        </p>
      ))}
      {affected.membershipDetails.map((m) => (
        <p key={m.id}>
          {m.membershipPlan.name} · {beneficiary(m.memberId)} ·{" "}
          {m.status.toLowerCase()}. Membership billing and service closure are
          separate verified actions.
        </p>
      ))}
      {affected.enrollments.map((e) => {
        const uses = affected.unitUses.filter((a) => a.enrollmentId === e.id);
        return (
          <div key={e.id}>
            <p>
              {e.programVersion.program.name} · accepted version{" "}
              {e.programVersion.number} · {beneficiary(e.memberId)} ·{" "}
              {e.startsOn.toISOString().slice(0, 10)} to{" "}
              {e.endsOn.toISOString().slice(0, 10)} ({e.timezone}) ·{" "}
              {e.status.toLowerCase()}.
            </p>
            <p>
              {e.programVersion.appointmentUnits} sold appointment units ·{" "}
              {uses.filter((a) => a.unitState === "HELD").length} held ·{" "}
              {uses.filter((a) => a.unitState === "CONSUMED").length} consumed ·{" "}
              {uses.filter((a) => a.unitState === "DISPUTED").length} disputed.
              Delivered notes and attendance remain recorded.
            </p>
          </div>
        );
      })}
      {membershipClosureRequired ? (
        <Notice tone="warning">
          Unused membership access cannot be retired while its contract remains
          active. Review its separate membership cancellation and verified
          billing closure, or explicitly retain access. This dispute review
          never stops renewals.
        </Notice>
      ) : null}
      <h4>Verified processor money movements</h4>
      {evidence.balanceTransactions.length ? (
        <ul>
          {evidence.balanceTransactions.map((b) => (
            <li key={b.id}>
              {b.type} · amount{" "}
              <Money amountMinor={b.amount} currency={b.currency} /> · fee{" "}
              <Money amountMinor={b.fee} currency={b.currency} /> · net{" "}
              <Money amountMinor={b.net} currency={b.currency} />
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No balance movements were returned with the latest verified dispute.
        </p>
      )}
      <Notice>
        Existing reservations remain recorded while access and unit changes are
        held for review. A chargeback is separate from a refund. Manage evidence
        or acceptance in Stripe, then check the processor outcome here.
      </Notice>
      <a
        href={`https://dashboard.stripe.com/${encodeURIComponent(d.providerAccountId)}/${d.livemode ? "" : "test/"}disputes/${encodeURIComponent(d.providerDisputeId)}`}
        target="_blank"
        rel="noreferrer"
        className="text-link"
      >
        Open dispute in Stripe
      </a>
      <DisputeForm
        key={d.version}
        disputeId={d.id}
        requestId={randomUUID()}
        reviewHash={reviewHash}
        reviewer={d.reviewerWorkspaceUserId ?? ""}
        owners={owners.map((o) => ({
          id: o.id,
          name: o.user.fullName ?? o.user.email,
        }))}
        final={["won", "lost", "warning_closed", "prevented"].includes(
          d.providerStatus,
        )}
        canRevoke={
          d.providerStatus === "lost" &&
          d.amountCents === d.chargeAmountCents &&
          d.allocations.length === 1 &&
          !membershipClosureRequired
        }
        closed={Boolean(d.resolvedAt)}
      />
      <h4>Dispute history</h4>
      <ol>
        {d.events.map((event) => (
          <li key={event.id}>
            {date(event.createdAt)} ·{" "}
            {event.kind.replaceAll("_", " ").toLowerCase()}
            {event.reason ? ` · ${event.reason}` : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}
