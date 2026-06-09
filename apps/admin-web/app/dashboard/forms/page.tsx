import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import {
  formatFormType,
  formatRequirementTarget,
  getPdfSizeCapLabel,
  listWorkspaceFormDocuments,
} from "../../../lib/forms";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { FormDocumentCreateForm } from "./form-document-create-form";

function formatDateTime(value: Date | null): string {
  if (!value) {
    return "Not uploaded yet";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function FormsPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const documents = await listWorkspaceFormDocuments({
    workspaceId: workspace.id,
  });

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Forms"
      title="Forms and waivers"
      description="Upload required PDFs, version them over time, and assign them to trial, member, guardian, or membership-activation contexts."
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Create form</p>
          <h3>New PDF document</h3>
          <p className="management-copy">
            This creates the logical form document and uploads version 1 in one
            step.
          </p>
          <FormDocumentCreateForm pdfSizeCapLabel={getPdfSizeCapLabel()} />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Current library</p>
          <h3>
            {documents.length} form
            {documents.length === 1 ? "" : "s"}
          </h3>
          <p className="management-copy">
            Each form keeps its own version history and current assignment targets.
          </p>
        </section>
      </div>

      <section className="management-card">
        <p className="dashboard-card-label">Documents</p>
        <h3>Gym forms</h3>

        {documents.length === 0 ? (
          <p className="empty-state">
            No forms uploaded yet. Add the first waiver or agreement above.
          </p>
        ) : (
          <div className="stack-list">
            {documents.map((document) => (
              <article key={document.id} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>{document.name}</h4>
                    <span className="status-pill">
                      {formatFormType(document.formType)}
                    </span>
                    <span className="status-pill status-pill-success">
                      Current v{document.currentVersionNumber ?? "?"}
                    </span>
                  </div>
                  <p>{document.description ?? "No owner notes yet."}</p>
                  <dl className="inline-meta">
                    <div>
                      <dt>Versions</dt>
                      <dd>{document.versionCount}</dd>
                    </div>
                    <div>
                      <dt>Current upload</dt>
                      <dd>{formatDateTime(document.currentVersionCreatedAt)}</dd>
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
                </div>

                <Link
                  className="button button-secondary"
                  href={`/dashboard/forms/${document.id}`}
                >
                  Manage form
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}

