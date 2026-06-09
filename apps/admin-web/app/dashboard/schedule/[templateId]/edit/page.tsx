import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../../_components/admin-shell";
import { archiveClassTemplateAction } from "../../actions";
import { ClassTemplateForm } from "../../class-template-form";
import {
  formatMinutesAsTime,
  getClassTemplateForEdit,
  getClassTemplateFormOptions,
} from "../../../../../lib/class-templates";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function EditClassTemplatePage({
  params,
}: {
  params: Promise<{
    templateId: string;
  }>;
}) {
  const { templateId } = await params;
  const { session, workspace, location } = await requireOwnerWorkspaceContext();
  const [template, options] = await Promise.all([
    getClassTemplateForEdit({
      templateId,
      workspaceId: workspace.id,
    }),
    getClassTemplateFormOptions({
      workspaceId: workspace.id,
      locationId: location.id,
    }),
  ]);

  if (!template) {
    notFound();
  }

  const coachStillSelectable = options.coaches.some(
    (coach) => coach.id === template.coachWorkspaceUserId,
  );

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Schedule"
      title={`Edit ${template.displayTitle}`}
      description="Adjust the recurring weekly template details or archive the template to hide it from the default schedule board."
      actions={
        <Link className="button button-secondary" href="/dashboard/schedule">
          Back to schedule
        </Link>
      }
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Template details</p>
          <h3>Update recurring class</h3>

          {!coachStillSelectable ? (
            <div className="info-callout" role="status">
              <strong>This template needs a new coach assignment.</strong>
              <p>
                The currently linked coach is no longer an active owner or coach
                in this workspace. Choose a currently active replacement before
                saving changes.
              </p>
            </div>
          ) : null}

          <ClassTemplateForm
            mode="edit"
            options={options}
            submitDisabled={!options.hasRequiredOptions}
            template={{
              id: template.id,
              title: template.title,
              programId: template.programId,
              roomId: template.roomId,
              coachWorkspaceUserId: template.coachWorkspaceUserId,
              weekday: template.weekday,
              startTimeMinutes: template.startTimeMinutes,
              endTimeMinutes: template.endTimeMinutes,
              capacityOverride: template.capacityOverride,
              bookingCutoffMinutes: template.bookingCutoffMinutes,
              cancellationCutoffMinutes: template.cancellationCutoffMinutes,
            }}
          />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Lifecycle</p>
          <h3>Archive template</h3>
          <p className="management-copy">
            Archived templates disappear from the active weekly board but remain
            visible in the archived section for reference.
          </p>

          <dl className="detail-list">
            <div>
              <dt>Weekday</dt>
              <dd>{template.weekdayLabel}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>
                {formatMinutesAsTime(template.startTimeMinutes)} -{" "}
                {formatMinutesAsTime(template.endTimeMinutes)}
              </dd>
            </div>
            <div>
              <dt>Coach</dt>
              <dd>{template.coachDisplayName}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{template.archivedAt ? "Archived" : "Active"}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDateTime(template.createdAt)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDateTime(template.updatedAt)}</dd>
            </div>
            <div>
              <dt>Archived at</dt>
              <dd>
                {template.archivedAt
                  ? formatDateTime(template.archivedAt)
                  : "Not archived"}
              </dd>
            </div>
          </dl>

          {template.archivedAt ? (
            <p className="empty-state">
              This template is already archived. Restore is intentionally
              deferred.
            </p>
          ) : (
            <form action={archiveClassTemplateAction} className="inline-form">
              <input name="templateId" type="hidden" value={template.id} />
              <button className="button button-danger" type="submit">
                Archive template
              </button>
            </form>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
