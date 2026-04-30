import { notFound } from "next/navigation";
import { getMagicLinkFormRequestPageData } from "../../../../../lib/forms";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      token: string;
    }>;
  },
) {
  const { token } = await params;
  const requestData = await getMagicLinkFormRequestPageData({
    token,
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

