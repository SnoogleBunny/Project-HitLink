import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@flowstate/db", () => ({ prisma: {} }));
import { parseWebsiteCompletion, websiteCompletionUrl } from "./completion";
import { readWebsiteCompletionNotice } from "./completion-notice";
const query = { websiteResult: "saved", version: "2", publicVersion: "1" };
const publicationQuery = { websiteResult: "published", version: "1", publicVersion: "1" };
const actor = { workspaceId: "owned-workspace", userId: "current-owner" };
const snapshot = { title: "Reviewed public gym", offers: [{ monthlyPriceCents: 14900, weeklyClassLimit: 3 }] };
const findFirst = vi.fn(); const db = { workspaceWebsite: { findFirst } };
function head(change: Record<string, unknown> = {}) {
  return { draftVersion: 2, publishedVersion: 1, publishedAt: new Date(), published: snapshot, publications: [{ version: 1, snapshot }], workspace: { status: "ACTIVE" }, ...change };
}
beforeEach(() => { findFirst.mockReset(); });
describe("version-bound website completion feedback", () => {
  it("does not show success from a query when the owned database head is absent", async () => {
    findFirst.mockResolvedValue(null);
    expect(await readWebsiteCompletionNotice(actor, query, db as never)).toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: actor.workspaceId, workspace: { status: { not: "DISABLED" }, workspaceUsers: { some: { userId: actor.userId, role: "OWNER", isActive: true } } } }, select: expect.objectContaining({ workspace: { select: { status: true } } }) }));
  });
  it.each(["ACTIVE", "SETUP_INCOMPLETE"])("confirms only the exact saved draft and unchanged public version for %s", async (status) => {
    findFirst.mockResolvedValue(head({ workspace: { status } }));
    expect(await readWebsiteCompletionNotice(actor, query, db as never)).toBe("Draft saved. The public website has not changed.");
    findFirst.mockResolvedValue(head({ draftVersion: 3, workspace: { status } }));
    expect(await readWebsiteCompletionNotice(actor, query, db as never)).toBeNull();
    findFirst.mockResolvedValue(head({ publishedVersion: 2, workspace: { status } }));
    expect(await readWebsiteCompletionNotice(actor, query, db as never)).toBeNull();
  });
  it("confirms publicly visible content only with its exact immutable version and snapshot", async () => {
    findFirst.mockResolvedValue(head());
    expect(await readWebsiteCompletionNotice(actor, publicationQuery, db as never)).toBe("Published. Visitors now see this reviewed version.");
  });
  it("confirms a committed setup publication without claiming it is already public", async () => {
    findFirst.mockResolvedValue(head({ workspace: { status: "SETUP_INCOMPLETE" } }));
    const notice = await readWebsiteCompletionNotice(actor, publicationQuery, db as never);
    expect(notice).toBe("Published. This reviewed version will become public when your workspace is active.");
    expect(notice).not.toContain("Visitors now see");
  });
  it.each(["DISABLED", "UNKNOWN"])("denies success for a non-serving/non-setup status returned after the query: %s", async (status) => {
    findFirst.mockResolvedValue(head({ workspace: { status } }));
    expect(await readWebsiteCompletionNotice(actor, publicationQuery, db as never)).toBeNull();
    expect(await readWebsiteCompletionNotice(actor, query, db as never)).toBeNull();
  });
  it("uses the current database status on each GET rather than a status or result carried by the URL", async () => {
    findFirst.mockResolvedValue(head());
    expect(await readWebsiteCompletionNotice(actor, publicationQuery, db as never)).toContain("Visitors now see");
    findFirst.mockResolvedValue(head({ workspace: { status: "SETUP_INCOMPLETE" } }));
    expect(await readWebsiteCompletionNotice(actor, publicationQuery, db as never)).toBe("Published. This reviewed version will become public when your workspace is active.");
    findFirst.mockResolvedValue(head({ workspace: { status: "DISABLED" } }));
    expect(await readWebsiteCompletionNotice(actor, publicationQuery, db as never)).toBeNull();
  });
  it.each([
    { publications: [] }, { publications: [{ version: 1, snapshot: { title: "Other version" } }] },
  ])("requires the same immutable publication proof before staged feedback: %j", async (change) => {
    findFirst.mockResolvedValue(head({ workspace: { status: "SETUP_INCOMPLETE" }, ...change }));
    expect(await readWebsiteCompletionNotice(actor, publicationQuery, db as never)).toBeNull();
  });
  it.each([
    { publishedVersion: 2 }, { publishedAt: null }, { published: null }, { publications: [] },
    { publications: [{ version: 2, snapshot }] }, { publications: [{ version: 1, snapshot: { title: "Other version" } }] },
    { publications: [{ version: 1, snapshot }, { version: 1, snapshot }] },
  ])("rejects missing or mismatched canonical publication evidence: %j", async (change) => {
    findFirst.mockResolvedValue(head(change));
    expect(await readWebsiteCompletionNotice(actor, publicationQuery, db as never)).toBeNull();
  });
  it.each(["0", "-1", "01", "1.0", "1e0", "1junk", "9007199254740992", "Infinity"])("requires a strict positive integer version, rejecting %s without a query", async (version) => {
    expect(parseWebsiteCompletion({ ...query, version })).toBeNull();
    expect(await readWebsiteCompletionNotice(actor, { ...query, version }, db as never)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("rejects repeated query fields and a published version that differs from the claim", () => {
    expect(parseWebsiteCompletion({ ...query, version: ["1", "2"] })).toBeNull();
    expect(parseWebsiteCompletion({ websiteResult: "published", version: "2", publicVersion: "1" })).toBeNull();
  });
  it("keeps navigation local and carries only version numbers plus the active known tab", () => {
    const url = websiteCompletionUrl({ kind: "saved", version: 2, publicVersion: 1 }, "#discovery");
    expect(url).toBe("/dashboard/website?websiteResult=saved&version=2&publicVersion=1#discovery");
    expect(websiteCompletionUrl({ kind: "published", version: 2, publicVersion: 2 }, "https://external.example.test/private")).toMatch(/#pricing$/);
    expect(url).not.toMatch(/session|owner|workspace|headline|description/);
    expect(() => websiteCompletionUrl({ kind: "saved", version: 0, publicVersion: null }, "#pricing")).toThrow();
  });
});
