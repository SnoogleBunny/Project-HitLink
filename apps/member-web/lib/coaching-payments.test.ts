import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  retrieve: vi.fn(),
  createSession: vi.fn(),
  findEnrollment: vi.fn(),
  findSettings: vi.fn(),
  paymentCreate: vi.fn(),
  enrollmentUpdate: vi.fn(),
  eventCreate: vi.fn(),
  transaction: vi.fn(),
  detail: vi.fn(),
  authority: vi.fn(),
  lock: vi.fn(),
  operationFind: vi.fn(),
  operationCreate: vi.fn(),
  operationUpdate: vi.fn(),
  reviewUpsert: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    checkout = {
      sessions: { retrieve: mock.retrieve, create: mock.createSession },
    };
  },
}));
vi.mock("@flowstate/db", () => ({
  CoachingError: class CoachingError extends Error {},
  requireCoachingPaymentViewer: mock.detail,
  requireCoachingPaymentAuthority: mock.authority,
  lockClassSchedule: mock.lock,
  prisma: {
    coachingEnrollment: {
      findUniqueOrThrow: mock.findEnrollment,
      findUnique: mock.findEnrollment,
      update: mock.enrollmentUpdate,
    },
    workspaceStripeSettings: { findUnique: mock.findSettings },
    financialOperation: { findFirst: mock.operationFind },
    $transaction: mock.transaction,
  },
}));
import {
  checkCoachingPayment,
  handleCoachingCheckoutWebhook,
  startCoachingPayment,
} from "./coaching-payments";
import type Stripe from "stripe";

