import Link from "next/link";
import {
  getClassSchedulingSettings,
  parseClassSchedulingPolicy,
} from "@flowstate/db";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { BookingRulesForm } from "./form";
export default async function ClassBookingRulesPage() {
  const context = await requireOwnerWorkspaceContext();
  const current = await getClassSchedulingSettings({
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  });
  const latest = current.history.at(-1);
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Class booking rules"
      description="Confirm the hours and booking window used for new class requests."
      actions={
        <Link className="text-link" href="/dashboard/settings">
          All settings
        </Link>
      }
    >
      <div className="hl-focused-form">
        <BookingRulesForm
          initial={latest ? parseClassSchedulingPolicy(latest.policy) : null}
          version={current.version}
        />
        <section className="management-card form-stack">
          <h2>Confirmed history</h2>
          {!current.history.length ? (
            <p>
              No class booking rules have been confirmed. New class claims are
              unavailable until the owner confirms them.
            </p>
          ) : (
            [...current.history].reverse().map((revision) => (
              <article key={revision.id}>
                <h3>Version {revision.version}</h3>
                <p>
                  Confirmed {revision.activatedAt.toISOString()} ·{" "}
                  {revision.reason}
                </p>
              </article>
            ))
          )}
        </section>
      </div>
    </AdminShell>
  );
}
