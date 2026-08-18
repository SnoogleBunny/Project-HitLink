import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { focusMock, getFormStateMock } = vi.hoisted(() => ({
  focusMock: vi.fn(),
  getFormStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useActionState: () => [getFormStateMock(), vi.fn()],
    useEffect: (effect: () => void) => effect(),
    useRef: () => ({ current: { focus: focusMock } }),
  };
});

vi.mock("../../../_components/submit-button", () => ({
  SubmitButton: ({ children }: { children: React.ReactNode }) => (
    <button className="button" type="submit">
      {children}
    </button>
  ),
}));

vi.mock("./actions", () => ({
  updateFailedPaymentGracePeriodAction: vi.fn(),
}));

import {
  BillingSettingsRecoveryAlert,
  GracePeriodForm,
} from "./grace-period-form";

describe("GracePeriodForm local recovery", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    focusMock.mockReset();
    getFormStateMock.mockReturnValue({});
  });

  it("keeps the local grace-period input and save action usable", () => {
    const html = renderToStaticMarkup(
      <GracePeriodForm failedPaymentGracePeriodDays={7} />,
    );

    expect(html).toContain('name="failedPaymentGracePeriodDays"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="60"');
    expect(html).toContain('step="1"');
    expect(html).toContain("Save grace period");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('role="alert"');
  });

  it("announces a server validation error, links it to the input, and moves focus to recovery", () => {
    getFormStateMock.mockReturnValue({
      error: "Grace period must be a whole number from 0 to 60 days.",
    });

    const html = renderToStaticMarkup(
      <GracePeriodForm failedPaymentGracePeriodDays={7} />,
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="grace-period-error"');
    expect(html).toContain('id="grace-period-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain(
      "Grace period must be a whole number from 0 to 60 days.",
    );
    expect(focusMock).toHaveBeenCalledTimes(1);
  });

  it("focuses and announces provider-action recovery copy", () => {
    const html = renderToStaticMarkup(
      <BillingSettingsRecoveryAlert message="Stripe is unavailable because STRIPE_SECRET_KEY is not configured." />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Stripe connection unavailable");
    expect(html).toContain(
      "Stripe is unavailable because STRIPE_SECRET_KEY is not configured.",
    );
    expect(focusMock).toHaveBeenCalledTimes(1);
  });

  it("inherits at least 44px controls without adding a billing-only visual system", () => {
    const css = readFileSync(
      new URL("../../../globals.css", import.meta.url),
      "utf-8",
    );

    expect(css).toMatch(/\.button\s*{[^}]*min-height:\s*3\.2rem;/s);
    expect(css).toMatch(
      /\.field input,[\s\S]*?\.field textarea\s*{[^}]*min-height:\s*3\.2rem;/s,
    );
  });
});
