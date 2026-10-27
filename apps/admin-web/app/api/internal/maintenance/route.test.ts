import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  expire: vi.fn(),
  expireMember: vi.fn(),
  expireCoaching: vi.fn(),
  coaching: vi.fn(),
  waitlist: vi.fn(),
  outbox: vi.fn(),
  billing: vi.fn(),
  disputes: vi.fn(),
  source: vi.fn(),
  adapter: vi.fn(),
  context: vi.fn(),
  recovery: vi.fn(),
  cleanup: vi.fn(),
  setup: vi.fn(),
  ready: vi.fn(),
  forms: vi.fn(),
  grace: vi.fn(),
  reminders: vi.fn(),
}));
vi.mock("@flowstate/db", () => ({
  prisma: { workspace: { findFirst: mocks.workspace } },
  isWorkspaceOperationallyReady: mocks.ready,
  expireWorkspaceDataExports: mocks.expire,
  expireMemberDataExports: mocks.expireMember,
  expireCoachingRecordExports: mocks.expireCoaching,
  reconcileCoachingDelivery: mocks.coaching,
  reconcileSourceMembershipLifecycle: mocks.source,
  processNotificationOutbox: mocks.outbox,
  processAccountSetupNotificationOutbox: mocks.setup,
  processWorkspaceWaitlists: mocks.waitlist,
  processMembershipGraceDisposition: mocks.grace,
  processClassBookingReminders: mocks.reminders,
  processFormRequirementWarnings: mocks.forms,
  createEmailNotificationAdapter: mocks.adapter,
  shouldDeliverNotification: mocks.context,
}));
vi.mock("@flowstate/payments", () => ({
  reconcileDueMembershipLifecycle: mocks.billing,
  reconcileWorkspacePaymentDisputes: mocks.disputes,
}));
vi.mock("@flowstate/auth", () => ({
  processPasswordRecoveryOutbox: mocks.recovery,
  cleanupPublicAuthThrottleBuckets: mocks.cleanup,
}));
import { POST } from "./route";
import { encodeGraceMaintenanceCursor, encodeReminderMaintenanceCursor } from "./grace-cursor";
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
  mocks.workspace.mockResolvedValue({
    id: "gym-1",
    status: "ACTIVE",
    migration: null,
    setupActivation: null,
  });
  mocks.ready.mockReturnValue(true);
  vi.stubEnv("NEXT_PUBLIC_MEMBER_WEB_URL", "");
  vi.stubEnv("NEXT_PUBLIC_MEMBER_APP_URL", "");
  mocks.grace.mockResolvedValue({ checked: 0, cancelled: 0, skipped: 0, nextBookingId: null, throughBookingId: null, workspaceNotReady: false });
  mocks.reminders.mockResolvedValue({ scanned: 0, queued: 0, nextCursor: null, configured: false });
  mocks.forms.mockResolvedValue({ processed: 0, queued: 0, needsContactReview: 0 });
  mocks.coaching.mockResolvedValue({ reviewed: 0 });
  mocks.waitlist.mockResolvedValue({ promoted: 0 });
  mocks.source.mockResolvedValue([]);
  mocks.disputes.mockResolvedValue({ checked: 0 });
  mocks.setup.mockResolvedValue([]);
  mocks.cleanup.mockResolvedValue({ deletedCount: 0 });
  mocks.recovery.mockResolvedValue({
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
  });
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
      waitlist: { promoted: 0 },
      disputes: "not_configured",
      forms: "not_configured",
      grace: { checked: 0, cancelled: 0, skipped: 0, nextBookingId: null, throughBookingId: null, workspaceNotReady: false },
      reminders: { scanned: 0, queued: 0, nextCursor: null, configured: false },
    });
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "ACTIVE",
          OR: [
            { migration: { stage: "COMPLETE" } },
            { setupActivation: { isNot: null } },
          ],
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
      accountRecovery: { sentCount: 0, failedCount: 0, skippedCount: 0 },
      accountSetup: [],
      billing: { reconciled: 1 },
      coaching: { reviewed: 0 },
      waitlist: { promoted: 0 },
      disputes: { checked: 0 },
      forms: "not_configured",
      grace: { checked: 0, cancelled: 0, skipped: 0, nextBookingId: null, throughBookingId: null, workspaceNotReady: false },
      reminders: { scanned: 0, queued: 0, nextCursor: null, configured: false },
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
      waitlist: { promoted: 0 },
      disputes: "not_configured",
      forms: "not_configured",
      grace: { checked: 0, cancelled: 0, skipped: 0, nextBookingId: null, throughBookingId: null, workspaceNotReady: false },
      reminders: { scanned: 0, queued: 0, nextCursor: null, configured: false },
    });
  });
  it("delivers account recovery independently of business activation and only once per scheduled sweep", async () => {
    vi.stubEnv("RESEND_API_KEY", "fixture-key");
    vi.stubEnv("HITLINK_EMAIL_FROM", "account@example.test");
    mocks.workspace.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).accountRecovery).toEqual({
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(mocks.recovery).toHaveBeenCalledOnce();
    await POST(request(secret, "?cursor=next-workspace"));
    expect(mocks.recovery).toHaveBeenCalledOnce();
  });
  it("retains a retryable global recovery failure even with no activated workspace", async () => {
    vi.stubEnv("RESEND_API_KEY", "fixture-key");
    vi.stubEnv("HITLINK_EMAIL_FROM", "account@example.test");
    mocks.workspace.mockResolvedValue(null);
    mocks.recovery.mockRejectedValue(
      new Error("private recipient and provider data"),
    );
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      done: false,
      nextCursor: null,
      accountRecovery: "retry_required",
      accountSetup: [],
    });
  });
  it("runs only the scoped account setup sweep before activation and once per cursor sweep", async () => {
    vi.stubEnv("RESEND_API_KEY", "fictional-key");
    vi.stubEnv("HITLINK_EMAIL_FROM", "identity@example.test");
    mocks.workspace.mockResolvedValue(null);
    await POST(request());
    expect(mocks.setup).toHaveBeenCalledOnce();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.cleanup).toHaveBeenCalledWith({ limit: 500 });
    expect(mocks.setup).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 }),
    );
    await POST(request(secret, "?cursor=gym-previous"));
    expect(mocks.setup).toHaveBeenCalledOnce();
    expect(mocks.outbox).not.toHaveBeenCalled();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
  it("queues actual-consent expiry warnings without requiring an email provider and keeps failures retryable", async () => {
    vi.stubEnv("NEXT_PUBLIC_MEMBER_WEB_URL", "https://members.example.test");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).forms).toEqual({ processed: 0, queued: 0, needsContactReview: 0 });
    expect(mocks.forms).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "gym-1", portalOrigin: "https://members.example.test", limit: 100 }));
    expect(mocks.outbox).not.toHaveBeenCalled();
    mocks.forms.mockRejectedValue(new Error("private signer address"));
    const failed = await POST(request());
    expect(failed.status).toBe(503);
    expect((await failed.json()).forms).toBe("retry_required");
  });
  it("does not run operational jobs for an invalid activation receipt", async () => {
    mocks.ready.mockReturnValue(false);
    const response = await POST(request());
    expect(await response.json()).toMatchObject({
      nextCursor: "gym-1",
      skipped: "workspace_not_ready",
    });
    expect(mocks.forms).not.toHaveBeenCalled();
    expect(mocks.waitlist).not.toHaveBeenCalled();
    expect(mocks.coaching).not.toHaveBeenCalled();
    expect(mocks.outbox).not.toHaveBeenCalled();
    expect(mocks.billing).not.toHaveBeenCalled();
  });
});

