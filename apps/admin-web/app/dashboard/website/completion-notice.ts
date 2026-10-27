import { isDeepStrictEqual } from "node:util";
import { prisma } from "@flowstate/db";
import { parseWebsiteCompletion, type WebsiteCompletionQuery } from "./completion";

/** Query values select a claim to check; they never establish that it happened. */
export async function readWebsiteCompletionNotice(actor: { workspaceId: string; userId: string }, query: WebsiteCompletionQuery, db: typeof prisma = prisma) {
  const completion = parseWebsiteCompletion(query);
  if (!completion) return null;
  const website = await db.workspaceWebsite.findFirst({
    where: { workspaceId: actor.workspaceId, workspace: { status: { not: "DISABLED" }, workspaceUsers: { some: { userId: actor.userId, role: "OWNER", isActive: true } } } },
    select: { draftVersion: true, publishedVersion: true, publishedAt: true, published: true, workspace: { select: { status: true } },
      publications: { where: { workspaceId: actor.workspaceId, version: completion.version }, take: 2, select: { version: true, snapshot: true } } },
  });
  if (!website || (website.workspace.status !== "ACTIVE" && website.workspace.status !== "SETUP_INCOMPLETE") || website.publishedVersion !== completion.publicVersion) return null;
  if (completion.kind === "saved") return website.draftVersion === completion.version ? "Draft saved. The public website has not changed." : null;
  const publication = website.publications[0];
  if (!website.publishedAt || website.publishedVersion !== completion.version || website.publications.length !== 1 || publication?.version !== completion.version || !website.published || !isDeepStrictEqual(publication.snapshot, website.published)) return null;
  return website.workspace.status === "ACTIVE"
    ? "Published. Visitors now see this reviewed version."
    : "Published. This reviewed version will become public when your workspace is active.";
}
