import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntryShell } from "./entry-shell";

describe("EntryShell", () => {
  it("keeps identity context before one primary task with one main and one h1", () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;

    const html = renderToStaticMarkup(
      <EntryShell
        description="Owners and coaches use their admin credentials to continue."
        eyebrow="Admin access"
        identityDescription="Role-aware access for one gym location."
        identityEyebrow="Flowstate admin"
        identityTitle="One front door. The right workspace."
        title="Welcome back"
      >
        <form aria-label="Admin login" />
      </EntryShell>,
    );

    const identityStart = html.indexOf('class="entry-identity"');
    const taskStart = html.indexOf('class="entry-task"');

    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain('aria-labelledby="entry-title"');
    expect(html).toContain('<h1 id="entry-title">Welcome back</h1>');
    expect(html).toContain("Flowstate admin");
    expect(html).toContain("One front door. The right workspace.");
    expect(identityStart).toBeGreaterThan(-1);
    expect(taskStart).toBeGreaterThan(identityStart);
  });
});
