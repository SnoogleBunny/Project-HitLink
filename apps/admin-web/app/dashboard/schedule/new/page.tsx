import Link from "next/link";
import { AdminShell } from "../../../_components/admin-shell";
import { ClassTemplateForm } from "../class-template-form";
import { getClassTemplateFormOptions } from "../../../../lib/class-templates";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";

function getMissingPrerequisiteCopy(code: "programs" | "rooms" | "coaches") {
  switch (code) {
    case "programs":
      return "No active programs are available yet.";
    case "rooms":
      return "No active rooms are available in the primary location.";
    case "coaches":
      return "No eligible active owners or coaches are available for assignment.";
  }
}

export default async function NewClassTemplatePage() {
  const { session, workspace, location } = await requireOwnerWorkspaceContext();
  const options = await getClassTemplateFormOptions({
    workspaceId: workspace.id,
    locationId: location.id,
  });

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Schedule"
      title="Create class template"
      description="Set up one recurring weekly class using existing programs, rooms, and active owner or coach assignments."
      actions={
        <Link className="button button-secondary" href="/dashboard/schedule">
          Back to schedule
        </Link>
      }
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Template details</p>
          <h3>Recurring weekly class</h3>

          {options.hasRequiredOptions ? null : (
            <div className="info-callout" role="status">
              <strong>Finish setup before creating classes.</strong>
              <ul className="callout-list">
                {options.missingPrerequisites.map((item) => (
                  <li key={item}>{getMissingPrerequisiteCopy(item)}</li>
                ))}
              </ul>
            </div>
          )}

          <ClassTemplateForm
            mode="create"
            options={options}
            submitDisabled={!options.hasRequiredOptions}
          />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Prerequisites</p>
          <h3>Schedule inputs</h3>
          <p className="management-copy">
            Templates only use currently active setup records.
          </p>

          <dl className="detail-list">
            <div>
              <dt>Programs</dt>
              <dd>{options.programs.length} active</dd>
            </div>
            <div>
              <dt>Rooms</dt>
              <dd>{options.rooms.length} active</dd>
            </div>
            <div>
              <dt>Eligible coaches</dt>
              <dd>{options.coaches.length} active</dd>
            </div>
          </dl>

          <div className="dashboard-actions">
            <Link
              className="button button-secondary"
              href="/dashboard/programs"
            >
              Manage programs
            </Link>
            <Link className="button button-secondary" href="/dashboard/rooms">
              Manage rooms
            </Link>
            <Link
              className="button button-secondary"
              href="/dashboard/staff-invites"
            >
              Manage staff invites
            </Link>
          </div>

          <p className="management-copy">
            Pending invites are not selectable until the invited user becomes an
            active workspace member.
          </p>
        </section>
      </div>
    </AdminShell>
  );
}
