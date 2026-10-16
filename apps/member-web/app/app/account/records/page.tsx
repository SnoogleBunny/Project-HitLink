import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getMemberDataOptions, listMemberDataExports } from "@flowstate/db";
import { RecordsExportPanel } from "@flowstate/ui";
import { MemberShell } from "../../../_components/member-shell";
import { requireMemberPortalContext } from "../../../../lib/member-auth";
import { memberRecordsAction } from "./actions";
export default async function MemberRecordsPage() {
  const context = await requireMemberPortalContext();
  const actor = {
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  };
  const options = await getMemberDataOptions(actor, context.member.id);
  const targets = [options.member, options.payer].filter(
    (target) => target !== null,
  );
  const panels = await Promise.all(
    targets.map(async (target) => ({
      target,
      jobs: await listMemberDataExports(actor, target),
    })),
  );
  return (
    <MemberShell
      context={context}
      title="Your records"
      description="Choose a member’s service record or your own payer record."
      actions={
        <Link className="text-link" href="/app/account">
          Back to account
        </Link>
      }
    >
      {!options.member ? (
        <section className="member-card">
          <h2>{context.member.fullName}’s member record</h2>
          <p>
            Downloading a child’s record requires verified signing access. Ask
            the gym to review your access. Booking or payment permission alone
            does not include signed records.
          </p>
        </section>
      ) : null}
      {!options.payer ? (
        <section className="member-card">
          <h2>Your payer record</h2>
          <p>
            No financial records are linked to your payer account yet. Ask the
            gym to review any older payments that are missing.
          </p>
        </section>
      ) : null}
      {panels.map(({ target, jobs }) => (
        <RecordsExportPanel
          key={`${target.scope}:${target.targetId}`}
          {...target}
          requestId={randomUUID()}
          timezone={context.location.timezone}
          jobs={jobs.map((job) => ({
            ...job,
            createdAt: job.createdAt.toISOString(),
            expiresAt: job.expiresAt.toISOString(),
            downloadedAt: job.downloadedAt?.toISOString() ?? null,
            receiptConfirmedAt: job.receiptConfirmedAt?.toISOString() ?? null,
          }))}
          action={memberRecordsAction}
          downloadBase="/app/account/records/download"
        />
      ))}
    </MemberShell>
  );
}
