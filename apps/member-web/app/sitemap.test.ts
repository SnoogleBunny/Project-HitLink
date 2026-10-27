import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@flowstate/db", () => ({
  prisma: { workspaceWebsite: { findMany } },
}));
vi.mock("../lib/gym-website", () => ({
  publicMemberOrigin: () => "http://localhost:3001",
}));

import sitemap, { dynamic } from "./sitemap";

describe("member website sitemap", () => {
  beforeEach(() => findMany.mockReset());

  it("reads newly published websites on subsequent runtime requests", async () => {
    const publishedAt = new Date("2026-10-25T10:00:00Z");
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { slug: "new-gym", publishedAt },
    ]);

    expect(dynamic).toBe("force-dynamic");
    expect(await sitemap()).toEqual([]);
    expect(await sitemap()).toEqual([
      { url: "http://localhost:3001/gym/new-gym", lastModified: publishedAt },
      {
        url: "http://localhost:3001/gym/new-gym/memberships",
        lastModified: publishedAt,
      },
    ]);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith({
      where: { publishedAt: { not: null }, workspace: { status: "ACTIVE" } },
      select: { slug: true, publishedAt: true },
    });
  });
});
