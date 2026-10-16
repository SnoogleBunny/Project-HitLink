import { describe, expect, it, vi } from "vitest";
const { website } = vi.hoisted(() => ({ website: vi.fn() }));
vi.mock("@flowstate/db", () => ({ prisma: { workspaceWebsite: { findUnique: website } } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); }, redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import Page from "./page";
import { createTrialBookingAction } from "./actions";
describe("legacy public trial route", () => {
  it("redirects to the published verified journey", async () => {
    website.mockResolvedValue({ slug: "muay-thai", publishedAt: new Date(), workspace: { status: "ACTIVE" } });
    await expect(Page({ params: Promise.resolve({ workspaceId: "gym" }) })).rejects.toThrow("redirect:/gym/muay-thai/trial");
  });
  it("does not expose unpublished registration", async () => {
    website.mockResolvedValue({ slug: "draft", publishedAt: null, workspace: { status: "ACTIVE" } });
    await expect(Page({ params: Promise.resolve({ workspaceId: "gym" }) })).rejects.toThrow("not found");
  });
  it("rejects the old unverified booking action", async () => {
    expect(await createTrialBookingAction({ error: null, confirmation: null }, new FormData())).toEqual({ error: expect.stringContaining("verify your email"), confirmation: null });
  });
});
