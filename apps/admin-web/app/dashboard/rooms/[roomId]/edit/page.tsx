import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@flowstate/db";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { archiveRoomAction } from "../../actions";
import { RoomEditForm } from "../../room-edit-form";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function EditRoomPage({
  params,
}: {
  params: Promise<{
    roomId: string;
  }>;
}) {
  const { roomId } = await params;
  const { session, workspace, location } = await requireOwnerWorkspaceContext();
  const room = await prisma.room.findFirst({
    where: {
      id: roomId,
      locationId: location.id,
    },
  });

  if (!room) {
    notFound();
  }

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Rooms"
      title={`Edit ${room.name}`}
      description="Adjust room capacity or active state before class templates start using room assignments."
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
              <dd>{room.archivedAt ? "Archived" : room.isActive ? "Active" : "Inactive"}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(room.createdAt)}</dd>
            </div>
            <div>
              <dt>Archived at</dt>
              <dd>{room.archivedAt ? formatDate(room.archivedAt) : "Not archived"}</dd>
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
    </AdminShell>
  );
}
