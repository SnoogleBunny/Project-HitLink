import { notFound } from "next/navigation";
import { prisma } from "@flowstate/db";
import { LocaleDate, WorkspaceLocaleProvider } from "@flowstate/ui";
import { FormSignatureForm } from "../../../_components/form-signature-form";
import { getMagicLinkFormRequestPageData } from "../../../../lib/forms";
import { signMagicLinkFormAction } from "./actions";

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
  const settings = await prisma.workspaceSetting.findUnique({
    where: { workspaceId: request.workspaceId },
    select: { locale: true },
  });
  const signerName = request.guardianName ?? request.memberName;
  const signerEmail = request.guardianEmail ?? request.memberEmail;

  return (
    <WorkspaceLocaleProvider locale={settings?.locale}>
      <main className="trial-page">
        <section className="trial-card trial-intro">
          <p className="trial-eyebrow">{request.formName}</p>
          <h1>Review and sign</h1>
          <p>
            Version {request.versionNumber} for{" "}
            {request.guardianName ?? request.memberName}.
          </p>
        </section>

        <div className="member-grid">
          <section className="member-card">
            <p className="member-eyebrow">Document</p>
            <h3>Exact PDF for this acceptance</h3>
            {request.effectiveAt ? <p>{request.upcoming ? "Scheduled effective time" : "Effective from"}: {formatDateTime(request.effectiveAt)}.</p> : null}
            <p>{request.consentValidUntil ? <>Acceptance is valid until {formatDateTime(request.consentValidUntil)}.</> : request.requirementRevisionId ? "No expiry is recorded for this acceptance cycle." : "No expiry was recorded for this legacy acceptance."}</p>
            {request.requirementRevisionId ? <p>Signing records acceptance of this exact cycle. Already-offered booking recovery choices remain separate; sign in to keep an affected booking or choose a remedy before class.</p> : null}
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
              {request.status === "OPEN" && request.canSign !== false && !request.signedDocumentId
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

            {request.status === "OPEN" && request.canSign !== false && !request.signedDocumentId ? (
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
                {request.signingUnavailableReason ?? "This magic link is no longer open for a new signature."}
              </p>
            )}
          </section>
        </div>
      </main>
    </WorkspaceLocaleProvider>
  );
}
