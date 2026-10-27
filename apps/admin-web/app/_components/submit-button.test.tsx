import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { formStatus } = vi.hoisted(() => ({ formStatus: vi.fn() }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: formStatus,
}));
import { SubmitButton as AdminSubmit } from "./submit-button";
import { SubmitButton as MemberSubmit } from "../../../member-web/app/_components/submit-button";

beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  formStatus.mockReturnValue({ pending: false });
});
describe.each([
  ["admin", AdminSubmit, "button"],
  ["member", MemberSubmit, "member-button"],
] as const)(
  "%s submit adapter compatibility",
  (_name, Component, className) => {
    it("retains its existing default class and native submitter attributes", () => {
      const html = renderToStaticMarkup(
        <Component pendingLabel="Working…" name="intent" value="save">
          Save
        </Component>,
      );
      expect(html).toContain(`class="${className}"`);
      expect(html).toContain('type="submit"');
      expect(html).toContain('name="intent"');
      expect(html).toContain('value="save"');
    });
    it("forwards explicit styles, disabled state and the pending label to the shared behavior", () => {
      formStatus.mockReturnValue({ pending: true });
      const html = renderToStaticMarkup(
        <Component pendingLabel="Working…" className="custom-submit" disabled>
          Save
        </Component>,
      );
      expect(html).toContain('class="custom-submit"');
      expect(html).toContain('disabled=""');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain(">Working…</button>");
    });
  },
);
