"use server";

import {
  saveWaitlistSubmission,
  validateWaitlistSubmission,
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
      message: "A few details need attention before we can save your spot.",
      errors,
    };
  }

  try {
    await saveWaitlistSubmission(submission);
  } catch {
    return {
      status: "error",
      message:
        "We could not save your waitlist request. Please try again in a moment.",
      errors: {
        form: "Submission failed.",
      },
    };
  }

  return {
    status: "success",
    message:
      "You're on the Founding Gym waitlist. We'll follow up about the grandfathered 15% monthly discount.",
    errors: {},
  };
}
