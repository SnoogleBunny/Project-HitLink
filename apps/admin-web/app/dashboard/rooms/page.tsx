import Link from "next/link";
import { prisma } from "@flowstate/db";
import { AdminShell } from "../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { RoomCreateForm } from "./room-create-form";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
  }).format(value);
}

export default async function RoomsPage() {
  const { session, workspace, location } = await requireOwnerWorkspaceContext();
  const [rooms, archivedRooms] = await Promise.all([
    prisma.room.findMany({
      where: {
        locationId: location.id,
        archivedAt: null,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.room.findMany({
      where: {
        locationId: location.id,
        archivedAt: {
          not: null,
        },
      },
      orderBy: {
        archivedAt: "desc",
      },
    }),
  ]);

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Rooms"
      title="Room management"
      description="Manage rooms for the single primary location that the upcoming weekly schedule will use."
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Create room</p>
          <h3>Primary location room</h3>
          <p className="management-copy">
            This gym supports one location only, so every room belongs to{" "}
            {location.name}.
          </p>
          <RoomCreateForm />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Active and inactive rooms</p>
          <h3>Available for operations</h3>
          <p className="management-copy">
            Active rooms can be scheduled later. Inactive rooms stay visible but
            should be skipped by future schedule builders.
          </p>

          {rooms.length === 0 ? (
            <p className="empty-state">
              No rooms yet. Add at least one room for class templates and weekly
              scheduling.
            </p>
          ) : (
            <div className="stack-list">
              {rooms.map((room) => (
                <article key={room.id} className="stack-item">
                  <div className="stack-item-copy">
                    <div className="stack-item-heading">
                      <h4>{room.name}</h4>
                      <span
                        className={`status-pill ${room.isActive ? "status-pill-success" : ""}`}
                      >
                        {room.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p>
                      {room.capacity
                        ? `Capacity ${room.capacity}`
                        : "No capacity set yet."}
                    </p>
                  </div>

                  <Link
                    className="button button-secondary"
                    href={`/dashboard/rooms/${room.id}/edit`}
                  >
                    Edit room
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="management-card">
        <p className="dashboard-card-label">Archived rooms</p>
        <h3>Kept out of future schedule pickers</h3>

        {archivedRooms.length === 0 ? (
          <p className="empty-state">
            No archived rooms yet. Archived rooms stay reserved by name and off
            the schedule.
          </p>
        ) : (
          <div className="stack-list">
            {archivedRooms.map((room) => (
              <article key={room.id} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>{room.name}</h4>
                    <span className="status-pill">Archived</span>
                  </div>
                  <p>
                    Archived on{" "}
                    {room.archivedAt ? formatDate(room.archivedAt) : "an earlier date"}.
                  </p>
                </div>

                <Link
                  className="button button-secondary"
                  href={`/dashboard/rooms/${room.id}/edit`}
                >
                  View details
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
