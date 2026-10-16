import { notFound, redirect } from "next/navigation";
import { prisma } from "@flowstate/db";
export default async function LegacyTrialPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const website = await prisma.workspaceWebsite.findUnique({ where: { workspaceId }, select: { slug: true, publishedAt: true, workspace: { select: { status: true } } } });
  if (!website?.publishedAt || website.workspace.status !== "ACTIVE") notFound();
  redirect(`/gym/${encodeURIComponent(website.slug)}/trial`);
}
