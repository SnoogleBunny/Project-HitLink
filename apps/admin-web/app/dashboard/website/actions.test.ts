import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), load: vi.fn(), save: vi.fn(), publish: vi.fn(), offer: vi.fn(), redirect: vi.fn(), revalidate: vi.fn() }));
vi.mock("../../../lib/owner-workspace", () => ({ requireOwnerWorkspaceContext: mocks.owner }));
vi.mock("@flowstate/db", () => ({ getOwnerGymWebsite: mocks.load, saveGymWebsiteDraft: mocks.save, publishGymWebsite: mocks.publish, websiteOfferFromPlan: mocks.offer, WebsiteError: class extends Error {} }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { WebsiteError } from "@flowstate/db";
import { publishWebsiteAction, publishWebsiteFallbackAction, saveWebsiteAction, saveWebsiteFallbackAction } from "./actions";
const idle = { error: null, success: null, completion: null };
function form() { const value = new FormData(); value.set("version", "12"); value.set("slug", "fictional-gym"); value.set("name-plan", "Typed plan name"); value.set("visible-plan", "on"); value.set("confirmed", "on"); value.set("section", "discovery"); return value; }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue({ workspace: { id: "workspace" }, session: { userId: "owner" } });
  mocks.load.mockResolvedValue({ plans: [{ id: "plan", name: "Operational name" }] });
  mocks.offer.mockImplementation((plan, display) => ({ id: plan.id, ...display, monthlyPriceCents: 14900 }));
  mocks.save.mockResolvedValue({ draftVersion: 13, publishedVersion: 9 });
  mocks.publish.mockResolvedValue({ draftVersion: 12, publishedVersion: 12 });
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`FICTIONAL_REDIRECT:${url}`); });
});
describe("website action completion contract", () => {
  it("returns the exact committed draft/public versions and retains the submitted stale-editor guard", async () => {
    const result = await saveWebsiteAction(idle, form());
    expect(result).toEqual({ error: null, success: null, completion: { kind: "saved", version: 13, publicVersion: 9 } });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith({ workspaceId: "workspace", userId: "owner" }, expect.objectContaining({ expectedVersion: 12, slug: "fictional-gym", content: expect.objectContaining({ offers: [expect.objectContaining({ name: "Typed plan name", monthlyPriceCents: 14900 })] }) }));
    expect(mocks.revalidate).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("takes the returned database version rather than inventing the next version from input", async () => {
    mocks.save.mockResolvedValue({ draftVersion: 21, publishedVersion: null });
    expect((await saveWebsiteAction(idle, form())).completion).toEqual({ kind: "saved", version: 21, publicVersion: null });
  });
  it("returns exact committed publication with explicit confirmation and no same-route revalidation", async () => {
    expect((await publishWebsiteAction(idle, form())).completion).toEqual({ kind: "published", version: 12, publicVersion: 12 });
    expect(mocks.publish).toHaveBeenCalledWith({ workspaceId: "workspace", userId: "owner" }, 12, true);
    expect(mocks.publish).toHaveBeenCalledTimes(1); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not manufacture publication consent when the checkbox is absent", async () => {
    const input = form(); input.delete("confirmed"); mocks.publish.mockRejectedValue(new WebsiteError("Review and confirm the operational terms."));
    const result = await publishWebsiteAction(idle, input);
    expect(mocks.publish).toHaveBeenCalledWith({ workspaceId: "workspace", userId: "owner" }, 12, false);
    expect(result).toMatchObject({ error: "Review and confirm the operational terms.", completion: null, success: null });
  });
  it.each(["saved", "published"] as const)("returns a stale %s rejection without navigation, retry or success", async (kind) => {
    (kind === "saved" ? mocks.save : mocks.publish).mockRejectedValueOnce(new WebsiteError("This draft changed. Reload it before saving."));
    const result = await (kind === "saved" ? saveWebsiteAction : publishWebsiteAction)(idle, form());
    expect(result).toMatchObject({ error: "This draft changed. Reload it before saving.", completion: null, success: null });
    expect(mocks.save.mock.calls.length + mocks.publish.mock.calls.length).toBe(1);
    expect(mocks.redirect).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not call a mutation when owner resolution rejects the current request", async () => {
    const original = new Error("Owner session is unavailable"); mocks.owner.mockRejectedValueOnce(original);
    await expect(saveWebsiteAction(idle, form())).rejects.toBe(original);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(["saved", "published"] as const)("native %s fallback redirects only after the same authenticated command returns exact completion", async (kind) => {
    const invoke = kind === "saved" ? saveWebsiteFallbackAction : publishWebsiteFallbackAction;
    await expect(invoke(idle, form())).rejects.toThrow(/FICTIONAL_REDIRECT:\/dashboard\/website\?websiteResult=/);
    expect(mocks.redirect).toHaveBeenCalledWith(kind === "saved" ? "/dashboard/website?websiteResult=saved&version=13&publicVersion=9#discovery" : "/dashboard/website?websiteResult=published&version=12&publicVersion=12#discovery");
    expect(mocks.save.mock.calls.length + mocks.publish.mock.calls.length).toBe(1);
  });
  it("native fallback retains a bounded error instead of redirecting/replaying a stale command", async () => {
    mocks.save.mockRejectedValueOnce(new WebsiteError("This draft changed. Reload it before saving."));
    expect((await saveWebsiteFallbackAction(idle, form())).error).toContain("draft changed");
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
