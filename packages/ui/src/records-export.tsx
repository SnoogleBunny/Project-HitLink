"use client";

import { useActionState } from "react";
import { Badge } from "./primitives";
import { useWorkspaceLocale } from "./workspace-locale";

export interface RecordsExportState {
  error: string | null;
  success?: string;
}
export interface RecordsExportJob {
  id: string;
  state: string;
  sha256: string | null;
  byteCount: number | null;
  createdAt: string;
  expiresAt: string;
  downloadedAt: string | null;
  receiptConfirmedAt: string | null;
  failureMessage: string | null;
  resolverName: string;
}
export interface RecordsExportPanelProps {
  scope: "MEMBER" | "PAYER";
  targetId: string;
  name: string;
  requestId: string;
  jobs: RecordsExportJob[];
  downloadBase: string;
  timezone: string;
  action: (
    previous: RecordsExportState,
    data: FormData,
  ) => Promise<RecordsExportState>;
}
function Receipt({
  job,
  action,
}: {
  job: RecordsExportJob;
  action: RecordsExportPanelProps["action"];
}) {
  const [state, submit, pending] = useActionState(action, { error: null });
  return (
    <form action={submit} className="form-stack">
      <input type="hidden" name="intent" value="receipt" />
      <input type="hidden" name="exportId" value={job.id} />
      <label className="field">
        <span>Archive SHA-256</span>
        <input
          name="checksum"
          required
          minLength={64}
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`checksum-help-${job.id}`}
        />
      </label>
      <p id={`checksum-help-${job.id}`}>
        Compare the downloaded file’s SHA-256 with the value above, then paste
        it here.
      </p>
      <label className="checkbox-field">
        <input type="checkbox" name="reviewed" required />I checked the archive
        and can read its records.
      </label>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p role="status">{state.success}</p> : null}
      <div>
        <button
          className="button button-secondary"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving receipt…" : "Confirm receipt"}
        </button>
      </div>
    </form>
  );
}
export function RecordsExportPanel({
  scope,
  targetId,
  name,
  requestId,
  jobs,
  downloadBase,
  timezone,
  action,
}: RecordsExportPanelProps) {
  const locale = useWorkspaceLocale();
  const [state, submit, pending] = useActionState(action, { error: null });
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  return (
    <section className="member-card management-card hl-records-export">
      <div>
        <p className="dashboard-card-label">
          {scope === "MEMBER" ? "Member record" : "Payer record"}
        </p>
        <h2>{name}</h2>
      </div>
      <p>
        {scope === "MEMBER"
          ? "Profile, accepted memberships and packs, classes, attendance, progress, and exact signed forms. This archive excludes payer financial records and other family members."
          : "Only this payer’s invoices, payments, refunds and monetary credits. People paid for are identified by name and record ID; their bookings, attendance and forms are excluded."}
      </p>
      <p>
        Coaching records have a separate download in the client’s Coaching page.
        Staff notes and private coaching content are excluded.
      </p>
      <form action={submit} className="form-stack">
        <input type="hidden" name="intent" value="create" />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="requestId" value={requestId} />
        {state.error ? (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.success ? <p role="status">{state.success}</p> : null}
        <div>
          <button className="button" disabled={pending} type="submit">
            {pending
              ? "Preparing archive…"
              : `Prepare ${scope === "MEMBER" ? "member" : "payer"} archive`}
          </button>
        </div>
      </form>
      <p>
        The download is a compressed JSON file with CSV copies, a data
        dictionary and file checksums. It expires after 24 hours. Access is
        checked again when you download it.
      </p>
      {jobs.length ? (
        <div className="hl-records-list">
          {jobs.map((job) => {
            const label =
              job.state === "READY"
                ? job.receiptConfirmedAt
                  ? "Receipt confirmed"
                  : job.downloadedAt
                    ? "Downloaded"
                    : "Ready"
                : job.state === "FAILED"
                  ? "Needs review"
                  : job.state === "EXPIRED"
                    ? "Expired"
                    : "Preparing";
            return (
              <article className="hl-records-job" key={job.id}>
                <div className="hl-records-heading">
                  <h3>{dateTime(job.createdAt)}</h3>
                  <Badge>{label}</Badge>
                </div>
                <p>
                  Records contact: {job.resolverName}. If this archive fails,
                  ask them to review it before preparing another.
                </p>
                {job.state === "FAILED" ? (
                  <p role="alert">
                    {job.failureMessage ?? "The archive could not be prepared."}
                  </p>
                ) : null}
                {job.state === "EXPIRED" ? (
                  <p>
                    This temporary archive expired. Prepare a new one to
                    download current records.
                  </p>
                ) : null}
                {job.state === "READY" ? (
                  <>
                    <p>
                      Available until {dateTime(job.expiresAt)} ({timezone}) ·{" "}
                      {Math.max(1, Math.ceil((job.byteCount ?? 0) / 1024))} KB
                    </p>
                    <p style={{ overflowWrap: "anywhere" }}>
                      SHA-256: <code>{job.sha256}</code>
                    </p>
                    <div>
                      <a
                        className="button button-secondary"
                        href={`${downloadBase}/${job.id}`}
                      >
                        Download archive
                      </a>
                    </div>
                    {!job.receiptConfirmedAt ? (
                      <Receipt job={job} action={action} />
                    ) : (
                      <p>
                        Receipt confirmed. Keep your downloaded copy in a secure
                        place.
                      </p>
                    )}
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p>No archives prepared yet.</p>
      )}
    </section>
  );
}
