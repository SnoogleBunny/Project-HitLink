import { randomUUID } from "node:crypto";
import Link from "next/link";
import { resolveDisplayLocale } from "@flowstate/ui";
import { coachingTime } from "../../../../lib/coaching-fields";
import { getCoachingBookingSettings } from "@flowstate/db";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { CoachingBookingRulesForm } from "./form";

export default async function CoachingBookingRulesPage() {
  const context = await requireOwnerWorkspaceContext();
  const locale=resolveDisplayLocale(context.workspace.settings?.locale);
  const current = await getCoachingBookingSettings({ workspaceId: context.workspace.id, userId: context.session.userId });
  return <AdminShell session={context.session} workspaceName={context.workspace.name} title="Program appointment booking rules" description="Confirm service hours, booking windows and help terms for new program appointments." actions={<Link className="text-link" href="/dashboard/settings">All settings</Link>}>
    <div className="hl-focused-form">
      <CoachingBookingRulesForm initial={current.head?.policy ?? null} version={current.head?.version ?? 0} initialOperationId={randomUUID()} />
      <section className="management-card form-stack">
        <h2>Confirmed history</h2>
        {!current.history.length ? <p>No program appointment booking rules have been confirmed.</p> : current.history.map((event) => {
          const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : {};
          const version = typeof metadata.version === "number" ? metadata.version : "Unavailable";
          const reason = typeof metadata.reason === "string" ? metadata.reason : "Reason unavailable";
          const owner = typeof metadata.actorNameSnapshot === "string" ? metadata.actorNameSnapshot : "Owner";
          return <article key={event.id}><h3>Version {version}</h3><p>Confirmed {coachingTime(event.createdAt,context.location.timezone,locale)} by {owner}</p><p>{reason}</p></article>;
        })}
      </section>
    </div>
  </AdminShell>;
}
