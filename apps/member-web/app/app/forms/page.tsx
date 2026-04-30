import Link from "next/link";
import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import {
  formatRequiredFormState,
  formatTargetLabel,
  getMemberFormsPageData,
} from "../../../lib/forms";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function MemberFormsPage() {
  const context = await requireMemberPortalContext();
  const forms = await getMemberFormsPageData({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
  });

  return (
    <MemberShell
      context={context}
      title="Forms"
      description="Review current required forms, open the active signing path, and see your signed version history."
    >
      <div className="member-grid">
        <section className="member-card">
          <p className="member-eyebrow">Current requirements</p>
          <h3>
            {forms.items.length} required form
            {forms.items.length === 1 ? "" : "s"}
          </h3>
          {forms.items.length === 0 ? (
            <p className="member-copy">
              No current forms are required for this account right now.
            </p>
          ) : (
            <div className="member-stack-list">
              {forms.items.map((item) => (
                <article key={item.assignmentId} className="member-stack-item">
                  <div className="member-stack-copy">
                    <div className="member-stack-heading">
                      <h4>{item.formName}</h4>
                      <span className="member-status-pill">
                        {formatRequiredFormState(item.status)}
                      </span>
                    </div>
                    <p>
                      {formatTargetLabel(item.requirementTarget)} · Current
                      version {item.currentVersionNumber}
                    </p>
                    {item.actionableHrefs.length > 0 ? (
                      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                        {item.actionableHrefs.map((actionable) => (
                          <Link
                            key={actionable.requestId}
                            className="button button-secondary"
                            href={actionable.href}
                          >
                            {actionable.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="member-card">
          <p className="member-eyebrow">Signed history</p>
          <h3>
            {forms.history.length} signed version
            {forms.history.length === 1 ? "" : "s"}
          </h3>
          {forms.history.length === 0 ? (
            <p className="member-copy">No signed forms yet.</p>
          ) : (
            <div className="member-stack-list">
              {forms.history.map((item) => (
                <article key={item.signedDocumentId} className="member-stack-item">
                  <div className="member-stack-copy">
                    <div className="member-stack-heading">
                      <h4>{item.formName}</h4>
                      <span className="member-status-pill member-status-pill-success">
                        v{item.versionNumber}
                      </span>
                    </div>
                    <p>
                      {formatTargetLabel(item.signerKind)} signed on{" "}
                      {formatDateTime(item.signedAt)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </MemberShell>
  );
}
