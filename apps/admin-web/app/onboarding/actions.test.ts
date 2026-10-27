import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createOwnerWorkspaceOnboardingMock,
  redirectMock,
  requireOnboardingSessionMock,
} = vi.hoisted(() => ({
  createOwnerWorkspaceOnboardingMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
  requireOnboardingSessionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("../../lib/admin-access", () => ({
  emptyFormState: {
    error: null,
  },
  requireOnboardingSession: requireOnboardingSessionMock,
}));

vi.mock("../../lib/onboarding", () => ({
  createOwnerWorkspaceOnboarding: createOwnerWorkspaceOnboardingMock,
}));

import { onboardingAction } from "./actions";

function buildFormData() {
  const formData = new FormData();
  formData.set("workspaceName", "Sahara Muay Thai");
  formData.set("businessType", "Muay Thai gym");
  formData.set("timezone", "America/Vancouver");
  formData.set("addressLine1", "123 Main Street");
  formData.set("city", "Vancouver");
  formData.set("region", "BC");
  formData.set("postalCode", "V6B 1A1");
  formData.set("countryCode", "ca");
  formData.set("currentSoftware", "Zen Planner");
  formData.set("targetGoLiveDate", "2026-06-15");
  formData.set("memberCountEstimate", "125");
  formData.set("billingStatus", "Active subscriptions");
  formData.set("scheduleComplexity", "Seven days a week");
  formData.set("formsAndWaivers", "Adult and child waivers");
  formData.append("dataScope", "Members and contact details");
  formData.append("dataScope", "Programs and weekly schedule");
  formData.set("accessInstructions", "Exports are ready.");

  return formData;
}

describe("onboardingAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOnboardingSessionMock.mockResolvedValue({
      userId: "user_1",
      email: "owner@example.com",
      displayName: "Dana Owner",
      workspaceId: null,
      role: null,
    });
  });

  it("returns only the inline error and logs the blocked inactive membership", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    createOwnerWorkspaceOnboardingMock.mockResolvedValue({
      status: "blocked",
      message:
        "This account is already linked to a workspace membership that isn't active. A new workspace can’t be created with this account right now. Contact support or use a different email.",
      workspaceUserId: "workspace_user_1",
      isActive: false,
    });

    await expect(
      onboardingAction(
        {
          error: null,
        },
        buildFormData(),
      ),
    ).resolves.toEqual({
      error:
        "This account is already linked to a workspace membership that isn't active. A new workspace can’t be created with this account right now. Contact support or use a different email.",
    });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledExactlyOnceWith({
      event: "owner_onboarding_blocked_inactive_membership",
      reason: "inactive-membership",
    });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toMatch(/owner@example.com|user_1|workspace_user_1/);

    warnSpy.mockRestore();
  });

  it("redirects to migration status when the workspace is created", async () => {
    createOwnerWorkspaceOnboardingMock.mockResolvedValue({
      status: "created",
      workspaceId: "workspace_1",
    });

    await expect(
      onboardingAction(
        {
          error: null,
        },
        buildFormData(),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard/migration");

    expect(redirectMock).toHaveBeenCalledWith("/dashboard/migration");
    expect(createOwnerWorkspaceOnboardingMock).toHaveBeenCalledWith({
      input: expect.objectContaining({
        workspaceName: "Sahara Muay Thai",
        migration: {
          currentSoftware: "Zen Planner",
          targetGoLiveDate: "2026-06-15",
          memberCountEstimate: "125",
          billingStatus: "Active subscriptions",
          scheduleComplexity: "Seven days a week",
          formsAndWaivers: "Adult and child waivers",
          dataScope: [
            "Members and contact details",
            "Programs and weekly schedule",
          ],
          accessInstructions: "Exports are ready.",
        },
      }),
    });
  });

  it("redirects to the returned location when onboarding is already complete", async () => {
    createOwnerWorkspaceOnboardingMock.mockResolvedValue({
      status: "redirect",
      location: "/dashboard",
      workspaceId: "workspace_1",
    });

    await expect(
      onboardingAction(
        {
          error: null,
        },
        buildFormData(),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("creates a clean coaching setup from the current owner without legacy fields or posted actor authority", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      onboardingKind: "NEW_BUSINESS",
      workspaceName: "Virtual coaching",
      timezone: "UTC",
      serviceMode: "COACHING",
      currency: "cad",
      locale: "en-CA",
      contactEmail: "owner@example.test",
      userId: "forged-owner",
    }))
      form.set(key, value);
    createOwnerWorkspaceOnboardingMock.mockResolvedValue({
      status: "created",
      workspaceId: "new-business",
    });
    await expect(onboardingAction({ error: null }, form)).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/setup",
    );
    expect(createOwnerWorkspaceOnboardingMock).toHaveBeenCalledWith({
      input: expect.objectContaining({
        userId: "user_1",
        kind: "NEW_BUSINESS",
        serviceMode: "COACHING",
        workspaceName: "Virtual coaching",
        timezone: "UTC",
        currency: "cad",
        locale: "en-CA",
        contactEmail: "owner@example.test",
      }),
    });
  });

  it("rejects unsupported new-business configuration before any workspace is written", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      onboardingKind: "NEW_BUSINESS",
      workspaceName: "Virtual coaching",
      timezone: "UTC",
      serviceMode: "COACHING",
      currency: "",
      locale: "en-CA",
      contactEmail: "owner@example.test",
    }))
      form.set(key, value);
    expect((await onboardingAction({ error: null }, form)).error).toContain(
      "currency",
    );
    expect(createOwnerWorkspaceOnboardingMock).not.toHaveBeenCalled();
    form.set("workspaceName", "");
    expect(await onboardingAction({ error: null }, form)).toEqual({
      error: "Business name and timezone are required.",
    });
  });

  it("does not read a session email accessor when logging the expected inactive-membership outcome", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const email = vi.fn(() => { throw new Error("PRIVATE_SESSION_EMAIL"); });
    requireOnboardingSessionMock.mockResolvedValue(Object.defineProperty({ userId: "PRIVATE_ACTOR_ID" }, "email", { get: email }));
    createOwnerWorkspaceOnboardingMock.mockResolvedValue({ status: "blocked", message: "Contact support before creating another workspace.", workspaceUserId: "PRIVATE_MEMBERSHIP_ID", isActive: false });
    try {
      expect(await onboardingAction({ error: null }, buildFormData())).toEqual({ error: "Contact support before creating another workspace." });
      expect(email).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledExactlyOnceWith({ event: "owner_onboarding_blocked_inactive_membership", reason: "inactive-membership" });
      expect(JSON.stringify(warn.mock.calls)).not.toContain("PRIVATE_");
      expect(redirectMock).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it("returns the same blocked inline response when its diagnostic sink fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => { throw new Error("PRIVATE_LOG_SINK"); });
    createOwnerWorkspaceOnboardingMock.mockResolvedValue({ status: "blocked", message: "Contact support before creating another workspace.", workspaceUserId: "workspace_user_1", isActive: false });
    try {
      expect(await onboardingAction({ error: null }, buildFormData())).toEqual({ error: "Contact support before creating another workspace." });
      expect(redirectMock).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });
});
