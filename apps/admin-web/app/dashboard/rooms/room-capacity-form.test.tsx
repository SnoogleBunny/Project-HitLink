import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomCapacitySettings } from "@flowstate/db";
const mocks = vi.hoisted(() => ({ state: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: () => [mocks.state(), vi.fn(), false],
}));
vi.mock("./capacity-actions", () => ({ roomCapacityAction: vi.fn() }));
import { RoomCapacityForm } from "./room-capacity-form";
const initial: RoomCapacitySettings = {
  roomId: "actual-room",
  roomName: "Mat",
  capacity: 2,
  version: "b".repeat(64),
  revision: 2,
  canChange: true,
  history: [],
};
beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
});
describe("room default form retains its acknowledged draft base", () => {
  it("warns on refreshed props while preserving the older hidden version and request", () => {
    mocks.state.mockReturnValue({
      baseVersion: "a".repeat(64),
      confirmedVersion: null,
      operationId: "original-room-request",
      error: null,
      success: null,
      review: null,
    });
    const html = renderToStaticMarkup(
      <RoomCapacityForm
        initial={initial}
        operationId="new-rsc-request"
        locale="en-CA"
      />,
    );
    expect(html).toContain(`name="version" value="${"a".repeat(64)}"`);
    expect(html).toContain('name="operationId" value="original-room-request"');
    expect(html).toContain("Room settings changed while this draft was open");
    expect(html).not.toContain('name="operationId" value="new-rsc-request"');
  });
  it("retains the committed confirmation when the same room revalidates", () => {
    mocks.state.mockReturnValue({
      baseVersion: initial.version,
      confirmedVersion: initial.version,
      operationId: "confirmed-next-request",
      error: null,
      success:
        "Room default capacity review 2 confirmed. Existing reservations and funding stay unchanged.",
      review: null,
    });
    const html = renderToStaticMarkup(
      <RoomCapacityForm
        initial={initial}
        operationId="new-rsc-request"
        locale="en-CA"
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("review 2 confirmed");
    expect(html).not.toContain(
      "Room settings changed while this draft was open",
    );
    expect(html).toContain(`name="version" value="${initial.version}"`);
  });
});
