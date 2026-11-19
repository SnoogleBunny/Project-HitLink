import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { formAction, startCheckoutMock, useActionStateMock } = vi.hoisted(() => ({
  formAction: "/start-punch-card-checkout-test",
  startCheckoutMock: vi.fn(),
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useActionState: useActionStateMock,
  };
});

vi.mock("./actions", () => ({
  startPunchCardCheckoutAction: startCheckoutMock,
}));

import { emptyMembershipActionState } from "../../form-states";
import { PunchCardPurchaseForm } from "./punch-card-purchase-form";

const products = [
  {
    id: "product_1",
    name: "10-class pack",
    description: "Ten visits",
    punchesIncluded: 10,
    priceCents: 25000,
    currency: "cad",
    restrictionSummary: "All active programs",
  },
];

const unavailableReason =
  "Online billing is not connected for this gym yet.";

describe("PunchCardPurchaseForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    useActionStateMock.mockReturnValue([
      emptyMembershipActionState,
      formAction,
    ]);
  });

  it("uses a native disabled purchase action with an adjacent explanation", () => {
    const html = renderToStaticMarkup(
      <PunchCardPurchaseForm
        products={products}
        purchaseUnavailableReason={unavailableReason}
      />,
    );
    const buyButton = html.match(/<button[^>]*>Buy punch card<\/button>/)?.[0];

    expect(buyButton).toContain('disabled=""');
    expect(buyButton).toContain(
      'aria-describedby="punch-card-purchase-unavailable"',
    );
    expect(html).toContain(
      `<p id="punch-card-purchase-unavailable" class="member-copy">${unavailableReason}</p>`,
    );
    expect(startCheckoutMock).not.toHaveBeenCalled();
  });

  it("keeps the fake-gateway-ready purchase action enabled", () => {
    const html = renderToStaticMarkup(
      <PunchCardPurchaseForm
        products={products}
        purchaseUnavailableReason={null}
      />,
    );
    const buyButton = html.match(/<button[^>]*>Buy punch card<\/button>/)?.[0];

    expect(buyButton).not.toContain("disabled");
    expect(buyButton).not.toContain("aria-describedby");
    expect(html).not.toContain("punch-card-purchase-unavailable");
    expect(html).toContain('action="/start-punch-card-checkout-test"');
  });

  it("makes no external request while the no-key fixture is unavailable", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("STRIPE_SECRET_KEY", "");

    renderToStaticMarkup(
      <PunchCardPurchaseForm
        products={products}
        purchaseUnavailableReason={unavailableReason}
      />,
    );

    expect(startCheckoutMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
    vi.unstubAllEnvs();
  });
});
