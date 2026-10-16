import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getPublishedGymWebsite } from "@flowstate/db";
import { PublicGymShell } from "../../../lib/gym-website";
import "./website.css";
export default async function GymLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) { const { slug } = await params; const website = await getPublishedGymWebsite(slug); if (!website) notFound(); return <PublicGymShell slug={slug} content={website.content}>{children}</PublicGymShell>; }
