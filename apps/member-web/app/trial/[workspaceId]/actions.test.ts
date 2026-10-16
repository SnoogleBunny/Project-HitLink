import { describe, expect, it } from "vitest";
import { emptyTrialBookingFormState } from "../../form-states";
import { createTrialBookingAction } from "./actions";

describe("retired unverified trial booking action", () => {
  it("refuses a replayed contact-only form and directs the visitor to email verification", async () => {
    const form = new FormData();
    form.set("workspaceId", "gym"); form.set("fullName", "Another member");
    form.set("email", "someone@example.test"); form.set("bookingOption", "template|2030-01-01");
    expect(await createTrialBookingAction(emptyTrialBookingFormState, form)).toEqual({ error: "Open the gym’s current trial page and verify your email before booking.", confirmation: null });
  });
});
