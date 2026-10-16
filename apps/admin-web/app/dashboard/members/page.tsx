import Link from "next/link";
import { resolveRequiredFormStatusesForMember } from "@flowstate/db";
import { AdminShell } from "../../_components/admin-shell";
import {
  listMembers,
  MEMBER_STATUSES,
  type MemberListItem,
} from "../../../lib/members";
import {
  formatRequiredFormState,
  getAggregateRequiredFormState,
} from "../../../lib/forms-status";
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
    status?: string;
    page?: string;
  }>;
}) {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const params = await searchParams;
  const query = params?.q ?? "";
  const status = MEMBER_STATUSES.find((value) => value === params?.status);
  const page = Math.max(1, Math.min(10000, Number.parseInt(params?.page ?? "1", 10) || 1));
  const members = await listMembers({
    workspaceId: workspace.id,
    query,
    status,
    skip: (page - 1) * 50,
    take: 51,
  });
  const hasNext = members.length > 50;
  if (hasNext) members.pop();
  const pageUrl = (next: number) => `/dashboard/members?${new URLSearchParams({ q: query, ...(status ? { status } : {}), page: String(next) })}`;
  const memberStatuses = await Promise.all(
    members.map(async (member) => ({
      memberId: member.id,
      aggregateState: getAggregateRequiredFormState(
        (
          await resolveRequiredFormStatusesForMember({
            workspaceId: workspace.id,
            memberId: member.id,
          })
        ).items,
      ),
    })),
  );
  const memberStatusMap = new Map(
    memberStatuses.map((status) => [status.memberId, status.aggregateState]),
  );

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Members"
      title="Members and trials"
      description="Find members, review trials, and manage family access."
      actions={<Link className="text-link" href="/dashboard/coaching">Coaching clients</Link>}
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
            <label className="field"><span>Status</span><select name="status" defaultValue={status ?? ""}><option value="">All members</option>{MEMBER_STATUSES.map((value) => <option key={value} value={value}>{formatStatus(value)}</option>)}</select></label>
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

        </section>
      </div>

      <section className="management-card">
        <p className="dashboard-card-label">Member list</p>
        <h3>
          {status ? `${formatStatus(status)} members` : "All members"} · Page {page}
        </h3>
        <nav className="dashboard-actions" aria-label="Member pages">{page > 1 ? <Link className="text-link" href={pageUrl(page - 1)}>Previous</Link> : null}{hasNext ? <Link className="text-link" href={pageUrl(page + 1)}>Next 50 members</Link> : null}</nav>

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
                      Forms{" "}
                      {formatRequiredFormState(
                        memberStatusMap.get(member.id) ?? "NONE",
                      )}
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
