import { beforeEach, describe, expect, it, vi } from "vitest";
const { redirectMock, requireContext, landing } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  requireContext: vi.fn(),
  landing: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("../../lib/member-auth", () => ({
  requireMemberPortalContext: requireContext,
}));
vi.mock("../../lib/portal-landing", () => ({ getPortalLanding: landing }));
import AppHomePage from "./page";
describe("member landing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireContext.mockResolvedValue({
      workspace: { id: "gym" },
      session: { userId: "adult-user" },
      member: { id: "selected-child" },
      accountMember: { id: "adult-member" },
      authorizedMembers: [{ id: "adult-member" }, { id: "verified-child" }],
    });
  });
  it("opens Classes for an authenticated gym account", async () => {
    landing.mockResolvedValue({ href: "/app/schedule", coachingHref: null });
    await expect(AppHomePage()).rejects.toThrow("REDIRECT:/app/schedule");
    expect(requireContext).toHaveBeenCalledWith({ scope: "account" });
    expect(landing).toHaveBeenCalledWith({
      workspaceId: "gym",
      userId: "adult-user",
      accountMemberId: "adult-member",
      authorizedMemberIds: ["adult-member", "verified-child"],
    });
  });
  it("opens the adult's coaching destination without borrowing the selected child's identity", async () => {
    landing.mockResolvedValue({
      href: "/app/coaching/own-program?view=notes",
      coachingHref: "/app/coaching/own-program?view=notes",
    });
    await expect(AppHomePage()).rejects.toThrow(
      "REDIRECT:/app/coaching/own-program?view=notes",
    );
  });
});
