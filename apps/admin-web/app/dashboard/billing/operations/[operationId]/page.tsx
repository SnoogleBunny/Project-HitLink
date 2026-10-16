import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@flowstate/db";
import { Badge, Money, Notice } from "@flowstate/ui";
import { AdminShell } from "../../../../_components/admin-shell";
import { SubmitButton } from "../../../../_components/submit-button";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { resumeFinancialAdjustment } from "../../adjustment-actions";
export default async function AdjustmentStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ operationId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await requireOwnerWorkspaceContext();
  const { operationId } = await params,
    { error } = await searchParams;
  const operation = await prisma.financialOperation.findFirst({
    where: {
      workspaceId: context.workspace.id,
      id: operationId,
      kind: { in: ["REFUND", "ISSUE_CREDIT", "APPLY_CREDIT"] },
    },
    include: {
      payerAccount: { select: { member: { select: { fullName: true } } } },
      beneficiaryMember: { select: { fullName: true } },
    },
  });
  if (!operation) notFound();
  const succeeded = operation.status === "SUCCEEDED",
    failed = operation.status === "FAILED";
  const refund = operation.kind === "REFUND",
    issue = operation.kind === "ISSUE_CREDIT";
  const result = operation.result as {
    moneyConfirmed?: boolean;
    accessDecision?: { disposition: string };
  } | null;
  const disposition =
    result?.accessDecision?.disposition ??
    (operation.payload as { command?: { disposition?: string } }).command
      ?.disposition;
  const title = refund
    ? "Refund status"
    : issue
      ? "Credit issued"
      : "Credit transfer status";
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title={title}
      description="This page shows the saved request and confirmed outcome."
      actions={
        <Link className="text-link" href="/dashboard/billing/adjustments">
          Back to payments
        </Link>
      }
    >
      <section className="management-card hl-financial-card">
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        <div className="hl-payment-record-heading">
          <h2>{operation.payerAccount?.member.fullName ?? "Recorded payer"}</h2>
          <Badge tone={succeeded ? "success" : failed ? "danger" : "warning"}>
            {succeeded
              ? "Confirmed"
              : failed
                ? "Failed"
                : operation.status === "REVIEW_REQUIRED"
                  ? "Needs review"
                  : "Processing"}
          </Badge>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Amount</dt>
            <dd>
              <Money
                amountMinor={operation.amountCents!}
                currency={operation.currency!}
              />
            </dd>
          </div>
          <div>
            <dt>For</dt>
            <dd>
              {operation.beneficiaryMember?.fullName ?? "Account service"}
            </dd>
          </div>
        </dl>
        {succeeded ? (
          <Notice tone="success">
            {refund
              ? `The processor confirmed the refund. ${disposition === "RETAIN_ACCESS" ? "Existing access and reservations remain available." : "The reviewed unused access has ended and its future reservations have been cancelled."}`
              : issue
                ? "The credit is saved. It has no expiry and can be applied to a membership invoice in the same currency."
                : "Credit was transferred to the payer’s processor balance. Invoice status will update after the processor confirms settlement."}
          </Notice>
        ) : (
          <Notice tone="warning">
            {operation.lastError ??
              (result?.moneyConfirmed
                ? "The refund is confirmed. Its access outcome still needs review; the affected access remains on hold."
                : "The processor has not confirmed the outcome. The amount remains reserved. Check this same request before creating another.")}
          </Notice>
        )}
        {refund ? (
          <p>A refund does not cancel future membership billing.</p>
        ) : (
          <p>
            Account credit cannot currently be used for class packs or drop-in
            purchases.
          </p>
        )}
        <div className="dashboard-actions">
          {refund && !succeeded && result?.moneyConfirmed ? (
            <Link
              className="button"
              href={`/dashboard/billing/operations/${operation.id}/access`}
            >
              Review access outcome
            </Link>
          ) : null}
          {!succeeded && !failed ? (
            <form action={resumeFinancialAdjustment}>
              <input type="hidden" name="operationId" value={operation.id} />
              <SubmitButton pendingLabel="Checking…">
                Check this request
              </SubmitButton>
            </form>
          ) : null}
          {issue && succeeded && operation.targetId ? (
            <Link
              className="button"
              href={`/dashboard/billing/credits/${operation.targetId}/apply`}
            >
              Apply to next membership invoice
            </Link>
          ) : null}
        </div>
      </section>
    </AdminShell>
  );
}
