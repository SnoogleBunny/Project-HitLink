export const onboardingRequiredFieldNames = [
  "workspaceName",
  "currentSoftware",
  "accessInstructions",
  "timezone",
] as const;

export type OnboardingRequiredFieldName =
  (typeof onboardingRequiredFieldNames)[number];

export type OnboardingFieldErrors = Partial<
  Record<OnboardingRequiredFieldName, string>
>;

type OnboardingRequiredValues = Record<OnboardingRequiredFieldName, string>;

const requiredFieldMessages: OnboardingRequiredValues = {
  workspaceName: "Enter your gym name.",
  currentSoftware: "Enter the software you use today.",
  accessInstructions:
    "Tell us how to access your exports or where the handoff is blocked.",
  timezone: "Enter the timezone for your launch.",
};

export function validateOnboardingFields(
  values: OnboardingRequiredValues,
): OnboardingFieldErrors {
  return onboardingRequiredFieldNames.reduce<OnboardingFieldErrors>(
    (errors, fieldName) => {
      if (!values[fieldName].trim()) {
        errors[fieldName] = requiredFieldMessages[fieldName];
      }

      return errors;
    },
    {},
  );
}
