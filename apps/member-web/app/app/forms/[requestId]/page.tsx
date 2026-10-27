import { notFound } from "next/navigation";
import { LocaleDate } from "@flowstate/ui";
import { MemberShell } from "../../../_components/member-shell";
import { FormSignatureForm } from "../../../_components/form-signature-form";
import { getAuthorizedPortalFormRequest } from "../../../../lib/portal-form-context";
import { signPortalFormAction } from "./actions";

function formatDateTime(value: Date | null) {
  if (!value) {
    return "Not signed yet";
  }

  return (
    <LocaleDate
      value={value}
      options={{ dateStyle: "medium", timeStyle: "short" }}
    />
  );
}

export default async function MemberFormRequestPage({
  params,
}: {
  params: Promise<{
    requestId: string;
  }>;
}) {
  const { requestId } = await params;
  const data = await getAuthorizedPortalFormRequest(requestId);
  if (!data) {
    notFound();
  }
  const { context, request } = data;

  const documentPath = `/app/forms/${request.requestId}/document`;

  return (
    <MemberShell
      context={context}
      title={request.formName}
      description={`Review version ${request.versionNumber} for ${request.memberName}.`}
    >
      <div className="member-grid">
        <section className="member-card">
          <p className="member-eyebrow">Current document</p>
          <h3>{request.formName}</h3>
          <p className="member-copy">
            Version {request.versionNumber} ·{" "}
            {request.description ?? "No extra description."}
          </p>
          {request.effectiveAt ? <p className="member-copy">{request.upcoming ? "This scheduled requirement starts" : "This requirement is effective from"} {formatDateTime(request.effectiveAt)}.</p> : null}
          <p className="member-copy">{request.consentValidUntil ? <>Acceptance is valid until {formatDateTime(request.consentValidUntil)}.</> : request.requirementRevisionId ? "No expiry is recorded for this acceptance cycle." : "No expiry was recorded for this legacy acceptance."}</p>
          {request.requirementRevisionId ? <p className="member-copy">Signing records your acceptance of this exact cycle. A valid signature permits admission for that cycle. Any already-offered booking recovery choices remain separate; explicitly keep the booking or choose a remedy before class.</p> : null}
          <iframe
            src={documentPath}
            style={{
              width: "100%",
              minHeight: "520px",
              border: "1px solid #d7d7d7",
              borderRadius: "16px",
            }}
            title={`${request.formName} PDF`}
          />
        </section>

        <section className="member-card">
          <p className="member-eyebrow">Signature</p>
          <h3>
            {request.status === "COMPLETED" || request.signedDocumentId
              ? "Already signed"
              : "Sign current version"}
          </h3>
          <dl className="member-detail-list">
            <div>
              <dt>Status</dt>
              <dd>{request.status}</dd>
            </div>
            <div>
              <dt>Viewed</dt>
              <dd>{formatDateTime(request.viewedAt)}</dd>
            </div>
            <div>
              <dt>Signed</dt>
              <dd>{formatDateTime(request.signedAt)}</dd>
            </div>
          </dl>

          {request.status === "OPEN" && request.canSign !== false && !request.signedDocumentId ? (
            <FormSignatureForm
              action={signPortalFormAction}
              requestId={request.requestId}
              memberId={context.member.id}
              signerEmail={context.accountMember?.email ?? request.memberEmail}
              signerName={context.accountMember?.fullName ?? request.memberName}
              pendingLabel="Signing form…"
              submitLabel="Sign form"
            />
          ) : (
            <p className="member-copy">
              {request.signingUnavailableReason ?? "This form request is no longer open for editing."}
            </p>
          )}
        </section>
      </div>
    </MemberShell>
  );
}
