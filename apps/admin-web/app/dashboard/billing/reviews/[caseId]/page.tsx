import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Money, Notice } from "@flowstate/ui";
import { toDateOnlyString } from "@flowstate/db";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { getFinancialReviewCase } from "../../../../../lib/financial-review";
export default async function FinancialReviewPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const context = await requireOwnerWorkspaceContext();
  const { caseId } = await params;
  const item = await getFinancialReviewCase({
    workspaceId: context.workspace.id,
    caseId,
  });
  if (!item) notFound();
  const date = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: context.location.timezone,
    }).format(value);
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Payment review"
      description="Review the recorded payment and access issue."
      actions={
        <Link href="/dashboard/billing?filter=attention" className="text-link">
          Back to Billing
        </Link>
      }
    >
      <section className="management-card hl-payment-review">
        <div className="hl-payment-record-heading">
          <h3>{item.payerAccount?.member.fullName ?? "Payer not recorded"}</h3>
          <Badge tone={item.resolvedAt ? "success" : "warning"}>
            {item.resolvedAt ? "Resolved" : "Needs review"}
          </Badge>
        </div>
        <p>{item.reason}</p>
        <dl className="detail-list">
          <div>
            <dt>Beneficiary</dt>
            <dd>{item.member?.fullName ?? "Account service"}</dd>
          </div>
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
            <dt>Opened</dt>
            <dd>{date(item.createdAt)}</dd>
          </div>
          {item.resolvedAt ? (
            <div>
              <dt>Resolved</dt>
              <dd>{date(item.resolvedAt)}</dd>
            </div>
          ) : null}
          {item.resolution ? (
            <div>
              <dt>Resolution</dt>
              <dd>{item.resolution}</dd>
            </div>
          ) : null}
        </dl>
        {!item.resolvedAt ? (
          <Notice tone="warning">
            This case remains open until its payment and access outcome is
            confirmed.
          </Notice>
        ) : null}
        <div className="dashboard-actions">
          {item.adjustmentOperationId ? (
            <Link
              className="text-link"
              href={`/dashboard/billing/operations/${item.adjustmentOperationId}`}
            >
              Open financial request
            </Link>
          ) : null}
          {item.paymentId ? (
            <Link
              className="text-link"
              href={`/dashboard/billing/refunds/${item.paymentId}`}
            >
              Review refund
            </Link>
          ) : null}
          {item.memberId ? (
            <Link
              className="text-link"
              href={`/dashboard/members/${item.memberId}/billing`}
            >
              Open member billing
            </Link>
          ) : null}
          {item.booking ? (
            <Link
              className="text-link"
              href={`/dashboard/schedule/${item.booking.classTemplateId}/roster?date=${toDateOnlyString(item.booking.scheduledForDate)}`}
            >
              Open dated class roster
            </Link>
          ) : null}
        </div>
      </section>
    </AdminShell>
  );
}
