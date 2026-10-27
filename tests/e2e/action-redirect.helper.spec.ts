import {
  expect,
  test,
  type BrowserContext,
  type Response,
} from "@playwright/test";
import { createServer } from "node:http";
import { captureAction, expectActionRedirect } from "./support/action-redirect";
import {
  attachBrowserDiagnostics,
  BrowserDiagnosticsCollector,
} from "./support/browser-diagnostics";

class ActionDiagnostics extends BrowserDiagnosticsCollector {
  acknowledgements = 0;
  override acknowledgeAction(response: Response, outcome: string) {
    super.acknowledgeAction(response, outcome);
    this.acknowledgements++;
  }
}

async function actionFixture(
  context: BrowserContext,
  options: {
    status?: number;
    redirect?: string;
    contentType?: string;
    renderedPath?: string;
  } = {},
) {
  let committed = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST") {
      committed++;
      response.writeHead(options.status ?? 200, {
        "content-type": options.contentType ?? "text/x-component",
        "x-action-redirect": options.redirect ?? "/receipt?entry=1;push",
      });
      response.end("Fictional local action receipt");
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<button>Commit fictional change</button><h1>Draft</h1>
      <script>document.querySelector('button').onclick = async () => {
        const result = await fetch(location.pathname, {method:'POST',headers:{'next-action':'fictional-commit',accept:'text/x-component'}});
        await result.text();
        history.pushState({},'',${JSON.stringify(options.renderedPath ?? "/receipt?entry=1")});
        document.querySelector('h1').textContent='Fictional receipt';
      };</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Missing action fixture address.");
  const diagnostics = new ActionDiagnostics();
  const detach = attachBrowserDiagnostics(context, diagnostics);
  return {
    origin: `http://127.0.0.1:${address.port}`,
    diagnostics,
    committed: () => committed,
    async close() {
      detach();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

for (const status of [200, 303]) {
  test(`exact action redirect proves ${status} transport without fabricating a business acknowledgment`, async ({
    page,
    context,
  }) => {
    const fixture = await actionFixture(context, { status });
    try {
      await page.goto(`${fixture.origin}/action`);
      const response = await captureAction(page, () =>
        page.getByRole("button").click(),
      );
      await expectActionRedirect(
        page,
        response,
        `${fixture.origin}/receipt?entry=1`,
      );
      // Transport alone never acknowledges the action. The caller proves its
      // visible receipt and actual fixture state before an explicit200 ack.
      expect(fixture.diagnostics.acknowledgements).toBe(0);
      await expect(
        page.getByRole("heading", { name: "Fictional receipt", exact: true }),
      ).toBeVisible();
      expect(fixture.committed()).toBe(1);
      if (status === 200)
        fixture.diagnostics.acknowledgeAction(
          response,
          "The exact receipt is visible and one fictional change committed.",
        );
      expect(fixture.diagnostics.acknowledgements).toBe(status === 200 ? 1 : 0);
      fixture.diagnostics.assertNoUnexpected();
    } finally {
      await fixture.close();
    }
  });
}

for (const variant of [
  { name: "wrong exact redirect", options: { redirect: "/unrelated;push" } },
  { name: "non-RSC response", options: { contentType: "text/plain" } },
  { name: "failed response", options: { status: 500 } },
  { name: "wrong rendered route", options: { renderedPath: "/unrelated" } },
]) {
  test(`action redirect rejects ${variant.name}`, async ({ page, context }) => {
    const fixture = await actionFixture(context, variant.options);
    try {
      await page.goto(`${fixture.origin}/action`);
      const response = await captureAction(page, () =>
        page.getByRole("button").click(),
      );
      await expect(
        expectActionRedirect(
          page,
          response,
          `${fixture.origin}/receipt?entry=1`,
        ),
      ).rejects.toThrow();
    } finally {
      await fixture.close();
    }
  });
}

test("a subframe action cannot prove a main-frame redirect", async ({
  page,
  context,
}) => {
  const fixture = await actionFixture(context);
  try {
    await page.goto(`${fixture.origin}/action`);
    await page.evaluate((origin) => {
      const frame = document.createElement("iframe");
      frame.src = origin + "/frame";
      document.body.append(frame);
    }, fixture.origin);
    const [response] = await Promise.all([
      page.waitForResponse(
        (value) =>
          value.url() === `${fixture.origin}/frame` &&
          value.request().method() === "POST",
      ),
      page.frameLocator("iframe").getByRole("button").click(),
    ]);
    await expect(
      expectActionRedirect(page, response, `${fixture.origin}/receipt?entry=1`),
    ).rejects.toThrow();
  } finally {
    await fixture.close();
  }
});
