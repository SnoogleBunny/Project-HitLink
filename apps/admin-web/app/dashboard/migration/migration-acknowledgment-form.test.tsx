import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { MigrationAcknowledgmentForm } from "./migration-acknowledgment-form";

describe("MigrationAcknowledgmentForm", () => {
  it("renders unchecked with the native submit control disabled", () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    const html = renderToStaticMarkup(
      <MigrationAcknowledgmentForm action={vi.fn()} />,
    );

    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain("checked");
    expect(html).toMatch(
      /<button[^>]*class="button migration-acknowledgment-submit"[^>]*disabled=""[^>]*>Acknowledge and lock summary<\/button>/,
    );
  });

  it("shows a not-allowed cursor while consent keeps submit disabled", () => {
    const css = readFileSync(
      new URL("../../globals.css", import.meta.url),
      "utf-8",
    );

    expect(css).toMatch(
      /\.migration-acknowledgment-submit:disabled\s*{[^}]*cursor:\s*not-allowed;/s,
    );
  });
});
