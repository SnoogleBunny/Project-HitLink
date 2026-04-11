import { notFound } from "next/navigation";
import { getFormVersionFileForOwner } from "../../../../../../../lib/forms";
import { requireOwnerWorkspaceContext } from "../../../../../../../lib/owner-workspace";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      formId: string;
      versionId: string;
    }>;
  },
) {
  const { formId, versionId } = await params;
  const { workspace } = await requireOwnerWorkspaceContext();
  const file = await getFormVersionFileForOwner({
    workspaceId: workspace.id,
    formDocumentId: formId,
    formVersionId: versionId,
  });

  if (!file) {
    notFound();
  }

  return new Response(Buffer.from(file.fileData), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${file.fileName}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
