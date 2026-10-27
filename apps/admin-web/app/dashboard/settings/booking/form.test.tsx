import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ state: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: () => [mocks.state(), vi.fn(), false],
}));
vi.mock("./actions", () => ({ bookingRulesAction: vi.fn() }));
import { BookingRulesForm } from "./form";
beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
});
describe("booking rule form uses its acknowledged draft base", () => {
  it("keeps old draft authority when server props contain a newer confirmed version", () => {
    mocks.state.mockReturnValue({
      baseVersion: 2,
      confirmedVersion: null,
      error: null,
      success: null,
      review: null,
    });
    const html = renderToStaticMarkup(
      <BookingRulesForm initial={null} version={3} />,
    );
    expect(html).toContain('name="version" value="2"');
    expect(html).not.toContain('name="version" value="3"');
    expect(html).toContain(
      "New booking rules were confirmed while this draft was open",
    );
  });
  it("keeps a committed success visible through same-component server revalidation", () => {
    mocks.state.mockReturnValue({
      baseVersion: 3,
      confirmedVersion: 3,
      error: null,
      success: "Class booking rules version 3 confirmed.",
      review: null,
    });
    const html = renderToStaticMarkup(
      <BookingRulesForm initial={null} version={3} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Class booking rules version 3 confirmed.");
    expect(html).toContain('name="version" value="3"');
    expect(html).not.toContain(
      "New booking rules were confirmed while this draft was open",
    );
  });
});
