import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import {
  listMembers,
  type MemberListItem,
} from "../../../lib/members";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { MemberCreateForm } from "./member-form";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
  }).format(value);
}

function formatStatus(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatContact(member: MemberListItem): string {
  if (member.email && member.phone) {
    return `${member.email} · ${member.phone}`;
  }

  return member.email ?? member.phone ?? "No contact details yet";
}

function formatLatestTrial(member: MemberListItem): string {
  if (!member.latestTrialBooking) {
    return "No trial booked";
  }

  return `${member.latestTrialBooking.classTitle} on ${formatDate(member.latestTrialBooking.scheduledForDate)}`;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
  }>;
}) {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const params = await searchParams;
  const query = params?.q ?? "";
  const members = await listMembers({
    workspaceId: workspace.id,
    query,
  });

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Members"
      title="Members and trials"
      description="Member records, trial prospects, notes, tags, guardian links, and booked trial dates."
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Create member</p>
          <h3>Member or prospect</h3>
          <p className="management-copy">
            Add a lightweight profile without billing, membership plans, or
            portal access.
          </p>
          <MemberCreateForm />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Search</p>
          <h3>Find people</h3>
          <form className="form-stack" method="get">
            <label className="field">
              <span>Name, email, or phone</span>
              <input
                defaultValue={query}
                name="q"
                placeholder="Search members and prospects"
                type="search"
              />
            </label>
            <div className="dashboard-actions">
              <button className="button" type="submit">
                Search members
              </button>
              {query ? (
                <Link className="button button-secondary" href="/dashboard/members">
                  Clear
                </Link>
              ) : null}
            </div>
          </form>

          <p className="management-copy">
            Search stays basic: exact workspace, simple text matching, no CRM
            merge flow.
          </p>
        </section>
      </div>

      <section className="management-card">
        <p className="dashboard-card-label">Member list</p>
        <h3>
          {members.length} result{members.length === 1 ? "" : "s"}
        </h3>

        {members.length === 0 ? (
          <p className="empty-state">
            No members found. Create a member manually or book a public trial.
          </p>
        ) : (
          <div className="stack-list">
            {members.map((member) => (
              <article key={member.id} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>{member.fullName}</h4>
                    <span className="status-pill">
                      {formatStatus(member.status)}
                    </span>
                    <span className="status-pill">
                      Forms {formatStatus(member.formStatus)}
                    </span>
                  </div>
                  <p>{formatContact(member)}</p>
                  <dl className="inline-meta">
                    <div>
                      <dt>Tags</dt>
                      <dd>
                        {member.tags.length > 0
                          ? member.tags.join(", ")
                          : "No tags"}
                      </dd>
                    </div>
                    <div>
                      <dt>Guardians</dt>
                      <dd>{member.guardians.length}</dd>
                    </div>
                    <div>
                      <dt>Latest trial</dt>
                      <dd>{formatLatestTrial(member)}</dd>
                    </div>
                  </dl>
                </div>

                <Link
                  className="button button-secondary"
                  href={`/dashboard/members/${member.id}`}
                >
                  View profile
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
