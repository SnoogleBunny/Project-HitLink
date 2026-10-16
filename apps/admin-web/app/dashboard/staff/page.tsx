import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getStaffLeave } from "@flowstate/db";
import { Badge } from "@flowstate/ui";
import { AdminShell } from "../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { StaffLeaveForm } from "./form";

export default async function StaffPage() {
  const context = await requireOwnerWorkspaceContext();
  const { staff, leave } = await getStaffLeave({
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  });
  const timezone = context.location.timezone;
  const format = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(value);
  const name = (id: string) => {
    const person = staff.find((item) => item.id === id);
    return person?.user.fullName ?? person?.user.email ?? "Former staff member";
  };
  const now = new Date();
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Coaches and staff"
      description="See your team and keep leave out of the teaching schedule."
      actions={
        <Link className="text-link" href="/dashboard/staff-invites">
          Coach invites
        </Link>
      }
    >
      <div className="management-grid">
        <section className="management-card form-stack">
          <h2>Record leave</h2>
          <p>
            Times use {timezone}. Resolve assigned classes and withdraw
            published appointment times before recording leave. Appointment
            buffers count too.
          </p>
          <StaffLeaveForm label="Record leave" timezone={timezone}>
            <input type="hidden" name="requestId" value={randomUUID()} />
            <label className="field">
              Coach or owner
              <select name="coachWorkspaceUserId" required defaultValue="">
                <option value="" disabled>
                  Choose a staff member
                </option>
                {staff
                  .filter((item) => item.isActive)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {name(item.id)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Leave starts
              <input name="startsAt" type="datetime-local" required />
            </label>
            <label className="field">
              Leave ends
              <input name="endsAt" type="datetime-local" required />
            </label>
            <label className="field">
              Reason
              <input
                name="reason"
                required
                minLength={3}
                maxLength={500}
                aria-describedby="leave-reason-help"
              />
            </label>
            <p id="leave-reason-help" className="form-help">
              Use a brief scheduling reason, such as “Annual leave.” Do not
              include medical or other private details.
            </p>
          </StaffLeaveForm>
        </section>
        <section className="management-card form-stack">
          <h2>Your team</h2>
          {staff.map((item) => (
            <div key={item.id} className="hl-record-row">
              <div>
                <strong>{name(item.id)}</strong>
                <p>{item.role === "OWNER" ? "Owner" : "Coach"}</p>
              </div>
              <Badge>{item.isActive ? "Active" : "Inactive"}</Badge>
            </div>
          ))}
        </section>
      </div>
      <section className="management-card form-stack">
        <h2>Leave records</h2>
        {!leave.length ? (
          <p>No leave recorded.</p>
        ) : (
          leave.map((item) => (
            <article key={item.id} className="management-card form-stack">
              <div className="dashboard-actions">
                <h3>{name(item.coachWorkspaceUserId)}</h3>
                <Badge>
                  {item.revokedAt
                    ? "Withdrawn"
                    : item.endsAt <= now
                      ? "Ended"
                      : "Scheduled"}
                </Badge>
              </div>
              <p>
                {format(item.startsAt)} – {format(item.endsAt)} ({timezone})
              </p>
              <p>{item.reason}</p>
              {item.revokedAt ? (
                <p>
                  Withdrawn {format(item.revokedAt)}: {item.revocationReason}
                </p>
              ) : item.endsAt > now ? (
                <details>
                  <summary>Withdraw leave</summary>
                  <StaffLeaveForm label="Withdraw leave" timezone={timezone}>
                    <input type="hidden" name="intent" value="revoke" />
                    <input type="hidden" name="leaveId" value={item.id} />
                    <label className="field">
                      Reason for withdrawing
                      <input
                        name="reason"
                        minLength={3}
                        maxLength={500}
                        required
                      />
                    </label>
                    <p>
                      Existing cancellations stay cancelled. This only makes the
                      coach available for new assignments.
                    </p>
                  </StaffLeaveForm>
                </details>
              ) : null}
            </article>
          ))
        )}
      </section>
    </AdminShell>
  );
}
