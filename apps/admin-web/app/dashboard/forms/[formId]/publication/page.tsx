import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  prisma,
  getFormPublicationPageData,
  parseRequirementTerms,
} from "@flowstate/db";
import { resolveDisplayLocale } from "@flowstate/ui";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { FormPublicationForm } from "../../publication-form";

export default async function FormPublicationPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const document = await getFormPublicationPageData({
    db: prisma,
    workspaceId: workspace.id,
    actorUserId: session.userId,
    formDocumentId: formId,
  });
  if (!document) notFound();
  const head = document.requirementRevisions[0];
  const locale = resolveDisplayLocale(workspace.settings?.locale);
  const format = (at: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(at) + " UTC";
  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Forms"
      title={`Publish ${document.name}`}
      description="Review a scheduled requirement or renewal against exact consent and accepted bookings."
      actions={
        <Link
          href={`/dashboard/forms/${formId}`}
          className="button button-secondary"
        >
          Back to document
        </Link>
      }
    >
      <div className="management-grid">
        <section className="management-card">
          <h2>Requirement and acceptance cycle</h2>
          <FormPublicationForm
            publicationId={randomUUID()}
            formDocumentId={formId}
            expectedHeadHash={head?.revisionHash ?? null}
            versions={document.versions}
            initialVersionId={
              head?.formVersionId ?? document.versions[0]?.id ?? ""
            }
            initialTargets={
              head
                ? parseRequirementTerms(head.terms).targets
                : document.assignments
                    .filter((row) => row.isActive)
                    .map((row) => row.requirementTarget)
            }
            defaultEffectiveAt={new Date(Date.now() + 48 * 3600000)
              .toISOString()
              .slice(0, 16)}
          />
        </section>
        <section className="management-card">
          <h2>Published requirement history</h2>
          {document.requirementRevisions.length ? (
            <div className="stack-list">
              {document.requirementRevisions.map((revision) => {
                const terms = parseRequirementTerms(revision.terms);
                return (
                  <article className="stack-item" key={revision.id}>
                    <div className="stack-item-copy">
                      <h3>Requirement revision {revision.version}</h3>
                      <p>
                        PDF version{" "}
                        {
                          document.versions.find(
                            (version) => version.id === revision.formVersionId,
                          )?.versionNumber
                        }{" "}
                        · effective {format(revision.effectiveAt)}
                      </p>
                      <p>
                        {terms.targets.length
                          ? terms.targets.join(", ")
                          : "Requirement withdrawn"}
                      </p>
                      <p>
                        {terms.consentValidUntil
                          ? `Consent valid until ${format(new Date(terms.consentValidUntil))}`
                          : "No consent expiry recorded"}
                      </p>
                      <p>
                        Published by{" "}
                        {revision.actor.fullName ?? revision.actor.email} on{" "}
                        {format(revision.publishedAt)}
                      </p>
                      <p>{revision.reason}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="management-copy">
              This document currently uses the observed legacy requirement.
              Existing signatures have no invented expiry or publication date.
            </p>
          )}
          <Link
            href="/dashboard/forms/recoveries"
            className="button button-secondary"
          >
            Review affected booking recovery
          </Link>
        </section>
      </div>
    </AdminShell>
  );
}
