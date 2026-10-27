import Link from "next/link";
import { resolveDisplayLocale } from "@flowstate/ui";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { getWorkspaceAudit } from "../../../../lib/workspace-audit";
const label = (value: string) => {
  const text = value
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
function Fields({
  title,
  values,
}: {
  title: string;
  values: Record<string, unknown>;
}) {
  if (!Object.keys(values).length) return null;
  return (
    <div>
      <h3>{title}</h3>
      <dl className="detail-list">
        {Object.entries(values).map(([key, value]) => (
          <div key={key}>
            <dt>{label(key)}</dt>
            <dd>
              {value === null
                ? "Not set"
                : Array.isArray(value)
                  ? value.join(", ") || "None"
                  : typeof value === "boolean"
                    ? value
                      ? "Yes"
                      : "No"
                    : key === "currency" && typeof value === "string"
                      ? value.toUpperCase()
                      : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireOwnerWorkspaceContext();
  const params = (await searchParams) ?? {};
  const data = await getWorkspaceAudit({
    workspaceId: context.workspace.id,
    actorUserId: context.session.userId,
    page: typeof params.page === "string" ? Number(params.page) : 1,
    kind: typeof params.kind === "string" ? params.kind : undefined,
  });
  const locale = resolveDisplayLocale(context.workspace.settings?.locale);
  const when = new Intl.DateTimeFormat(locale, {
    timeZone: context.location.timezone,
    dateStyle: "medium",
    timeStyle: "long",
  });
  const href = (page: number) =>
    `/dashboard/settings/audit?${new URLSearchParams({ page: String(page), ...(data.kind ? { kind: data.kind } : {}) })}`;
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Audit log"
      description="Business settings, member archival and staff identity changes."
      actions={
        <Link className="text-link" href="/dashboard/settings">
          Back to Settings
        </Link>
      }
    >
      <p>
        Attendance corrections, class changes, membership decisions and
        financial reviews retain their detailed history in the relevant record.
        Private coaching content and security tokens are excluded from this log.
      </p>
      <form className="management-card form-stack" method="get">
        <label className="field">
          <span>Change type</span>
          <select className="input" name="kind" defaultValue={data.kind ?? ""}>
            <option value="">All change types</option>
            {data.kinds.map((row) => (
              <option value={row.kind} key={row.kind}>
                {label(row.kind)} ({row._count._all})
              </option>
            ))}
          </select>
        </label>
        <button className="button button-secondary" type="submit">
          Filter audit log
        </button>
      </form>
      <p>
        {data.count} matching {data.count === 1 ? "record" : "records"} · page{" "}
        {data.page}
      </p>
      {data.events.map((event) => (
        <article className="management-card form-stack" key={event.id}>
          <h2>{label(event.kind)}</h2>
          <p>
            {when.format(event.createdAt)} · {context.location.timezone}
          </p>
          <p>
            Recorded by {event.actorName}
            {event.actorUserId ? ` · ${event.actorUserId}` : ""}
          </p>
          <Fields title="Record" values={event.context} />
          <Fields title="Before" values={event.before} />
          <Fields title="After" values={event.after} />
          {event.reason ? <p>Reason: {event.reason}</p> : null}
          {!Object.keys(event.context).length &&
          !Object.keys(event.before).length &&
          !Object.keys(event.after).length ? (
            <p>Details remain in the protected source record.</p>
          ) : null}
        </article>
      ))}
      {!data.count ? <p>No matching changes recorded.</p> : null}
      <nav className="hl-payment-tabs" aria-label="Audit log pages">
        {data.page > 1 ? (
          <Link className="text-link" href={href(data.page - 1)}>
            Newer records
          </Link>
        ) : null}
        {data.page * 50 < data.count ? (
          <Link className="text-link" href={href(data.page + 1)}>
            Older records
          </Link>
        ) : null}
      </nav>
    </AdminShell>
  );
}
