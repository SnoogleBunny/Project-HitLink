import Link from "next/link";
import { AdminShell } from "../../../_components/admin-shell";
import { getPdfSizeCapLabel } from "../../../../lib/forms";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { FormDocumentCreateForm } from "../form-document-create-form";

export default async function NewFormPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      title="Add form"
      description="Upload a waiver or agreement. New versions preserve everyone’s accepted record."
      actions={
        <Link className="text-link" href="/dashboard/forms">
          All forms
        </Link>
      }
    >
      <section className="management-card hl-focused-form">
        <h2>Document and first version</h2>
        <FormDocumentCreateForm pdfSizeCapLabel={getPdfSizeCapLabel()} />
      </section>
    </AdminShell>
  );
}
