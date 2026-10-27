import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessSettingsInput } from "../../../../lib/business-settings";
const { actionState } = vi.hoisted(() => ({ actionState: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: actionState,
}));
vi.mock("./actions", () => ({ saveBusinessSettingsAction: vi.fn() }));
vi.mock("../../../records/[caseId]/actions", () => ({
  retentionAction: vi.fn(),
}));
import { BusinessSettingsForm } from "./form";
import { RetentionForm } from "../../../records/[caseId]/form";

const initial: BusinessSettingsInput = {
  name: "Fictional Gym",
  businessType: "Gym",
  contactEmail: "owner@example.test",
  contactPhone: "",
  currency: "cad",
  locale: "en-CA",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "CA",
};
beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  actionState.mockReturnValue([
    { error: null, success: null },
    "/local-test-action",
    false,
  ]);
});
describe.each([
  [
    "business settings",
    () => <BusinessSettingsForm initial={initial} version={7} currencyLocked />,
  ],
  [
    "retention",
    () => (
      <RetentionForm
        caseId="fixture-case"
        version={7}
        intent="hold"
        label="Record hold"
      />
    ),
  ],
] as const)("%s action feedback", (_name, component) => {
  it("keeps the initial form quiet and preserves its versioned submission fields", () => {
    const html = renderToStaticMarkup(component());
    expect(html).not.toMatch(/role="(?:alert|status)"/);
    expect(html).toContain('name="version" value="7"');
    expect(html).toContain('action="/local-test-action"');
  });
  it.each([
    [
      { error: "The current version changed.", success: null },
      "alert",
      "The current version changed.",
    ],
    [{ error: null, success: "Saved." }, "status", "Saved."],
  ] as const)("announces the returned outcome once", (state, role, message) => {
    actionState.mockReturnValue([state, "/local-test-action", false]);
    const html = renderToStaticMarkup(component());
    expect(html.match(new RegExp(`role="${role}"`, "g"))).toHaveLength(1);
    expect(html).toContain(message);
    expect(html).toContain('name="version" value="7"');
  });
});