describe("coaching payment provider evidence", () => {
  const actor = { workspaceId: "workspace", userId: "user" };
  const enrollment = {
    id: "enrollment",
    workspaceId: "workspace",
    memberId: "member",
    programVersionId: "version",
    checkoutSessionId: "cs_123",
    checkoutAccountId: "acct_correct",
    paymentId: null,
    paymentState: "PENDING",
    acceptedAt: new Date(),
    currentCoachWorkspaceUserId: "coach",
    closedAt: null,
    programVersion: {
      priceCents: 12000,
      currency: "cad",
      program: { name: "Program" },
    },
    member: { user: { email: "client@example.test" } },
  };
  const settled = {
    id: "cs_123",
    mode: "payment",
    client_reference_id: "enrollment",
    metadata: {
      purpose: "coaching",
      workspaceId: "workspace",
      enrollmentId: "enrollment",
      memberId: "member",
      programVersionId: "version",
    },
    amount_total: 12000,
    currency: "cad",
    payment_status: "paid",
    payment_intent: {
      id: "pi_correct",
      amount: 12000,
      amount_received: 12000,
      currency: "cad",
      status: "succeeded",
    },
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("NEXT_PUBLIC_MEMBER_WEB_URL", "https://member.example.test");
    mock.detail.mockResolvedValue({
      own: true,
      accepted: true,
      contactVerified: true,
      coachAccepted: true,
      memberId: "member",
      paymentState: "PENDING",
      closedAt: null,
    });
    mock.findEnrollment.mockResolvedValue(enrollment);
    mock.authority.mockImplementation(async () => ({
      enrollment: await mock.findEnrollment(),
      payerAccountId: "payer-account",
      payerUserId: "user",
      payerEmail: "client@example.test",
      payerGrantId: null,
      payerGrantVersion: null,
    }));
    mock.operationFind.mockResolvedValue({
      id: "operation",
      status: "SUBMITTED",
      actorUserId: "user",
      payerAccountId: "payer-account",
      amountCents: 12000,
      currency: "cad",
      payload: { metadata: { payerGrantId: "", payerGrantVersion: "" } },
    });
    mock.findSettings.mockResolvedValue({
      stripeAccountId: "acct_correct",
      connectionStatus: "ACTIVE",
      chargesEnabled: true,
    });
    mock.retrieve.mockResolvedValue(settled);
    mock.paymentCreate.mockResolvedValue({ id: "payment" });
    mock.transaction.mockImplementation(async (callback) =>
      callback({
        coachingEnrollment: {
          findUniqueOrThrow: mock.findEnrollment,
          update: mock.enrollmentUpdate,
          updateMany: mock.enrollmentUpdate,
        },
        payment: { create: mock.paymentCreate },
        coachingEvent: { create: mock.eventCreate },
        financialOperation: {
          findFirst: mock.operationFind,
          findUnique: mock.operationFind,
          create: mock.operationCreate,
          update: mock.operationUpdate,
          updateMany: mock.operationUpdate,
        },
        financialReviewCase: { upsert: mock.reviewUpsert },
      }),
    );
  });
  it("retrieves the stored session on its Connect account before recording one settled payment", async () => {
    expect(await checkCoachingPayment(actor, "enrollment")).toBe("PAID");
    expect(mock.retrieve).toHaveBeenCalledWith(
      "cs_123",
      { expand: ["payment_intent"] },
      { stripeAccount: "acct_correct" },
    );
    expect(mock.paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          amountCents: 12000,
          stripePaymentIntentId: "pi_correct",
        }),
      }),
    );
    expect(mock.enrollmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentState: "PAID",
          paymentId: "payment",
        }),
      }),
    );
  });
  it("keeps incomplete checkout and processing intent pending without writing payment success", async () => {
    mock.retrieve.mockResolvedValue({
      ...settled,
      payment_status: "unpaid",
      payment_intent: null,
    });
    expect(await checkCoachingPayment(actor, "enrollment")).toBe("PENDING");
    mock.retrieve.mockResolvedValue({
      ...settled,
      payment_intent: { ...settled.payment_intent, status: "processing" },
    });
    expect(await checkCoachingPayment(actor, "enrollment")).toBe("PENDING");
    expect(mock.paymentCreate).not.toHaveBeenCalled();
  });
  it.each([
    { amount_total: 1 },
    { currency: "usd" },
    { client_reference_id: "another" },
    { metadata: { ...settled.metadata, memberId: "another" } },
    { metadata: { ...settled.metadata, programVersionId: "another" } },
    { payment_intent: { ...settled.payment_intent, amount_received: 1 } },
  ])("rejects mismatched provider evidence %#", async (change) => {
    mock.retrieve.mockResolvedValue({ ...settled, ...change });
    await expect(checkCoachingPayment(actor, "enrollment")).rejects.toThrow(
      /not match/,
    );
    expect(mock.paymentCreate).not.toHaveBeenCalled();
  });
  it("does not duplicate an already verified payment", async () => {
    mock.findEnrollment.mockResolvedValue({
      ...enrollment,
      paymentId: "payment",
      paymentState: "PAID",
    });
    expect(await checkCoachingPayment(actor, "enrollment")).toBe("PAID");
    expect(mock.retrieve).not.toHaveBeenCalled();
    expect(mock.paymentCreate).not.toHaveBeenCalled();
  });
  it("does not reopen closed service when a delayed payment succeeds", async () => {
    mock.findEnrollment.mockResolvedValue({
      ...enrollment,
      closedAt: new Date(),
    });
    await checkCoachingPayment(actor, "enrollment");
    const data = mock.enrollmentUpdate.mock.calls[0]![0].data;
    expect(data.settlementState).toBe("REVIEW_REQUIRED");
    expect(data).not.toHaveProperty("closedAt");
  });
  it("rejects another member and ignores a webhook from a different connected account", async () => {
    mock.detail.mockResolvedValue({ own: false });
    await expect(checkCoachingPayment(actor, "enrollment")).rejects.toThrow(
      "own account",
    );
    expect(
      await handleCoachingCheckoutWebhook({
        type: "checkout.session.completed",
        account: "acct_wrong",
        data: { object: settled },
      } as unknown as Stripe.Event),
    ).toBe(false);
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
  it("reuses an open checkout instead of creating another payment", async () => {
    mock.retrieve.mockResolvedValue({
      ...settled,
      status: "open",
      url: "https://checkout.stripe.com/existing",
      metadata: {
        ...settled.metadata,
        payerGrantId: "",
        payerGrantVersion: "",
      },
    });
    expect(await startCoachingPayment(actor, "enrollment")).toBe(
      "https://checkout.stripe.com/existing",
    );
    expect(mock.createSession).not.toHaveBeenCalled();
  });
  it("creates an account-bound checkout once using the reserved exact request", async () => {
    mock.findEnrollment.mockResolvedValue({
      ...enrollment,
      checkoutSessionId: null,
    });
    let operation: Record<string, unknown> | null = null;
    mock.operationFind.mockImplementation(async () => operation);
    mock.operationCreate.mockImplementation(async ({ data }) => {
      operation = { id: "new-operation", ...data };
      return operation;
    });
    mock.createSession.mockImplementation(async (request) => ({
      ...settled,
      metadata: request.metadata,
      status: "open",
      payment_status: "unpaid",
      payment_intent: null,
      expires_at: Math.floor(Date.now() / 1000) + 1800,
      url: "https://checkout.stripe.com/new",
    }));
    expect(await startCoachingPayment(actor, "enrollment")).toBe(
      "https://checkout.stripe.com/new",
    );
    expect(mock.createSession).toHaveBeenCalledOnce();
    expect(mock.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: "client@example.test",
        metadata: expect.objectContaining({
          payerAccountId: "payer-account",
          payerUserId: "user",
        }),
      }),
      expect.objectContaining({
        stripeAccount: "acct_correct",
        idempotencyKey: "coaching-checkout:enrollment:first",
      }),
    );
    expect(mock.enrollmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payerAccountId: "payer-account",
          paymentState: "PENDING",
        }),
      }),
    );
  });
  it("requires owner reconciliation for a lost checkout beyond the provider replay window", async () => {
    mock.findEnrollment.mockResolvedValue({
      ...enrollment,
      checkoutSessionId: null,
    });
    mock.operationFind.mockResolvedValue({
      id: "operation",
      status: "SUBMITTED",
      providerReference: null,
      submittedAt: new Date(Date.now() - 24 * 3600000),
    });
    await expect(startCoachingPayment(actor, "enrollment")).rejects.toThrow(
      "needs owner review",
    );
    expect(mock.operationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REVIEW_REQUIRED" }),
      }),
    );
    expect(mock.reviewUpsert).toHaveBeenCalledOnce();
    expect(mock.createSession).not.toHaveBeenCalled();
  });
  it("withholds an open checkout while payer review is unresolved", async () => {
    mock.operationFind.mockResolvedValue({
      id: "operation",
      status: "REVIEW_REQUIRED",
      actorUserId: "user",
      payerAccountId: "payer-account",
    });
    mock.retrieve.mockResolvedValue({
      status: "open",
      url: "https://checkout.stripe.com/reviewed",
    });
    await expect(startCoachingPayment(actor, "enrollment")).rejects.toThrow(
      "No payment link",
    );
    expect(mock.retrieve).not.toHaveBeenCalled();
    expect(mock.createSession).not.toHaveBeenCalled();
  });
  it("records paid cash without activation after payer revocation, even when authority later returns", async () => {
    mock.authority.mockRejectedValue(new Error("Payer consent revoked"));
    expect(await checkCoachingPayment(actor, "enrollment")).toBe(
      "REVIEW_REQUIRED",
    );
    expect(mock.paymentCreate).toHaveBeenCalledOnce();
    expect(mock.enrollmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentState: "REVIEW_REQUIRED",
          paymentId: "payment",
        }),
      }),
    );
    mock.findEnrollment.mockResolvedValue({
      ...enrollment,
      paymentId: "payment",
      paymentState: "REVIEW_REQUIRED",
    });
    mock.authority.mockResolvedValue({
      enrollment,
      payerAccountId: "payer-account",
      payerGrantId: null,
      payerGrantVersion: null,
    });
    expect(await checkCoachingPayment(actor, "enrollment")).toBe(
      "REVIEW_REQUIRED",
    );
    expect(mock.paymentCreate).toHaveBeenCalledOnce();
  });
  it("recovers a signed webhook that arrives before the checkout response is attached", async () => {
    mock.findEnrollment
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...enrollment,
        checkoutSessionId: null,
        checkoutAccountId: null,
      })
      .mockResolvedValueOnce({
        ...enrollment,
        checkoutSessionId: null,
        checkoutAccountId: null,
      });
    mock.operationFind.mockResolvedValue({
      id: "operation",
      actorUserId: "user",
      payerAccountId: "payer-account",
      amountCents: 12000,
      currency: "cad",
      payload: {
        client_reference_id: "enrollment",
        metadata: settled.metadata,
      },
    });
    expect(
      await handleCoachingCheckoutWebhook({
        type: "checkout.session.completed",
        account: "acct_correct",
        data: { object: settled },
      } as unknown as Stripe.Event),
    ).toBe(true);
    expect(mock.enrollmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          checkoutSessionId: "cs_123",
          checkoutAccountId: "acct_correct",
        }),
      }),
    );
    expect(mock.paymentCreate).toHaveBeenCalledOnce();
  });
  it("throws a recoverable linkage error instead of swallowing a premature webhook", async () => {
    mock.findEnrollment
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...enrollment, checkoutSessionId: null });
    mock.operationFind.mockResolvedValue(null);
    await expect(
      handleCoachingCheckoutWebhook({
        type: "checkout.session.completed",
        account: "acct_correct",
        data: { object: settled },
      } as unknown as Stripe.Event),
    ).rejects.toThrow("Retry reconciliation");
    expect(mock.paymentCreate).not.toHaveBeenCalled();
  });
  it("records provider-confirmed expiry without marking payment successful", async () => {
    mock.retrieve.mockResolvedValue({
      ...settled,
      status: "expired",
      payment_status: "unpaid",
      payment_intent: null,
    });
    expect(
      await handleCoachingCheckoutWebhook({
        type: "checkout.session.expired",
        account: "acct_correct",
        data: { object: settled },
      } as unknown as Stripe.Event),
    ).toBe(true);
    expect(mock.enrollmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentState: "EXPIRED" }),
      }),
    );
    expect(mock.paymentCreate).not.toHaveBeenCalled();
  });
});
