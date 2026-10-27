import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), events: vi.fn() }));
vi.mock("../../../lib/member-auth", () => ({ requireMemberPortalContext: mocks.context }));
vi.mock("@flowstate/db", () => ({ prisma: { accountSecurityEvent: { findMany: mocks.events } } }));
vi.mock("../../_components/gym-contact", () => ({ GymContact: ({ workspaceId }: { workspaceId: string }) => <section data-gym={workspaceId}>Gym contact</section> }));
vi.mock("../../actions/logout", () => ({ logoutAction: "/logout" }));
vi.mock("./security-actions", () => ({ signOutAllAction: "/sign-out-all" }));
import AccountPage from "./page";
beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ session: { userId: "signed-in-parent", displayName: "Parent", email: "parent@example.test" }, workspace: { id: "gym", name: "Gym" }, location: { timezone: "UTC" }, member: { id: "account-member" }, authorizedMembers: [{ id: "account-member", fullName: "Parent" }, { id: "child", fullName: "Child" }] });
  mocks.events.mockResolvedValue([{ id: "event", kind: "PASSWORD_RESET_COMPLETED", createdAt: new Date("2030-01-01T12:00:00Z"), revokedSessionCount: 2 }]);
});
describe("member account security", () => {
  it("queries the authenticated account's security history independently of family selection", async () => {
    const html = renderToStaticMarkup(await AccountPage());
    expect(mocks.context).toHaveBeenCalledWith({ scope: "account" });
    expect(mocks.events).toHaveBeenCalledWith({ where: { userId: "signed-in-parent" }, select: { id: true, kind: true, createdAt: true, revokedSessionCount: true }, orderBy: { createdAt: "desc" }, take: 10 });
    expect(html).toContain("2 sessions signed out"); expect(html).toContain('href="/forgot-password"');
    expect(html).toContain('name="confirm"'); expect(html).toContain("Child"); expect(html).toContain('data-gym="gym"');
  });
  it("renders only known server error codes and never echoes arbitrary query text", async () => {
    const html = renderToStaticMarkup(await AccountPage({ searchParams: Promise.resolve({ error: "untrusted-message" }) }));
    expect(html).not.toContain("untrusted-message");
    expect(renderToStaticMarkup(await AccountPage({ searchParams: Promise.resolve({ error: "retry" }) }))).toContain("Sign-out could not be confirmed");
  });
});
