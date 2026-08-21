import { describe, expect, it } from "vitest";
import {
  formatBillingRecordStatus,
  formatBillingRecordType,
  formatBillingStateStatus,
  formatCalendarDate,
  formatFailureDetail,
  formatGymDateTime,
  formatMembershipStatus,
  formatMoney,
  formatPunchCardStatus,
} from "./billing-display";

describe("billing display mappings", () => {
  it.each([
    ["ACTIVE", "Active"],
    ["PENDING_PAYMENT_METHOD", "Payment method needed"],
    ["PAST_DUE", "Past due"],
    ["FROZEN", "Frozen"],
    ["CANCELLED", "Cancelled"],
    ["ENDED", "Ended"],
  ])("maps membership status %s", (source, display) => {
    expect(formatMembershipStatus(source)).toBe(display);
  });

  it.each([
    ["NOT_READY", "Billing not ready"],
    ["ACTIVE", "Active"],
    ["PENDING_PAYMENT_METHOD", "Payment method needed"],
    ["PAST_DUE", "Past due"],
    ["PAYMENT_FAILED", "Payment failed"],
    ["ACTION_REQUIRED", "Member action needed"],
    ["FROZEN", "Frozen"],
    ["CANCELLED", "Cancelled"],
    ["ENDED", "Ended"],
  ])("maps billing state %s", (source, display) => {
    expect(formatBillingStateStatus(source)).toBe(display);
  });

  it.each([
    ["INFO", "Recorded"],
    ["PENDING", "Pending"],
    ["SUCCEEDED", "Succeeded"],
    ["FAILED", "Failed"],
    ["ACTION_REQUIRED", "Member action needed"],
  ])("maps billing-record status %s", (source, display) => {
    expect(formatBillingRecordStatus(source)).toBe(display);
  });

  it.each([
    ["MEMBERSHIP_ASSIGNED", "Membership assigned"],
    ["MEMBERSHIP_CANCELLED", "Membership cancellation recorded"],
    ["MEMBERSHIP_FROZEN", "Membership frozen"],
    ["MEMBERSHIP_UNFROZEN", "Membership freeze ended"],
    ["PUNCH_CARD_PURCHASED", "Punch card purchased"],
    ["PUNCH_CARD_GRANTED", "Punch card added by the gym"],
    ["DROP_IN_PURCHASED", "Drop-in purchased"],
    ["SUBSCRIPTION_CREATED", "Recurring billing started"],
    ["SUBSCRIPTION_UPDATED", "Recurring billing updated"],
    ["PAYMENT_SUCCEEDED", "Payment succeeded"],
    ["PAYMENT_FAILED", "Payment failed"],
    ["PAYMENT_ACTION_REQUIRED", "Payment needs your action"],
    ["PAYMENT_UPDATE_REQUESTED", "Payment-method update requested"],
    ["RETRY_REQUESTED", "Payment retry requested"],
    ["STRIPE_ACCOUNT_UPDATED", "Gym payment setup updated"],
    ["STRIPE_ACCOUNT_DISCONNECTED", "Gym payment setup disconnected"],
  ])("maps billing-record type %s", (source, display) => {
    expect(formatBillingRecordType(source)).toBe(display);
  });

  it.each([
    ["ACTIVE", "Ready to use"],
    ["DEPLETED", "Used up"],
    ["ARCHIVED", "Archived"],
  ])("maps punch-card status %s", (source, display) => {
    expect(formatPunchCardStatus(source)).toBe(display);
  });

  it("uses non-raw fallbacks for every mapping family", () => {
    expect(formatMembershipStatus("FUTURE_MEMBERSHIP_STATE")).toBe(
      "Membership status unavailable",
    );
    expect(formatBillingStateStatus("FUTURE_BILLING_STATE")).toBe(
      "Billing status unavailable",
    );
    expect(formatBillingRecordStatus("FUTURE_RECORD_STATUS")).toBe(
      "Status unavailable",
    );
    expect(formatBillingRecordType("FUTURE_RECORD_TYPE")).toBe(
      "Billing update",
    );
    expect(formatPunchCardStatus("FUTURE_CARD_STATE")).toBe(
      "Status unavailable",
    );
  });
});

describe("billing display dates and amounts", () => {
  it("keeps date-only values on their stored calendar date", () => {
    expect(formatCalendarDate(new Date("2027-01-15T00:00:00.000Z"))).toBe(
      "Jan 15, 2027",
    );
  });

  it("formats instants in the explicit gym timezone", () => {
    expect(
      formatGymDateTime(
        new Date("2027-01-15T21:30:00.000Z"),
        "America/Toronto",
      ),
    ).toBe("Jan 15, 2027, 4:30 p.m. EST");
  });

  it("fails safely to explicit UTC when the gym timezone is invalid", () => {
    expect(
      formatGymDateTime(
        new Date("2027-01-15T21:30:00.000Z"),
        "Invalid/Gym-Timezone",
      ),
    ).toBe("Jan 15, 2027, 9:30 p.m. UTC (gym timezone unavailable)");
  });

  it("preserves valid amounts and uses truthful unknown/null fallbacks", () => {
    expect(formatMoney(12900, "cad")).toBe("$129.00");
    expect(formatMoney(12900, "zzz")).toBe("12900 ZZZ amount units");
    expect(formatMoney(12900, null)).toBe(
      "12900 amount units (currency not recorded)",
    );
    expect(formatMoney(null, "cad")).toBe("Amount not recorded");
  });
});

describe("billing failure detail", () => {
  it("prefers a non-empty stored message", () => {
    expect(
      formatFailureDetail({
        status: "PAYMENT_FAILED",
        failureMessage: "  Issuer declined this payment.  ",
        failureCode: "card_declined",
      }),
    ).toBe("Issuer declined this payment.");
  });

  it.each([
    ["card_declined", "Payment was declined."],
    ["expired_card", "The card has expired."],
    ["incorrect_cvc", "The card security code was incorrect."],
    ["insufficient_funds", "The card has insufficient funds."],
    ["authentication_required", "Payment authentication is required."],
  ])("maps failure code %s", (failureCode, display) => {
    expect(
      formatFailureDetail({
        status: "PAYMENT_FAILED",
        failureMessage: null,
        failureCode,
      }),
    ).toBe(display);
  });

  it("does not expose unknown provider tokens", () => {
    expect(
      formatFailureDetail({
        status: "PAYMENT_FAILED",
        failureMessage: " ",
        failureCode: "future_provider_failure",
      }),
    ).toBe("Payment could not be completed.");
  });

  it("keeps missing details actionable for failed states and neutral otherwise", () => {
    expect(
      formatFailureDetail({
        status: "ACTION_REQUIRED",
        failureMessage: null,
        failureCode: null,
      }),
    ).toBe("Payment issue details are unavailable.");
    expect(
      formatFailureDetail({
        status: "ACTIVE",
        failureMessage: null,
        failureCode: null,
      }),
    ).toBe("No payment issue recorded");
  });
});
