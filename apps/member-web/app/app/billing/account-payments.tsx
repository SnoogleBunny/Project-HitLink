import { Badge, Money } from "@flowstate/ui";
import Link from "next/link";
import { formatGymDateTime } from "../../../lib/billing-display";
import type { PayerBillingData } from "../../../lib/payer-billing";
const operationLabels: Record<string, string> = {
  CHECKOUT: "Purchase",
  RETRY_INVOICE: "Payment retry",
  REFUND: "Refund",
  ISSUE_CREDIT: "Credit",
  APPLY_CREDIT: "Credit application",
  STOP_RENEWALS: "Stop renewals",
  RESTORE_RENEWALS: "Restore renewals",
  FREEZE: "Membership freeze",
  RESUME: "Membership resumption",
};
const statusLabels: Record<string, string> = {
  RESERVED: "Pending",
  SUBMITTED: "Processing",
  REVIEW_REQUIRED: "Needs review",
  SUCCEEDED: "Paid",
  FAILED: "Failed",
  PENDING: "Pending",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
  IMPORTED: "Imported record",
};
export function AccountPayments({
  data,
  timezone,
  history,
}: {
  data: PayerBillingData;
  timezone: string;
  history: boolean;
}) {
  return (
    <>
      <nav className="hl-payment-tabs" aria-label="Payment views">
        <Link
          className="hl-text-link"
          aria-current={!history ? "page" : undefined}
          href="/app/billing"
        >
          Current payments
        </Link>
        <Link
          className="hl-text-link"
          aria-current={history ? "page" : undefined}
          href="/app/billing?view=history"
        >
          History
        </Link>
      </nav>
      {!history ? (
        <>
          <section className="member-card">
            <div className="hl-card-heading">
              <h2>Current payments</h2>
              <Badge>{data.operations.length + data.invoices.length}</Badge>
            </div>
            {!data.operations.length && !data.invoices.length ? (
              <p className="member-copy">
                No open invoices or payment requests for your account.
              </p>
            ) : (
              <div className="hl-payment-records">
                {data.operations.map((item) => (
                  <article key={item.id}>
                    <div className="hl-payment-record-heading">
                      <div>
                        <h3>
                          {operationLabels[item.kind] ?? "Payment request"}
                        </h3>
                        <p>
                          For{" "}
                          {item.beneficiaryMember?.fullName ?? "your account"}
                        </p>
                      </div>
                      <Badge
                        tone={
                          item.status === "REVIEW_REQUIRED"
                            ? "warning"
                            : "neutral"
                        }
                      >
                        {statusLabels[item.status] ?? "Pending"}
                      </Badge>
                    </div>
                    <dl>
                      <div>
                        <dt>Amount</dt>
                        <dd>
                          {item.amountCents !== null && item.currency ? (
                            <Money
                              amountMinor={item.amountCents}
                              currency={item.currency}
                            />
                          ) : (
                            "Amount not recorded"
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Started</dt>
                        <dd>{formatGymDateTime(item.createdAt, timezone)}</dd>
                      </div>
                      {item.expiresAt ? (
                        <div>
                          <dt>Checkout expires</dt>
                          <dd>{formatGymDateTime(item.expiresAt, timezone)}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {item.kind === "CHECKOUT" ? (
                      <Link
                        className="hl-text-link"
                        href={`/app/checkout/complete?operation=${encodeURIComponent(item.id)}`}
                      >
                        Check payment status
                      </Link>
                    ) : (
                      <p className="member-copy">
                        The gym is processing this request. It is complete only
                        after confirmation.
                      </p>
                    )}
                  </article>
                ))}
                {data.invoices.map((item) => (
                  <article key={item.id}>
                    <div className="hl-payment-record-heading">
                      <div>
                        <h3>
                          {item.invoiceNumber
                            ? `Invoice ${item.invoiceNumber}`
                            : "Open invoice"}
                        </h3>
                        <p>For {item.member?.fullName ?? "your account"}</p>
                      </div>
                      <Badge tone="warning">Amount due</Badge>
                    </div>
                    <dl>
                      <div>
                        <dt>Due</dt>
                        <dd>
                          <Money
                            amountMinor={item.amountDueCents}
                            currency={item.currency}
                          />
                        </dd>
                      </div>
                      <div>
                        <dt>Total</dt>
                        <dd>
                          <Money
                            amountMinor={item.totalCents}
                            currency={item.currency}
                          />
                        </dd>
                      </div>
                      <div>
                        <dt>Due date</dt>
                        <dd>
                          {formatGymDateTime(
                            item.dueAt,
                            timezone,
                            "No due date recorded",
                          )}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>
          {data.credits.length ? (
            <section className="member-card">
              <h2>Available credits</h2>
              <p className="member-copy">Account credit can be applied to a membership invoice in the same currency. Ask the gym to apply it. Class packs and drop-in purchases cannot use it yet.</p>
              <div className="hl-payment-records">
                {data.credits.map((item) => (
                  <article key={item.id}>
                    <div className="hl-payment-record-heading">
                      <div>
                        <h3>Account credit</h3>
                        <p>For {item.member.fullName}</p>
                      </div>
                      <Money
                        amountMinor={item.availableCents}
                        currency={item.currency}
                      />
                    </div>
                    <p className="member-copy">
                      {item.expiresAt
                        ? `Expires ${formatGymDateTime(item.expiresAt, timezone)}`
                        : "No expiry"}
                    </p>
                    {item.reservedCents > 0 ? <p className="member-copy"><Money amountMinor={item.reservedCents} currency={item.currency} /> reserved for a pending transfer.</p> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="member-card">
          <h2>Payment history</h2>
          <p className="member-copy">
            Your latest 50 payments, including purchases for family members.
          </p>
          {data.payments.length ? (
            <div className="hl-payment-records">
              {data.payments.map((item) => (
                <article key={item.id}>
                  <div className="hl-payment-record-heading">
                    <div>
                      <h3>
                        {item.invoice?.invoiceNumber
                          ? `Invoice ${item.invoice.invoiceNumber}`
                          : "Payment"}
                      </h3>
                      <p>For {item.member?.fullName ?? "your account"}</p>
                    </div>
                    <Badge
                      tone={
                        item.status === "SUCCEEDED"
                          ? "success"
                          : item.status === "FAILED"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {statusLabels[item.status] ?? "Status unavailable"}
                    </Badge>
                  </div>
                  <dl>
                    <div>
                      <dt>Amount</dt>
                      <dd>
                        <Money
                          amountMinor={item.amountCents}
                          currency={item.currency}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>Recorded</dt>
                      <dd>
                        {formatGymDateTime(
                          item.paidAt ?? item.failedAt ?? item.createdAt,
                          timezone,
                        )}
                      </dd>
                    </div>
                    {item.refundedAmountCents > 0 ? (
                      <div>
                        <dt>Refunded</dt>
                        <dd>
                          <Money
                            amountMinor={item.refundedAmountCents}
                            currency={item.currency}
                          />
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {item.refunds.map((refund) => (
                    <div className="hl-refund-line" key={refund.id}>
                      <span>
                        Refund ·{" "}
                        {refund.status === "SUCCEEDED"
                          ? "Confirmed"
                          : refund.status === "FAILED"
                            ? "Failed"
                            : refund.status === "IMPORTED"
                              ? "Imported record"
                              : "Pending"}
                      </span>
                      <Money
                        amountMinor={refund.amountCents}
                        currency={refund.currency}
                      />
                    </div>
                  ))}
                </article>
              ))}
            </div>
          ) : (
            <p className="member-copy">
              No payments recorded for your account yet.
            </p>
          )}
          {data.creditHistory?.length ? <><h3>Credit history</h3><div className="hl-payment-records">{data.creditHistory.map(item => <article key={item.id}><div className="hl-payment-record-heading"><h4>{item.kind === "ISSUE_CREDIT" ? "Account credit issued" : "Credit transferred to membership billing"}</h4>{item.amountCents !== null && item.currency ? <Money amountMinor={item.amountCents} currency={item.currency} /> : null}</div><p>{formatGymDateTime(item.settledAt ?? item.createdAt, timezone)}</p>{item.kind === "APPLY_CREDIT" ? <p className="member-copy">Transferred to your processor balance. Invoice settlement is recorded separately.</p> : null}</article>)}</div></> : null}
        </section>
      )}
    </>
  );
}
