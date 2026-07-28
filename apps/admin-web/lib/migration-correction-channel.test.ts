import { afterEach, describe, expect, it, vi } from "vitest";

import { getMigrationCorrectionChannelProjection } from "./migration-correction-channel";

const environmentKey = "FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL";

describe("migration correction channel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete process.env[environmentKey];
  });

  it("builds the fixed pre-lock correction draft for one configured recipient", () => {
    vi.stubEnv(environmentKey, "  corrections@example.test  ");

    expect(
      getMigrationCorrectionChannelProjection({
        gymDisplayName: "North & South Gym",
        phase: "pre-lock",
      }),
    ).toEqual({
      status: "available",
      recipient: "corrections@example.test",
      href: "mailto:corrections%40example.test?subject=Migration%20correction%20%E2%80%94%20North%20%26%20South%20Gym&body=I%20found%20a%20problem%20in%20the%20migration%20summary%20before%20acknowledgment.%0A%0ASection%20that%20looks%20wrong%3A%0A%0ADo%20not%20include%20member%20data%2C%20credentials%2C%20export%20files%2C%20or%20private%20links.",
      label: "Email a correction before acknowledging",
      helper:
        "Send to corrections@example.test. This opens your email app. Describe only which part of the summary looks wrong. Do not include member data, credentials, export files, or private links. Do not acknowledge until a corrected summary appears here.",
    });
  });

  it.each([
    ["missing", undefined],
    ["blank", "   "],
    ["carriage return", "corrections@example.test\rBcc:other@example.test"],
    ["line feed", "corrections@example.test\nBcc:other@example.test"],
    ["trailing line feed", "corrections@example.test\n"],
    ["leading tab", "\tcorrections@example.test"],
    ["control character", "corrections@example.test\u0007"],
    ["Unicode format control", "corrections@example.test\u202E"],
    ["query fragment", "corrections@example.test?bcc=other@example.test"],
    ["hash fragment", "corrections@example.test#fragment"],
    ["comma-separated recipients", "one@example.test,two@example.test"],
    ["semicolon-separated recipients", "one@example.test;two@example.test"],
    ["space-separated recipients", "one@example.test two@example.test"],
    ["missing local part", "@example.test"],
    ["missing domain", "corrections@"],
    ["leading local-part dot", ".corrections@example.test"],
    ["consecutive local-part dots", "corrections..team@example.test"],
    ["display-name form", "Corrections <corrections@example.test>"],
    ["multiple at signs", "one@example.test@two.example.test"],
    ["Unicode lookalike domain", "corrections@ｅxample.test"],
    ["overlong value", `${"a".repeat(240)}@example.test`],
  ])("fails closed for a %s recipient", (_label, configuredRecipient) => {
    if (configuredRecipient === undefined) {
      delete process.env[environmentKey];
    } else {
      vi.stubEnv(environmentKey, configuredRecipient);
    }

    expect(
      getMigrationCorrectionChannelProjection({
        gymDisplayName: "North Gym",
        phase: "pre-lock",
      }),
    ).toEqual({
      status: "unavailable",
      reason: "correction-channel-unavailable",
      message:
        "The migration correction channel is unavailable. Do not acknowledge this summary. Flowstate must make the contact channel available before owner review can continue.",
    });
  });

  it("sanitizes and bounds a Unicode gym name in the post-lock fixed draft", () => {
    vi.stubEnv(environmentKey, "locked-corrections@example.test");
    const gymDisplayName = `  North\u0007   拳館\t🥊  ${"A".repeat(100)}\r\nBcc:private@example.test`;
    const expectedGymName = Array.from(
      `North 拳館 🥊 ${"A".repeat(100)} Bcc:private@example.test`,
    )
      .slice(0, 80)
      .join("");

    const projection = getMigrationCorrectionChannelProjection({
      gymDisplayName,
      phase: "post-lock",
    });

    expect(projection).toMatchObject({
      status: "available",
      recipient: "locked-corrections@example.test",
      label: "Email a problem with the locked summary",
      helper:
        "Send to locked-corrections@example.test. The locked summary cannot be edited from this page. This email reports a problem; it does not unlock the snapshot, guarantee a change, or set a response time. Do not include member data, credentials, export files, or private links.",
    });
    expect(projection.status).toBe("available");
    if (projection.status !== "available") {
      throw new Error("Expected an available correction channel.");
    }

    const mailto = new URL(projection.href);
    expect(decodeURIComponent(mailto.pathname)).toBe(
      "locked-corrections@example.test",
    );
    expect(mailto.searchParams.get("subject")).toBe(
      `Migration correction — ${expectedGymName}`,
    );
    expect(mailto.searchParams.get("body")).toBe(
      [
        "I found a problem after the migration summary was locked.",
        "",
        "Section that looks wrong:",
        "",
        "Do not include member data, credentials, export files, or private links.",
      ].join("\n"),
    );
    expect(Array.from(expectedGymName)).toHaveLength(80);
    expect(
      Array.from(mailto.searchParams.get("subject") ?? "").some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
      }),
    ).toBe(false);
    expect(projection.href).not.toContain("private@example.test");
  });

  it("uses stable post-lock unavailable copy without exposing a dead href", () => {
    delete process.env[environmentKey];

    expect(
      getMigrationCorrectionChannelProjection({
        gymDisplayName: "North Gym",
        phase: "post-lock",
      }),
    ).toEqual({
      status: "unavailable",
      reason: "correction-channel-unavailable",
      message:
        "The migration correction channel is unavailable. The locked summary has not changed.",
    });
  });

  it("strips an unpaired surrogate instead of throwing while encoding", () => {
    vi.stubEnv(environmentKey, "corrections@example.test");

    const projection = getMigrationCorrectionChannelProjection({
      gymDisplayName: "North \ud800 Gym",
      phase: "pre-lock",
    });

    expect(projection.status).toBe("available");
    if (projection.status !== "available") {
      throw new Error("Expected an available correction channel.");
    }
    expect(new URL(projection.href).searchParams.get("subject")).toBe(
      "Migration correction — North Gym",
    );
  });

  it("fails closed outside the server runtime", () => {
    vi.stubEnv(environmentKey, "corrections@example.test");
    vi.stubGlobal("window", {});

    expect(
      getMigrationCorrectionChannelProjection({
        gymDisplayName: "North Gym",
        phase: "pre-lock",
      }),
    ).toMatchObject({
      status: "unavailable",
      reason: "correction-channel-unavailable",
    });
  });
});
