import { describe, expect, it } from "vitest";
import {
  buildDirectBookingFundingReview,
  directBookingCommercialVersion,
  parseDirectBookingFundingReview,
} from "../../../packages/db/src/direct-booking-funding.js";

const review = () =>
  buildDirectBookingFundingReview({
    workspaceId: "gym",
    memberId: "person",
    classTemplateId: "class",
    scheduledForDate: "2030-01-07",
    occurrence: {
      programId: "program",
      startsAt: "2030-01-07T18:00:00.000Z",
      endsAt: "2030-01-07T19:00:00.000Z",
      timezone: "UTC",
      cancellationCutoffMinutes: 120,
    },
    funding: {
      kind: "PUNCH_CARD",
      id: "owned-pack",
      version: "a".repeat(64),
      units: 1,
    },
  });

describe("direct booking review input", () => {
  it("round-trips the exact scope and one paid unit", () => {
    expect(parseDirectBookingFundingReview(JSON.stringify(review()))).toEqual(
      review(),
    );
  });
  it("rejects missing, oversized, malformed and extra posted data", () => {
    for (const value of [
      null,
      undefined,
      "",
      "not json",
      "x".repeat(4097),
      { ...review(), source: "ADMIN" },
    ])
      expect(() => parseDirectBookingFundingReview(value)).toThrow(
        "review this class again",
      );
  });
  it("binds beneficiary, occurrence, source, units and commercial version", () => {
    const original = review();
    for (const changed of [
      { ...original, memberId: "another-person" },
      { ...original, scheduledForDate: "2030-01-14" },
      {
        ...original,
        occurrence: { ...original.occurrence, cancellationCutoffMinutes: 240 },
      },
      { ...original, funding: { ...original.funding, id: "another-pack" } },
      {
        ...original,
        funding: { ...original.funding, version: "b".repeat(64) },
      },
      { ...original, funding: { ...original.funding, units: 2 } },
    ])
      expect(() => parseDirectBookingFundingReview(changed)).toThrow();
  });
  it("requires an exact payable amount and currency for a drop-in", () => {
    const original = review();
    const dropIn = buildDirectBookingFundingReview({
      ...original,
      funding: {
        kind: "DROP_IN",
        id: "one-class",
        version: "b".repeat(64),
        amountCents: 2500,
        currency: "cad",
      },
    });
    expect(parseDirectBookingFundingReview(dropIn).funding).toMatchObject({
      amountCents: 2500,
      currency: "cad",
    });
    expect(() =>
      parseDirectBookingFundingReview({
        ...dropIn,
        funding: { ...dropIn.funding, amountCents: -1 },
      }),
    ).toThrow();
    expect(() =>
      parseDirectBookingFundingReview({
        ...dropIn,
        funding: { ...dropIn.funding, currency: "USD" },
      }),
    ).toThrow();
  });
  it("uses a canonical commercial projection independent of property ordering", () => {
    expect(
      directBookingCommercialVersion({
        priceCents: 2500,
        policy: { noShow: true, version: 2 },
      }),
    ).toBe(
      directBookingCommercialVersion({
        policy: { version: 2, noShow: true },
        priceCents: 2500,
      }),
    );
  });
});
