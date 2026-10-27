import { resolveDisplayLocale } from "@flowstate/ui";
import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import {
  formatFormType,
  formatRequirementTarget,
  listWorkspaceFormDocuments,
} from "../../../lib/forms";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

export default async function FormsPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const locale = resolveDisplayLocale(workspace.settings?.locale);
  function formatDateTime(value: Date | null): string {
    if (!value) {
      return "Not uploaded yet";
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  }

  const documents = await listWorkspaceFormDocuments({
    workspaceId: workspace.id,
  });

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Forms"
      title="Forms and waivers"
      description="Manage waivers, agreements and their accepted versions."
      actions={
        <Link className="button" href="/dashboard/forms/new">
          Add form
        </Link>
      }
    >
      <section className="management-card">
        <p className="dashboard-card-label">Documents</p>
        <h3>Gym forms</h3>

        {documents.length === 0 ? (
          <p className="empty-state">
            No forms uploaded yet. Add your first waiver or agreement.
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
                      <dd>
                        {formatDateTime(document.currentVersionCreatedAt)}
                      </dd>
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
