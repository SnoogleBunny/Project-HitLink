import { downloadMemberDataExport } from "@flowstate/db";
import { requireMemberPortalContext } from "../../../../../../lib/member-auth";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const context = await requireMemberPortalContext({ scope: "account" });
  try {
    const archive = await downloadMemberDataExport(
      { workspaceId: context.workspace.id, userId: context.session.userId },
      (await params).exportId,
    );
    return new Response(new Uint8Array(archive.bytes), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${archive.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Archive-SHA256": archive.sha256,
      },
    });
  } catch {
    return new Response("These records are unavailable.", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
