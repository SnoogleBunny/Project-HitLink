import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getWorkspaceDateString, prisma } from "@flowstate/db";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { OwnerLateBookingForm } from "./form";
export default async function OwnerLateBookingPage({
  searchParams,
}: {
  searchParams?: Promise<{ classTemplateId?: string; date?: string }>;
}) {
  const context = await requireOwnerWorkspaceContext(),
    query = await searchParams;
  const [members, templates] = await Promise.all([
    prisma.member.findMany({
      where: { workspaceId: context.workspace.id, archivedAt: null },
      select: { id: true, fullName: true },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      take: 200,
    }),
    prisma.classTemplate.findMany({
      where: { workspaceId: context.workspace.id, archivedAt: null },
      include: { program: { select: { name: true } } },
      orderBy: [{ title: "asc" }, { id: "asc" }],
    }),
  ]);
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Late booking exception"
      description="The owner can review a named cutoff exception for one class that has not started."
      actions={
        <Link className="text-link" href="/dashboard/bookings">
          Class bookings
        </Link>
      }
    >
      <div className="hl-focused-form">
        <OwnerLateBookingForm
          operationId={randomUUID()}
          initialDate={
            query?.date ??
            getWorkspaceDateString(new Date(), context.location.timezone)
          }
          initialTemplateId={query?.classTemplateId ?? ""}
          members={members.map((member) => ({
            id: member.id,
            name: member.fullName,
          }))}
          templates={templates.map((template) => ({
            id: template.id,
            title: template.title ?? template.program.name,
          }))}
        />
      </div>
    </AdminShell>
  );
}
