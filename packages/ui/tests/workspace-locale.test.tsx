import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LocaleDate,
  Money,
  WorkspaceLocaleProvider,
} from "../src/workspace-locale";
import { formatDisplayDate, resolveDisplayLocale } from "../src/locale";

describe("configured workspace presentation", () => {
  it("renders date and money consumers in the same workspace locale on the server", () => {
    const render = (locale: string) =>
      renderToStaticMarkup(
        <WorkspaceLocaleProvider locale={locale}>
          <LocaleDate
            value="2026-10-25T12:00:00Z"
            options={{ dateStyle: "long" }}
          />
          <Money amountMinor={123456} currency="EUR" />
        </WorkspaceLocaleProvider>,
      );
    expect(render("en-CA")).toContain("October 25, 2026");
    expect(render("en-CA")).toContain("1,234.56");
    expect(render("de-DE")).toContain("25. Oktober 2026");
    expect(render("de-DE")).toContain("1.234,56");
  });
  it("keeps historical timezone and currency minor units independent of locale", () => {
    const instant = new Date("2026-10-25T00:30:00Z"),
      original = instant.toISOString();
    expect(
      formatDisplayDate(
        instant,
        { timeZone: "America/Vancouver", dateStyle: "long" },
        "de-DE",
      ),
    ).toContain("24. Oktober 2026");
    const html = renderToStaticMarkup(
      <WorkspaceLocaleProvider locale="de-DE">
        <Money amountMinor={1234} currency="JPY" />
        <Money amountMinor={123456} currency="KWD" />
      </WorkspaceLocaleProvider>,
    );
    expect(html).toContain("JPY 1.234");
    expect(html).toContain("KWD 123,456");
    expect(instant.toISOString()).toBe(original);
  });
  it("canonicalizes configured locales and safely falls back for invalid saved values", () => {
    expect(resolveDisplayLocale("de-de")).toBe("de-DE");
    expect(resolveDisplayLocale("not_a_locale")).toBe("en-CA");
    expect(resolveDisplayLocale(null)).toBe("en-CA");
  });
});
