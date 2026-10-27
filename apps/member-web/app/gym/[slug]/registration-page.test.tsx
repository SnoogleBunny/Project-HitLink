import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ forms: vi.fn(), site: vi.fn(), enrollment: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "fixture-registration" }) }) }));
vi.mock("@flowstate/auth", () => ({ MEMBER_SESSION_COOKIE_NAME: "member", getSession: async () => ({ userId: "account" }) }));
vi.mock("@flowstate/db", () => ({ getPublishedGymWebsite: mocks.site, getPublicEnrollment: mocks.enrollment, getPublicEnrollmentForms: mocks.forms, readPublicParticipant: () => ({ accountUserId: "account", fullName: "Trial participant", scheduledForDate: "2030-01-07" }), prisma: {} }));
vi.mock("../../../lib/trial-booking", () => ({ listTrialBookingOptions: vi.fn() }));
vi.mock("./registration-form", () => ({ RegistrationActionForm: ({ step, label, children }: React.PropsWithChildren<{ step: string; label: string }>) => <form data-step={step}>{children}<button>{label}</button></form>, RegistrationDetails: () => null, RegistrationStepFocus: () => null, RefreshRegistrationForms: () => <button>Check signed forms</button> }));
import PublicRegistrationPage from "./registration-page";
beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  mocks.site.mockResolvedValue({ workspaceId: "gym", content: { title: "Gym", contactEmail: "gym@example.test", offers: [] } });
  mocks.enrollment.mockResolvedValue({ id: "enrollment", kind: "TRIAL", status: "VERIFIED", verifiedAt: new Date(), memberId: "participant" });
});
describe("trial registration current-form consent", () => {
  it("shows signing and refresh before booking when the current form is unsigned", async () => {
    mocks.forms.mockResolvedValue([{ name: "Current waiver", version: 2, signed: false, requestId: "request" }]);
    const html = renderToStaticMarkup(await PublicRegistrationPage({ slug: "gym", kind: "TRIAL" }));
    expect(html).toContain("Sign the current required forms"); expect(html).toContain('href="/app/forms/request"');
    expect(html).toContain("Check signed forms"); expect(html).not.toContain('data-step="book"');
  });
  it("offers the booking action after all current signatures are complete", async () => {
    mocks.forms.mockResolvedValue([{ name: "Current waiver", version: 2, signed: true, requestId: null }]);
    const html = renderToStaticMarkup(await PublicRegistrationPage({ slug: "gym", kind: "TRIAL" }));
    expect(html).toContain('data-step="book"'); expect(html).toContain("All current required forms are signed");
  });
});
