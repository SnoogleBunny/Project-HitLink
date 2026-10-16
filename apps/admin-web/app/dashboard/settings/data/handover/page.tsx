import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  prisma,
  workspaceBillingObligations,
  WorkspaceDataError,
} from "@flowstate/db";
import { Badge, Notice } from "@flowstate/ui";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { HandoverForm } from "./form";
export default async function BillingHandoverPage() {
  const context = await requireOwnerWorkspaceContext();
  const plan = await prisma.workspaceOffboarding.findUnique({
    where: { workspaceId: context.workspace.id },
  });
  const current = plan?.customerBillingHandoverId
    ? await prisma.workspaceBillingHandover.findFirst({
        where: {
          id: plan.customerBillingHandoverId,
          workspaceId: context.workspace.id,
        },
      })
    : null;
  let obligations: Awaited<
      ReturnType<typeof workspaceBillingObligations>
    > | null = null,
    preparationError: string | null = null;
  try {
    if (plan)
      obligations = await workspaceBillingObligations(
        prisma,
        context.workspace.id,
        plan.accessEndsAt,
      );
  } catch (error) {
    if (error instanceof WorkspaceDataError) preparationError = error.message;
    else throw error;
  }
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Billing handover"
      description="Agree who will honor balances and manage customer renewals after HitLink access ends."
      actions={
        <Link className="text-link" href="/dashboard/settings/data">
          Back to records and access
        </Link>
      }
    >
      <section className="management-card form-stack">
        <h2>Review the receiving responsibility</h2>
        <p>
          Class packs and monetary credits stay intact. The receiving account
          accepts their exact remaining balances. Unpaid invoices, future
          bookings and coaching services still need their own resolution.
        </p>
        <Notice>
          Retaining billing means the gym keeps the same connected processor
          account. Moving to another provider requires old renewals to stop and
          payers to authorize any new charges there. This page does not move
          cards or payment methods.
        </Notice>
        {preparationError ? (
          <Notice tone="warning">{preparationError}</Notice>
        ) : null}
        {plan && obligations ? (
          <>
            <p>
              Exit plan version {plan.version}. Access ends{" "}
              {plan.accessEndsAt.toISOString()}. {obligations.packs.length}{" "}
              packs and {obligations.credits.length} monetary credits have
              balances.
            </p>
            {current ? (
              <section className="hl-records-job">
                <h3>{current.destinationName}</h3>
                <p>
                  <Badge>{current.state.replaceAll("_", " ")}</Badge>
                </p>
                <p>
                  Named receiver: {current.receiverUserId}. Snapshot:{" "}
                  <code style={{ overflowWrap: "anywhere" }}>
                    {current.obligationFingerprint}
                  </code>
                  .
                </p>
                <Link
                  className="text-link"
                  href={`/billing-handover/${current.id}`}
                >
                  Open the receiving account’s review
                </Link>
                <HandoverForm label="Verify current processor evidence">
                  <input type="hidden" name="intent" value="verify" />
                  <input type="hidden" name="version" value={plan.version} />
                </HandoverForm>
              </section>
            ) : null}
            <h3>
              {current
                ? "Prepare a replacement handover"
                : "Prepare a handover"}
            </h3>
            <p>
              Saving creates a new exit-plan version and clears previous owner
              confirmations. The receiving account must accept this snapshot
              before verification.
            </p>
            <HandoverForm label="Prepare handover">
              <input type="hidden" name="intent" value="save" />
              <input type="hidden" name="requestId" value={randomUUID()} />
              <input type="hidden" name="version" value={plan.version} />
              <label className="field">
                <span>Receiving gym or service</span>
                <input name="destinationName" required maxLength={250} />
              </label>
              <label className="field">
                <span>Named receiving account ID</span>
              <input name="receiverUserId" aria-label="Named receiving account ID" required />
                <small>
                  This account must already exist. Only that account can accept
                  the balances.
                </small>
              </label>
              <label className="field">
                <span>Billing arrangement</span>
                <select
                  name="processorMode"
                  required
                  defaultValue="STOP_AND_REAUTHORIZE"
                >
                  <option value="STOP_AND_REAUTHORIZE">
                    Stop old renewals; obtain new payer authorization elsewhere
                  </option>
                  <option value="RETAIN_GYM_PROCESSOR">
                    Keep the gym’s current connected processor account
                  </option>
                </select>
              </label>
              <label className="field">
                <span>Existing processor account ID</span>
                <input
                name="processorAccountId" aria-label="Existing processor account ID"
                  defaultValue={obligations.accountId ?? ""}
                />
                <small>
                  Required exactly as shown when retaining the current
                  processor.
                </small>
              </label>
              <label className="field">
                <span>Signed handover agreement reference</span>
                <input name="evidenceReference" required maxLength={1000} />
              </label>
              <label className="field">
                <span>Payer authority evidence reference</span>
                <input
                name="payerAuthorityEvidence" aria-label="Payer authority evidence reference"
                  required
                  maxLength={1000}
                />
                <small>
                  Reference the reviewed authority for continued billing or the
                  requirement for new authorization.
                </small>
              </label>
              {obligations.source.map((source) => (
                <fieldset className="hl-records-job" key={source.id}>
                  <legend>
                    {source.sourceSystem}: {source.sourceContractReference}
                  </legend>
                  <p>
                    Paid through {source.paidThrough.slice(0, 10)} (exclusive).
                    Next source renewal {source.nextRenewalOn.slice(0, 10)}. A
                    paid receipt does not prove billing has stopped.
                  </p>
                  <input
                    type="hidden"
                    name="sourceEvidenceId"
                    value={source.id}
                  />
                  <input
                    type="hidden"
                    name={`source.${source.id}.contract`}
                    value={source.sourceContractReference}
                  />
                  <label className="field">
                    <span>Exact source account reference</span>
                    <input
                      name={`source.${source.id}.account`}
                      required
                      maxLength={250}
                    />
                  </label>
                  <label className="field">
                    <span>Source billing disposition</span>
                    <select
                      name={`source.${source.id}.disposition`}
                      defaultValue="STOP"
                    >
                      <option value="STOP">Source renewals stop</option>
                      <option value="CONTINUE_WITH_RECEIVER">
                        Named receiver takes over source billing
                      </option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Effective stop or handover date (ISO timestamp)</span>
                    <input
                      name={`source.${source.id}.effectiveAt`}
                      required
                      defaultValue={plan.accessEndsAt.toISOString()}
                    />
                  </label>
                  <label className="field">
                    <span>
                      Source provider stop or transfer receipt reference
                    </span>
                    <input
                      name={`source.${source.id}.evidence`}
                      required
                      maxLength={1000}
                    />
                  </label>
                </fieldset>
              ))}
            </HandoverForm>
          </>
        ) : !plan ? (
          <p>Prepare an exit plan and verify its export receipt first.</p>
        ) : null}
      </section>
    </AdminShell>
  );
}
