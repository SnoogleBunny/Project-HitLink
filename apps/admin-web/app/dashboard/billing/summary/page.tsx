import Link from "next/link";
import { Money, resolveDisplayLocale } from "@flowstate/ui";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import {
  financialSummaryQuery,
  getFinancialSummary,
  getFinancialSummaryRecords,
} from "../../../../lib/financial-summary";

export default async function FinancialSummaryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const query = financialSummaryQuery((await searchParams) ?? {});
  const actor = { workspaceId: workspace.id, actorUserId: session.userId };
  const [summary, detail] = await Promise.all([
    getFinancialSummary(actor),
    getFinancialSummaryRecords({ ...actor, query }),
  ]);
  const locale = resolveDisplayLocale(workspace.settings?.locale);
  const link = (
    records: string,
    source = query.source,
    currency = query.currency,
    page = 1,
  ) => {
    const params = new URLSearchParams({ records, source, page: String(page) });
    if (currency) params.set("currency", currency);
    return `/dashboard/billing/summary?${params}`;
  };
  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      title="Financial summary"
      description="All recorded history, separated by currency and collection source."
      actions={
        <Link className="text-link" href="/dashboard/billing">
          Back to Billing
        </Link>
      }
    >
      <p>
        Snapshot{" "}
        {new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: workspace.location.timezone,
        }).format(summary.capturedAt)}{" "}
        · {workspace.location.timezone}
      </p>
      <p>
        Confirmed collections exclude failed and pending payments. Net
        collections equal recorded collections minus confirmed refunds. Account
        credit and outstanding invoices are separate ledgers. These figures
        exclude processor fees, payouts and dispute balance movements.
      </p>
      {summary.ledgers.length ? (
        summary.ledgers.map((item) => (
          <section
            className="management-card"
            key={`${item.source}:${item.currency}`}
          >
            <h2>
              {item.source === "CURRENT"
                ? "HitLink collections"
                : "Imported source evidence"}{" "}
              · {item.currency.toUpperCase()}
            </h2>
            {item.source === "IMPORTED" ? (
              <p>
                Historical records from the previous system. These are not new
                HitLink charges.
              </p>
            ) : null}
            <dl className="summary-list">
              <div>
                <dt>Confirmed collections · {item.paymentCount} records</dt>
                <dd>
                  <Money amountMinor={item.gross} currency={item.currency} />
                </dd>
              </div>
              <div>
                <dt>Confirmed refunds · {item.refundCount} records</dt>
                <dd>
                  <Money amountMinor={item.refunded} currency={item.currency} />
                </dd>
              </div>
              <div>
                <dt>Net collections</dt>
                <dd>
                  <Money amountMinor={item.net} currency={item.currency} />
                </dd>
              </div>
              <div>
                <dt>Outstanding issued invoice balance</dt>
                <dd>
                  <Money
                    amountMinor={item.invoiceDue}
                    currency={item.currency}
                  />
                </dd>
              </div>
              <div>
                <dt>Tax on fully paid invoices</dt>
                <dd>
                  <Money
                    amountMinor={item.paidInvoiceTax}
                    currency={item.currency}
                  />
                </dd>
              </div>
              <div>
                <dt>Pending payments · excluded from collections</dt>
                <dd>
                  <Money
                    amountMinor={item.pendingPayments}
                    currency={item.currency}
                  />
                </dd>
              </div>
              <div>
                <dt>Pending refunds · excluded from confirmed refunds</dt>
                <dd>
                  <Money
                    amountMinor={item.pendingRefunds}
                    currency={item.currency}
                  />
                </dd>
              </div>
            </dl>
            <p>
              Invoice tax is the recorded invoice amount before any refund
              allocation. This is not a tax return or a statement of tax
              remitted.
            </p>
            {item.refundDifference ? (
              <p role="alert" className="form-error">
                Refund totals need reconciliation. Payments record{" "}
                <Money
                  amountMinor={item.recordedRefunds}
                  currency={item.currency}
                />{" "}
                refunded; the confirmed refund ledger records{" "}
                <Money amountMinor={item.refunded} currency={item.currency} />.
              </p>
            ) : null}
            <nav
              className="hl-payment-tabs"
              aria-label={`${item.source} ${item.currency.toUpperCase()} records`}
            >
              <Link
                className="text-link"
                href={link("payments", item.source, item.currency)}
              >
                Inspect payments
              </Link>
              <Link
                className="text-link"
                href={link("refunds", item.source, item.currency)}
              >
                Inspect refunds
              </Link>
              <Link
                className="text-link"
                href={link("invoices", item.source, item.currency)}
              >
                Inspect invoices and tax
              </Link>
            </nav>
          </section>
        ))
      ) : (
        <p>No payment, refund or invoice records yet.</p>
      )}
      <section className="management-card">
        <h2>Refund reconciliation</h2>
        {summary.refundChecks.length ? (
          <>
            <p role="alert" className="form-error">
              {summary.refundChecks[0]!.total} payments need refund
              reconciliation. Showing up to 50; resolve these records and reload
              for the next outstanding records.
            </p>
            {summary.refundChecks.map((row) => (
              <p key={row.id}>
                <Link
                  className="text-link"
                  href={`/dashboard/billing/refunds/${row.id}`}
                >
                  Review payment {row.id}
                </Link>{" "}
                · recorded refund{" "}
                <Money amountMinor={row.mirrored} currency={row.currency} /> ·
                confirmed linked refunds{" "}
                <Money amountMinor={row.confirmed} currency={row.currency} />
                {row.invalidLinks
                  ? " · incompatible refund link requires review"
                  : ""}
              </p>
            ))}
          </>
        ) : (
          <p>
            Recorded payment refund amounts match their confirmed linked refund
            records. Currency-level discrepancies above can also identify
            unlinked historical refunds.
          </p>
        )}
      </section>
      <section className="management-card">
        <h2>Processor disputes</h2>
        <p>
          Disputed amounts belong to individual cases and can overlap on one
          payment. They are separate from refunds and net collections. Open a
          case to inspect verified processor money movements and its access
          treatment.
        </p>
        {summary.disputes.length ? (
          summary.disputes.map((row) => (
            <p
              key={`${row.currency}:${row.livemode}:${row.providerStatus}:${row.moneyState}`}
            >
              {row.livemode ? "Live mode" : "Test mode"} · {row._count._all}{" "}
              cases · {row.providerStatus.replaceAll("_", " ")} ·{" "}
              {row.moneyState.replaceAll("_", " ").toLowerCase()} ·{" "}
              <Money
                amountMinor={row._sum.amountCents ?? 0}
                currency={row.currency}
              />
            </p>
          ))
        ) : (
          <p>No processor disputes recorded.</p>
        )}
        <Link className="text-link" href="/dashboard/billing?filter=attention">
          Review financial cases
        </Link>
      </section>
      <section className="management-card">
        <h2>Credit and unsettled requests</h2>
        <p>
          Credit issuance is not a new cash collection. Unsettled requests can
          refer to the same invoice or payment, so they are not added to invoice
          debt.
        </p>
        {summary.credits
          .filter((row) => row.status === "ACTIVE")
          .map((row) => (
            <p key={`${row.currency}:${row.status}`}>
              {row.currency.toUpperCase()} · {row._count._all} active credit
              records ·{" "}
              <Money
                amountMinor={row._sum.remainingAmountCents ?? 0}
                currency={row.currency}
              />{" "}
              remaining.{" "}
              <Link
                className="text-link"
                href={link("credits", "CURRENT", row.currency)}
              >
                Inspect credit
              </Link>
            </p>
          ))}
        {summary.operations.map((row) => (
          <p key={`${row.currency}:${row.kind}:${row.status}`}>
            {row._count._all} {row.kind.replaceAll("_", " ").toLowerCase()}{" "}
            requests · {row.status.replaceAll("_", " ").toLowerCase()}
            {row.currency && row._sum.amountCents !== null ? (
              <>
                {" "}
                ·{" "}
                <Money
                  amountMinor={row._sum.amountCents}
                  currency={row.currency}
                />
              </>
            ) : (
              " · amount not established"
            )}
          </p>
        ))}
        <p>
          {summary.openReviews} unresolved financial review cases.{" "}
          <Link
            className="text-link"
            href="/dashboard/billing?filter=attention"
          >
            Review unresolved cases
          </Link>
        </p>
      </section>
      <section
        className="management-card"
        aria-labelledby="financial-records-heading"
      >
        <h2 id="financial-records-heading">
          {query.view[0]!.toUpperCase() + query.view.slice(1)} ·{" "}
          {query.view === "credits"
            ? "all credit"
            : query.source === "CURRENT"
              ? "HitLink"
              : "imported"}{" "}
          {query.currency?.toUpperCase()}
        </h2>
        <p>
          {detail.count} matching records. Page {query.page}; up to 50 records
          per page. Payment and refund rows show their full amount; invoice rows
          show the remaining balance; credit rows show remaining credit.
        </p>
        {detail.records.map((row) => (
          <article className="hl-payment-record" key={row.id}>
            <h3>
              {row.status.replaceAll("_", " ").toLowerCase()} ·{" "}
              <Money amountMinor={row.amount} currency={row.currency} />
            </h3>
            <p>Record {row.id}</p>
            <p>
              {row.detail}
              {row.detailAmount !== null ? (
                <>
                  :{" "}
                  <Money
                    amountMinor={row.detailAmount}
                    currency={row.currency}
                  />
                </>
              ) : null}
            </p>
            {row.memberId ? (
              <Link
                className="text-link"
                href={`/dashboard/members/${row.memberId}/billing`}
              >
                Open member billing
              </Link>
            ) : (
              <p>Account service or retained source record</p>
            )}
          </article>
        ))}
        <nav className="hl-payment-tabs" aria-label="Financial record pages">
          {query.page > 1 ? (
            <Link
              className="text-link"
              href={link(
                query.view,
                query.source,
                query.currency,
                query.page - 1,
              )}
            >
              Previous page
            </Link>
          ) : null}
          {query.page * 50 < detail.count ? (
            <Link
              className="text-link"
              href={link(
                query.view,
                query.source,
                query.currency,
                query.page + 1,
              )}
            >
              Next page
            </Link>
          ) : null}
        </nav>
      </section>
    </AdminShell>
  );
}
