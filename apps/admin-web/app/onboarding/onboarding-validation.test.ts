import { describe, expect, it } from "vitest";
import { validateOnboardingFields } from "./onboarding-validation";

describe("validateOnboardingFields", () => {
  it("returns accessible inline messages for every required field", () => {
    expect(
      validateOnboardingFields({
        workspaceName: "",
        currentSoftware: "  ",
        accessInstructions: "",
        timezone: "",
      }),
    ).toEqual({
      workspaceName: "Enter your gym name.",
      currentSoftware: "Enter the software you use today.",
      accessInstructions:
        "Tell us how to access your exports or where the handoff is blocked.",
      timezone: "Enter the timezone for your launch.",
    });
  });

  it("accepts trimmed values and reports no client-side errors", () => {
    expect(
      validateOnboardingFields({
        workspaceName: " Sahara Muay Thai ",
        currentSoftware: " Zen Planner ",
        accessInstructions: " Exports are ready. ",
        timezone: " America/Vancouver ",
      }),
    ).toEqual({});
  });
});
