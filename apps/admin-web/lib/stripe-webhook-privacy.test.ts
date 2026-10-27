import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Receipt {
  id: string;
  status: string;
  receivedAt: Date;
  updatedAt: Date;
  stripeEventId: string;
  stripeAccountId: string;
  eventType: string;
  livemode: boolean;
  attemptCount: number;
  lastError: string | null;
  processedAt: Date | null;
}
const state = vi.hoisted(() => ({
  signature: "",
  receipt: null as Receipt | null,
  provider: vi.fn(),
  dispute: vi.fn(),
  db: {} as Record<string, unknown>,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "stripe-signature": state.signature }),
}));
// Execute the actual receipt/retry domain and actual SDK signature verifier.
// Inject only its documented reconciliation dependency and a stateful, process-local receipt store.
vi.mock("./stripe-billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stripe-billing")>();
  return {
    ...actual,
    processStripeWebhookEvent: (args: Parameters<typeof actual.processStripeWebhookEvent>[0]) =>
      actual.processStripeWebhookEvent({
        ...args,
        db: state.db as unknown as NonNullable<Parameters<typeof actual.processStripeWebhookEvent>[0]["db"]>,
        reconcileMembershipEvent: state.provider,
        reconcileDisputeEvent: state.dispute,
        recoverPublicMembershipEvent: async () => false,
      }),
  };
});
import { POST } from "../app/api/stripe/webhook/route";

