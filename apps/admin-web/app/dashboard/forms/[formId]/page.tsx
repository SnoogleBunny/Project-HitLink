import Link from "next/link";
import { notFound } from "next/navigation";
import type { RequirementTarget } from "@flowstate/db";
import { AdminShell } from "../../../_components/admin-shell";
import {
  formatBytesAsMegabytes,
  formatFormType,
  formatRequirementTarget,
  getFormDocumentDetail,
  getPdfSizeCapLabel,
} from "../../../../lib/forms";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { toggleRequiredFormAssignmentAction } from "../actions";
import { FormVersionUploadForm } from "../form-version-upload-form";

const requirementTargets: RequirementTarget[] = [
  "TRIAL",
  "MEMBER",
  "GUARDIAN",
  "MEMBERSHIP_ACTIVATION",
];

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function FormDocumentDetailPage({
  params,
}: {
  params: Promise<{
    formId: string;
  }>;
}) {
  const { formId } = await params;
  const { session, workspace } = await requireOwnerWorkspaceContext();
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
  const currentPreviewPath =
    currentVersion
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
              <dd>{document.currentVersionNumber ? `v${document.currentVersionNumber}` : "Not set"}</dd>
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
              <Link className="button button-secondary" href={currentPreviewPath}>
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
          <h3>Replace current required PDF</h3>
          <p className="management-copy">
            Uploading a new version preserves history and immediately makes the
            new version current for requirement resolution.
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
          <div className="stack-list">
            {requirementTargets.map((target) => {
              const isActive = document.activeRequirementTargets.includes(target);

              return (
                <article key={target} className="stack-item">
                  <div className="stack-item-copy">
                    <div className="stack-item-heading">
                      <h4>{formatRequirementTarget(target)}</h4>
                      <span
                        className={`status-pill ${
                          isActive ? "status-pill-success" : ""
                        }`}
                      >
                        {isActive ? "Required" : "Inactive"}
                      </span>
                    </div>
                    <p>
                      {target === "TRIAL"
                        ? "Applies this form to public trial booking handoff."
                        : target === "MEMBER"
                          ? "Applies this form to general member context."
                          : target === "GUARDIAN"
                            ? "Requires a linked guardian to sign for the child context."
                            : "Blocks membership activation until the current version is signed."}
                    </p>
                  </div>
                  <form action={toggleRequiredFormAssignmentAction}>
                    <input
                      name="formDocumentId"
                      type="hidden"
                      value={document.id}
                    />
                    <input
                      name="requirementTarget"
                      type="hidden"
                      value={target}
                    />
                    <input
                      name="isActive"
                      type="hidden"
                      value={isActive ? "false" : "true"}
                    />
                    <button className="button button-secondary" type="submit">
                      {isActive ? "Disable" : "Enable"}
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
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
                        Current
                      </span>
                    ) : (
                      <span className="status-pill">Historical</span>
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

