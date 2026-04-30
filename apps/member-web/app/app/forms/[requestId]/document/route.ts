import { notFound } from "next/navigation";
import { requireMemberPortalContext } from "../../../../../lib/member-auth";
import { getPortalFormRequestPageData } from "../../../../../lib/forms";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      requestId: string;
    }>;
  },
) {
  const { requestId } = await params;
  const context = await requireMemberPortalContext();
  const requestData = await getPortalFormRequestPageData({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    requestId,
  });

  if (!requestData) {
    notFound();
  }

  return new Response(Buffer.from(requestData.fileData), {
    headers: {
      "Content-Type": requestData.mimeType,
      "Content-Disposition": `inline; filename="${requestData.fileName}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

