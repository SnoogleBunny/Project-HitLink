import { randomUUID } from "node:crypto";
import Link from "next/link";
import { FinancialError, previewOwnerRefund } from "@flowstate/db";
import { Money, Notice } from "@flowstate/ui";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { AdjustmentForm } from "../../adjustment-form";
export default async function RefundPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const context = await requireOwnerWorkspaceContext();
  const { paymentId } = await params;
  let review, error;
  try {
    review = await previewOwnerRefund({
      workspaceId: context.workspace.id,
      actorUserId: context.session.userId,
      paymentId,
    });
  } catch (problem) {
    if (!(problem instanceof FinancialError)) throw problem;
    error = problem.message;
  }
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Refund payment"
      description="Review the amount and what happens to unused access."
      actions={
        <Link className="text-link" href="/dashboard/billing/adjustments">
          Back to payments
        </Link>
      }
    >
      <section className="management-card hl-financial-card">
        {error ? (
          <Notice tone="warning">{error}</Notice>
        ) : review ? (
          <>
            <h2>{review.payer}</h2>
            <p>Payment for {review.beneficiary}</p>
            <dl className="detail-list">
              <div>
                <dt>Original payment</dt>
                <dd>
                  <Money
                    amountMinor={review.amountCents}
                    currency={review.currency}
                  />
                </dd>
              </div>
              <div>
                <dt>Already refunded</dt>
                <dd>
                  <Money
                    amountMinor={review.succeeded}
                    currency={review.currency}
                  />
                </dd>
              </div>
              <div>
                <dt>Pending refunds</dt>
                <dd>
                  <Money
                    amountMinor={review.pending}
                    currency={review.currency}
                  />
                </dd>
              </div>
            </dl>
            {review.revokeUnavailableReason ? (
              <Notice tone="warning">{review.revokeUnavailableReason}</Notice>
            ) : null}
            {!review.onlineAvailable ? (
              <Notice tone="warning">
                The original processor payment needs reconciliation before an
                online refund is available.
              </Notice>
            ) : null}
            <AdjustmentForm
              initialValues={{
                kind: "refund",
                targetId: paymentId,
                requestId: randomUUID(),
                currency: review.currency,
                amount: (review.refundableCents / 100).toFixed(2),
              }}
              maxCents={review.refundableCents}
              disabled={!review.onlineAvailable || review.refundableCents === 0}
            />
          </>
        ) : null}
      </section>
    </AdminShell>
  );
}
