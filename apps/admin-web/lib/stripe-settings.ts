import {
  prisma,
  type StripeConnectionStatus,
} from "@flowstate/db";
import {
  stripeBillingGateway,
  type StripeAccountSummary,
  type StripeBillingGateway,
} from "./stripe-billing";

interface StripeSettingsRecord {
  id: string;
  workspaceId: string;
  stripeAccountId: string | null;
  connectionStatus: StripeConnectionStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  failedPaymentGracePeriodDays: number;
  createdAt: Date;
  updatedAt: Date;
}

interface StripeSettingsDatabase {
  workspaceStripeSettings: {
    findUnique(args: Record<string, unknown>): Promise<StripeSettingsRecord | null>;
    upsert(args: Record<string, unknown>): Promise<StripeSettingsRecord>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
}

export type StripeSettingsMutationResult =
  | {
      status: "updated";
    }
  | {
      status: "redirect";
      url: string;
    }
  | {
      status: "error";
      message: string;
    };

const stripeSettingsDatabase = prisma as unknown as StripeSettingsDatabase;

function mapAccountToSettingsUpdate(account: StripeAccountSummary) {
  return {
    stripeAccountId: account.stripeAccountId,
    connectionStatus: account.connectionStatus,
    chargesEnabled: account.chargesEnabled,
    payoutsEnabled: account.payoutsEnabled,
    detailsSubmitted: account.detailsSubmitted,
  };
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

function parseGracePeriodDays(value: string): number | "invalid" {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return "invalid";
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 60) {
    return "invalid";
  }

  return parsed;
}

export async function getWorkspaceStripeSettings(args: {
  workspaceId: string;
  db?: StripeSettingsDatabase;
}): Promise<StripeSettingsRecord> {
  const db = args.db ?? stripeSettingsDatabase;

  return db.workspaceStripeSettings.upsert({
    where: {
      workspaceId: args.workspaceId,
    },
    update: {},
    create: {
      workspaceId: args.workspaceId,
    },
  });
}

export async function startStripeConnectOnboarding(args: {
  workspaceId: string;
  workspaceName: string;
  db?: StripeSettingsDatabase;
  stripe?: StripeBillingGateway;
}): Promise<StripeSettingsMutationResult> {
  const db = args.db ?? stripeSettingsDatabase;
  const stripe = args.stripe ?? stripeBillingGateway;
  const settings = await getWorkspaceStripeSettings({
    workspaceId: args.workspaceId,
    db,
  });
  const account = settings.stripeAccountId
    ? await stripe.retrieveAccount({
        stripeAccountId: settings.stripeAccountId,
      })
    : await stripe.createStandardAccount({
        workspaceId: args.workspaceId,
        workspaceName: args.workspaceName,
      });

  await db.workspaceStripeSettings.updateMany({
    where: {
      workspaceId: args.workspaceId,
    },
    data: mapAccountToSettingsUpdate(account),
  });

  const appUrl = getAppUrl();
  const accountLink = await stripe.createAccountLink({
    stripeAccountId: account.stripeAccountId,
    refreshUrl: `${appUrl}/dashboard/settings/billing/refresh`,
    returnUrl: `${appUrl}/dashboard/settings/billing/return`,
  });

  return {
    status: "redirect",
    url: accountLink.url,
  };
}

export async function refreshStripeConnectionStatus(args: {
  workspaceId: string;
  db?: StripeSettingsDatabase;
  stripe?: StripeBillingGateway;
}): Promise<StripeSettingsMutationResult> {
  const db = args.db ?? stripeSettingsDatabase;
  const stripe = args.stripe ?? stripeBillingGateway;
  const settings = await getWorkspaceStripeSettings({
    workspaceId: args.workspaceId,
    db,
  });

  if (!settings.stripeAccountId) {
    return {
      status: "updated",
    };
  }

  const account = await stripe.retrieveAccount({
    stripeAccountId: settings.stripeAccountId,
  });
  await db.workspaceStripeSettings.updateMany({
    where: {
      workspaceId: args.workspaceId,
    },
    data: mapAccountToSettingsUpdate(account),
  });

  return {
    status: "updated",
  };
}

export async function updateFailedPaymentGracePeriod(args: {
  workspaceId: string;
  failedPaymentGracePeriodDays: string;
  db?: StripeSettingsDatabase;
}): Promise<StripeSettingsMutationResult> {
  const db = args.db ?? stripeSettingsDatabase;
  const failedPaymentGracePeriodDays = parseGracePeriodDays(
    args.failedPaymentGracePeriodDays,
  );

  if (failedPaymentGracePeriodDays === "invalid") {
    return {
      status: "error",
      message: "Grace period must be a whole number from 0 to 60 days.",
    };
  }

  await db.workspaceStripeSettings.upsert({
    where: {
      workspaceId: args.workspaceId,
    },
    update: {
      failedPaymentGracePeriodDays,
    },
    create: {
      workspaceId: args.workspaceId,
      failedPaymentGracePeriodDays,
    },
  });

  return {
    status: "updated",
  };
}

export function formatStripeConnectionStatus(
  status: StripeConnectionStatus,
): string {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
