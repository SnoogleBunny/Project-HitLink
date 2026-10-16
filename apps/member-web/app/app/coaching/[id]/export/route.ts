import { exportCoachingRecords } from "@flowstate/db";
import { requireMemberPortalContext } from "../../../../../lib/member-auth";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireMemberPortalContext({ scope: "account" });
  const { id } = await params;
  const records = await exportCoachingRecords(
    { workspaceId: context.workspace.id, userId: context.session.userId },
    id,
  );
  return new Response(JSON.stringify(records, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": "attachment; filename=coaching-records.json",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
