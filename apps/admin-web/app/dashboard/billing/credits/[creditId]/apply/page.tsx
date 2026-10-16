import { randomUUID } from "node:crypto";
import Link from "next/link";
import { FinancialError, previewOwnerCreditApplication } from "@flowstate/db";
import { Money, Notice } from "@flowstate/ui";
import { AdminShell } from "../../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../../lib/owner-workspace";
import { AdjustmentForm } from "../../../adjustment-form";
export default async function ApplyCreditPage({
  params,
}: {
  params: Promise<{ creditId: string }>;
}) {
  const context = await requireOwnerWorkspaceContext();
  const { creditId } = await params;
  let review, error;
  try {
    review = await previewOwnerCreditApplication({
      workspaceId: context.workspace.id,
      actorUserId: context.session.userId,
      creditId,
    });
  } catch (problem) {
    if (!(problem instanceof FinancialError)) throw problem;
    error = problem.message;
  }
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Apply credit to a membership invoice"
      description="Transfer credit to this payer’s processor balance."
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
            <dl className="detail-list">
              <div>
                <dt>Credit balance</dt>
                <dd>
                  <Money
                    amountMinor={review.remainingCents}
                    currency={review.currency}
                  />
                </dd>
              </div>
              <div>
                <dt>Pending transfers</dt>
                <dd>
                  <Money
                    amountMinor={review.reservedCents}
                    currency={review.currency}
                  />
                </dd>
              </div>
            </dl>
            {!review.canApply ? (
              <Notice tone="warning">
                This payer needs a matching membership and verified processor
                customer before using the credit. It remains available without
                expiry.
              </Notice>
            ) : null}
            <AdjustmentForm
              initialValues={{
                kind: "apply-credit",
                targetId: creditId,
                requestId: randomUUID(),
                currency: review.currency,
                amount: (review.availableCents / 100).toFixed(2),
              }}
              maxCents={review.availableCents}
              disabled={!review.canApply || review.availableCents === 0}
            />
          </>
        ) : null}
      </section>
    </AdminShell>
  );
}