// The same workspace is exhausted before moving to its next sibling; opaque IDs
// advance even when earlier bookings are held, past or otherwise skipped.
describe("bounded membership grace continuation", () => {
  it("returns and accepts a same-workspace keyset cursor before waitlist or provider work", async () => {
    mocks.grace.mockResolvedValueOnce({ checked: 100, cancelled: 2, skipped: 98, nextBookingId: "booking-100", throughBookingId: "booking-200", workspaceNotReady: false });
    const first = await POST(request());
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.nextCursor).toMatch(/^mg1\./);
    expect(mocks.waitlist).not.toHaveBeenCalled();
    expect(mocks.billing).not.toHaveBeenCalled();
    mocks.workspace.mockClear();
    const last = await POST(request(secret, `?cursor=${encodeURIComponent(body.nextCursor)}`));
    expect(last.status).toBe(200);
    expect(mocks.workspace).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "gym-1" }) }));
    expect(mocks.grace).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceId: "gym-1", afterBookingId: "booking-100", throughBookingId: "booking-200", limit: 100 }));
    expect((await last.json()).nextCursor).toBe("gym-1");
    expect(mocks.waitlist).toHaveBeenCalledOnce();
  });
  it("returns retry-required instead of advancing after a rolled-back grace page", async () => {
    mocks.grace.mockRejectedValueOnce(Error("Injected local fixture failure"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).grace).toBe("retry_required");
    expect(mocks.waitlist).not.toHaveBeenCalled();
  });
  it("rejects malformed opaque state before reading a business", async () => {
    expect((await POST(request(secret, "?cursor=mg1.invalid"))).status).toBe(400);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
});

