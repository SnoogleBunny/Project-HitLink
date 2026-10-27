import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachingPresale } from "@flowstate/db";
import { CoachingBookingAvailability } from "./booking-availability";

type AvailabilityProps = Parameters<typeof CoachingBookingAvailability>[0];

function presale(overrides: Partial<CoachingPresale> = {}): CoachingPresale {
  return {
    configured: true,
    message: null,
    slots: [
      {
        id: "private-availability-row",
        startsAt: new Date("2026-11-03T17:30:00.000Z"),
        endsAt: new Date("2026-11-03T18:15:00.000Z"),
        // Fixed IANA offset: this formatting test must not assume future
        // regional DST law. DST/service-hour behavior has separate tests.
        timezone: "Etc/GMT+8",
        room: { name: "Studio One" },
        bufferMinutes: 15,
      },
    ],
    notOpenCount: 0,
    caseOwnerName: "Maya Patel",
    resolutionResponseHours: 24,
    disclosure: {
      schemaVersion: 1,
      policyEventId: "private-policy-event",
      policyVersion: 7,
      policyHash: "private-policy-hash",
      reviewedAt: "2026-10-26T00:00:00.000Z",
      availabilityHash: "private-availability-hash",
      availableCount: 1,
      notOpenCount: 0,
      resolutionOwnerWorkspaceUserId: "private-case-owner-row",
      resolutionOwnerNameSnapshot: "Maya Patel",
      resolutionResponseHours: 24,
      notHeld: true,
    },
    ...overrides,
  };
}

