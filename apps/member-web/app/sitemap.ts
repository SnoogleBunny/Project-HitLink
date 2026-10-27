import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
import { prisma } from "@flowstate/db";
import { publicMemberOrigin } from "../lib/gym-website";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> { const websites = await prisma.workspaceWebsite.findMany({ where: { publishedAt: { not: null }, workspace: { status: "ACTIVE" } }, select: { slug: true, publishedAt: true } }); return websites.flatMap((website) => ["", "/memberships"].map((suffix) => ({ url: `${publicMemberOrigin()}/gym/${website.slug}${suffix}`, lastModified: website.publishedAt ?? undefined }))); }