const secret = "whsec_fictional_privacy_signature_test";
const customerMarker = "PRIVATE_WEBHOOK_CUSTOMER";
const bearerMarker = "BEARER_WEBHOOK_SENTINEL";
const safeCode = "MEMBERSHIP_RECONCILIATION_PENDING";
const referencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fixtureEvent(type = "invoice.paid") {
  return {
    id: "evt_fictionalPrivacy1", object: "event", type, account: "acct_fictionalPrivacy1", livemode: false,
    data: { object: { id: "in_fictionalPrivacy1", object: "invoice" } },
  };
}
async function deliver(type?: string) {
  const payload = JSON.stringify(fixtureEvent(type));
  state.signature = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000), scheme: "v1", signature: "", cryptoProvider: Stripe.createNodeCryptoProvider() });
  return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload }));
}
function store() {
  return {
    stripeWebhookEvent: {
      findUnique: vi.fn(async () => state.receipt),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.receipt = { ...data, id: "receipt_fictional", receivedAt: new Date(), updatedAt: new Date(), lastError: null, processedAt: null } as unknown as Receipt;
        return state.receipt;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (!state.receipt) throw new Error("The synthetic receipt must already exist.");
        const increment = data.attemptCount as { increment: number } | undefined;
        Object.assign(state.receipt, data, { attemptCount: state.receipt.attemptCount + (increment?.increment ?? 0), updatedAt: new Date() });
        return state.receipt;
      }),
    },
    workspaceStripeSettings: { findFirst: vi.fn(async () => ({ workspaceId: "workspace_fictional", stripeAccountId: "acct_fictionalPrivacy1", failedPaymentGracePeriodDays: 7 })) },
  };
}
beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fictional_no_network");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  state.receipt = null;
  state.db = store();
  state.provider.mockReset();
  state.dispute.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("handled Stripe reconciliation privacy and retry boundary", () => {
  it("keeps signed-handler failures retryable without persisting or returning synthetic customer/bearer text", async () => {
    const diagnostics = vi.spyOn(console, "error").mockImplementation(() => {});
    state.provider.mockRejectedValue(new Error(`${customerMarker}: email=fictional@example.invalid; token=${bearerMarker}`));
    const response = await deliver();
    const body = await response.json();
    const publicAndStored = JSON.stringify({ body, receipt: state.receipt, diagnostics: diagnostics.mock.calls });
    expect(publicAndStored).not.toContain(customerMarker);
    expect(publicAndStored).not.toContain(bearerMarker);
    expect(response.status).toBe(500);
    expect(body).toEqual({ error: expect.stringMatching(/retry|reconcil/i), code: safeCode, diagnosticId: expect.stringMatching(referencePattern) });
    expect(state.receipt).toMatchObject({ status: "ERROR", attemptCount: 1, processedAt: null, stripeEventId: "evt_fictionalPrivacy1", stripeAccountId: "acct_fictionalPrivacy1", eventType: "invoice.paid", livemode: false, lastError: `${safeCode}:${body.diagnosticId}` });
    expect(diagnostics).toHaveBeenCalledExactlyOnceWith(expect.any(String));
    expect(JSON.parse(diagnostics.mock.calls[0]![0] as string)).toMatchObject({ event: "stripe.webhook.error", code: safeCode, diagnosticId: body.diagnosticId, stripeEventId: "evt_fictionalPrivacy1", stripeAccountId: "acct_fictionalPrivacy1", livemode: false });
    expect(state.provider).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "evt_fictionalPrivacy1", account: "acct_fictionalPrivacy1" }));
  });
  it("retries the same errored receipt, clears its safe error only on success, and dedupes confirmed delivery", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.provider.mockRejectedValueOnce(new Error(`${customerMarker} ${bearerMarker}`)).mockResolvedValueOnce(true);
    expect((await deliver()).status).toBe(500);
    expect(state.receipt).toMatchObject({ status: "ERROR", attemptCount: 1 });
    const retry = await deliver();
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true, status: "processed" });
    expect(state.receipt).toMatchObject({ status: "PROCESSED", attemptCount: 2, lastError: null, processedAt: expect.any(Date) });
    expect(await (await deliver()).json()).toEqual({ ok: true, status: "duplicate" });
    expect(state.provider).toHaveBeenCalledTimes(2);
    expect(state.receipt?.attemptCount).toBe(2);
  });
  it("retains the existing dispute reconciliation code without storing its private provider error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.dispute.mockRejectedValue(new Error(`${customerMarker} ${bearerMarker}`));
    const response = await deliver("charge.dispute.closed");
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.code).toBe("DISPUTE_RECONCILIATION_PENDING");
    expect(state.receipt?.lastError).toBe(`${body.code}:${body.diagnosticId}`);
    expect(JSON.stringify({ body, receipt: state.receipt })).not.toMatch(/PRIVATE_WEBHOOK_CUSTOMER|BEARER_WEBHOOK_SENTINEL/);
    expect(state.provider).not.toHaveBeenCalled();
  });
  it("does not read attacker-controlled exception message, code, request or stack fields", async () => {
    const diagnostics = vi.spyOn(console, "error").mockImplementation(() => {});
    const read = vi.fn(() => { throw new Error("Private fields must not be inspected."); });
    const failure = Object.create(null);
    for (const field of ["message", "stack", "code", "requestId", "raw", "cause"]) Object.defineProperty(failure, field, { get: read });
    state.provider.mockRejectedValue(failure);
    const response = await deliver();
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe(safeCode);
    expect(read).not.toHaveBeenCalled();
    expect(diagnostics).toHaveBeenCalledOnce();
  });
  it("keeps a fresh processing lease unclaimed, then reclaims it only after the existing stale cutoff", async () => {
    state.provider.mockResolvedValue(true);
    state.receipt = { id: "receipt_fictional", status: "PROCESSING", receivedAt: new Date(), updatedAt: new Date(), stripeEventId: "evt_fictionalPrivacy1", stripeAccountId: "acct_fictionalPrivacy1", eventType: "invoice.paid", livemode: false, attemptCount: 1, lastError: null, processedAt: null };
    expect(await (await deliver()).json()).toEqual({ ok: true, status: "already_processing" });
    expect(state.provider).not.toHaveBeenCalled();
    state.receipt.updatedAt = new Date(Date.now() - 11 * 60 * 1000);
    expect(await (await deliver()).json()).toEqual({ ok: true, status: "processed" });
    expect(state.receipt).toMatchObject({ status: "PROCESSED", attemptCount: 2, lastError: null });
    expect(state.provider).toHaveBeenCalledOnce();
  });
  it("rejects tampered raw bytes before creating a receipt or entering reconciliation", async () => {
    const payload = JSON.stringify(fixtureEvent());
    state.signature = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000), scheme: "v1", signature: "", cryptoProvider: Stripe.createNodeCryptoProvider() });
    const response = await POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: `${payload} ` }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid Stripe webhook signature." });
    expect(state.receipt).toBeNull();
    expect(state.provider).not.toHaveBeenCalled();
  });
  it("keeps the ERROR receipt and HTTP failure truthful when the diagnostic sink is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => { throw new Error(`${customerMarker} ${bearerMarker}`); });
    state.provider.mockRejectedValue(new Error("Synthetic provider uncertainty."));
    const response = await deliver();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe(safeCode);
    expect(state.receipt?.status).toBe("ERROR");
    expect(body.error).toMatch(/retry|reconcil/i);
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE_WEBHOOK_CUSTOMER|BEARER_WEBHOOK_SENTINEL/);
  });
});
