import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatPaymentConfirmation,
  getPaymentConfirmation,
} from "@flowstate/db";
import { Money } from "@flowstate/ui";
import { MemberShell } from "../../../../_components/member-shell";
import { requireMemberPortalContext } from "../../../../../lib/member-auth";
import { emailPaymentConfirmationCopy } from "./actions";
export default async function PaymentReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ queued?: string; error?: string }>;
}) {
  const context = await requireMemberPortalContext({ scope: "account" });
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  const confirmation = await getPaymentConfirmation({
    actor: {
      kind: "PAYER",
      workspaceId: context.workspace.id,
      userId: context.session.userId,
    },
    confirmationId: id,
  }).catch(() => null);
  if (!confirmation) notFound();
  const receipt = formatPaymentConfirmation(confirmation);
  return (
    <MemberShell
      context={context}
      title="Payment confirmation"
      description="Your record of money received by the gym."
    >
      <Link href="/app/billing?view=history" className="hl-text-link">
        Back to payment history
      </Link>
      {feedback.queued === "1" ? (
        <p role="status">
          Another copy is queued for your payer account email. Delivery remains
          pending until confirmed by the email provider.
        </p>
      ) : null}
      {feedback.error ? <p role="alert">{feedback.error}</p> : null}
      <section className="member-card">
        <h2>{receipt.snapshot.businessName}</h2>
        <p>{receipt.snapshot.description}</p>
        <dl className="member-detail-list">
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
            <dd>{receipt.snapshot.beneficiaryName ?? "Your account"}</dd>
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
          This records money received. Service access and subsequent refunds are
          shown separately in your account.
        </p>
        {receipt.snapshot.contactEmail ? (
          <p>{receipt.snapshot.contactEmail}</p>
        ) : null}
        {receipt.snapshot.contactPhone ? (
          <p>{receipt.snapshot.contactPhone}</p>
        ) : null}
        <form action={emailPaymentConfirmationCopy} className="form-stack">
          <input type="hidden" name="confirmationId" value={confirmation.id} />
          <input type="hidden" name="operationId" value={randomUUID()} />
          <button type="submit" className="button">
            Email another copy
          </button>
          <p>A copy goes only to the email on your payer account.</p>
        </form>
      </section>
    </MemberShell>
  );
}
