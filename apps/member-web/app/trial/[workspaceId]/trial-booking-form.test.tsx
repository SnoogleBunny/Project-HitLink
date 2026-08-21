import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTrialBookingActionMock, formAction, useActionStateMock } =
  vi.hoisted(() => ({
    createTrialBookingActionMock: vi.fn(),
    formAction: "/trial-booking-test",
    useActionStateMock: vi.fn(),
  }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useActionState: useActionStateMock,
  };
});

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./actions", () => ({
  createTrialBookingAction: createTrialBookingActionMock,
}));

import { emptyTrialBookingFormState } from "../../form-states";
import { TrialBookingForm } from "./trial-booking-form";

const populatedTemplates = [
  {
    id: "template_1",
    displayTitle: "Muay Thai Fundamentals",
    programName: "Muay Thai",
    roomName: "Main floor",
    coachDisplayName: "Coach Lee",
    dateOptions: [
      {
        classTemplateId: "template_1",
        scheduledForDate: "2026-08-25",
        label: "Tuesday, August 25 at 6:00 PM",
      },
    ],
  },
];

function renderForm(
  state: typeof emptyTrialBookingFormState = emptyTrialBookingFormState,
  templates = populatedTemplates,
) {
  useActionStateMock.mockReturnValue([state, formAction, false]);
  (globalThis as typeof globalThis & { React: typeof React }).React = React;

  return renderToStaticMarkup(
    <TrialBookingForm workspaceId="workspace_1" templates={templates} />,
  );
}

describe("TrialBookingForm recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes submission when the projection has zero eligible dates", () => {
    const html = renderForm(emptyTrialBookingFormState, []);

    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="submit"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Trial booking is unavailable right now");
    expect(html).toContain("Check back later for an available trial date.");
  });

  it("keeps a populated date fixture usable with named required fields and recovery associations", () => {
    const html = renderForm();
    const bookingSelect = html.match(
      /<select[^>]*name="bookingOption"[^>]*>/,
    )?.[0];
    const nameInput = html.match(/<input[^>]*name="fullName"[^>]*>/)?.[0];
    const emailInput = html.match(/<input[^>]*name="email"[^>]*>/)?.[0];
    const phoneInput = html.match(/<input[^>]*name="phone"[^>]*>/)?.[0];

    expect(html).toContain('action="/trial-booking-test"');
    expect(html).toContain("Tuesday, August 25 at 6:00 PM");
    expect(bookingSelect).toContain('required=""');
    expect(bookingSelect).toContain('id="trial-booking-option"');
    expect(html).toContain('for="trial-booking-option"');
    expect(nameInput).toContain('required=""');
    expect(nameInput).toContain('autoComplete="name"');
    expect(emailInput).toContain('autoComplete="email"');
    expect(phoneInput).toContain('autoComplete="tel"');
    expect(html).toMatch(
      /<button(?=[^>]*type="submit")(?![^>]*disabled)[^>]*>Book trial<\/button>/,
    );
  });

  it("associates a field-specific server error with its recovery field", () => {
    const html = renderForm({
      confirmation: null,
      error: "Participant full name is required.",
    });
    const nameInput = html.match(/<input[^>]*name="fullName"[^>]*>/)?.[0];

    expect(html).toContain('role="alert"');
    expect(html).toContain('id="trial-booking-error-summary"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Participant full name is required.");
    expect(nameInput).toContain('aria-invalid="true"');
    expect(nameInput).toContain(
      'aria-describedby="trial-booking-error-summary"',
    );
  });

  it("announces the atomic-failure truth and associates retry guidance with submit", () => {
    const message =
      "Trial booking could not be completed. No booking was saved. Try again.";
    const html = renderForm({ confirmation: null, error: message });
    const submitButton = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0];

    expect(html).toContain('role="alert"');
    expect(html).toContain(message);
    expect(submitButton).toContain(
      'aria-describedby="trial-booking-error-summary"',
    );
  });
});
