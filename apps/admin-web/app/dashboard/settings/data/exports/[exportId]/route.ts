import { downloadWorkspaceDataExport, WorkspaceDataError } from "@flowstate/db";
import { requireOwnerWorkspaceContext } from "../../../../../../lib/owner-workspace";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const context = await requireOwnerWorkspaceContext();
  try {
    const result = await downloadWorkspaceDataExport(
      { workspaceId: context.workspace.id, userId: context.session.userId },
      (await params).exportId,
    );
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "X-Archive-SHA256": result.sha256,
      },
    });
  } catch (error) {
    return new Response(
      error instanceof WorkspaceDataError
        ? error.message
        : "Export unavailable.",
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
}
