import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getMemberOperations,
  getMemberOperationsHistory,
  MemberOperationsError,
} from "@flowstate/db";
import { resolveDisplayLocale } from "@flowstate/ui";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireMemberOperationsContext } from "../operations-context";
import { MemberOperationsPanel } from "../operations-panel";

export default async function MemberOperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams?: Promise<{
    classTemplateId?: string;
    date?: string;
    history?: string;
    historyAt?: string;
    historyId?: string;
    beforeAt?: string;
    beforeId?: string;
  }>;
}) {
  const { memberId } = await params,
    query = await searchParams;
  const { session, workspace } = await requireMemberOperationsContext();
  const locale = resolveDisplayLocale(workspace.settings?.locale),
    timezone = workspace.location.timezone;
  const occurrence =
    query?.classTemplateId && query.date
      ? { classTemplateId: query.classTemplateId, date: query.date }
      : undefined;
  if (
    !!query?.classTemplateId !== !!query?.date ||
    !!query?.beforeAt !== !!query?.beforeId ||
    !!query?.historyAt !== !!query?.historyId
  )
    notFound();
  const actor = {
    workspaceId: workspace.id,
    userId: session.userId,
    ...(occurrence ? { occurrence } : {}),
  };
  let view, history;
  try {
    view = await getMemberOperations(actor, memberId, {
      ...(query?.beforeAt && query.beforeId
        ? { before: { createdAt: query.beforeAt, id: query.beforeId } }
        : {}),
    });
    if (query?.history)
      history = await getMemberOperationsHistory(actor, {
        memberId,
        ...(query.history === "all" ? {} : { recordKey: query.history }),
        ...(query.historyAt && query.historyId
          ? { before: { createdAt: query.historyAt, id: query.historyId } }
          : {}),
      });
  } catch (error) {
    if (error instanceof MemberOperationsError) notFound();
    throw error;
  }
  const scope = { memberId, ...(occurrence ?? {}) };
  const operationIds = Object.fromEntries(
    [
      "newNote",
      "newTag",
      ...view.notes.map((note) => note.recordKey),
      ...view.tags.map((tag) => tag.recordKey),
      ...(view.legacy?.unclassifiedTags.map((label) => `legacy:${label}`) ??
        []),
    ].map((key) => [key, randomUUID()]),
  );
  const historyQuery = new URLSearchParams({
    ...(occurrence ?? {}),
    history: query?.history ?? "all",
  });
  const historyHref = `/dashboard/members/${memberId}/operations?${historyQuery}`;
  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Members"
      title={`Operations · ${view.memberName}`}
      description="Internal class notes and labels, with current visibility and attributable history."
      actions={
        <Link
          className="button button-secondary"
          href={
            occurrence
              ? `/dashboard/schedule/${occurrence.classTemplateId}/roster?date=${occurrence.date}`
              : `/dashboard/members/${memberId}`
          }
        >
          {occurrence ? "Back to roster" : "Back to member"}
        </Link>
      }
    >
      <MemberOperationsPanel
        view={view}
        scope={scope}
        operationIds={operationIds}
        noteKey={`note:${randomUUID()}`}
        locale={locale}
        timezone={timezone}
      />
      {history ? (
        <section
          className="management-card"
          aria-labelledby="member-operations-history-title"
        >
          <h2 id="member-operations-history-title">
            Internal operations history
          </h2>
          {history.items.length ? (
            <ol className="stack-list">
              {history.items.map((row) => (
                <li
                  key={`${row.recordKey}:${row.version}`}
                  className="stack-item"
                >
                  <div>
                    <strong>
                      {row.action === "RETRACT"
                        ? "Retracted"
                        : row.action === "AMEND"
                          ? "Corrected"
                          : row.action === "CLASSIFY"
                            ? "Legacy visibility reviewed"
                            : "Added"}{" "}
                      {row.recordKind === "NOTE"
                        ? "note"
                        : row.tagPurpose === "COHORT_ELIGIBILITY"
                          ? "eligibility tag"
                          : "operational label"}
                    </strong>
                    <p>
                      {row.actorName} ·{" "}
                      <time dateTime={row.createdAt}>
                        {new Intl.DateTimeFormat(locale, {
                          timeZone: timezone,
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(row.createdAt))}
                      </time>{" "}
                      ·{" "}
                      {row.visibility === "OWNER_ONLY"
                        ? "Owner only"
                        : "Assigned class staff"}
                    </p>
                    {row.noteBody ? (
                      <p
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {row.noteBody}
                      </p>
                    ) : null}
                    {row.tagLabel ? <p>{row.tagLabel}</p> : null}
                    {row.reason ? <p>Reason: {row.reason}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p>No history is recorded for this selection.</p>
          )}
          {history.nextCursor ? (
            <Link
              className="button button-secondary"
              href={`${historyHref}&historyAt=${encodeURIComponent(history.nextCursor.createdAt)}&historyId=${encodeURIComponent(history.nextCursor.id)}`}
            >
              Older history
            </Link>
          ) : null}
        </section>
      ) : null}
    </AdminShell>
  );
}
