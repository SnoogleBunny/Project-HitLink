import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import {
  getAccessProductFormOptions,
  listDropInProducts,
  listPunchCardProducts,
  type DropInProductSummary,
  type PunchCardProductSummary,
} from "../../../lib/access-products";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import {
  archiveDropInProductAction,
  archivePunchCardProductAction,
  toggleDropInProductAction,
  togglePunchCardProductAction,
} from "./actions";
import { DropInProductForm } from "./drop-in-product-form";
import { PunchCardProductForm } from "./punch-card-product-form";

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function formatRestrictions(
  product: PunchCardProductSummary | DropInProductSummary,
): string {
  if (product.programRestrictions.length === 0) {
    return "All active programs";
  }

  return product.programRestrictions.map((program) => program.name).join(", ");
}

function PunchCardProductCard({
  product,
  archived = false,
}: {
  product: PunchCardProductSummary;
  archived?: boolean;
}) {
  return (
    <article className="stack-item">
      <div className="stack-item-copy">
        <div className="stack-item-heading">
          <h4>{product.name}</h4>
          <span
            className={`status-pill ${
              archived ? "" : product.isEnabled ? "status-pill-success" : ""
            }`}
          >
            {archived ? "Archived" : product.isEnabled ? "Enabled" : "Disabled"}
          </span>
          {product.stripePriceId ? <span className="status-pill">Stripe</span> : null}
        </div>
        <p>{product.description ?? "No description yet."}</p>
        <dl className="inline-meta">
          <div>
            <dt>Included</dt>
            <dd>{product.punchesIncluded} punches</dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd>{formatMoney(product.priceCents, product.currency)}</dd>
          </div>
          <div>
            <dt>Programs</dt>
            <dd>{formatRestrictions(product)}</dd>
          </div>
        </dl>
      </div>

      <div className="dashboard-actions">
        <Link
          className="button button-secondary"
          href={`/dashboard/access-products/punch-cards/${product.id}/edit`}
        >
          {archived ? "View details" : "Edit"}
        </Link>
        {!archived ? (
          <>
            <form action={togglePunchCardProductAction}>
              <input name="punchCardProductId" type="hidden" value={product.id} />
              <input
                name="enabled"
                type="hidden"
                value={product.isEnabled ? "false" : "true"}
              />
              <button className="button button-secondary" type="submit">
                {product.isEnabled ? "Disable" : "Enable"}
              </button>
            </form>
            <form action={archivePunchCardProductAction}>
              <input name="punchCardProductId" type="hidden" value={product.id} />
              <button className="button button-secondary" type="submit">
                Archive
              </button>
            </form>
          </>
        ) : null}
      </div>
    </article>
  );
}

function DropInProductCard({
  product,
  archived = false,
}: {
  product: DropInProductSummary;
  archived?: boolean;
}) {
  return (
    <article className="stack-item">
      <div className="stack-item-copy">
        <div className="stack-item-heading">
          <h4>{product.name}</h4>
          <span
            className={`status-pill ${
              archived ? "" : product.isEnabled ? "status-pill-success" : ""
            }`}
          >
            {archived ? "Archived" : product.isEnabled ? "Enabled" : "Disabled"}
          </span>
          {product.stripePriceId ? <span className="status-pill">Stripe</span> : null}
        </div>
        <p>{product.description ?? "No description yet."}</p>
        <dl className="inline-meta">
          <div>
            <dt>Price</dt>
            <dd>{formatMoney(product.priceCents, product.currency)}</dd>
          </div>
          <div>
            <dt>Programs</dt>
            <dd>{formatRestrictions(product)}</dd>
          </div>
        </dl>
      </div>

      <div className="dashboard-actions">
        <Link
          className="button button-secondary"
          href={`/dashboard/access-products/drop-ins/${product.id}/edit`}
        >
          {archived ? "View details" : "Edit"}
        </Link>
        {!archived ? (
          <>
            <form action={toggleDropInProductAction}>
              <input name="dropInProductId" type="hidden" value={product.id} />
              <input
                name="enabled"
                type="hidden"
                value={product.isEnabled ? "false" : "true"}
              />
              <button className="button button-secondary" type="submit">
                {product.isEnabled ? "Disable" : "Enable"}
              </button>
            </form>
            <form action={archiveDropInProductAction}>
              <input name="dropInProductId" type="hidden" value={product.id} />
              <button className="button button-secondary" type="submit">
                Archive
              </button>
            </form>
          </>
        ) : null}
      </div>
    </article>
  );
}

export default async function AccessProductsPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const [options, punchCards, dropIns] = await Promise.all([
    getAccessProductFormOptions({
      workspaceId: workspace.id,
    }),
    listPunchCardProducts({
      workspaceId: workspace.id,
    }),
    listDropInProducts({
      workspaceId: workspace.id,
    }),
  ]);

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Access products"
      title="Punch cards and drop-ins"
      description="Create non-membership class access products for member purchases and operational grants."
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Create punch card</p>
          <h3>Non-expiring class packs</h3>
          <PunchCardProductForm mode="create" options={options} />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Create drop-in</p>
          <h3>Paid at booking</h3>
          <DropInProductForm mode="create" options={options} />
        </section>
      </div>

      <section className="management-card">
        <p className="dashboard-card-label">Active punch cards</p>
        <h3>
          {punchCards.activeProducts.length} active product
          {punchCards.activeProducts.length === 1 ? "" : "s"}
        </h3>
        {punchCards.activeProducts.length === 0 ? (
          <p className="empty-state">No punch-card products yet.</p>
        ) : (
          <div className="stack-list">
            {punchCards.activeProducts.map((product) => (
              <PunchCardProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <section className="management-card">
        <p className="dashboard-card-label">Active drop-ins</p>
        <h3>
          {dropIns.activeProducts.length} active product
          {dropIns.activeProducts.length === 1 ? "" : "s"}
        </h3>
        {dropIns.activeProducts.length === 0 ? (
          <p className="empty-state">No drop-in products yet.</p>
        ) : (
          <div className="stack-list">
            {dropIns.activeProducts.map((product) => (
              <DropInProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Archived punch cards</p>
          <h3>Hidden from new purchases</h3>
          {punchCards.archivedProducts.length === 0 ? (
            <p className="empty-state">No archived punch-card products yet.</p>
          ) : (
            <div className="stack-list">
              {punchCards.archivedProducts.map((product) => (
                <PunchCardProductCard
                  key={product.id}
                  archived
                  product={product}
                />
              ))}
            </div>
          )}
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Archived drop-ins</p>
          <h3>Hidden from new purchases</h3>
          {dropIns.archivedProducts.length === 0 ? (
            <p className="empty-state">No archived drop-in products yet.</p>
          ) : (
            <div className="stack-list">
              {dropIns.archivedProducts.map((product) => (
                <DropInProductCard key={product.id} archived product={product} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
