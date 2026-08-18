import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  stripeBillingGateway,
  type StripeBillingGateway,
} from "./stripe-billing";
import {
  getWorkspaceStripeSettings,
  refreshStripeConnectionStatus,
  startStripeConnectOnboarding,
  updateFailedPaymentGracePeriod,
} from "./stripe-settings";

type StripeSettingsTestDb = NonNullable<
  Parameters<typeof getWorkspaceStripeSettings>[0]["db"]
>;

type StripeSettingsTestRecord = NonNullable<
  Awaited<
    ReturnType<
      StripeSettingsTestDb["workspaceStripeSettings"]["findUnique"]
    >
  >
>;

const persistedSettings: StripeSettingsTestRecord = {
  id: "stripe_settings_1",
  workspaceId: "workspace_1",
  stripeAccountId: null,
  connectionStatus: "NOT_CONNECTED" as const,
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  failedPaymentGracePeriodDays: 7,
  createdAt: new Date("2026-08-18T00:00:00.000Z"),
  updatedAt: new Date("2026-08-18T00:00:00.000Z"),
};

function createMockDb(
  settings: StripeSettingsTestRecord | null = null,
): StripeSettingsTestDb {
  return {
    workspaceStripeSettings: {
      findUnique: vi.fn().mockResolvedValue(settings),
      upsert: vi.fn().mockResolvedValue(persistedSettings),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function createFakeStripeGateway(): StripeBillingGateway {
  return {
    createStandardAccount: vi.fn().mockResolvedValue({
      stripeAccountId: "acct_fake_1",
      connectionStatus: "PENDING",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    }),
    createAccountLink: vi.fn().mockResolvedValue({
      url: "https://connect.stripe.test/onboarding",
    }),
    retrieveAccount: vi.fn().mockResolvedValue({
      stripeAccountId: "acct_fake_1",
      connectionStatus: "ACTIVE",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    }),
  } as unknown as StripeBillingGateway;
}

const unavailableResult = {
  status: "unavailable",
  reason: "stripe-secret-key-not-configured",
  message: "Stripe is unavailable because STRIPE_SECRET_KEY is not configured.",
} as const;

describe("owner Stripe settings", () => {
  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reads absent settings without creating a database row", async () => {
    const db = createMockDb();

    await expect(
      getWorkspaceStripeSettings({
        workspaceId: "workspace_1",
        db,
      }),
    ).resolves.toMatchObject({
      stripeAccountId: null,
      connectionStatus: "NOT_CONNECTED",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      failedPaymentGracePeriodDays: 7,
      providerAvailability: unavailableResult,
    });

    expect(db.workspaceStripeSettings.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
      },
    });
    expect(db.workspaceStripeSettings.upsert).not.toHaveBeenCalled();
    expect(db.workspaceStripeSettings.updateMany).not.toHaveBeenCalled();
  });

  it("reports ready configuration without invoking the provider", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_ready_fixture");
    const db = createMockDb(persistedSettings);
    const createAccount = vi.spyOn(
      stripeBillingGateway,
      "createStandardAccount",
    );
    const retrieveAccount = vi.spyOn(stripeBillingGateway, "retrieveAccount");
    const createAccountLink = vi.spyOn(
      stripeBillingGateway,
      "createAccountLink",
    );

    await expect(
      getWorkspaceStripeSettings({
        workspaceId: "workspace_1",
        db,
      }),
    ).resolves.toMatchObject({
      workspaceId: "workspace_1",
      providerAvailability: {
        status: "ready",
      },
    });

    expect(createAccount).not.toHaveBeenCalled();
    expect(retrieveAccount).not.toHaveBeenCalled();
    expect(createAccountLink).not.toHaveBeenCalled();
    expect(db.workspaceStripeSettings.upsert).not.toHaveBeenCalled();
    expect(db.workspaceStripeSettings.updateMany).not.toHaveBeenCalled();
  });

  it("fails the connect action closed before database or provider access when Stripe is not configured", async () => {
    const db = createMockDb(persistedSettings);
    const createAccount = vi.spyOn(
      stripeBillingGateway,
      "createStandardAccount",
    );
    const retrieveAccount = vi.spyOn(stripeBillingGateway, "retrieveAccount");
    const createAccountLink = vi.spyOn(
      stripeBillingGateway,
      "createAccountLink",
    );

    await expect(
      startStripeConnectOnboarding({
        workspaceId: "workspace_1",
        workspaceName: "Sahara Muay Thai",
        db,
      }),
    ).resolves.toEqual(unavailableResult);

    expect(db.workspaceStripeSettings.findUnique).not.toHaveBeenCalled();
    expect(db.workspaceStripeSettings.upsert).not.toHaveBeenCalled();
    expect(db.workspaceStripeSettings.updateMany).not.toHaveBeenCalled();
    expect(createAccount).not.toHaveBeenCalled();
    expect(retrieveAccount).not.toHaveBeenCalled();
    expect(createAccountLink).not.toHaveBeenCalled();
  });

  it("fails the refresh action closed before database or provider access when Stripe is not configured", async () => {
    const db = createMockDb(persistedSettings);
    const createAccount = vi.spyOn(
      stripeBillingGateway,
      "createStandardAccount",
    );
    const retrieveAccount = vi.spyOn(stripeBillingGateway, "retrieveAccount");
    const createAccountLink = vi.spyOn(
      stripeBillingGateway,
      "createAccountLink",
    );

    await expect(
      refreshStripeConnectionStatus({
        workspaceId: "workspace_1",
        db,
      }),
    ).resolves.toEqual(unavailableResult);

    expect(db.workspaceStripeSettings.findUnique).not.toHaveBeenCalled();
    expect(db.workspaceStripeSettings.upsert).not.toHaveBeenCalled();
    expect(db.workspaceStripeSettings.updateMany).not.toHaveBeenCalled();
    expect(createAccount).not.toHaveBeenCalled();
    expect(retrieveAccount).not.toHaveBeenCalled();
    expect(createAccountLink).not.toHaveBeenCalled();
  });

  it("uses an injected fake gateway for connect without a live Stripe key", async () => {
    const db = createMockDb();
    const stripe = createFakeStripeGateway();

    await expect(
      startStripeConnectOnboarding({
        workspaceId: "workspace_1",
        workspaceName: "Sahara Muay Thai",
        db,
        stripe,
      }),
    ).resolves.toEqual({
      status: "redirect",
      url: "https://connect.stripe.test/onboarding",
    });

    expect(stripe.createStandardAccount).toHaveBeenCalledOnce();
    expect(stripe.createAccountLink).toHaveBeenCalledOnce();
    expect(db.workspaceStripeSettings.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
      },
      update: {
        stripeAccountId: "acct_fake_1",
        connectionStatus: "PENDING",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      },
      create: {
        workspaceId: "workspace_1",
        stripeAccountId: "acct_fake_1",
        connectionStatus: "PENDING",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      },
    });
  });

  it("uses an injected fake gateway to refresh connected settings without a live Stripe key", async () => {
    const db = createMockDb({
      ...persistedSettings,
      stripeAccountId: "acct_fake_1",
      connectionStatus: "PENDING",
    });
    const stripe = createFakeStripeGateway();

    await expect(
      refreshStripeConnectionStatus({
        workspaceId: "workspace_1",
        db,
        stripe,
      }),
    ).resolves.toEqual({
      status: "updated",
    });

    expect(stripe.retrieveAccount).toHaveBeenCalledWith({
      stripeAccountId: "acct_fake_1",
    });
    expect(db.workspaceStripeSettings.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
      },
      data: {
        stripeAccountId: "acct_fake_1",
        connectionStatus: "ACTIVE",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      },
    });
  });

  it("keeps the local grace-period mutation available without Stripe configuration", async () => {
    const db = createMockDb();

    await expect(
      updateFailedPaymentGracePeriod({
        workspaceId: "workspace_1",
        failedPaymentGracePeriodDays: "14",
        db,
      }),
    ).resolves.toEqual({
      status: "updated",
    });

    expect(db.workspaceStripeSettings.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
      },
      update: {
        failedPaymentGracePeriodDays: 14,
      },
      create: {
        workspaceId: "workspace_1",
        failedPaymentGracePeriodDays: 14,
      },
    });
  });
});
