import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatPaymentConfirmation,
  getPaymentConfirmation,
} from "@flowstate/db";
import { Money } from "@flowstate/ui";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { emailPaymentConfirmationCopy } from "./actions";
export default async function OwnerPaymentReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ queued?: string; error?: string }>;
}) {
  const context = await requireOwnerWorkspaceContext();
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  const confirmation = await getPaymentConfirmation({
    actor: {
      kind: "OWNER",
      workspaceId: context.workspace.id,
      userId: context.session.userId,
    },
    confirmationId: id,
  }).catch(() => null);
  if (!confirmation) notFound();
  const receipt = formatPaymentConfirmation(confirmation);
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Payment confirmation"
      description="An immutable record of verified money received."
    >
      <Link href="/dashboard/settings/email" className="text-link">
        Back to email delivery
      </Link>
      {feedback.queued === "1" ? (
        <p role="status">
          Another copy is queued for the verified payer. This does not repeat
          the charge or change service access.
        </p>
      ) : null}
      {feedback.error ? <p role="alert">{feedback.error}</p> : null}
      <section className="management-card">
        <h2>{receipt.snapshot.businessName}</h2>
        <p>{receipt.snapshot.description}</p>
        <dl className="inline-meta">
          <div>
            <dt>Amount received</dt>
            <dd>{receipt.amount}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>
              {receipt.paidAt} ({receipt.snapshot.timezone})
            </dd>
          </div>
          <div>
            <dt>For</dt>
            <dd>{receipt.snapshot.beneficiaryName ?? "Payer account"}</dd>
          </div>
          <div>
            <dt>Payer</dt>
            <dd>{confirmation.payerAccount.user.email}</dd>
          </div>
          {receipt.snapshot.invoiceNumber ? (
            <div>
              <dt>Invoice</dt>
              <dd>{receipt.snapshot.invoiceNumber}</dd>
            </div>
          ) : null}
          <div>
            <dt>Payment reference</dt>
            <dd style={{ overflowWrap: "anywhere" }}>
              {receipt.snapshot.providerReference}
            </dd>
          </div>
          <div>
            <dt>Confirmation reference</dt>
            <dd style={{ overflowWrap: "anywhere" }}>{confirmation.id}</dd>
          </div>
          {confirmation.payment.refundedAmountCents > 0 ? (
            <div>
              <dt>Subsequently refunded</dt>
              <dd>
                <Money
                  amountMinor={confirmation.payment.refundedAmountCents}
                  currency={confirmation.currency}
                />
              </dd>
            </div>
          ) : null}
        </dl>
        <p>
          This confirms money received. Review service access and refund
          obligations separately.
        </p>
        <form action={emailPaymentConfirmationCopy} className="form-stack">
          <input type="hidden" name="confirmationId" value={confirmation.id} />
          <input type="hidden" name="operationId" value={randomUUID()} />
          <button type="submit" className="button">
            Email another copy
          </button>
          <p>
            The recipient is the verified payer account, independent of current
            child selection.
          </p>
        </form>
      </section>
    </AdminShell>
  );
}