// These are route-unit contracts, not executed database/worker proofs.
describe("compound grace cursor boundary recovery", () => {
  const compound = () => encodeGraceMaintenanceCursor("gym-1", "booking-100", "booking-200");
  const nextWorkspace = () => ({ id: "gym-2", status: "ACTIVE", migration: null, setupActivation: null });
  it.each(["deleted", "disabled"])("advances a %s exact workspace continuation to the next ready business", async () => {
    const cursor = compound();
    mocks.workspace.mockResolvedValueOnce(null).mockResolvedValueOnce(nextWorkspace());
    const first = await POST(request(secret, `?cursor=${encodeURIComponent(cursor)}`));
    expect(first.status).toBe(200); expect(await first.json()).toEqual({ nextCursor: "gym-1" });
    expect(mocks.workspace).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "gym-1", status: "ACTIVE" }) }));
    expect(mocks.grace).not.toHaveBeenCalled();
    const second = await POST(request(secret, "?cursor=gym-1"));
    expect(second.status).toBe(200); expect((await second.json()).nextCursor).toBe("gym-2");
    expect(mocks.workspace).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { gt: "gym-1" }, status: "ACTIVE" }) }));
    expect(mocks.grace).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ workspaceId: "gym-2", afterBookingId: undefined, throughBookingId: undefined }));
  });
  it("advances an unready exact workspace without operational jobs and visits the next ready business", async () => {
    mocks.ready.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const first = await POST(request(secret, `?cursor=${encodeURIComponent(compound())}`));
    expect(first.status).toBe(200); expect(await first.json()).toMatchObject({ nextCursor: "gym-1", skipped: "workspace_not_ready" });
    expect(mocks.grace).not.toHaveBeenCalled(); expect(mocks.waitlist).not.toHaveBeenCalled(); expect(mocks.source).not.toHaveBeenCalled();
    mocks.workspace.mockResolvedValueOnce(nextWorkspace());
    const second = await POST(request(secret, "?cursor=gym-1"));
    expect(second.status).toBe(200); expect((await second.json()).nextCursor).toBe("gym-2");
    expect(mocks.grace).toHaveBeenCalledOnce();
  });
  it("an exact workspace becoming unready under the grace locks skips later operational jobs", async () => {
    mocks.grace.mockResolvedValueOnce({ checked: 0, cancelled: 0, skipped: 0, nextBookingId: null, throughBookingId: null, workspaceNotReady: true });
    const response = await POST(request(secret, `?cursor=${encodeURIComponent(compound())}`));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ nextCursor: "gym-1", skipped: "workspace_not_ready" });
    expect(mocks.waitlist).not.toHaveBeenCalled(); expect(mocks.forms).not.toHaveBeenCalled(); expect(mocks.source).not.toHaveBeenCalled();
  });
  it("503 explicitly retains the incoming compound position and retries the same exact page without private errors", async () => {
    const cursor = compound();
    mocks.grace.mockRejectedValueOnce(Error("PRIVATE_FIXTURE_DETAIL"));
    const failed = await POST(request(secret, `?cursor=${encodeURIComponent(cursor)}`));
    expect(failed.status).toBe(503);
    const failure = await failed.json(); expect(failure.nextCursor).toBe(cursor); expect(failure.grace).toBe("retry_required");
    expect(JSON.stringify(failure)).not.toContain("PRIVATE_FIXTURE_DETAIL"); expect(mocks.waitlist).not.toHaveBeenCalled();
    const retried = await POST(request(secret, `?cursor=${encodeURIComponent(failure.nextCursor)}`));
    expect(retried.status).toBe(200); expect((await retried.json()).nextCursor).toBe("gym-1");
    expect(mocks.grace).toHaveBeenCalledTimes(2);
    for (const [input] of mocks.grace.mock.calls) expect(input).toMatchObject({ workspaceId: "gym-1", afterBookingId: "booking-100", throughBookingId: "booking-200" });
  });
});


