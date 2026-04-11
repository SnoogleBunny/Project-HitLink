import { notFound } from "next/navigation";
import { FormSignatureForm } from "../../../_components/form-signature-form";
import { getMagicLinkFormRequestPageData } from "../../../../lib/forms";
import { signMagicLinkFormAction } from "./actions";

function formatDateTime(value: Date | null): string {
  if (!value) {
    return "Not signed yet";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function PublicFormSigningPage({
  params,
}: {
  params: Promise<{
    token: string;
  }>;
}) {
  const { token } = await params;
  const request = await getMagicLinkFormRequestPageData({
    token,
  });

  if (!request) {
    notFound();
  }

  const documentPath = `/sign/forms/${token}/document`;
  const signerName =
    request.guardianName ?? request.memberName;
  const signerEmail =
    request.guardianEmail ?? request.memberEmail;

  return (
    <main className="trial-page">
      <section className="trial-card trial-intro">
        <p className="trial-eyebrow">{request.formName}</p>
        <h1>Review and sign</h1>
        <p>
          Version {request.versionNumber} for {request.guardianName ?? request.memberName}.
        </p>
      </section>

      <div className="member-grid">
        <section className="member-card">
          <p className="member-eyebrow">Document</p>
          <h3>Current PDF version</h3>
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
            {request.status === "OPEN" && !request.signedDocumentId
              ? "Sign current version"
              : "Request status"}
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
              action={signMagicLinkFormAction}
              pendingLabel="Signing form..."
              signerEmail={signerEmail}
              signerName={signerName}
              submitLabel="Sign form"
              token={token}
            />
          ) : (
            <p className="member-copy">
              This magic link is no longer open for a new signature.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

