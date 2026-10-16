import Link from "next/link";
import { getWorkspaceDataManagement } from "@flowstate/db";
import { Badge, Notice } from "@flowstate/ui";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { DataForm } from "./forms";
const when = (date: Date | null) => date?.toISOString() ?? "Not recorded";
export default async function DataPage() {
  const context = await requireOwnerWorkspaceContext();
  const data = await getWorkspaceDataManagement({
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  });
  const plan = data.plan;
  const version = (
    <input type="hidden" name="version" value={plan?.version ?? 0} />
  );
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Records and access"
      description="Download gym records, review an exit plan, or grant temporary support access."
    >
      <section className="management-card form-stack">
        <h2>Gym export</h2>
        <p>
          The compressed JSON archive contains linked records, CSV copies, a
          data dictionary, and exact signed-form files with checksums. Coaching
          content stays in the client’s own export; private notes and drafts are
          excluded.
        </p>
        <DataForm intent="export" label="Prepare export">
          <label className="field">
            <span>Purpose</span>
            <input
              className="input"
              name="purpose"
              required
              maxLength={1000}
              placeholder="For example, migration to another system"
            />
          </label>
        </DataForm>
        {data.exports.map((job) => (
          <div className="management-item form-stack" key={job.id}>
            <h3>{job.purpose}</h3>
            <p>
              <Badge>{job.state.replaceAll("_", " ")}</Badge> Created{" "}
              {when(job.createdAt)}
            </p>
            {job.failureMessage ? (
              <Notice tone="danger">{job.failureMessage}</Notice>
            ) : null}
            {job.state === "READY" ? (
              <>
                <a
                  className="text-link"
                  href={`/dashboard/settings/data/exports/${job.id}`}
                >
                  Download archive
                </a>
                <p>
                  Expires {when(job.expiresAt)}. SHA-256:{" "}
                  <code style={{ overflowWrap: "anywhere" }}>{job.sha256}</code>
                </p>
                <DataForm
                  intent="receipt"
                  label={
                    job.receiptConfirmedAt
                      ? "Confirm receipt again"
                      : "Confirm verified receipt"
                  }
                >
                  <input type="hidden" name="exportId" value={job.id} />
                  <label className="field">
                    <span>Archive checksum</span>
                    <input
                      className="input"
                      name="checksum"
                      required
                      minLength={64}
                      maxLength={64}
                    />
                  </label>
                  <label className="field-checkbox">
                    <input type="checkbox" name="confirmed" required /> I opened
                    this archive and checked representative household, booking,
                    payment and signed-form records.
                  </label>
                </DataForm>
              </>
            ) : null}
            {job.receiptConfirmedAt ? (
              <p>Receipt confirmed {when(job.receiptConfirmedAt)}.</p>
            ) : null}
          </div>
        ))}
      </section>
      <section className="management-card form-stack">
        <h2>Offboarding</h2>
        <p>
          Keep access available through all promised record-retrieval windows.
          Customer memberships must follow their accepted cancellation terms.
          This workflow verifies a stop; moving live billing to another provider
          requires a separately reconciled handover.
        </p>
        <Notice tone="warning">
          A retention review date does not delete records or backups. The named
          records contact must resolve holds and verify deletion separately.
          Missing platform subscription evidence remains under review, including
          free-pilot arrangements without an explicit billing policy.
        </Notice>
        <DataForm intent="plan" label="Save offboarding plan">
          {version}
          <label className="field">
            <span>Verified export</span>
            <select
              className="input"
              name="exportJobId"
              required
              defaultValue={plan?.exportJobId ?? ""}
            >
              <option value="">Choose an export</option>
              {data.exports
                .filter((job) => job.receiptConfirmedAt)
                .map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.purpose} — {when(job.createdAt)}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Access ends (ISO timestamp with timezone)</span>
            <input
              className="input"
              name="accessEndsAt"
              required
              defaultValue={plan?.accessEndsAt.toISOString()}
              placeholder="YYYY-MM-DDT00:00:00-08:00"
            />
          </label>
          <label className="field">
            <span>Retention review date (ISO timestamp)</span>
            <input
              className="input"
              name="retentionUntil"
              required
              defaultValue={plan?.retentionUntil.toISOString()}
            />
          </label>
          <label className="field">
            <span>Retention basis and record classes</span>
            <textarea
              className="input"
              name="retentionReason"
              required
              defaultValue={plan?.retentionReason}
              maxLength={1000}
            />
          </label>
          <label className="field">
            <span>Records contact</span>
            <input
              className="input"
              name="recordsContact"
              required
              defaultValue={plan?.recordsContact}
              maxLength={250}
            />
          </label>
          <label className="field">
            <span>Retention hold, if applicable</span>
            <textarea
              className="input"
              name="retentionHoldReason"
              defaultValue={plan?.retentionHoldReason ?? ""}
            />
          </label>
        </DataForm>
        {plan ? (
          <>
            <h3>Checks before access ends</h3>
            {data.blockers.length ? (
              <ul>
                {data.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : (
              <p>
                Current checks pass. They run again before access is revoked.
              </p>
            )}
            <DataForm intent="confirm" label="Confirm this plan">
              {version}
              <label className="field-checkbox">
                <input type="checkbox" name="confirmed" required /> I approve
                version {plan.version}, including the access end, export, and
                retention responsibilities.
              </label>
            </DataForm>
            <DataForm intent="platform" label="Verify platform subscription">
              <label className="field">
                <span>HitLink subscription ID</span>
                <input
                  className="input"
                  name="subscriptionId"
                  required
                  placeholder="sub_…"
                />
              </label>
            </DataForm>
            <DataForm
              intent="stop-platform"
              label="Stop or recheck HitLink billing"
            >
              {version}
            </DataForm>
            <DataForm intent="customers" label="Check customer renewal stops">
              {version}
            </DataForm>
            <DataForm intent="finalize" label="End gym access">
              {version}
              <label className="field-checkbox">
                <input type="checkbox" name="confirmed" required /> End access
                on or after the agreed date only if all checks pass.
              </label>
            </DataForm>
          </>
        ) : null}
      </section>
      <section className="management-card form-stack">
        <h2>Temporary support access</h2>
        <p>
          Grant a named account read-only diagnostics for up to 24 hours. It can
          see operational counts and statuses. It cannot impersonate anyone,
          change records, export data, or read notes, forms or payment details.
        </p>
        <DataForm intent="grant" label="Grant temporary access">
          <label className="field">
            <span>Support account ID</span>
            <input className="input" name="supportUserId" required />
          </label>
          <label className="field">
            <span>Purpose</span>
            <input className="input" name="purpose" required maxLength={1000} />
          </label>
          <label className="field">
            <span>Expires (ISO timestamp with timezone)</span>
            <input
              className="input"
              name="expiresAt"
              required
              placeholder="YYYY-MM-DDT15:00:00-07:00"
            />
          </label>
        </DataForm>
        {data.grants.map((grant) => (
          <div className="management-item form-stack" key={grant.id}>
            <h3>{grant.purpose}</h3>
            <p>
              {grant.revokedAt
                ? "Revoked"
                : grant.expiresAt <= new Date()
                  ? "Expired"
                  : "Active"}{" "}
              · {grant.supportUserId} · Ends {when(grant.expiresAt)}
            </p>
            <Link className="text-link" href={`/support/${grant.id}`}>
              Named support access link
            </Link>
            {!grant.revokedAt ? (
              <DataForm intent="revoke" label="Revoke access">
                <input type="hidden" name="grantId" value={grant.id} />
              </DataForm>
            ) : null}
            <ul>
              {grant.events.map((event) => (
                <li key={event.id}>
                  {when(event.createdAt)} — {event.action.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </AdminShell>
  );
}
