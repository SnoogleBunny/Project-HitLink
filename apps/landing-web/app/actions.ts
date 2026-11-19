"use server";

import {
  saveWaitlistSubmission,
  validateWaitlistSubmission,
  waitlistValuesFromSubmission,
  type WaitlistState,
} from "../lib/waitlist";

export async function joinWaitlistAction(
  _previousState: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const { errors, submission } = validateWaitlistSubmission(formData);

  if (Object.keys(errors).length > 0) {
    return {
      status: "error",
      message: "Check the fields with errors, then submit your request again.",
      errors,
      attemptId: submission.attemptId,
      values: waitlistValuesFromSubmission(submission),
    };
  }

  let saveResult: "saved" | "duplicate";

  try {
    saveResult = await saveWaitlistSubmission(submission);
  } catch {
    return {
      status: "error",
      message:
        "We couldn't confirm that your waitlist request was saved locally. Please try again.",
      errors: {},
      attemptId: submission.attemptId,
      values: waitlistValuesFromSubmission(submission),
    };
  }

  if (saveResult === "duplicate") {
    return {
      status: "duplicate",
      message:
        "This same waitlist request is already saved locally. You do not need to submit it again.",
      errors: {},
      attemptId: submission.attemptId,
      values: waitlistValuesFromSubmission(submission),
    };
  }

  return {
    status: "success",
    message:
      "Your Founding Gym waitlist request was saved locally. No email was sent.",
    errors: {},
    attemptId: submission.attemptId,
    values: waitlistValuesFromSubmission(submission),
  };
}
