import type { MemberServiceSummary } from "@flowstate/db";
function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}
export function MemberServiceSummaryPanel({
  services,
  compact = false,
}: {
  services: MemberServiceSummary;
  compact?: boolean;
}) {
  const membership = services.membership;
  const archived = services.archived;
  return (
    <div className="stack-list" aria-label="Independent service status">
      {archived ? (
        <p>
          Archived profile: new service acquisition is blocked; existing service
          and financial records remain.
        </p>
      ) : null}
      <div>
        <strong>Membership</strong>
        {membership ? (
          <>
            <p>
              {membership.name} · Contract: {label(membership.contractState)} ·
              Payment: {label(membership.paymentState)}
              {membership.graceUntil ? " (within recorded grace)" : ""}
            </p>
            <p>
              Membership funding:{" "}
              {label(archived ? "ARCHIVED" : membership.fundingState)}.
            </p>
            {membership.held ? (
              <p>
                Membership entitlement is held for financial review. Other
                products keep their own status.
              </p>
            ) : null}
            {!membership.sourceDateCovered ? (
              <p>
                Original-system evidence does not cover today. Review this
                membership&apos;s source records.
              </p>
            ) : null}
            {membership.cancellationScheduled ? (
              <p>
                Cancellation scheduled
                {membership.endsOn
                  ? ` for ${membership.endsOn}`
                  : "; effective date needs review"}
                .
              </p>
            ) : null}
            {membership.allowance.state === "READY" ? (
              membership.allowance.summary.unlimited ? (
                <p>No class cap in accepted membership terms.</p>
              ) : (
                <ul>
                  {membership.allowance.summary.windows.map((window) => (
                    <li key={`${window.kind}:${window.startsOn}`}>
                      {label(window.kind)}: {window.remaining} available ·{" "}
                      {window.reserved} held · {window.used} used of{" "}
                      {window.limit}
                    </li>
                  ))}
                </ul>
              )
            ) : membership.allowance.state === "REVIEW" ? (
              <p>{membership.allowance.message}</p>
            ) : null}
          </>
        ) : (
          <p>No current membership contract.</p>
        )}
      </div>
      <div>
        <strong>Class packs</strong>
        {services.packs.length ? (
          <ul>
            {services.packs.map((pack) => (
              <li key={pack.id}>
                {pack.name}: {pack.recordedUnits} recorded{" "}
                {pack.recordedUnits === 1 ? "unit" : "units"} ·{" "}
                {label(pack.state)}
                {pack.held ? " · financial hold" : ""}
                {pack.expiresOn ? ` · expires ${pack.expiresOn}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>No current class pack records.</p>
        )}
        {services.morePacks ? (
          <p>
            Showing 10 pack records. Review all packs in the member&apos;s billing
            records before deciding access.
          </p>
        ) : null}
      </div>
      <div>
        <strong>Coaching</strong>
        {services.coaching.length ? (
          <ul>
            {services.coaching.map((program) => (
              <li key={program.id}>
                {program.name}: {label(program.state)} · Payment:{" "}
                {label(program.paymentState)}
                {program.held ? " · financial hold" : ""}
                {!compact
                  ? ` · Settlement: ${label(program.settlementState)} · Records: ${label(program.exportState)}`
                  : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>No coaching engagement recorded.</p>
        )}
        {services.moreCoaching ? (
          <p>
            Showing 10 engagements. Open Coaching clients for the complete
            history.
          </p>
        ) : null}
      </div>
      {!compact ? (
        <p>
          These are separate service facts. Every class or appointment still
          checks its own accepted dates, program rules, forms, balance, holds
          and availability. A payment never changes another service&apos;s freeze,
          cancellation or archive state.
        </p>
      ) : null}
    </div>
  );
}
