import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSetupReview } from "@flowstate/db";
const mocks = vi.hoisted(() => ({ state: vi.fn(), action: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: mocks.state,
}));
vi.mock("./actions", () => ({ workspaceSetupAction: mocks.action }));
import { SetupForm } from "./form";
function render(review: WorkspaceSetupReview | null) {
  mocks.state.mockReturnValue([
    { error: null, message: null, review },
    () => {},
    false,
  ]);
  return renderToStaticMarkup(
    <SetupForm ownerEmail="owner@example.test" ownerVerified={false} />,
  );
}
const review: WorkspaceSetupReview = {
  version: 4,
  snapshotHash: "a".repeat(64),
  ok: true,
  errors: [],
  snapshot: {
    businessName: "Virtual coaching",
    businessType: null,
    serviceMode: "COACHING",
    timezone: "UTC",
    currency: "cad",
    locale: "en-CA",
    contactEmail: "owner@example.test",
    address: [],
    ownerUserIds: ["owner"],
    onlinePaymentsReady: false,
    configuredPrograms: 0,
    configuredRooms: 0,
    configuredCoachingTemplates: 0,
  },
};
describe("new-business setup review", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
  });
  it("requires fresh verification and review before offering activation", () => {
    const html = render(null);
    expect(html).toContain("last 15 minutes");
    expect(html).toContain("expires after 30 minutes");
    expect(html).toContain("Request owner verification");
    expect(html).not.toContain("Activate new business");
  });
  it("allows an empty virtual coaching catalog with truthful provider status and unchecked explicit consent", () => {
    const html = render(review);
    expect(html).toContain("Adult life coaching only");
    expect(html).toContain("0 programs, 0 rooms and 0 coaching templates");
    expect(html).toContain("Virtual business; no address published");
    expect(html).toContain(
      "Online payments are not connected. Activation does not enable charging.",
    );
    const checkbox = html.match(/<input[^>]*name="confirmSetup"[^>]*>/)?.[0];
    expect(checkbox).toContain('required=""');
    expect(checkbox).not.toContain("checked");
    expect(html).toContain('name="snapshotHash"');
    expect(html).toContain('value="4"');
  });
  it("shows server blockers and omits activation controls when the review is not ready", () => {
    const html = render({
      ...review,
      ok: false,
      errors: ["Verify owner email within 15 minutes."],
    });
    expect(html).toContain("Verify owner email within 15 minutes.");
    expect(html).not.toContain('name="confirmSetup"');
    expect(html).not.toContain("Activate new business");
  });
});
