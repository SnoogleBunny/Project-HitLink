import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ context: vi.fn(), status: vi.fn() }));
vi.mock("../../../../lib/member-auth", () => ({ requireMemberPortalContext: mock.context }));
vi.mock("../../../../lib/checkout-status", () => ({ getOwnCheckoutStatus: mock.status }));
vi.mock("./check-payment-form", () => ({ CheckPaymentForm: () => <button>Check or resume payment</button> }));
vi.mock("../../../_components/member-shell", () => ({ MemberShell: ({ title, description, children }: PropsWithChildren<{ title: string; description: string }>) => <main><h1>{title}</h1><p>{description}</p>{children}</main> }));
import Page from "./page";
describe("checkout receipt", () => {
  beforeEach(() => { vi.stubGlobal("React", React); mock.context.mockResolvedValue({ workspace: { id: "gym" }, session: { userId: "payer" } }); mock.status.mockResolvedValue(null); });
  it("does not claim payment from a success URL or unowned request", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ checkout_return: "success", operation: "foreign" }) }));
    expect(html).toContain("Payment request not found"); expect(html).not.toContain("Payment confirmed");
    expect(mock.context).toHaveBeenCalledWith({ scope: "account" });
    expect(mock.status).toHaveBeenCalledWith({ workspaceId: "gym", userId: "payer", operationId: "foreign" });
  });
  it("distinguishes settled money from access that still needs review", async () => {
    mock.status.mockResolvedValue({ id: "op", status: "REVIEW_REQUIRED", paymentId: "paid", amountCents: 3500, currency: "cad", beneficiaryMember: { fullName: "Child" } });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ operation: "op" }) }));
    expect(html).toContain("Payment needs review"); expect(html).toContain("please do not pay again"); expect(html).not.toContain("Check or resume payment"); expect(html).toContain("For Child");
  });
  it("offers recovery only while the durable request is pending", async () => {
    mock.status.mockResolvedValue({ id: "op", status: "SUBMITTED", paymentId: null });
    expect(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ operation: "op" }) }))).toContain("Check or resume payment");
  });
});
