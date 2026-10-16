import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ children, href }: PropsWithChildren<{ href: string }>) => <a href={href}>{children}</a> }));
vi.mock("../../_components/admin-shell", () => ({ AdminShell: ({ children }: PropsWithChildren) => <main>{children}</main> }));
vi.mock("../../../lib/owner-workspace", () => ({ requireOwnerWorkspaceContext: async () => ({ session: { userId: "owner" }, workspace: { id: "gym", name: "Gym" }, location: { timezone: "UTC" } }) }));
vi.mock("../../../lib/failed-payments", () => ({ listFailedPaymentQueue: async () => [], formatBillingStateStatus: (value: string) => value }));
vi.mock("../../../lib/financial-review", () => ({ getFinancialReviewQueue: async () => [] }));
vi.mock("./financial-review-queue", () => ({ FinancialReviewQueue: () => null }));
vi.mock("./actions", () => ({ markPaymentUpdateRequestedAction: vi.fn(), retryFailedPaymentNowAction: vi.fn() }));
import BillingPage from "./page";
vi.stubGlobal("React", React);
describe("owner Billing recovery", () => {
  it("shows a retry failure as escaped text and keeps payment management reachable", async () => {
    const html = renderToStaticMarkup(await BillingPage({ searchParams: Promise.resolve({ error: "Card declined <script>bad()</script>" }) }));
    expect(html).toContain('role="alert"'); expect(html).toContain("Card declined &lt;script&gt;bad()&lt;/script&gt;"); expect(html).not.toContain("<script>"); expect(html).toContain('/dashboard/billing/adjustments');
  });
});
