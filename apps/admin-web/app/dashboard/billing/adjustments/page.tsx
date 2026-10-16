import Link from "next/link";
import { prisma } from "@flowstate/db";
import { Badge, Money } from "@flowstate/ui";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
export default async function AdjustmentsPage() {
  const context = await requireOwnerWorkspaceContext();
  const where = { workspaceId: context.workspace.id };
  const [payments, accounts, credits, operations] = await Promise.all([
    prisma.payment.findMany({
      where: {
        ...where,
        status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] },
      },
      include: {
        member: { select: { fullName: true } },
        payerAccount: { select: { member: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.financialAccount.findMany({
      where,
      select: { id: true, member: { select: { fullName: true } } },
      orderBy: { member: { fullName: "asc" } },
    }),
    prisma.accountCredit.findMany({
      where: { ...where, status: "ACTIVE", remainingAmountCents: { gt: 0 } },
      include: {
        payerAccount: { select: { member: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.financialOperation.findMany({
      where: {
        ...where,
        kind: { in: ["REFUND", "ISSUE_CREDIT", "APPLY_CREDIT"] },
      },
      include: {
        payerAccount: { select: { member: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Payments and credits"
      description="Review payments, refunds and account credit."
      actions={
        <Link className="text-link" href="/dashboard/billing">
          Back to Billing
        </Link>
      }
    >
      <section className="management-card">
        <h2>Confirmed payments</h2>
        <p className="muted-text">
          Latest 50 payments. Open a member’s billing page for their full
          history.
        </p>
        {payments.length ? (
          <div className="hl-payment-records">
            {payments.map((item) => (
              <article key={item.id} className="hl-payment-record">
                <div className="hl-payment-record-heading">
                  <div>
                    <h3>
                      {item.payerAccount?.member.fullName ??
                        "Payer not recorded"}
                    </h3>
                    <p>For {item.member?.fullName ?? "account service"}</p>
                  </div>
                  <Money
                    amountMinor={item.amountCents}
                    currency={item.currency}
                  />
                </div>
                <p>
                  {item.refundedAmountCents ? (
                    <>
                      <Money
                        amountMinor={item.refundedAmountCents}
                        currency={item.currency}
                      />{" "}
                      refunded
                    </>
                  ) : (
                    "No confirmed refunds"
                  )}
                </p>
                <Link
                  className="text-link"
                  href={`/dashboard/billing/refunds/${item.id}`}
                >
                  Review refund
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p>No confirmed payments yet.</p>
        )}
      </section>
      <section className="management-card">
        <h2>Account credit</h2>
        <p>
          Credit stays with its payer, has no expiry, and can be used for a
          membership invoice in the same currency. Class packs and drop-in
          purchases cannot use it yet.
        </p>
        {credits.map((item) => (
          <article key={item.id} className="hl-payment-record">
            <div className="hl-payment-record-heading">
              <h3>
                {item.payerAccount?.member.fullName ?? "Payer not recorded"}
              </h3>
              <Money
                amountMinor={item.remainingAmountCents}
                currency={item.currency}
              />
            </div>
            <Link
              className="text-link"
              href={`/dashboard/billing/credits/${item.id}/apply`}
            >
              Review available credit
            </Link>
          </article>
        ))}
        <details>
          <summary>Issue credit to a payer</summary>
          {accounts.length ? (
            <ul>
              {accounts.map((account) => (
                <li key={account.id}>
                  <Link
                    className="text-link"
                    href={`/dashboard/billing/credits/new?account=${account.id}`}
                  >
                    {account.member.fullName}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No verified payer accounts yet.</p>
          )}
        </details>
      </section>
      <section className="management-card">
        <h2>Recent requests</h2>
        <p className="muted-text">Latest 50 refund and credit requests.</p>
        {operations.length ? (
          operations.map((item) => (
            <article key={item.id} className="hl-payment-record">
              <div className="hl-payment-record-heading">
                <h3>
                  {item.kind === "REFUND"
                    ? "Refund"
                    : item.kind === "ISSUE_CREDIT"
                      ? "Credit issued"
                      : "Credit transfer"}{" "}
                  · {item.payerAccount?.member.fullName ?? "Recorded payer"}
                </h3>
                <Badge
                  tone={item.status === "SUCCEEDED" ? "success" : "warning"}
                >
                  {item.status.replaceAll("_", " ").toLowerCase()}
                </Badge>
              </div>
              {item.amountCents !== null && item.currency ? (
                <Money
                  amountMinor={item.amountCents}
                  currency={item.currency}
                />
              ) : null}
              <p>
                <Link
                  className="text-link"
                  href={`/dashboard/billing/operations/${item.id}`}
                >
                  Open request
                </Link>
              </p>
            </article>
          ))
        ) : (
          <p>No refund or credit requests yet.</p>
        )}
      </section>
    </AdminShell>
  );
}
