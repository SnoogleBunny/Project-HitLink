"use client";

import { useActionState } from "react";
import { Money, Notice } from "@flowstate/ui";
import type { MemberArchiveImpact } from "../../../lib/member-archive-impact";
import { changeMemberArchiveAction } from "./archive-actions";

export function MemberArchiveForm({
  memberId,
  archived,
  version,
  impact,
}: {
  memberId: string;
  archived: boolean;
  version: number;
  impact: MemberArchiveImpact;
}) {
  const [state, action, pending] = useActionState(changeMemberArchiveAction, {
    error: null,
    success: null,
  });
  return (
    <section className="management-card form-stack">
      <h2>{archived ? "Archived member" : "Archive member"}</h2>
      <p className="management-copy">
        Archiving keeps attendance, signed forms, transactions and balances.
        Resolve active services and upcoming bookings first. Reactivation
        restores the directory entry; it does not create a membership or
        purchase.
      </p>
      {state.error ? (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      ) : state.success ? (
        <Notice tone="success" role="status">
          {state.success}
        </Notice>
      ) : null}
      <form action={action} className="form-stack">
        <input type="hidden" name="memberId" value={memberId} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="impactHash" value={impact.hash} />
        <input
          type="hidden"
          name="operation"
          value={archived ? "reactivate" : "archive"}
        />
        {!archived ? (
          <>
            <h3>Archive preview</h3>
            <dl className="detail-list">
              {Object.entries({
                memberships: "Active memberships",
                classes: "Upcoming class bookings",
                waitlist: "Active future waitlists",
                coaching: "Open coaching programs",
                events: "Upcoming event bookings",
                lessons: "Upcoming private lessons",
                checkout: "Pending purchases",
              }).map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {impact.blockers[key as keyof typeof impact.blockers]} ·{" "}
                    {impact.blockers[key as keyof typeof impact.blockers]
                      ? "Resolve before archiving"
                      : "Clear"}
                  </dd>
                </div>
              ))}
              <div>
                <dt>Open invoice balances</dt>
                <dd>
                  {impact.debt.length
                    ? impact.debt.map((row) => (
                        <p key={row.currency}>
                          <Money
                            amountMinor={row.amountMinor}
                            currency={row.currency}
                          />{" "}
                          retained
                        </p>
                      ))
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Recorded credits</dt>
                <dd>
                  {impact.credits.length
                    ? impact.credits.map((row) => (
                        <p key={row.currency}>
                          <Money
                            amountMinor={row.amountMinor}
                            currency={row.currency}
                          />{" "}
                          retained
                        </p>
                      ))
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Unused class-pack units</dt>
                <dd>
                  {impact.units.reduce((total, row) => total + row.units, 0)}{" "}
                  retained with their original products
                </dd>
              </div>
            </dl>
            <label className="member-checkbox-field">
              <input type="checkbox" name="retainBalancesAndUnits" required />
              <span>
                Keep all debts, credits and unused units recorded. No balance is
                waived, refunded, transferred or forfeited by archiving.
              </span>
            </label>
          </>
        ) : null}
        <label className="field">
          <span>Reason for {archived ? "reactivation" : "archiving"}</span>
          <input name="reason" required minLength={5} maxLength={500} />
        </label>
        <button className="button button-secondary" disabled={pending}>
          {pending
            ? "Saving…"
            : archived
              ? "Reactivate member"
              : "Archive member"}
        </button>
      </form>
    </section>
  );
}
