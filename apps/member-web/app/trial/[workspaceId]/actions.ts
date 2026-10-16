"use server";
import type { TrialBookingFormState } from "../../form-states";
/** Old clients cannot bypass the verified registration journey. */
export async function createTrialBookingAction(_state: TrialBookingFormState, _form: FormData): Promise<TrialBookingFormState> {
  void _state; void _form;
  return { error: "Open the gym’s current trial page and verify your email before booking.", confirmation: null };
}
