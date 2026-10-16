import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "../src/button";
import { Card } from "../src/card";
import { Money, PageSkeleton } from "../src/primitives";
import { formatMoney } from "../src/money";

describe("money representation", () => {
  it.each([
    [0, "CAD\u202f0.00"],
    [12900, "CAD\u202f129.00"],
    [123456, "CAD\u202f1,234.56"],
    [-750, "CAD\u202f-7.50"],
  ])(
    "formats %s minor units with an inseparable currency label",
    (amount, expected) => {
      expect(formatMoney(amount as number)).toBe(expected);
    },
  );
  it("uses the accepted currency and one text run", () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    expect(
      renderToStaticMarkup(<Money amountMinor={2510} currency="usd" />),
    ).toBe('<span class="hl-money ">USD\u202f25.10</span>');
  });
});

describe("shared semantics", () => {
  it("preserves native action properties without a starter alert", () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    const html = renderToStaticMarkup(
      <Button type="submit" name="operation" value="approve" disabled>
        Approve
      </Button>,
    );
    expect(html).toContain('name="operation"');
    expect(html).toContain('value="approve"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("alert");
  });
  it("keeps informational cards out of the keyboard link order", () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    const html = renderToStaticMarkup(
      <Card title="Payment status">
        <p>No payments due</p>
      </Card>,
    );
    expect(html).toContain("<section");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("utm_");
  });
  it("provides one truthful loading announcement with decorative blocks", () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    const html = renderToStaticMarkup(<PageSkeleton label="Loading classes" />);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading classes");
    expect(html).toContain('aria-hidden="true"');
  });
});
