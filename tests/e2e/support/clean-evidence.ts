import type { Page } from "@playwright/test";

export async function prepareCleanEvidence(page: Page): Promise<void> {
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
  await page.locator("nextjs-portal").evaluateAll((portals) => {
    for (const portal of portals) {
      (portal as HTMLElement).style.setProperty("display", "none", "important");
    }
  });
  const visiblePortals = await page
    .locator("nextjs-portal")
    .evaluateAll(
      (portals) =>
        portals.filter((portal) => getComputedStyle(portal).display !== "none")
          .length,
    );
  if (visiblePortals !== 0) {
    throw new Error(
      `Expected clean evidence without a Next.js dev overlay; ${visiblePortals} portal(s) remained visible.`,
    );
  }
}
