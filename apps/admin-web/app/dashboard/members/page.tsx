import { resolveDisplayLocale } from "@flowstate/ui";
import {
  DIRECTORY_CONDITIONS,
  MemberDirectoryInputError,
  parseMemberDirectoryFilters,
  readOwnerMemberDirectory,
} from "@flowstate/db";
import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import { MEMBER_STATUSES } from "../../../lib/members";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { MemberServiceSummaryPanel } from "./member-service-summary";
function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}
export default async function MembersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const locale = resolveDisplayLocale(workspace.settings?.locale);
  const params = (await searchParams) ?? {};
  let filters;
  try {
    filters = parseMemberDirectoryFilters(params);
  } catch {
    return (
      <AdminShell
        session={session}
        workspaceName={workspace.name}
        eyebrow="Members"
        title="Members"
        description="Find people and review independent services."
      >
        <p role="alert">
          These search filters are invalid.{" "}
          <Link href="/dashboard/members">Return to all current members</Link>.
        </p>
      </AdminShell>
    );
  }
  let page;
  try {
    page = await readOwnerMemberDirectory(
      { workspaceId: workspace.id, userId: session.userId },
      {
        filters,
        after: typeof params.after === "string" ? params.after : undefined,
      },
    );
  } catch (error) {
    if (!(error instanceof MemberDirectoryInputError)) throw error;
    return (
      <AdminShell
        session={session}
        workspaceName={workspace.name}
        eyebrow="Members"
        title="Members"
        description="Find people and review independent services."
      >
        <p role="alert">
          {error.message}{" "}
          <Link href="/dashboard/members">Return to the first page</Link>.
        </p>
      </AdminShell>
    );
  }
  const baseParams = new URLSearchParams({
    q: filters.query,
    ...(filters.profileLabel ? { status: filters.profileLabel } : {}),
    ...(filters.archived ? { archived: "1" } : {}),
    ...(filters.classProgram ? { classProgram: filters.classProgram } : {}),
    ...(filters.coachingProgram
      ? { coachingProgram: filters.coachingProgram }
      : {}),
    ...(filters.cohortLabel ? { cohortLabel: filters.cohortLabel } : {}),
    ...(filters.operationalTag ? { operationalTag: filters.operationalTag } : {}),
    ...(filters.condition ? { condition: filters.condition } : {}),
    ...(filters.forms ? { forms: filters.forms } : {}),
  });
  const nextParams = new URLSearchParams(baseParams);
  if (page.nextCursor) nextParams.set("after", page.nextCursor);
  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Members"
      title="Members"
      description="Find people and review each service independently."
      actions={
        <>
          <Link
            className="text-link"
            href={
              filters.archived
                ? "/dashboard/members"
                : "/dashboard/members?archived=1"
            }
          >
            {filters.archived ? "Current members" : "Archived members"}
          </Link>
          <Link className="text-link" href="/dashboard/coaching">
            Coaching clients
          </Link>
          <Link className="button" href="/dashboard/members/new">
            Add member
          </Link>
        </>
      }
    >
      <section className="management-card">
        <h2>Find people</h2>
        <form className="form-stack" method="get">
          {filters.archived ? (
            <input type="hidden" name="archived" value="1" />
          ) : null}
          <label className="field">
            <span>Name, email, or phone</span>
            <input
              name="q"
              defaultValue={filters.query}
              type="search"
              maxLength={120}
            />
          </label>
          <label className="field">
            <span>Profile label</span>
            <select name="status" defaultValue={filters.profileLabel ?? ""}>
              <option value="">All profile labels</option>
              {MEMBER_STATUSES.map((value) => (
                <option value={value} key={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          <p>
            Profile labels are saved administrative labels. Current service
            status is shown separately below.
          </p>
          <label className="field">
            <span>Class program participation</span>
            <input
              name="classProgram"
              defaultValue={filters.classProgram}
              maxLength={120}
              placeholder="Program name in recorded class participation"
            />
          </label>
          <label className="field">
            <span>Coaching program enrollment</span>
            <input
              name="coachingProgram"
              defaultValue={filters.coachingProgram}
              maxLength={120}
              placeholder="Coaching program name"
            />
          </label>
          <label className="field">
            <span>Exact current operational tag</span>
            <input name="operationalTag" defaultValue={filters.operationalTag} maxLength={40} placeholder="For example: Use side entrance" />
          </label>
          <label className="field">
            <span>Exact saved cohort / legacy label</span>
            <input
              name="cohortLabel"
              defaultValue={filters.cohortLabel}
              maxLength={80}
            />
          </label>
          <label className="field">
            <span>Operational condition</span>
            <select name="condition" defaultValue={filters.condition ?? ""}>
              <option value="">All conditions</option>
              {Object.entries(DIRECTORY_CONDITIONS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Required forms</span>
            <select name="forms" defaultValue={filters.forms ?? ""}>
              <option value="">All forms states</option>
              <option value="COMPLETE">
                Complete / none currently required
              </option>
              <option value="ACTION_REQUIRED">Action required</option>
              <option value="EXPIRED">Expired requirement</option>
            </select>
          </label>
          <div className="dashboard-actions">
            <button className="button" type="submit">
              Search members
            </button>
            <Link
              className="button button-secondary"
              href={
                filters.archived
                  ? "/dashboard/members?archived=1"
                  : "/dashboard/members"
              }
            >
              Clear filters
            </Link>
          </div>
        </form>
      </section>
      <section className="management-card">
        <h2>{filters.archived ? "Archived members" : "Current members"}</h2>
        <nav className="dashboard-actions" aria-label="Member pages">
          {params.after ? (
            <Link
              className="text-link"
              href={`/dashboard/members?${baseParams}`}
            >
              First matching page
            </Link>
          ) : null}
          {page.nextCursor ? (
            <Link
              className="text-link"
              href={`/dashboard/members?${nextParams}`}
            >
              Next 50 matching members
            </Link>
          ) : null}
        </nav>
        {!page.members.length ? (
          <p className="empty-state">No members match these filters.</p>
        ) : (
          <div className="stack-list">
            {page.members.map((member) => (
              <article className="stack-item" key={member.id}>
                <div className="stack-item-copy">
                  <h3>{member.fullName}</h3>
                  <p>
                    {member.email ?? "No email"}
                    {member.phone ? ` · ${member.phone}` : ""}
                  </p>
                  <p>
                    Profile label: {label(member.status)}
                    {member.archivedAt
                      ? ` · Archived ${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(member.archivedAt)}`
                      : ""}{" "}
                    · Guardians: {member._count.familyLinks}
                  </p>
                  <p>
                    Forms:{" "}
                    {member.forms
                      ? label(member.forms.state)
                      : "summary unavailable"}
                    {member.forms?.upcomingCount
                      ? ` · ${member.forms.upcomingCount} upcoming`
                      : ""}
                  </p>
                  <p>
                    Saved labels (cohort and unclassified legacy):{" "}
                    {member.tags.join(", ") || "None"}
                  </p>
                  <p>
                    Operational tags:{" "}
                    {member.services.operationalTags.join(", ") || "None"}
                    {member.services.moreTags
                      ? " · more in Internal operations"
                      : ""}
                  </p>
                  <p>
                    Latest trial:{" "}
                    {member.services.latestTrial
                      ? `${member.services.latestTrial.title} on ${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${member.services.latestTrial.date}T00:00:00Z`))}`
                      : "No trial booked"}
                  </p>
                  <MemberServiceSummaryPanel
                    services={member.services}
                    compact
                  />
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
