import { randomUUID } from "node:crypto";
import Link from "next/link";
import { FinancialError, previewConfirmedRefundAccess } from "@flowstate/db";
import { Money, Notice } from "@flowstate/ui";
import { AdminShell } from "../../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../../lib/owner-workspace";
import { AdjustmentForm } from "../../../adjustment-form";
export default async function RefundAccessPage({
  params,
}: {
  params: Promise<{ operationId: string }>;
}) {
  const context = await requireOwnerWorkspaceContext(),
    { operationId } = await params;
  let current, error;
  try {
    current = await previewConfirmedRefundAccess({
      workspaceId: context.workspace.id,
      actorUserId: context.session.userId,
      operationId,
    });
  } catch (problem) {
    if (!(problem instanceof FinancialError)) throw problem;
    error = problem.message;
  }
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Resolve refunded access"
      description="Review current access after a confirmed refund."
      actions={
        <Link
          className="text-link"
          href={`/dashboard/billing/operations/${operationId}`}
        >
          Back to refund
        </Link>
      }
    >
      <section className="management-card hl-financial-card">
        {error ? (
          <Notice tone="warning">{error}</Notice>
        ) : current ? (
          <>
            <h2>{current.review.payer}</h2>
            <p>
              Confirmed refund:{" "}
              <Money
                amountMinor={current.operation.amountCents!}
                currency={current.review.currency}
              />
            </p>
            <AdjustmentForm
              initialValues={{
                kind: "resolve-refund",
                targetId: operationId,
                requestId: randomUUID(),
                amount: (current.operation.amountCents! / 100).toFixed(2),
                currency: current.review.currency,
              }}
            />
          </>
        ) : null}
      </section>
    </AdminShell>
  );
}
