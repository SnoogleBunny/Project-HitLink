import { notFound } from "next/navigation";
import { MemberShell } from "../../../_components/member-shell";
import { FormSignatureForm } from "../../../_components/form-signature-form";
import { requireMemberPortalContext } from "../../../../lib/member-auth";
import { getPortalFormRequestPageData } from "../../../../lib/forms";
import { signPortalFormAction } from "./actions";

function formatDateTime(value: Date | null): string {
  if (!value) {
    return "Not signed yet";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function MemberFormRequestPage({
  params,
}: {
  params: Promise<{
    requestId: string;
  }>;
}) {
  const { requestId } = await params;
  const context = await requireMemberPortalContext();
  const request = await getPortalFormRequestPageData({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    requestId,
  });

  if (!request) {
    notFound();
  }

  const documentPath = `/app/forms/${request.requestId}/document`;

  return (
    <MemberShell
      context={context}
      title={request.formName}
      description={`Review version ${request.versionNumber} and sign the current PDF version for this account.`}
    >
      <div className="member-grid">
        <section className="member-card">
          <p className="member-eyebrow">Current document</p>
          <h3>{request.formName}</h3>
          <p className="member-copy">
            Version {request.versionNumber} · {request.description ?? "No extra description."}
          </p>
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

          {request.status === "OPEN" && !request.signedDocumentId ? (
            <FormSignatureForm
              action={signPortalFormAction}
              requestId={request.requestId}
              signerEmail={request.memberEmail}
              signerName={request.memberName}
              pendingLabel="Signing form..."
              submitLabel="Sign form"
            />
          ) : (
            <p className="member-copy">
              This form request is no longer open for editing.
            </p>
          )}
        </section>
      </div>
    </MemberShell>
  );
}

