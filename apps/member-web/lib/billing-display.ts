const membershipStatusLabels: Record<string, string> = {
  ACTIVE: "Active",
  PENDING_PAYMENT_METHOD: "Payment method needed",
  PAST_DUE: "Past due",
  FROZEN: "Frozen",
  CANCELLED: "Cancelled",
  ENDED: "Ended",
};

const billingStateLabels: Record<string, string> = {
  NOT_READY: "Billing not ready",
  ACTIVE: "Active",
  PENDING_PAYMENT_METHOD: "Payment method needed",
  PAST_DUE: "Past due",
  PAYMENT_FAILED: "Payment failed",
  ACTION_REQUIRED: "Member action needed",
  FROZEN: "Frozen",
  CANCELLED: "Cancelled",
  ENDED: "Ended",
};

const billingRecordStatusLabels: Record<string, string> = {
  INFO: "Recorded",
  PENDING: "Pending",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  ACTION_REQUIRED: "Member action needed",
};

const billingRecordTypeLabels: Record<string, string> = {
  MEMBERSHIP_ASSIGNED: "Membership assigned",
  MEMBERSHIP_CANCELLED: "Membership cancellation recorded",
  MEMBERSHIP_FROZEN: "Membership frozen",
  MEMBERSHIP_UNFROZEN: "Membership freeze ended",
  PUNCH_CARD_PURCHASED: "Punch card purchased",
  PUNCH_CARD_GRANTED: "Punch card added by the gym",
  DROP_IN_PURCHASED: "Drop-in purchased",
  SUBSCRIPTION_CREATED: "Recurring billing started",
  SUBSCRIPTION_UPDATED: "Recurring billing updated",
  PAYMENT_SUCCEEDED: "Payment succeeded",
  PAYMENT_FAILED: "Payment failed",
  PAYMENT_ACTION_REQUIRED: "Payment needs your action",
  PAYMENT_UPDATE_REQUESTED: "Payment-method update requested",
  RETRY_REQUESTED: "Payment retry requested",
  STRIPE_ACCOUNT_UPDATED: "Gym payment setup updated",
  STRIPE_ACCOUNT_DISCONNECTED: "Gym payment setup disconnected",
};

const punchCardStatusLabels: Record<string, string> = {
  ACTIVE: "Ready to use",
  DEPLETED: "Used up",
  ARCHIVED: "Archived",
};

const failureCodeLabels: Record<string, string> = {
  card_declined: "Payment was declined.",
  expired_card: "The card has expired.",
  incorrect_cvc: "The card security code was incorrect.",
  insufficient_funds: "The card has insufficient funds.",
  authentication_required: "Payment authentication is required.",
};

const actionableFailureStatuses = new Set([
  "PAST_DUE",
  "PAYMENT_FAILED",
  "ACTION_REQUIRED",
  "FAILED",
]);

const supportedCurrencyCodes = new Set(Intl.supportedValuesOf("currency"));

const calendarDateFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function createInstantFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

export function formatMembershipStatus(status: string): string {
  return membershipStatusLabels[status] ?? "Membership status unavailable";
}

export function formatBillingStateStatus(status: string): string {
  return billingStateLabels[status] ?? "Billing status unavailable";
}

export function formatBillingRecordStatus(status: string): string {
  return billingRecordStatusLabels[status] ?? "Status unavailable";
}

export function formatBillingRecordType(type: string): string {
  return billingRecordTypeLabels[type] ?? "Billing update";
}

export function formatPunchCardStatus(status: string): string {
  return punchCardStatusLabels[status] ?? "Status unavailable";
}

export function formatCalendarDate(value: Date): string {
  return calendarDateFormatter.format(value);
}

export function formatGymDateTime(
  value: Date | null,
  gymTimeZone: string,
  nullLabel = "Not available",
): string {
  if (!value) {
    return nullLabel;
  }

  try {
    return createInstantFormatter(gymTimeZone).format(value);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }

    return `${createInstantFormatter("UTC").format(value)} (gym timezone unavailable)`;
  }
}

export function formatFailureDetail(args: {
  status: string;
  failureMessage: string | null;
  failureCode: string | null;
}): string {
  const message = args.failureMessage?.trim();

  if (message) {
    return message;
  }

  if (args.failureCode) {
    return (
      failureCodeLabels[args.failureCode] ?? "Payment could not be completed."
    );
  }

  return actionableFailureStatuses.has(args.status)
    ? "Payment issue details are unavailable."
    : "No payment issue recorded";
}

export function formatMoney(
  amountCents: number | null,
  currency: string | null,
): string {
  if (amountCents === null) {
    return "Amount not recorded";
  }

  const currencyCode = currency?.trim().toUpperCase();

  if (!currencyCode) {
    return `${amountCents} amount units (currency not recorded)`;
  }

  if (!supportedCurrencyCodes.has(currencyCode)) {
    return `${amountCents} ${currencyCode} amount units`;
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currencyCode,
  }).format(amountCents / 100);
}
