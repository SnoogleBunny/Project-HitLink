import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  onboardingAction: vi.fn(),
}));

vi.mock("../_components/submit-button", () => ({
  SubmitButton: ({ children }: React.PropsWithChildren) => (
    <button type="submit">{children}</button>
  ),
}));

import { OnboardingForm } from "./onboarding-form";

describe("OnboardingForm migration planning copy", () => {
  it("uses commercially neutral planning language", () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    const html = renderToStaticMarkup(
      <OnboardingForm defaultTimezone="America/Vancouver" />,
    );

    expect(html).toContain("Migration planning details");
    expect(html).toContain(
      "Optional. These details help Flowstate plan your migration.",
    );
    expect(html).toContain("Preferred go-live date");
    expect(html).not.toContain("Pricing and scope details");
    expect(html).not.toContain("quoting the migration service");
    expect(html).not.toContain("Included");
  });
});
