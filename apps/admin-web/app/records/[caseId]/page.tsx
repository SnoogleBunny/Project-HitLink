import { getWorkspaceRetentionCase, WorkspaceDataError } from "@flowstate/db";
import { Notice } from "@flowstate/ui";
import { redirect, notFound } from "next/navigation";
import { getSessionOrNull } from "../../../lib/admin-access";
import { RetentionForm } from "./form";
export const metadata = {
  title: "Retained records",
  robots: { index: false, follow: false },
};
export default async function RecordsCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const caseId = (await params).caseId;
  let data;
  try {
    data = await getWorkspaceRetentionCase(session.userId, caseId);
  } catch (error) {
    if (error instanceof WorkspaceDataError) notFound();
    throw error;
  }
  const { record, blockers, approvals, inventory, external } = data;
  const props = { caseId, version: record.version };
  const owner = record.ownerUserIds.includes(session.userId),
    custodian = record.custodianUserId === session.userId;
  return (
    <main className="records-shell">
      <section className="management-card form-stack">
        <h1>Retained records</h1>
        <p>
          Case version {record.version} ·{" "}
          {record.state.replaceAll("_", " ").toLowerCase()}
        </p>
        <p>
          Gym ID: <code>{record.workspaceId}</code>
        </p>
        <p>
          Database removal: {record.retentionAt.toISOString()}. Earliest backup
          removal: {record.backupDeletionAfter.toISOString()}.
        </p>
        <p>{record.retentionBasis}</p>
        <p>
          Records custodian: {record.custodianUserId}. Backup custodian:{" "}
          {record.backupCustodianUserId}.
        </p>
        <p>
          Owner approvals:{" "}
          {record.ownerUserIds.filter((id) => approvals.includes(id)).length} of{" "}
          {record.ownerUserIds.length}.
        </p>
        {record.holdReason ? (
          <Notice tone="warning">On hold: {record.holdReason}</Notice>
        ) : null}
        {blockers.length ? (
          <>
            <h2>Before removal</h2>
            <ul>
              {blockers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : null}
        {!record.executedAt && owner ? (
          <>
            <RetentionForm
              {...props}
              intent="approve"
              label="Approve this version"
            />
            <details>
              <summary>Change dates or responsibilities</summary>
              <p>
                Saving creates a new version and requires approval from every
                owner again.
              </p>
              <RetentionForm
                {...props}
                intent="save"
                label="Save a new case version"
              >
                <input
                  type="hidden"
                  name="workspaceId"
                  value={record.workspaceId}
                />
                <label className="field">
                  <span>Records custodian account ID</span>
                  <input
                    className="input"
                    name="custodianUserId"
                    required
                    defaultValue={record.custodianUserId}
                  />
                </label>
                <label className="field">
                  <span>Backup custodian account ID</span>
                  <input
                    className="input"
                    name="backupCustodianUserId"
                    required
                    defaultValue={record.backupCustodianUserId}
                  />
                </label>
                <label className="field">
                  <span>Database removal date (ISO timestamp)</span>
                  <input
                    className="input"
                    name="retentionAt"
                    required
                    defaultValue={record.retentionAt.toISOString()}
                  />
                </label>
                <label className="field">
                  <span>Earliest backup removal date (ISO timestamp)</span>
                  <input
                    className="input"
                    name="backupDeletionAfter"
                    required
                    defaultValue={record.backupDeletionAfter.toISOString()}
                  />
                </label>
                <label className="field">
                  <span>Retention basis and record classes</span>
                  <textarea
                    className="input"
                    name="retentionBasis"
                    required
                    maxLength={1000}
                    defaultValue={record.retentionBasis}
                  />
                </label>
                <label className="field">
                  <span>Evidence resolving any hold</span>
                  <textarea
                    className="input"
                    name="holdResolutionEvidence"
                    maxLength={1000}
                    defaultValue={record.holdResolutionEvidence ?? ""}
                  />
                </label>
              </RetentionForm>
            </details>
          </>
        ) : null}
        {!record.executedAt && (owner || custodian) ? (
          <RetentionForm {...props} intent="hold" label="Place records on hold">
            <label className="field">
              <span>Hold reason</span>
              <textarea
                className="input"
                name="reason"
                required
                maxLength={1000}
              />
            </label>
          </RetentionForm>
        ) : null}
        {!record.executedAt && custodian && inventory ? (
          <>
            <h2>Database removal preview</h2>
            <p>
              This removes this gym’s records, stored form files, import files,
              and export archives. Global sign-in accounts and sessions remain
              for other gyms. The minimal authorization and removal receipt
              remains available here.
            </p>
            <details>
              <summary>Record counts</summary>
              <ul>
                {Object.entries(inventory.counts)
                  .filter(([, count]) => count)
                  .map(([name, count]) => (
                    <li key={name}>
                      {name}: {count}
                    </li>
                  ))}
              </ul>
            </details>
            {external?.objects.length ? (
              <>
                <h3>External files</h3>
                <p>
                  Remove these exact objects through the storage provider and
                  record its receipt. HitLink does not delete external storage
                  through this form.
                </p>
                <ul>
                  {external.objects.map((item) => (
                    <li key={item.id}>
                      <code>{item.storageKey}</code>
                    </li>
                  ))}
                </ul>
                <RetentionForm
                  {...props}
                  intent="external"
                  label="Record external storage receipt"
                >
                  <input
                    type="hidden"
                    name="inventoryHash"
                    value={external.fingerprint}
                  />
                  <label className="field">
                    <span>Provider removal receipt reference</span>
                    <input
                      className="input"
                      name="evidenceReference"
                      required
                      maxLength={1000}
                    />
                  </label>
                </RetentionForm>
              </>
            ) : null}
            {!blockers.length ? (
              <RetentionForm
                {...props}
                intent="remove"
                label="Remove this gym’s database records"
              >
                <input
                  type="hidden"
                  name="inventoryHash"
                  value={inventory.fingerprint}
                />
                <label className="field">
                  <span>
                    Type the exact gym ID to confirm irreversible database
                    removal
                  </span>
                  <input
                    className="input"
                    name="confirmedWorkspaceId"
                    required
                    autoComplete="off"
                  />
                </label>
              </RetentionForm>
            ) : null}
          </>
        ) : null}
        {record.receipt ? (
          <>
            <h2>Database receipt</h2>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {JSON.stringify(record.receipt, null, 2)}
            </pre>
          </>
        ) : null}
        {record.executedAt && !record.backupReceipt ? (
          <Notice tone="warning">
            Database removal is recorded. Backup removal is still awaiting a
            separate provider receipt.
          </Notice>
        ) : null}
        {record.executedAt &&
        !record.backupReceipt &&
        record.backupCustodianUserId === session.userId ? (
          <RetentionForm
            {...props}
            intent="backup"
            label="Record backup removal receipt"
          >
            <label className="field">
              <span>Gym ID covered by the receipt</span>
              <input className="input" name="confirmedWorkspaceId" required />
            </label>
            <label className="field">
              <span>Completed backup removal (ISO timestamp)</span>
              <input className="input" name="removedAt" required />
            </label>
            <label className="field">
              <span>
                Provider receipt reference covering this gym’s backups
              </span>
              <input
                className="input"
                name="evidenceReference"
                required
                maxLength={1000}
              />
            </label>
          </RetentionForm>
        ) : null}
        {record.backupReceipt ? (
          <>
            <h2>Backup receipt</h2>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {JSON.stringify(record.backupReceipt, null, 2)}
            </pre>
          </>
        ) : null}
      </section>
    </main>
  );
}
