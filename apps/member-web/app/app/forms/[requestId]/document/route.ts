import { notFound } from "next/navigation";
import { getAuthorizedPortalFormRequest } from "../../../../../lib/portal-form-context";

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
  const data = await getAuthorizedPortalFormRequest(requestId);
  if (!data) {
    notFound();
  }
  const requestData = data.request;

  return new Response(Buffer.from(requestData.fileData), {
    headers: {
      "Content-Type": requestData.mimeType,
      "Content-Disposition": `inline; filename="${requestData.fileName}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
