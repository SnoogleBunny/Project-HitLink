import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getPublishedGymWebsite, prisma } from "@flowstate/db";
import { WorkspaceLocaleProvider } from "@flowstate/ui";
import { PublicGymShell } from "../../../lib/gym-website";
import "./website.css";
export default async function GymLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const website = await getPublishedGymWebsite(slug);
  if (!website) notFound();
  const settings = await prisma.workspaceSetting.findUnique({
    where: { workspaceId: website.workspaceId },
    select: { locale: true },
  });
  return (
    <WorkspaceLocaleProvider locale={settings?.locale}>
      <PublicGymShell slug={slug} content={website.content}>
        {children}
      </PublicGymShell>
    </WorkspaceLocaleProvider>
  );
}