describe("bounded reminder continuation alongside grace disposition", () => {
  const reminderCursor = { afterId: "booking-100", highWaterId: "booking-200", settingsVersion: 1 };
  it("finishes grace before beginning reminders and resumes the precise reminder page", async () => {
    mocks.reminders.mockResolvedValueOnce({ scanned: 100, queued: 3, nextCursor: reminderCursor, configured: true });
    const first = await POST(request(secret, "?cursor=gym-0")), body = await first.json();
    expect(first.status).toBe(200);expect(body.nextCursor).toBe(encodeReminderMaintenanceCursor("gym-1", reminderCursor));expect(mocks.grace).toHaveBeenCalledOnce();expect(mocks.waitlist).not.toHaveBeenCalled();expect(mocks.outbox).not.toHaveBeenCalled();
    mocks.grace.mockClear();mocks.workspace.mockClear();mocks.reminders.mockClear();
    const second = await POST(request(secret, `?cursor=${encodeURIComponent(body.nextCursor)}`));expect(second.status).toBe(200);
    expect(mocks.workspace).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "gym-1" }) }));expect(mocks.grace).not.toHaveBeenCalled();expect(mocks.reminders).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ workspaceId: "gym-1", cursor: reminderCursor, limit: 100 }));expect(mocks.waitlist).toHaveBeenCalledOnce();
  });
  it("leaves reminder production untouched until the last grace page", async () => {
    mocks.grace.mockResolvedValueOnce({ checked: 100, cancelled: 2, skipped: 98, nextBookingId: "booking-100", throughBookingId: "booking-200", workspaceNotReady: false });
    const body = await (await POST(request())).json();expect(body.nextCursor).toBe(encodeGraceMaintenanceCursor("gym-1", "booking-100", "booking-200"));expect(mocks.reminders).not.toHaveBeenCalled();
  });
  it("retains exact incoming reminder cursor after failure without private error text", async () => {
    const cursor = encodeReminderMaintenanceCursor("gym-1", reminderCursor);mocks.reminders.mockRejectedValueOnce(new Error("PRIVATE_REMINDER_DETAIL"));
    const response = await POST(request(secret, `?cursor=${encodeURIComponent(cursor)}`)), body = await response.json();expect(response.status).toBe(503);expect(body.nextCursor).toBe(cursor);expect(body.reminders).toBe("retry_required");expect(JSON.stringify(body)).not.toContain("PRIVATE_REMINDER_DETAIL");expect(mocks.grace).not.toHaveBeenCalled();expect(mocks.waitlist).not.toHaveBeenCalled();
  });
  it("returns an explicit reminder start phase after first-page failure", async () => {
    mocks.reminders.mockRejectedValueOnce(new Error("PRIVATE_REMINDER_DETAIL"));const response = await POST(request(secret, "?cursor=gym-0")), body = await response.json();expect(response.status).toBe(503);expect(body.nextCursor).toBe(encodeReminderMaintenanceCursor("gym-1"));expect(mocks.grace).toHaveBeenCalledOnce();expect(mocks.waitlist).not.toHaveBeenCalled();
  });
  it("advances beyond a deleted or disabled reminder workspace to the next ready gym", async () => {
    const cursor = encodeReminderMaintenanceCursor("gym-1", reminderCursor);mocks.workspace.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "gym-2", status: "ACTIVE", migration: null, setupActivation: null });
    const first = await POST(request(secret, `?cursor=${encodeURIComponent(cursor)}`));expect(await first.json()).toEqual({ nextCursor: "gym-1" });expect(mocks.reminders).not.toHaveBeenCalled();
    await POST(request(secret, "?cursor=gym-1"));expect(mocks.workspace).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { gt: "gym-1" } }) }));expect(mocks.reminders).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ workspaceId: "gym-2", cursor: undefined }));
  });
  it("advances past an unready workspace before producing reminders", async () => { mocks.ready.mockReturnValue(false);const cursor = encodeReminderMaintenanceCursor("gym-1", reminderCursor);const body = await (await POST(request(secret, `?cursor=${encodeURIComponent(cursor)}`))).json();expect(body).toMatchObject({ nextCursor: "gym-1", skipped: "workspace_not_ready" });expect(mocks.grace).not.toHaveBeenCalled();expect(mocks.reminders).not.toHaveBeenCalled(); });
  it("post-lock workspace disable advances without running remaining subsystems", async () => { mocks.reminders.mockResolvedValueOnce({ scanned: 0, queued: 0, nextCursor: null, configured: false, workspaceNotReady: true });const body = await (await POST(request())).json();expect(body).toMatchObject({ nextCursor: "gym-1", skipped: "workspace_not_ready" });expect(mocks.waitlist).not.toHaveBeenCalled();expect(mocks.source).not.toHaveBeenCalled(); });
  it("a settings revision change ends the old phase instead of retrying its stale cursor forever", async () => { const cursor = encodeReminderMaintenanceCursor("gym-1", reminderCursor);mocks.reminders.mockResolvedValueOnce({ scanned: 0, queued: 0, nextCursor: null, configured: true, configurationChanged: true });const body = await (await POST(request(secret, `?cursor=${encodeURIComponent(cursor)}`))).json();expect(body.nextCursor).toBe("gym-1");expect(mocks.grace).not.toHaveBeenCalled();expect(mocks.waitlist).toHaveBeenCalledOnce(); });
});
