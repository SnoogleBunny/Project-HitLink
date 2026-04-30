import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../../../_components/admin-shell";
import {
  getAccessProductFormOptions,
  getPunchCardProduct,
} from "../../../../../../lib/access-products";
import { requireOwnerWorkspaceContext } from "../../../../../../lib/owner-workspace";
import { PunchCardProductForm } from "../../../punch-card-product-form";

export default async function EditPunchCardProductPage({
  params,
}: {
  params: Promise<{
    punchCardProductId: string;
  }>;
}) {
  const { punchCardProductId } = await params;
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const [product, options] = await Promise.all([
    getPunchCardProduct({
      workspaceId: workspace.id,
      punchCardProductId,
    }),
    getAccessProductFormOptions({
      workspaceId: workspace.id,
    }),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Access products"
      title={product.name}
      description="Edit owner-facing punch-card product details and program restrictions."
      actions={
        <Link className="button button-secondary" href="/dashboard/access-products">
          Back to access products
        </Link>
      }
    >
      <section className="management-card">
        <p className="dashboard-card-label">Edit punch card</p>
        <h3>Non-expiring access</h3>
        <PunchCardProductForm mode="edit" options={options} product={product} />
      </section>
    </AdminShell>
  );
}
