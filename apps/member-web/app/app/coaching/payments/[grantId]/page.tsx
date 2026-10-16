import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getCoachingPayerView } from "@flowstate/db";
import { Money, Notice } from "@flowstate/ui";
import { MemberShell } from "../../../../_components/member-shell";
import { requireMemberPortalContext } from "../../../../../lib/member-auth";
import {
  CoachingField as Field,
  coachingLabel,
} from "../../../../../lib/coaching-fields";
import { CoachingForm } from "../../form";

export default async function CoachingPayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ grantId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; payment?: string }>;
}) {
  const context = await requireMemberPortalContext({ scope: "account" });
  const { grantId } = await params,
    query = await searchParams;
  const data = await getCoachingPayerView(
    { workspaceId: context.workspace.id, userId: context.session.userId },
    grantId,
  );
  const form = { enrollmentId: data.enrollmentId, version: data.version };
  const fields = (
    <>
      <input type="hidden" name="grantId" value={grantId} />
      <input type="hidden" name="returnPayerGrantId" value={grantId} />
    </>
  );
  return (
    <MemberShell
      context={context}
      title="Coaching payment request"
      description="Payment permission is separate from access to the client's coaching records."
      actions={<Link href="/app/coaching">Coaching</Link>}
    >
      {query.error ? (
        <Notice tone="danger">{query.error}</Notice>
      ) : query.payment ? (
        <Notice>
          Payment status: {coachingLabel(query.payment)}. A return from checkout
          is not proof of payment.
        </Notice>
      ) : query.saved ? (
        <Notice tone="success">Saved.</Notice>
      ) : null}
      <section className="member-card">
        <h2>Payment for {data.clientName}</h2>
        <Money amountMinor={data.amountCents} currency={data.currency} />
        <p>Payment: {coachingLabel(data.paymentState)}.</p>
        <details>
          <summary>Payment and service terms</summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{data.terms}</p>
        </details>
        <p>
          This authorization does not allow access to intake, goals,
          appointments, published notes or private notes.
        </p>
        {data.revoked ? (
          <p>
            This payment authorization has been revoked. Any money already
            received remains recorded for review.
          </p>
        ) : data.closed ? (
          <p>Service is closed. Contact the gym about settlement.</p>
        ) : !data.client ? (
          <>
            {!data.verified ? (
              <>
                <CoachingForm
                  {...form}
                  kind="sendPayerVerification"
                  operationId={randomUUID()}
                  submit="Email my verification code"
                >
                  {fields}
                  <p>The code goes to your own account email.</p>
                </CoachingForm>
                <CoachingForm
                  {...form}
                  kind="verifyPayerContact"
                  operationId={randomUUID()}
                  submit="Verify my contact"
                >
                  {fields}
                  <Field name="code" label="One-use email code" />
                </CoachingForm>
              </>
            ) : !data.accepted ? (
              <CoachingForm
                {...form}
                kind="acceptPayerTerms"
                operationId={randomUUID()}
                submit="Accept payment terms"
              >
                {fields}
                <label className="field-checkbox">
                  <input name="confirmConsequences" type="checkbox" required />
                  <span>
                    I agree to pay the amount shown for this client under these
                    terms. I will confirm the payment on the hosted checkout
                    page.
                  </span>
                </label>
              </CoachingForm>
            ) : !["PAID", "REVIEW_REQUIRED"].includes(data.paymentState) ? (
              <CoachingForm
                {...form}
                kind="pay"
                operationId={randomUUID()}
                submit="Continue to secure payment"
              >
                {fields}
              </CoachingForm>
            ) : null}
          </>
        ) : (
          <p>
            The named payer must verify their contact and accept these terms
            from their own account.
          </p>
        )}
        <CoachingForm
          {...form}
          kind="checkPayment"
          operationId={randomUUID()}
          submit="Check payment status"
        >
          {fields}
        </CoachingForm>
        {!data.revoked ? (
          <CoachingForm
            {...form}
            kind="revokeCoachingPayer"
            operationId={randomUUID()}
            submit="Revoke payment authorization"
          >
            {fields}
            <p>
              Revocation prevents a new payment attempt. It does not undo a
              payment already received.
            </p>
          </CoachingForm>
        ) : null}
      </section>
    </MemberShell>
  );
}
