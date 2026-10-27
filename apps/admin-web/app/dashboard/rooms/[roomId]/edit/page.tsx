import { randomUUID } from "node:crypto";
import { resolveDisplayLocale } from "@flowstate/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, getRoomCapacitySettings } from "@flowstate/db";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { archiveRoomAction } from "../../actions";
import { RoomEditForm } from "../../room-edit-form";
import { RoomCapacityForm } from "../../room-capacity-form";

export default async function EditRoomPage({
  params,
}: {
  params: Promise<{
    roomId: string;
  }>;
}) {
  const { roomId } = await params;
  const { session, workspace, location } = await requireOwnerWorkspaceContext();
  const locale = resolveDisplayLocale(workspace.settings?.locale);
  function formatDate(value: Date): string {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  }

  const room = await prisma.room.findFirst({
    where: {
      id: roomId,
      locationId: location.id,
    },
  });

  if (!room) {
    notFound();
  }

  const capacitySettings = await getRoomCapacitySettings(
    { workspaceId: workspace.id, userId: session.userId },
    roomId,
  );

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Rooms"
      title={`Edit ${room.name}`}
      description="Maintain room details and review the effect of a default-capacity change on future classes."
      actions={
        <Link className="button button-secondary" href="/dashboard/rooms">
          Back to rooms
        </Link>
      }
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Room details</p>
          <h3>Update room settings</h3>
          <RoomEditForm room={room} />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Lifecycle</p>
          <h3>Archive room</h3>
          <p className="management-copy">
            Archived rooms stay out of future scheduling and are automatically
            marked inactive.
          </p>

          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>
                {room.archivedAt
                  ? "Archived"
                  : room.isActive
                    ? "Active"
                    : "Inactive"}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(room.createdAt)}</dd>
            </div>
            <div>
              <dt>Archived at</dt>
              <dd>
                {room.archivedAt ? formatDate(room.archivedAt) : "Not archived"}
              </dd>
            </div>
          </dl>

          {room.archivedAt ? (
            <p className="empty-state">
              This room is already archived. Restore is intentionally deferred.
            </p>
          ) : (
            <form action={archiveRoomAction} className="inline-form">
              <input name="roomId" type="hidden" value={room.id} />
              <button className="button button-danger" type="submit">
                Archive room
              </button>
            </form>
          )}
        </section>
      </div>
      <section className="management-card">
        <RoomCapacityForm
          key={room.id}
          initial={capacitySettings}
          operationId={randomUUID()}
          locale={locale}
        />
      </section>
      <section className="management-card">
        <h3>Room default history</h3>
        {capacitySettings.history.length ? (
          <ol>
            {capacitySettings.history.map((row) => (
              <li key={row.revision}>
                <strong>
                  Review {row.revision}:{" "}
                  {row.previousCapacity ?? "No room default limit"} →{" "}
                  {row.capacity ?? "No room default limit"}
                </strong>
                <p>
                  {row.actorName} ·{" "}
                  {new Intl.DateTimeFormat(locale, {
                    timeZone: workspace.location.timezone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(row.at))}
                </p>
                <p>{row.reason}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p>
            No default-capacity changes have been reviewed. The initial room
            value has no fabricated review history.
          </p>
        )}
        {capacitySettings.history.length === 10 ? (
          <p>
            Showing the latest 10 reviews. Preserved business records include
            the full history.
          </p>
        ) : null}
      </section>
    </AdminShell>
  );
}
