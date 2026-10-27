import { resolveDisplayLocale } from "@flowstate/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../_components/admin-shell";
import {
  formatBytesAsMegabytes,
  formatFormType,
  formatRequirementTarget,
  getFormDocumentDetail,
  getPdfSizeCapLabel,
} from "../../../../lib/forms";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { FormVersionUploadForm } from "../form-version-upload-form";


export default async function FormDocumentDetailPage({
  params,
}: {
  params: Promise<{
    formId: string;
  }>;
}) {
  const { formId } = await params;
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const locale = resolveDisplayLocale(workspace.settings?.locale);
  function formatDateTime(value: Date): string {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  }

  const document = await getFormDocumentDetail({
    workspaceId: workspace.id,
    formDocumentId: formId,
  });

  if (!document) {
    notFound();
  }

  const currentVersion = document.versions.find(
    (version) => version.id === document.currentVersionId,
  );
  const currentPreviewPath = currentVersion
    ? `/dashboard/forms/${document.id}/versions/${currentVersion.id}/file`
    : null;

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Forms"
      title={document.name}
      description="Manage current version, upload replacements, and keep requirement targets explicit."
      actions={
        <Link className="button button-secondary" href="/dashboard/forms">
          Back to forms
        </Link>
      }
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Document summary</p>
          <h3>Current version details</h3>
          <dl className="detail-list">
            <div>
              <dt>Form type</dt>
              <dd>{formatFormType(document.formType)}</dd>
            </div>
            <div>
              <dt>Current version</dt>
              <dd>
                {document.currentVersionNumber
                  ? `v${document.currentVersionNumber}`
                  : "Not set"}
              </dd>
            </div>
            <div>
              <dt>Total versions</dt>
              <dd>{document.versionCount}</dd>
            </div>
            <div>
              <dt>Assignments</dt>
              <dd>
                {document.activeRequirementTargets.length > 0
                  ? document.activeRequirementTargets
                      .map(formatRequirementTarget)
                      .join(", ")
                  : "Not required anywhere yet"}
              </dd>
            </div>
          </dl>

          <div className="info-callout">
            <strong>Description</strong>
            <p>{document.description ?? "No owner notes yet."}</p>
          </div>

          {currentPreviewPath ? (
            <div className="form-stack">
              <Link
                className="button button-secondary"
                href={currentPreviewPath}
              >
                Open current PDF
              </Link>
              <iframe
                src={currentPreviewPath}
                style={{
                  width: "100%",
                  minHeight: "420px",
                  border: "1px solid var(--color-border, #d7d7d7)",
                  borderRadius: "16px",
                }}
                title={`${document.name} current PDF`}
              />
            </div>
          ) : null}
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Upload version</p>
          <h3>Upload a draft PDF version</h3>
          <p className="management-copy">
            Uploading preserves the exact prior PDF and signatures. It does not change requirements. Review and publish a scheduled requirement before asking participants to accept it.
          </p>
          <FormVersionUploadForm
            formDocumentId={document.id}
            pdfSizeCapLabel={getPdfSizeCapLabel()}
          />
        </section>
      </div>

      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Assignments</p>
          <h3>Required contexts</h3>
          <p className="management-copy">New versions, requirement contexts, withdrawals and same-PDF renewals all use one reviewed publication with explicit timing and affected-booking recovery.</p>
          <Link href={`/dashboard/forms/${document.id}/publication`} className="button button-primary">Review and publish requirements</Link>
          <p><Link href="/dashboard/forms/recoveries">Review affected booking recovery</Link></p>
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Version history</p>
          <h3>
            {document.versions.length} uploaded version
            {document.versions.length === 1 ? "" : "s"}
          </h3>
          <div className="stack-list">
            {document.versions.map((version) => (
              <article key={version.id} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>Version {version.versionNumber}</h4>
                    {version.id === document.currentVersionId ? (
                      <span className="status-pill status-pill-success">
                        Displayed
                      </span>
                    ) : (
                      <span className="status-pill">Uploaded</span>
                    )}
                  </div>
                  <p>{version.fileName}</p>
                  <dl className="inline-meta">
                    <div>
                      <dt>Uploaded</dt>
                      <dd>{formatDateTime(version.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Size</dt>
                      <dd>{formatBytesAsMegabytes(version.fileSizeBytes)}</dd>
                    </div>
                    <div>
                      <dt>By</dt>
                      <dd>
                        {version.uploadedByWorkspaceUser.user.fullName ??
                          version.uploadedByWorkspaceUser.user.email}
                      </dd>
                    </div>
                  </dl>
                </div>

                <Link
                  className="button button-secondary"
                  href={`/dashboard/forms/${document.id}/versions/${version.id}/file`}
                >
                  Open PDF
                </Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
