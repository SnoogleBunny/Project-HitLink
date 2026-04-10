import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../../../_components/admin-shell";
import {
  getAccessProductFormOptions,
  getDropInProduct,
} from "../../../../../../lib/access-products";
import { requireOwnerWorkspaceContext } from "../../../../../../lib/owner-workspace";
import { DropInProductForm } from "../../../drop-in-product-form";

export default async function EditDropInProductPage({
  params,
}: {
  params: Promise<{
    dropInProductId: string;
  }>;
}) {
  const { dropInProductId } = await params;
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const [product, options] = await Promise.all([
    getDropInProduct({
      workspaceId: workspace.id,
      dropInProductId,
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
      description="Edit owner-facing drop-in product details and program restrictions."
      actions={
        <Link className="button button-secondary" href="/dashboard/access-products">
          Back to access products
        </Link>
      }
    >
      <section className="management-card">
        <p className="dashboard-card-label">Edit drop-in</p>
        <h3>Paid at booking</h3>
        <DropInProductForm mode="edit" options={options} product={product} />
      </section>
    </AdminShell>
  );
}
