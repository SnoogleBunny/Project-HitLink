import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  expire: vi.fn(),
  expireMember: vi.fn(),
  expireCoaching: vi.fn(),
  coaching: vi.fn(),
  outbox: vi.fn(),
  billing: vi.fn(),
  source: vi.fn(),
  adapter: vi.fn(),
  context: vi.fn(),
}));
vi.mock("@flowstate/db", () => ({
  prisma: { workspace: { findFirst: mocks.workspace } },
  expireWorkspaceDataExports: mocks.expire,
  expireMemberDataExports: mocks.expireMember,
  expireCoachingRecordExports: mocks.expireCoaching,
  reconcileCoachingDelivery: mocks.coaching,
  reconcileSourceMembershipLifecycle: mocks.source,
  processNotificationOutbox: mocks.outbox,
  createEmailNotificationAdapter: mocks.adapter,
  shouldDeliverNotification: mocks.context,
}));
vi.mock("@flowstate/payments", () => ({
  reconcileDueMembershipLifecycle: mocks.billing,
}));
import { POST } from "./route";
const secret = "local-test-worker-secret-at-least-32-characters";
const request = (token = secret, query = "") =>
  new Request(`http://localhost/api/internal/maintenance${query}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("HITLINK_WORKER_SECRET", secret);
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("HITLINK_EMAIL_FROM", "");
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  mocks.workspace.mockResolvedValue({ id: "gym-1" });
  mocks.coaching.mockResolvedValue({ reviewed: 0 });
  mocks.source.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
describe("background worker authorization and recovery", () => {
  it("refuses missing configuration and invalid credentials before touching data", async () => {
    vi.stubEnv("HITLINK_WORKER_SECRET", "");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("HITLINK_WORKER_SECRET", secret);
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(mocks.expireMember).not.toHaveBeenCalled();
    expect(mocks.expireCoaching).not.toHaveBeenCalled();
    expect(mocks.coaching).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it("validates the cursor and scopes each pass to one activated workspace", async () => {
    expect((await POST(request(secret, "?cursor=%3Cinvalid%3E"))).status).toBe(
      400,
    );
    expect(mocks.expire).not.toHaveBeenCalled();
    const response = await POST(request(secret, "?cursor=gym-0"));
    expect(await response.json()).toEqual({
      nextCursor: "gym-1",
      email: "not_configured",
      billing: { reconciled: 0, provider: "not_configured" },
      coaching: { reviewed: 0 },
    });
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "ACTIVE",
          migration: { stage: "COMPLETE" },
          id: { gt: "gym-0" },
        },
      }),
    );
    expect(mocks.outbox).not.toHaveBeenCalled();
    expect(mocks.billing).not.toHaveBeenCalled();
    expect(mocks.expire).toHaveBeenCalledOnce();
    expect(mocks.expireMember).toHaveBeenCalledOnce();
    expect(mocks.expireCoaching).toHaveBeenCalledOnce();
    expect(mocks.coaching).toHaveBeenCalledWith("gym-1");
  });
  it("keeps the sweep retryable after a failed subsystem and omits private error details", async () => {
    vi.stubEnv("RESEND_API_KEY", "fake-key");
    vi.stubEnv("HITLINK_EMAIL_FROM", "gym@example.test");
    vi.stubEnv("STRIPE_SECRET_KEY", "fake-key");
    mocks.outbox.mockRejectedValue(new Error("private address and key"));
    mocks.billing.mockResolvedValue([{}]);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      nextCursor: "gym-1",
      email: "retry_required",
      billing: { reconciled: 1 },
      coaching: { reviewed: 0 },
    });
    expect(mocks.outbox).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "gym-1",
        limit: 5,
        shouldSend: expect.any(Function),
      }),
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.billing).toHaveBeenCalledOnce();
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it("advances source boundaries without Stripe and keeps failed passes retryable", async () => {
    mocks.source.mockResolvedValue([
      { id: "source-change", state: "SOURCE_CONFIRMATION_REQUIRED" },
    ]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).billing).toEqual({
      reconciled: 1,
      provider: "not_configured",
    });
    expect(mocks.source).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "gym-1",
      limit: 10,
    });
    expect(mocks.billing).not.toHaveBeenCalled();
    mocks.source.mockRejectedValue(new Error("private source account"));
    const retry = await POST(request());
    expect(retry.status).toBe(503);
    expect((await retry.json()).billing).toBe("retry_required");
  });
  it("expires temporary archives even when no activated workspaces remain", async () => {
    mocks.workspace.mockResolvedValue(null);
    expect(await (await POST(request())).json()).toEqual({
      done: true,
      nextCursor: null,
    });
    expect(mocks.expire).toHaveBeenCalledOnce();
    expect(mocks.coaching).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it("retries coaching reconciliation without exposing client data", async () => {
    mocks.coaching.mockRejectedValue(new Error("private client record"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      nextCursor: "gym-1",
      email: "not_configured",
      billing: { reconciled: 0, provider: "not_configured" },
      coaching: "retry_required",
    });
  });
});
