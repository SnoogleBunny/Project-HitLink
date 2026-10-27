import { randomUUID } from "node:crypto";
import { PublicEnrollmentError } from "@flowstate/db";

// These are the current explicit rejections in getPublicEnrollmentForms,
// requireEnrollmentAuthority and effectiveEnrollmentFormsTx. Match a genuine
// domain error and return reviewed constant copy, never arbitrary Error.message.
const expected = new Map([
  ["Registration not found.", "REGISTRATION_NOT_FOUND"],
  [
    "Sign in to the account used for this registration.",
    "REGISTRATION_ACCOUNT_REQUIRED",
  ],
  [
    "This account is not available for member registration.",
    "REGISTRATION_ACCOUNT_UNAVAILABLE",
  ],
  [
    "Use the participant’s own account for this registration.",
    "PARTICIPANT_ACCOUNT_REQUIRED",
  ],
  [
    "The family relationship changed. Ask the gym to review it.",
    "FAMILY_RELATIONSHIP_REVIEW",
  ],
  [
    "The gym must verify guardian access before you can sign or pay for this participant.",
    "GUARDIAN_ACCESS_REVIEW",
  ],
  [
    "This participant is no longer available for registration.",
    "PARTICIPANT_UNAVAILABLE",
  ],
  [
    "This trial class changed or is unavailable. Choose another trial date or ask the gym to review it.",
    "TRIAL_OCCURRENCE_REVIEW",
  ],
  [
    "This trial class is no longer upcoming. Choose another trial date or ask the gym to review it.",
    "TRIAL_DATE_PASSED",
  ],
  [
    "The gym needs to publish a required form before registration can continue.",
    "REQUIRED_FORM_PUBLICATION_REVIEW",
  ],
  [
    "A currently verified guardian must sign this participant's forms.",
    "CURRENT_GUARDIAN_SIGNATURE_REQUIRED",
  ],
  [
    "The adult participant must sign through their own current account.",
    "CURRENT_ADULT_SIGNATURE_REQUIRED",
  ],
  [
    "The participant's signing authority changes before this trial class. Ask the gym to review it, or return after the birthday through the adult participant's own account.",
    "TRIAL_SIGNING_AUTHORITY_REVIEW",
  ],
  [
    "A required form expires before this trial class. Ask the gym to publish a renewal covering this date or choose another trial date.",
    "TRIAL_FORM_RENEWAL_REVIEW",
  ],
] as const);

export interface PublicEnrollmentFormsFailure {
  message: string;
  code: string;
  diagnosticId?: string;
}

export function publicEnrollmentFormsFailure(
  error: unknown,
): PublicEnrollmentFormsFailure {
  if (error instanceof PublicEnrollmentError) {
    const descriptor = Object.getOwnPropertyDescriptor(error, "message");
    const value: unknown =
      descriptor && "value" in descriptor ? descriptor.value : undefined;
    // Iterate the fixed map so output copy comes from its reviewed keys.
    for (const [message, code] of expected) {
      if (value === message) return { message, code };
    }
  }
  const diagnosticId = randomUUID();
  const code = "PUBLIC_ENROLLMENT_FORMS_UNAVAILABLE";
  const record = {
    schemaVersion: 1,
    event: "application.error",
    code,
    boundary: "PUBLIC_REGISTRATION_FORMS_LOADER",
    diagnosticId,
    occurredAt: new Date().toISOString(),
  };
  // Never forward the exception, enrollment, person, bearer token or sink error.
  // Logging failure cannot turn this blocked registration into apparent success.
  try {
    console.error(JSON.stringify(record));
  } catch {
    /* The UI still returns the safe reference; durable logging is not implied. */
  }
  return {
    code,
    diagnosticId,
    message: `Required forms could not be checked. Try again, or contact the gym with reference ${diagnosticId}. Registration cannot continue until the forms are checked.`,
  };
}
