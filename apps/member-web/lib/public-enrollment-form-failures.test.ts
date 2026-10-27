import { Prisma } from "@prisma/client";
import { PublicEnrollmentError } from "@flowstate/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicEnrollmentFormsFailure } from "./public-enrollment-form-failures";

afterEach(() => vi.restoreAllMocks());
const reference =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("public registration consumed forms failures", () => {
  it.each([
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
  ])(
    "retains the reviewed %s rejection without a technical-failure event",
    (message, code) => {
      const output = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(
        publicEnrollmentFormsFailure(new PublicEnrollmentError(message)),
      ).toEqual({ message, code });
      expect(output).not.toHaveBeenCalled();
    },
  );

  it("replaces an actual Prisma exception with blocked fixed copy and an exactly correlated safe event", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Prisma.PrismaClientKnownRequestError(
      "PRIVATE_PERSON BEARER_SECRET",
      {
        code: "P2002",
        clientVersion: "6.19.3",
        meta: { private: "PRIVATE_META" },
      },
    );
    const result = publicEnrollmentFormsFailure(failure);
    expect(result).toMatchObject({
      code: "PUBLIC_ENROLLMENT_FORMS_UNAVAILABLE",
      diagnosticId: expect.stringMatching(reference),
      message: expect.stringContaining("Registration cannot continue"),
    });
    expect(output).toHaveBeenCalledExactlyOnceWith(expect.any(String));
    expect(JSON.parse(output.mock.calls[0]![0] as string)).toEqual({
      schemaVersion: 1,
      event: "application.error",
      code: result.code,
      boundary: "PUBLIC_REGISTRATION_FORMS_LOADER",
      diagnosticId: result.diagnosticId,
      occurredAt: expect.any(String),
    });
    expect(result.message).toContain(result.diagnosticId!);
    expect(JSON.stringify({ result, logs: output.mock.calls })).not.toMatch(
      /PRIVATE_|BEARER_/,
    );
  });

  it("does not trust an ordinary error with expected copy or an unknown domain message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      publicEnrollmentFormsFailure(new Error("Registration not found.")),
    ).toMatchObject({ code: "PUBLIC_ENROLLMENT_FORMS_UNAVAILABLE" });
    expect(
      publicEnrollmentFormsFailure(
        new PublicEnrollmentError("PRIVATE_DOMAIN_MESSAGE"),
      ),
    ).toMatchObject({ code: "PUBLIC_ENROLLMENT_FORMS_UNAVAILABLE" });
  });

  it("does not invoke message/code/stack/cause getters on unknown failures or a forged domain message accessor", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const read = vi.fn(() => {
      throw new Error("PRIVATE_GETTER");
    });
    const unknown = Object.create(null);
    for (const key of ["message", "code", "stack", "cause"])
      Object.defineProperty(unknown, key, { get: read });
    const domain = new PublicEnrollmentError("Private");
    Object.defineProperty(domain, "message", { get: read });
    expect(publicEnrollmentFormsFailure(unknown).code).toBe(
      "PUBLIC_ENROLLMENT_FORMS_UNAVAILABLE",
    );
    expect(publicEnrollmentFormsFailure(domain).code).toBe(
      "PUBLIC_ENROLLMENT_FORMS_UNAVAILABLE",
    );
    expect(read).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledTimes(2);
  });

  it("retains blocked copy/reference when the logging sink fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("PRIVATE_SINK_FAILURE");
    });
    const result = publicEnrollmentFormsFailure(new Error("PRIVATE_ORIGINAL"));
    expect(result).toMatchObject({
      diagnosticId: expect.stringMatching(reference),
      message: expect.stringContaining("Registration cannot continue"),
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
  });
});
