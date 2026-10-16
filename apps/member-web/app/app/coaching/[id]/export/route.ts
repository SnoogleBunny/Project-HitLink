import {
  prepareCoachingRecordExport,
  downloadCoachingRecordExport,
} from "@flowstate/db";
import { requireMemberPortalContext } from "../../../../../lib/member-auth";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireMemberPortalContext({ scope: "account" });
  const { id } = await params;
  const actor = {
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  };
  const exportId =
    new URL(request.url).searchParams.get("exportId") ??
    (await prepareCoachingRecordExport(actor, id)).id;
  const archive = await downloadCoachingRecordExport(actor, id, exportId);
  return new Response(Buffer.from(archive.artifact), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": "attachment; filename=coaching-records.json",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-HitLink-Export-ID": archive.id,
      "X-HitLink-Checksum": archive.checksum,
    },
  });
}
