import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntryShell } from "./entry-shell";

describe("EntryShell member semantics", () => {
  it("keeps the form task primary while explaining gym-provisioned member access", () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;

    const html = renderToStaticMarkup(
      <EntryShell
        description="Use the member login supplied by your gym."
        eyebrow="Member access"
        intent="member-login"
        title="Log in to your member portal"
      >
        <form aria-label="Member login" />
      </EntryShell>,
    );

    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain("HitLink");
    expect(html).toContain("Your member portal");
    expect(html).toContain("Use the login supplied by your gym");
    expect(html).not.toMatch(/sign up|create (?:an |your )?account/i);

    const identityStart = html.indexOf('class="member-entry-identity"');
    const taskStart = html.indexOf('class="member-entry-task"');
    const formStart = html.indexOf('<form aria-label="Member login"');

    expect(identityStart).toBeGreaterThan(-1);
    expect(taskStart).toBeGreaterThan(identityStart);
    expect(formStart).toBeGreaterThan(taskStart);
  });
});
