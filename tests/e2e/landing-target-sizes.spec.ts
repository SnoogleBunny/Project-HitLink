import { expect, test, type Locator, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prepareCleanEvidence } from "./support/clean-evidence";

const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

const evidenceDir =
  process.env.LANDING_EVIDENCE_DIR ??
  path.join(
    process.cwd(),
    "test-results",
    "landing-target-sizes",
    "screenshots",
  );

async function visibleNavigationLinks(page: Page): Promise<Locator[]> {
  const links = page.locator(".site-header a, .site-footer a");
  const visible: Locator[] = [];

  for (let index = 0; index < (await links.count()); index += 1) {
    const link = links.nth(index);
    if (await link.isVisible()) {
      visible.push(link);
    }
  }

  return visible;
}

async function assertKeyboardTraversal(
  page: Page,
  expectedTargetIds: string[],
): Promise<void> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });

  const visited = new Set<string>();

  for (
    let index = 0;
    index < 60 && visited.size < expectedTargetIds.length;
    index += 1
  ) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      const targetId = active?.dataset.rp19Target;

      if (!active || !targetId) {
        return null;
      }

      const style = getComputedStyle(active);
      return {
        targetId,
        boxShadow: style.boxShadow,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });

    if (!focused) {
      continue;
    }

    visited.add(focused.targetId);
    const hasVisibleFocus =
      focused.boxShadow !== "none" ||
      (focused.outlineStyle !== "none" && focused.outlineWidth !== "0px");
    expect(
      hasVisibleFocus,
      `${focused.targetId} retains a visible keyboard focus indicator`,
    ).toBe(true);
  }

  expect(
    [...visited].sort(),
    "keyboard traversal reaches every targeted link",
  ).toEqual([...expectedTargetIds].sort());
}

async function assertFragmentIsVisible(
  page: Page,
  href: string,
): Promise<void> {
  const link = page.locator(`a[href="${href}"]:visible`).first();
  await link.click();
  await page.waitForTimeout(30);

  const target = page.locator(href);
  await expect(target, `${href} fragment exists`).toBeVisible();
  const placement = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const content = element.querySelector("h1, h2, form") ?? element;
    const contentRect = content.getBoundingClientRect();
    return {
      targetTop: rect.top,
      contentTop: contentRect.top,
      viewportHeight: window.innerHeight,
    };
  });

  expect(
    placement.targetTop,
    `${href} is not clipped above the viewport`,
  ).toBeGreaterThanOrEqual(-1);
  expect(
    placement.contentTop,
    `${href} content is not obscured`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    placement.contentTop,
    `${href} content enters the viewport`,
  ).toBeLessThan(placement.viewportHeight);
}

for (const viewport of viewports) {
  test(`${viewport.name}: landing navigation targets and recovery constraints`, async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const badResponses: string[] = [];
    const requestedOrigins = new Set<string>();

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol === "http:" || url.protocol === "https:") {
        requestedOrigins.add(url.origin);
      }
    });
    page.on("requestfailed", (request) => {
      failedRequests.push(`${request.method()} ${request.url()}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        badResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "networkidle" });

    const links = await visibleNavigationLinks(page);
    const measurements: Array<{
      id: string;
      name: string;
      href: string;
      width: number;
      height: number;
    }> = [];

    for (let index = 0; index < links.length; index += 1) {
      const link = links[index];
      const id = `target-${index}`;
      await link.evaluate((element, targetId) => {
        (element as HTMLElement).dataset.rp19Target = targetId;
      }, id);
      await expect(link).toHaveAccessibleName(/\S/);
      const box = await link.boundingBox();
      expect(box, `${id} has a rendered target`).not.toBeNull();
      const name = await link.getAttribute("aria-label");
      measurements.push({
        id,
        name: name ?? (await link.innerText()).trim(),
        href: (await link.getAttribute("href")) ?? "",
        width: box?.width ?? 0,
        height: box?.height ?? 0,
      });
    }

    console.log(
      `RP-19 ${viewport.name} measurements ${JSON.stringify(measurements)}`,
    );

    for (const measurement of measurements) {
      expect
        .soft(
          measurement.width,
          `${measurement.name} (${measurement.href}) target width`,
        )
        .toBeGreaterThanOrEqual(44);
      expect
        .soft(
          measurement.height,
          `${measurement.name} (${measurement.href}) target height`,
        )
        .toBeGreaterThanOrEqual(44);
    }

    for (let left = 0; left < links.length; left += 1) {
      const leftBox = await links[left].boundingBox();
      for (let right = left + 1; right < links.length; right += 1) {
        const rightBox = await links[right].boundingBox();
        if (!leftBox || !rightBox) {
          continue;
        }
        const overlapWidth =
          Math.min(leftBox.x + leftBox.width, rightBox.x + rightBox.width) -
          Math.max(leftBox.x, rightBox.x);
        const overlapHeight =
          Math.min(leftBox.y + leftBox.height, rightBox.y + rightBox.height) -
          Math.max(leftBox.y, rightBox.y);
        expect(
          overlapWidth > 0.5 && overlapHeight > 0.5,
          `${measurements[left].name} does not overlap ${measurements[right].name}`,
        ).toBe(false);
      }
    }

    await assertKeyboardTraversal(
      page,
      measurements.map((measurement) => measurement.id),
    );

    const fragmentHrefs = [
      ...new Set(
        measurements
          .map((measurement) => measurement.href)
          .filter((href) => href.startsWith("#")),
      ),
    ];
    for (const href of fragmentHrefs) {
      await assertFragmentIsVisible(page, href);
    }

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const overflowing = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".site-header a, .site-footer a",
        ),
      )
        .filter((element) => {
          if (element.getClientRects().length === 0) {
            return false;
          }
          const rect = element.getBoundingClientRect();
          return rect.left < -0.5 || rect.right > root.clientWidth + 0.5;
        })
        .slice(0, 5)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
        }));
      const heroDuration = getComputedStyle(
        document.querySelector<HTMLElement>(".hero-content")!,
      ).animationDuration;
      const plane = document.querySelector<HTMLElement>(".product-plane")!;
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        overflowing,
        scrollBehavior: getComputedStyle(root).scrollBehavior,
        heroDuration,
        planeDuration: getComputedStyle(plane).animationDuration,
      };
    });

    expect(
      layout.scrollWidth,
      "page has no horizontal overflow",
    ).toBeLessThanOrEqual(layout.clientWidth);
    expect(
      layout.overflowing,
      "no rendered element clips horizontally",
    ).toEqual([]);
    expect(
      layout.scrollBehavior,
      "reduced motion disables smooth scrolling",
    ).toBe("auto");
    expect(layout.heroDuration, "reduced motion shortens hero animation").toBe(
      "0.001s",
    );
    expect(
      layout.planeDuration,
      "reduced motion shortens preview animation",
    ).toBe("0.001s");

    const expectedOrigin = new URL(page.url()).origin;
    expect(
      [...requestedOrigins],
      "the page makes no external requests",
    ).toEqual([expectedOrigin]);
    expect(consoleErrors, "browser console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed requests").toEqual([]);
    expect(badResponses, "HTTP error responses").toEqual([]);

    await page.evaluate(() => window.scrollTo(0, 0));
    await fs.mkdir(evidenceDir, { recursive: true });
    await prepareCleanEvidence(page);
    await page.screenshot({
      fullPage: true,
      path: path.join(evidenceDir, `landing-${viewport.name}.png`),
    });
  });
}
