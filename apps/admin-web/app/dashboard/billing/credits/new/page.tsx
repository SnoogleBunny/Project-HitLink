import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@flowstate/db";
import { Notice } from "@flowstate/ui";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { AdjustmentForm } from "../../adjustment-form";
export default async function IssueCreditPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const context = await requireOwnerWorkspaceContext();
  const { account: accountId } = await searchParams;
  if (!accountId) notFound();
  const account = await prisma.financialAccount.findFirst({
    where: { workspaceId: context.workspace.id, id: accountId },
    select: { id: true, member: { select: { fullName: true } } },
  });
  if (!account) notFound();
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Issue account credit"
      description={`Credit for ${account.member.fullName}.`}
      actions={
        <Link className="text-link" href="/dashboard/billing/adjustments">
          Back to payments
        </Link>
      }
    >
      <section className="management-card hl-financial-card">
        <Notice>
          Credit has no expiry and stays with this payer. It can be applied to a
          membership invoice in the same currency. Class packs and drop-in
          purchases cannot use it yet. This does not refund a payment.
        </Notice>
        <AdjustmentForm
          initialValues={{
            kind: "issue-credit",
            targetId: account.id,
            requestId: randomUUID(),
            currency: "cad",
            amount: "",
          }}
        />
      </section>
    </AdminShell>
  );
}
