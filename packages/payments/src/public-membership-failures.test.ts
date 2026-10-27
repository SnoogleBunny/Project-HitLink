import { Prisma, FinancialError, PublicEnrollmentError } from "@flowstate/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicMembershipActivationFailure } from "./public-membership-failures.js";

afterEach(() => vi.restoreAllMocks());
const reference = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("paid public membership consumed failure projection", () => {
  it.each([
    [FinancialError, "Verify the registration account before payment.", "REGISTRATION_ACCOUNT_REVIEW"],
    [FinancialError, "Ask the gym to reactivate this participant before purchasing a membership.", "PARTICIPANT_REACTIVATION_REVIEW"],
    [FinancialError, "Sign in with the verified registration account.", "VERIFIED_REGISTRATION_ACCOUNT_REQUIRED"],
    [FinancialError, "This account cannot make this purchase.", "FINANCIAL_PAYER_REVIEW"],
    [FinancialError, "You no longer have permission to pay for this family member.", "FAMILY_PAYMENT_AUTHORITY_REVIEW"],
    [FinancialError, "The gym must verify your family permissions before this membership can begin.", "FAMILY_PERMISSIONS_REVIEW"],
    [FinancialError, "Complete every current required form before paying for this membership.", "CURRENT_FORMS_REQUIRED"],
    [FinancialError, "Payment settled, but this membership changed before activation. The gym must reconcile access and money.", "MEMBERSHIP_ACTIVATION_STATE_REVIEW"],
    [FinancialError, "The subscription has moved beyond its initial billing period or changed its anchor before registration completed. Review current debt and service dates before activation.", "SUBSCRIPTION_INITIAL_PERIOD_REVIEW"],
    [FinancialError, "The payment changed. Reload its status before continuing.", "PAYMENT_OPERATION_VERSION_REVIEW"],
    [PublicEnrollmentError, "Online registration is not open for this gym yet.", "PUBLIC_REGISTRATION_UNAVAILABLE"],
    [PublicEnrollmentError, "Sign in to the account used for this registration.", "REGISTRATION_SIGN_IN_REQUIRED"],
    [PublicEnrollmentError, "This account is not available for member registration.", "REGISTRATION_ACCOUNT_UNAVAILABLE"],
    [PublicEnrollmentError, "Use the participant’s own account for this registration.", "PARTICIPANT_ACCOUNT_REQUIRED"],
    [PublicEnrollmentError, "The family relationship changed. Ask the gym to review it.", "FAMILY_RELATIONSHIP_REVIEW"],
    [PublicEnrollmentError, "The gym must verify guardian access before you can sign or pay for this participant.", "GUARDIAN_ACCESS_REVIEW"],
    [PublicEnrollmentError, "This participant is no longer available for registration.", "PARTICIPANT_UNAVAILABLE"],
    [PublicEnrollmentError, "The gym needs to publish a required form before registration can continue.", "REQUIRED_FORM_PUBLICATION_REVIEW"],
    [PublicEnrollmentError, "A currently verified guardian must sign this participant's forms.", "CURRENT_GUARDIAN_SIGNATURE_REQUIRED"],
    [PublicEnrollmentError, "The adult participant must sign through their own current account.", "CURRENT_ADULT_SIGNATURE_REQUIRED"],
  ] as const)("retains fixed reviewed policy copy for %s: %s", (ErrorType, reason, code) => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(publicMembershipActivationFailure(new ErrorType(reason))).toEqual({ reason, code });
    expect(output).not.toHaveBeenCalled();
  });

  it("uses one server reference in the diagnostic and persistable reason without reading raw Prisma error fields", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = new Prisma.PrismaClientKnownRequestError("PRIVATE_PERSON BEARER_SECRET", { code: "P2002", clientVersion: "6.19.3", meta: { source: "PRIVATE_META" } });
    const read = vi.fn(() => { throw new Error("PRIVATE_GETTER"); });
    for (const field of ["stack", "code", "cause", "meta", "message"]) Object.defineProperty(original, field, { get: read });
    const result = publicMembershipActivationFailure(original);
    expect(result).toMatchObject({ code: "PUBLIC_MEMBERSHIP_ACTIVATION_REVIEW", diagnosticId: expect.stringMatching(reference) });
    expect(result.reason).toBe(`Payment settled but membership access needs review. ${result.code}:${result.diagnosticId}`);
    expect(output).toHaveBeenCalledExactlyOnceWith(expect.any(String));
    expect(JSON.parse(output.mock.calls[0]![0] as string)).toEqual({ schemaVersion: 1, event: "public-membership.activation.error", boundary: "PUBLIC_MEMBERSHIP_PAID_ACTIVATION", code: result.code, diagnosticId: result.diagnosticId, occurredAt: expect.any(String) });
    expect(read).not.toHaveBeenCalled();
    expect(JSON.stringify({ result, output: output.mock.calls })).not.toMatch(/PRIVATE_|BEARER_/);
  });

  it.each([
    new Error("Complete every current required form before paying for this membership."),
    new FinancialError("PRIVATE_FINANCIAL_MESSAGE"),
    new PublicEnrollmentError("PRIVATE_ENROLLMENT_MESSAGE"),
    Object.assign(new Error("PRIVATE_FORGED"), { name: "FinancialError", code: "CURRENT_FORMS_REQUIRED", diagnosticId: "PRIVATE_REFERENCE" }),
    "PRIVATE_STRING",
    null,
  ])("does not trust an unknown failure or a forged policy result", (original) => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = publicMembershipActivationFailure(original);
    expect(result).toMatchObject({ code: "PUBLIC_MEMBERSHIP_ACTIVATION_REVIEW", diagnosticId: expect.stringMatching(reference) });
    expect(JSON.stringify({ result, output: output.mock.calls })).not.toContain("PRIVATE_");
  });

  it("does not invoke an untrusted domain message getter or prototype trap", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const read = vi.fn(() => { throw new Error("PRIVATE_ACCESSOR"); });
    const domain = new FinancialError("Private");
    Object.defineProperty(domain, "message", { get: read });
    expect(publicMembershipActivationFailure(domain).code).toBe("PUBLIC_MEMBERSHIP_ACTIVATION_REVIEW");
    expect(read).not.toHaveBeenCalled();
    const proxy = new Proxy({}, { getPrototypeOf: () => { throw new Error("PRIVATE_PROTOTYPE"); } });
    expect(publicMembershipActivationFailure(proxy).code).toBe("PUBLIC_MEMBERSHIP_ACTIVATION_REVIEW");
  });

  it("keeps the fixed review reference when the log sink fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => { throw new Error("PRIVATE_SINK_ERROR"); });
    const result = publicMembershipActivationFailure(new Error("PRIVATE_ORIGINAL"));
    expect(result).toMatchObject({ diagnosticId: expect.stringMatching(reference), reason: expect.stringContaining("membership access needs review") });
    expect(result.reason).toContain(result.diagnosticId!);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
  });
});
