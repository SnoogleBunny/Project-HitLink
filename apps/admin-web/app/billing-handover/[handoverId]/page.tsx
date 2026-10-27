import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceBillingHandover,
  prisma,
  WorkspaceDataError,
  type BillingHandoverSnapshot,
} from "@flowstate/db";
import { Badge, Money, Notice, WorkspaceLocaleProvider } from "@flowstate/ui";
import { getSessionOrNull } from "../../../lib/admin-access";
import { AcceptHandoverForm } from "./form";
export const metadata = {
  title: "Billing handover review",
  robots: { index: false, follow: false },
};
export default async function ReceivingHandoverPage({
  params,
}: {
  params: Promise<{ handoverId: string }>;
}) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  let data;
  try {
    data = await getWorkspaceBillingHandover(
      session.userId,
      (await params).handoverId,
    );
  } catch (error) {
    if (error instanceof WorkspaceDataError) notFound();
    throw error;
  }
  const { handover, current, accessRevokedAt } = data,
    snapshot =
      handover.obligationSnapshot as unknown as BillingHandoverSnapshot,
    obligations = snapshot.obligations;
  const memberName = (id: string) =>
    obligations.members.find((member) => member.id === id)?.fullName ?? id;
  const settings = await prisma.workspaceSetting.findUnique({
    where: { workspaceId: handover.workspaceId },
    select: { locale: true },
  });
  return (
    <WorkspaceLocaleProvider locale={settings?.locale}>
      <main className="records-shell">
        <section className="management-card form-stack">
          <h1>Billing handover review</h1>
          <h2>{handover.destinationName}</h2>
          <p>
            <Badge>{handover.state.replaceAll("_", " ")}</Badge> Exit plan
            version {handover.offboardingPlanVersion}
          </p>
          <p>
            Named receiving account: {handover.receiverUserId}. Effective by{" "}
            {obligations.accessEndsAt}.
          </p>
          <p>
            {handover.processorMode === "RETAIN_GYM_PROCESSOR"
              ? "The gym retains its current connected processor account and existing customer subscriptions. The receiving service must have separately authorized access to that same account."
              : "Old processor and source renewals must stop by the access end. Any new charges elsewhere require new payer authorization."}
          </p>
          <p>
            Agreement: {handover.evidenceReference}. Payer authority:{" "}
            {handover.payerAuthorityEvidence}.
          </p>
          <Notice>
            This acceptance covers the snapshot below. It does not transfer
            payment methods or settle unpaid invoices, future bookings or
            coaching services.
          </Notice>
          <h2>Remaining class packs</h2>
          {obligations.packs.length ? (
            obligations.packs.map((pack) => (
              <section className="hl-records-job" key={pack.id}>
                <h3>
                  {memberName(pack.memberId)} · {pack.remainingPunches} classes
                  remaining
                </h3>
                <p>
                  Pack record: {pack.id}. Status: {pack.status}. Purchased{" "}
                  {pack.purchasedAt.slice(0, 10)}.{" "}
                  {pack.expiresOn
                    ? `Expires ${pack.expiresOn.slice(0, 10)}.`
                    : "No expiry."}
                </p>
                <p>
                  {pack.acceptedTerms.restrictionMode === "GENERAL"
                    ? "Accepted access: all eligible programs."
                    : `Accepted program IDs: ${pack.acceptedTerms.programIds.join(", ")}.`}{" "}
                  Late cancellation{" "}
                  {pack.acceptedTerms.lateCancellationConsumesPunch
                    ? "uses a class"
                    : "returns the class"}
                  ; no-show{" "}
                  {pack.acceptedTerms.noShowConsumesPunch
                    ? "uses a class"
                    : "returns the class"}
                  .
                </p>
              </section>
            ))
          ) : (
            <p>No remaining pack balances.</p>
          )}
          <h2>Remaining monetary credits</h2>
          {obligations.credits.length ? (
            <div className="hl-handover-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Payer</th>
                    <th>Credit record</th>
                    <th>Remaining credit</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.credits.map((credit) => (
                    <tr key={credit.id}>
                      <td>
                        {memberName(
                          obligations.payers.find(
                            (payer) => payer.id === credit.payerAccountId,
                          )?.memberId ??
                            credit.payerAccountId ??
                            "Unverified payer",
                        )}
                      </td>
                      <td>{credit.id}</td>
                      <td>
                        <Money
                          amountMinor={credit.remainingAmountCents}
                          currency={credit.currency}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No remaining monetary credits.</p>
          )}
          <h2>Renewal and source evidence</h2>
          <p>
            Processor account: {obligations.accountId ?? "Not verified"}.{" "}
            {
              obligations.memberships.filter(
                (item) => item.stripeSubscriptionId,
              ).length
            }{" "}
            linked processor subscriptions. {obligations.source.length}{" "}
            source-paid receipts.
          </p>
          <details>
            <summary>Exact contract and payer references</summary>
            <div className="hl-handover-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Contract record</th>
                    <th>Processor subscription</th>
                    <th>Processor customer</th>
                    <th>Billing source</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.memberships.map((contract) => (
                    <tr key={contract.id}>
                      <td>{memberName(contract.memberId)}</td>
                      <td>{contract.id}</td>
                      <td>{contract.stripeSubscriptionId ?? "None"}</td>
                      <td>{contract.stripeCustomerId ?? "None"}</td>
                      <td>
                        {contract.sourceBillingManaged
                          ? "External source receipts"
                          : "Gym processor"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hl-handover-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Payer</th>
                    <th>Payer record</th>
                    <th>Processor account</th>
                    <th>Processor customer</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.payers.map((payer) => (
                    <tr key={payer.id}>
                      <td>{memberName(payer.memberId)}</td>
                      <td>{payer.id}</td>
                      <td>{payer.stripeAccountId ?? "Unverified"}</td>
                      <td>{payer.stripeCustomerId ?? "Unverified"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {obligations.source.map((source) => {
            const declaration = snapshot.sourceDeclarations.find(
              (item) => item.evidenceId === source.id,
            );
            return (
              <section className="hl-records-job" key={source.id}>
                <h3>
                  {source.sourceSystem}: {source.sourceContractReference}
                </h3>
                <p>
                  Source account: {declaration?.sourceAccountReference}.{" "}
                  {declaration?.disposition === "STOP"
                    ? "Renewals stop"
                    : "The named receiver takes over source billing"}{" "}
                  on {declaration?.effectiveAt}.
                </p>
                <p>
                  Provider evidence reference: {declaration?.evidenceReference}.
                </p>
                <p>
                  Paid from {source.paidFrom.slice(0, 10)} through{" "}
                  {source.paidThrough.slice(0, 10)} (exclusive). Next source
                  renewal: {source.nextRenewalOn.slice(0, 10)}.
                </p>
                <p>
                  This source evidence is reviewed separately from the connected
                  processor check. A paid receipt alone does not prove a stop.
                </p>
              </section>
            );
          })}
          {obligations.importedMoney.length ? (
            <details>
              <summary>Imported payment responsibility</summary>
              <div className="hl-handover-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Source record</th>
                      <th>Account</th>
                      <th>Source status</th>
                      <th>Paid / refunded</th>
                      <th>Billing / refund owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obligations.importedMoney.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.sourceSystem}: {item.sourceExternalId}
                        </td>
                        <td>{item.sourceAccountReference}</td>
                        <td>{item.sourceStatus}</td>
                        <td>
                          <Money
                            amountMinor={item.paidCents}
                            currency={item.currency}
                          />{" "}
                          /{" "}
                          <Money
                            amountMinor={item.refundedCents}
                            currency={item.currency}
                          />
                        </td>
                        <td>
                          {item.billingOwner} / {item.refundOwner}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
          <p>
            Snapshot SHA-256:{" "}
            <code style={{ overflowWrap: "anywhere" }}>
              {handover.obligationFingerprint}
            </code>
          </p>
          {handover.receiverAcceptedAt ? (
            <p>
              The named receiver accepted this snapshot on{" "}
              {handover.receiverAcceptedAt.toISOString()}. Receipt:{" "}
              {handover.receiverEvidence}.
            </p>
          ) : null}
          {!current ? (
            <Notice tone="warning">
              This handover was replaced. Ask the gym for the current review.
            </Notice>
          ) : accessRevokedAt ? (
            <p>
              HitLink gym access ended on {accessRevokedAt.toISOString()}. The
              accepted responsibilities remain recorded here.
            </p>
          ) : session.userId === handover.receiverUserId &&
            !handover.receiverAcceptedAt ? (
            <AcceptHandoverForm
              id={handover.id}
              fingerprint={handover.obligationFingerprint}
            />
          ) : !handover.receiverAcceptedAt ? (
            <p>Only the named receiving account can accept this handover.</p>
          ) : null}
        </section>
      </main>
    </WorkspaceLocaleProvider>
  );
}
