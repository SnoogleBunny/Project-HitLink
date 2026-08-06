import { describe, expect, it } from "vitest";
import {
  buildOccurrenceActionLabel,
  buildOccurrenceErrorMessage,
  getOccurrencePendingLabel,
} from "./schedule-list";
import type { ScheduleOccurrence } from "../../../lib/self-service-bookings";

function buildOccurrence(
  overrides: Partial<ScheduleOccurrence> = {},
): ScheduleOccurrence {
  return {
    classTemplateId: "template_1",
    scheduledForDate: "2026-07-27",
    displayTitle: "Muay Thai Fundamentals",
    programName: "Muay Thai",
    roomName: "Main mat",
    dateLabel: "Monday, July 27",
    timeLabel: "6:30 PM",
    capacityLabel: "4 / 20 booked",
    bookingState: "AVAILABLE",
    accessLabel: "Membership",
    action: "book",
    actionLabel: "Book class",
    note: null,
    ...overrides,
  };
}

describe("member schedule occurrence action copy", () => {
  it("gives repeated controls unique names with class, date, and time context", () => {
    const first = buildOccurrence();
    const second = buildOccurrence({
      scheduledForDate: "2026-08-03",
      dateLabel: "Monday, August 3",
    });

    const firstLabel = buildOccurrenceActionLabel(first);
    const secondLabel = buildOccurrenceActionLabel(second);

    expect(firstLabel).toBe(
      "Book class — Muay Thai Fundamentals, Monday, July 27 at 6:30 PM",
    );
    expect(secondLabel).toContain("Monday, August 3 at 6:30 PM");
    expect(firstLabel).not.toBe(secondLabel);
  });

  it("does not repeat a time that the schedule date label already includes", () => {
    const label = buildOccurrenceActionLabel(
      buildOccurrence({ dateLabel: "Monday, July 27, 2026 at 6:30 PM" }),
    );

    expect(label).toBe(
      "Book class — Muay Thai Fundamentals, Monday, July 27, 2026 at 6:30 PM",
    );
  });

  it("adds the triggering class and date to recoverable failures", () => {
    const message = buildOccurrenceErrorMessage(
      buildOccurrence({
        action: "join_waitlist",
        actionLabel: "Join waitlist",
        bookingState: "FULL",
      }),
      "Choose a valid upcoming class date.",
    );

    expect(message).toContain("Muay Thai Fundamentals");
    expect(message).toContain("Monday, July 27 at 6:30 PM");
    expect(message).toContain("Choose a valid upcoming class date.");
    expect(message).toContain("try again");
  });

  it.each([
    ["book", "Booking…"],
    ["pay_and_book", "Starting checkout…"],
    ["join_waitlist", "Joining waitlist…"],
    ["none", "Already booked"],
  ] as const)("uses a truthful pending label for %s", (action, expected) => {
    expect(
      getOccurrencePendingLabel(
        buildOccurrence({
          action,
          actionLabel: expected === "Already booked" ? expected : "Action",
        }),
      ),
    ).toBe(expected);
  });
});