function render(props: Partial<AvailabilityProps> = {}) {
  return renderToStaticMarkup(
    <CoachingBookingAvailability
      data={presale()}
      units={4}
      minutes={45}
      locale="en-CA"
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal("React", React);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("appointment availability before purchase", () => {
  it("states the included service and explains that matching times are unheld", () => {
    const html = render();
    expect(html).toContain("Appointment availability before purchase");
    expect(html).toContain(
      "Your program includes 4 appointments of 45 minutes.",
    );
    expect(html).toContain(
      "Displayed times are not held and can change before you book.",
    );
    expect(html).toContain("Currently matching times:");
    expect(html).toContain("Studio One");
    expect(html).not.toMatch(
      /appointment (?:is|has been) (?:booked|reserved|confirmed)/i,
    );
  });

  it("renders safe slot text without provider links, meeting URLs or internal disclosure identities", () => {
    const base = presale();
    // Extra fields model a future widened projection. Rendering availability
    // must continue to select its safe display fields rather than spread them.
    const widened = {
      ...base,
      checkoutUrl: "https://checkout.stripe.com/private-checkout",
      providerReference: "private-provider-reference",
      slots: [
        {
          ...base.slots[0]!,
          meetingUrl: "https://video.example.test/private-meeting",
          providerUrl: "https://provider.example.test/private-session",
        },
      ],
    };
    const html = render({ data: widened });
    expect(html).toContain("Studio One");
    expect(html).toContain("Maya Patel");
    expect(html).not.toMatch(
      /https?:|\bhref=|\bsrc=|\baction=|<(?:a|button|form)(?:\s|>)/i,
    );
    for (const privateValue of [
      "private-checkout",
      "private-provider-reference",
      "private-meeting",
      "private-session",
      "private-availability-row",
      "private-policy-event",
      "private-policy-hash",
      "private-availability-hash",
      "private-case-owner-row",
    ]) {
      expect(html).not.toContain(privateValue);
    }
  });

  it.each([
    { source: "current policy", hours: 24 },
    { source: "faster previously accepted", hours: 8 },
    { source: "faster protected submitted-checkout", hours: 2 },
  ])(
    "displays the supplied resolved $source booking-help promise separately from the coach promise",
    ({ hours }) => {
      // The domain resolves current versus accepted promises before this render.
      // The component displays that resolved value and does not invent a second
      // response window from coach or provider information.
      const base = presale();
      const html = render({
        data: presale({
          resolutionResponseHours: hours,
          disclosure: { ...base.disclosure!, resolutionResponseHours: hours },
        }),
      });
      expect(html).toContain(
        `Maya Patel handles booking, extension or refund reviews and replies within ${hours} hours.`,
      );
      expect(html).toContain(
        "This is the booking-help response window; your coach’s general reply promise remains separate.",
      );
      expect(html).not.toMatch(
        /(?:refund|extension) (?:is|has been) (?:approved|confirmed|guaranteed)/i,
      );
    },
  );

  it.each([
    ["de-DE", "03.11.2026", "09:30", "10:15"],
    ["en-US", "Nov 3, 2026", "9:30", "10:15"],
  ])(
    "uses configured locale %s and the slot business timezone for both endpoints",
    (locale, date, start, end) => {
      const html = render({ locale });
      expect(html).toContain(date);
      expect(html).toContain(start);
      expect(html).toContain(end);
      expect(html).not.toContain("17:30");
      expect(html).not.toContain("18:15");
      if (locale === "de-DE") expect(html).not.toContain("Nov 3, 2026");
    },
  );

  it("uses the supplied slot timezone even when it changes the local calendar day", () => {
    const base = presale();
    const html = render({
      locale: "de-DE",
      data: presale({ slots: [{ ...base.slots[0]!, timezone: "Asia/Seoul" }] }),
    });
    expect(html).toContain("04.11.2026");
    expect(html).toContain("02:30");
    expect(html).toContain("03:15");
    expect(html).not.toContain("03.11.2026");
  });

  it("explains missing policy configuration when no presale projection is available", () => {
    const html = render({ data: null });
    expect(html).toContain('role="status"');
    expect(html).toContain(
      "The gym must confirm appointment delivery and booking-help details before a new purchase.",
    );
    expect(html).toContain("Displayed times are not held");
    expect(html).not.toContain("Currently matching times:");
    expect(html).not.toContain("No matching appointment time");
    expect(html).not.toContain("replies within");
  });

  it("shows the unconfigured-policy explanation without presenting stale slots or an available response promise", () => {
    const message =
      "The owner must confirm appointment service hours and booking rules before new appointment times or purchases are available.";
    const html = render({ data: presale({ configured: false, message }) });
    expect(html).toContain(`<p role="status">${message}</p>`);
    expect(html).not.toContain("Currently matching times:");
    expect(html).not.toContain("Studio One");
    expect(html).not.toContain("Maya Patel");
    expect(html).not.toContain("replies within");
  });

  it.each([null, presale()])(
    "omits appointment availability entirely for a zero-unit program (%#)",
    (data) => {
      expect(render({ units: 0, data })).toBe("");
    },
  );

  it("gives review options when no times match without promising a refund", () => {
    const html = render({ data: presale({ slots: [] }) });
    expect(html).toContain(
      "No matching appointment time is currently available for these program dates.",
    );
    expect(html).toContain(
      "Contact the booking-help owner to review booking, an extension or a refund.",
    );
    expect(html).toContain("A review is not a confirmed refund.");
    expect(html).toContain(
      "Maya Patel handles booking, extension or refund reviews",
    );
    expect(html).not.toContain("Currently matching times:");
  });

  it.each([
    {
      notOpenCount: 1,
      message: "1 matching time is not open for booking yet.",
    },
    {
      notOpenCount: 3,
      message: "3 matching times are not open for booking yet.",
    },
  ])(
    "distinguishes $notOpenCount not-yet-open matching times from currently offered slots",
    ({ notOpenCount, message }) => {
      const html = render({ data: presale({ slots: [], notOpenCount }) });
      expect(html).toContain(message);
      expect(html).not.toContain("Currently matching times:");
      expect(html).not.toMatch(/<(?:a|button|form)(?:\s|>)/i);
    },
  );

  it("renders an online slot as text without constructing a meeting link", () => {
    const base = presale();
    const html = render({
      data: presale({ slots: [{ ...base.slots[0]!, room: null }] }),
    });
    expect(html).toContain("Online appointment");
    expect(html).not.toMatch(/https?:|\bhref=|<(?:a|button)(?:\s|>)/i);
  });

  it("keeps a missing case-owner warning visible and does not invent a named contact or response promise", () => {
    const message =
      "The gym must name a current booking-help owner. Existing paid appointments and units remain yours.";
    const html = render({
      data: presale({ caseOwnerName: null, message, disclosure: null }),
    });
    expect(html).toContain(`<p role="status">${message}</p>`);
    expect(html).toContain(
      "Existing paid appointments and units remain yours.",
    );
    expect(html).not.toContain("Maya Patel");
    expect(html).not.toContain("replies within");
  });
});
