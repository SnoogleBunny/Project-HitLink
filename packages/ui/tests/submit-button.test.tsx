import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { formStatus } = vi.hoisted(() => ({ formStatus: vi.fn() }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: formStatus,
}));
import { SubmitButton } from "../src/submit-button";

beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  formStatus.mockReturnValue({ pending: false });
});

describe("shared pending submit contract", () => {
  it("keeps the submitter identity, form attributes and accessible label", () => {
    const html = renderToStaticMarkup(
      <SubmitButton
        pendingLabel="Saving…"
        name="intent"
        value="approve"
        form="review-form"
        formAction="/review"
        aria-describedby="review-consequences"
      >
        Approve
      </SubmitButton>,
    );
    expect(html).toContain('class="hl-button"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('name="intent"');
    expect(html).toContain('value="approve"');
    expect(html).toContain('form="review-form"');
    expect(html).toContain('formAction="/review"');
    expect(html).toContain('aria-describedby="review-consequences"');
    expect(html).toContain(">Approve</button>");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("aria-busy");
  });

  it("uses the actual form status to disable and announce pending work", () => {
    formStatus.mockReturnValue({ pending: true });
    const html = renderToStaticMarkup(
      <SubmitButton pendingLabel="Saving…" disabled={false}>
        Save
      </SubmitButton>,
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(">Saving…</button>");
    expect(html).not.toContain(">Save</button>");
  });

  it("preserves an explicitly disabled control without claiming pending work", () => {
    const html = renderToStaticMarkup(
      <SubmitButton
        pendingLabel="Saving…"
        disabled
        className="button button-secondary"
      >
        Save
      </SubmitButton>,
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('class="button button-secondary"');
    expect(html).not.toContain("aria-busy");
    expect(html).toContain(">Save</button>");
  });
});
