import { randomUUID } from "node:crypto";
import { FinancialError, PublicEnrollmentError } from "@flowstate/db";

// Fixed current policy rejections reachable from the paid activation
// transaction. Returning reviewed copy preserves policy outcomes without
// treating every instance's arbitrary message as safe diagnostic text.
const financialPolicies = new Map<string, string>([
  ["Verify the registration account before payment.", "REGISTRATION_ACCOUNT_REVIEW"],
  ["Ask the gym to reactivate this participant before purchasing a membership.", "PARTICIPANT_REACTIVATION_REVIEW"],
  ["Sign in with the verified registration account.", "VERIFIED_REGISTRATION_ACCOUNT_REQUIRED"],
  ["This account cannot make this purchase.", "FINANCIAL_PAYER_REVIEW"],
  ["You no longer have permission to pay for this family member.", "FAMILY_PAYMENT_AUTHORITY_REVIEW"],
  ["The gym must verify your family permissions before this membership can begin.", "FAMILY_PERMISSIONS_REVIEW"],
  ["Complete every current required form before paying for this membership.", "CURRENT_FORMS_REQUIRED"],
  ["Payment settled, but this membership changed before activation. The gym must reconcile access and money.", "MEMBERSHIP_ACTIVATION_STATE_REVIEW"],
  ["The subscription has moved beyond its initial billing period or changed its anchor before registration completed. Review current debt and service dates before activation.", "SUBSCRIPTION_INITIAL_PERIOD_REVIEW"],
  ["The payment changed. Reload its status before continuing.", "PAYMENT_OPERATION_VERSION_REVIEW"],
]);
const enrollmentPolicies = new Map<string, string>([
  ["Online registration is not open for this gym yet.", "PUBLIC_REGISTRATION_UNAVAILABLE"],
  ["Sign in to the account used for this registration.", "REGISTRATION_SIGN_IN_REQUIRED"],
  ["This account is not available for member registration.", "REGISTRATION_ACCOUNT_UNAVAILABLE"],
  ["Use the participant’s own account for this registration.", "PARTICIPANT_ACCOUNT_REQUIRED"],
  ["The family relationship changed. Ask the gym to review it.", "FAMILY_RELATIONSHIP_REVIEW"],
  ["The gym must verify guardian access before you can sign or pay for this participant.", "GUARDIAN_ACCESS_REVIEW"],
  ["This participant is no longer available for registration.", "PARTICIPANT_UNAVAILABLE"],
  ["The gym needs to publish a required form before registration can continue.", "REQUIRED_FORM_PUBLICATION_REVIEW"],
  ["A currently verified guardian must sign this participant's forms.", "CURRENT_GUARDIAN_SIGNATURE_REQUIRED"],
  ["The adult participant must sign through their own current account.", "CURRENT_ADULT_SIGNATURE_REQUIRED"],
]);

export interface PublicMembershipActivationFailure {
  reason: string;
  code: string;
  diagnosticId?: string;
}

function knownPolicy(error: unknown): PublicMembershipActivationFailure | null {
  try {
    const policies = error instanceof FinancialError
      ? financialPolicies
      : error instanceof PublicEnrollmentError
        ? enrollmentPolicies
        : null;
    if (!policies) return null;
    const descriptor = Object.getOwnPropertyDescriptor(error, "message");
    const value: unknown = descriptor && "value" in descriptor ? descriptor.value : undefined;
    for (const [reason, code] of policies) {
      if (value === reason) return { reason, code };
    }
  } catch {
    // A hostile prototype/accessor cannot turn unknown text into a policy result.
  }
  return null;
}

/** Use only after the paid activation transaction has unwound. */
export function publicMembershipActivationFailure(error: unknown): PublicMembershipActivationFailure {
  const policy = knownPolicy(error);
  if (policy) return policy;
  const code = "PUBLIC_MEMBERSHIP_ACTIVATION_REVIEW";
  const diagnosticId = randomUUID();
  const record = {
    schemaVersion: 1,
    event: "public-membership.activation.error",
    boundary: "PUBLIC_MEMBERSHIP_PAID_ACTIVATION",
    code,
    diagnosticId,
    occurredAt: new Date().toISOString(),
  };
  // This reports an activation failure, not a promise that review persistence
  // succeeded. Never pass the exception, person, provider payload or sink error.
  try {
    console.error(JSON.stringify(record));
  } catch {
    // The original paid/review outcome must not depend on the log sink.
  }
  return {
    code,
    diagnosticId,
    reason: `Payment settled but membership access needs review. ${code}:${diagnosticId}`,
  };
}
