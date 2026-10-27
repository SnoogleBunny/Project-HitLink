import {
  expect,
  test,
  type BrowserContext,
  type Response,
} from "@playwright/test";
import { createServer } from "node:http";
import {
  attachBrowserDiagnostics,
  BrowserDiagnosticsCollector,
} from "./support/browser-diagnostics";
import { loginToWorkspace } from "./support/workspace-login";

const email = "login-proof@example.test";

class LoginDiagnostics extends BrowserDiagnosticsCollector {
  acknowledgements = 0;
  override acknowledgeAction(response: Response, outcome: string) {
    super.acknowledgeAction(response, outcome);
    this.acknowledgements++;
  }
}

async function loginFixture(
  context: BrowserContext,
  options: {
    status?: 200 | 303;
    account?: string;
    displayName?: string;
    redirect?: string;
    existingSession?: boolean;
  },
) {
  let submissions = 0;
  const server = createServer((request, response) => {
    if (request.url === "/login" && request.method === "POST") {
      submissions++;
      response.writeHead(options.status ?? 200, {
        "content-type": "text/x-component",
        "x-action-redirect": options.redirect ?? "/dashboard;push",
      });
      response.end("Fictional local login action");
    } else if (request.url === "/login") {
      if (options.existingSession) {
        response.writeHead(302, { location: "/dashboard" });
        response.end();
      } else {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(`<form><label>Email<input name="email"></label><label>Password<input name="password" type="password"></label><button>Log in</button></form>
          <script>document.querySelector('form').onsubmit = async event => {
            event.preventDefault();
            const result = await fetch('/login', { method: 'POST', headers: {'next-action': 'fictional-login', accept: 'text/x-component'} });
            await result.text(); location.href = '/dashboard';
          };</script>`);
      }
    } else {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<style>.menu-trigger {display:none} @media(max-width:1023px) {.menu-trigger {display:block} .desktop-account {display:none}}</style>
        <main class="hl-workspace-shell"><h1>Today</h1>
        <button class="menu-trigger" onclick="document.querySelector('dialog').showModal()">Open workspace menu</button>
        <div class="hl-workspace-account desktop-account"><strong>${options.displayName ?? "Fictional member"}</strong><span>${options.account ?? email}</span></div>
        <dialog aria-label="Workspace menu"><div class="hl-workspace-account"><strong>${options.displayName ?? "Fictional member"}</strong><span>${options.account ?? email}</span></div>
        <button onclick="document.querySelector('dialog').close()">Close workspace menu</button></dialog></main>`);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing login-fixture address.");
  const diagnostics = new LoginDiagnostics();
  const detach = attachBrowserDiagnostics(context, diagnostics);
  return {
    diagnostics,
    submissions: () => submissions,
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      detach();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

for (const variant of [
  { status: 200, width: 1280 },
  { status: 303, width: 390 },
] as const) {
  test(`positive login proof checks exact visible identity at ${variant.width}px and preserves ${variant.status} semantics`, async ({
    page,
    context,
  }) => {
    const fixture = await loginFixture(context, variant);
    try {
      await page.setViewportSize({ width: variant.width, height: 900 });
      await loginToWorkspace({
        page,
        origin: fixture.origin,
        email,
        password: "FictionalPass123!",
        expectedRedirect: "/dashboard;push",
        destination: { path: "/dashboard", heading: "Today" },
        diagnostics: fixture.diagnostics,
      });
      expect(fixture.submissions()).toBe(1);
      expect(fixture.diagnostics.acknowledgements).toBe(
        variant.status === 200 ? 1 : 0,
      );
      await expect(page.getByRole("dialog")).toBeHidden();
      fixture.diagnostics.assertNoUnexpected();
    } finally {
      await fixture.close();
    }
  });
}

test("a wrong visible account cannot acknowledge an otherwise successful login", async ({
  page,
  context,
}) => {
  const fixture = await loginFixture(context, {
    account: "someone-else@example.test",
  });
  try {
    await expect(
      loginToWorkspace({
        page,
        origin: fixture.origin,
        email,
        password: "FictionalPass123!",
        expectedRedirect: "/dashboard;push",
        destination: { path: "/dashboard", heading: "Today" },
        diagnostics: fixture.diagnostics,
      }),
    ).rejects.toThrow();
    expect(fixture.diagnostics.acknowledgements).toBe(0);
  } finally {
    await fixture.close();
  }
});

test("a wrong login redirect cannot be acknowledged by a matching rendered account", async ({
  page,
  context,
}) => {
  const fixture = await loginFixture(context, { redirect: "/unexpected;push" });
  try {
    await expect(
      loginToWorkspace({
        page,
        origin: fixture.origin,
        email,
        password: "FictionalPass123!",
        expectedRedirect: "/dashboard;push",
        destination: { path: "/dashboard", heading: "Today" },
        diagnostics: fixture.diagnostics,
      }),
    ).rejects.toThrow();
    expect(fixture.diagnostics.acknowledgements).toBe(0);
  } finally {
    await fixture.close();
  }
});

test("an existing session proves identity without inventing a login response", async ({
  page,
  context,
}) => {
  const fixture = await loginFixture(context, { existingSession: true });
  try {
    await loginToWorkspace({
      page,
      origin: fixture.origin,
      email,
      password: "FictionalPass123!",
      expectedRedirect: "/dashboard;push",
      destination: { path: "/dashboard", heading: "Today" },
      diagnostics: fixture.diagnostics,
      allowExistingSession: true,
    });
    expect(fixture.submissions()).toBe(0);
    expect(fixture.diagnostics.acknowledgements).toBe(0);
    fixture.diagnostics.assertNoUnexpected();
  } finally {
    await fixture.close();
  }
});

for (const width of [1280, 390]) {
  test(`matching display name and actual email prove one account at ${width}px`, async ({
    page,
    context,
  }) => {
    const fixture = await loginFixture(context, { displayName: email });
    try {
      await page.setViewportSize({ width, height: 900 });
      await loginToWorkspace({
        page,
        origin: fixture.origin,
        email,
        password: "FictionalPass123!",
        expectedRedirect: "/dashboard;push",
        destination: { path: "/dashboard", heading: "Today" },
        diagnostics: fixture.diagnostics,
      });
      expect(fixture.submissions()).toBe(1);
      expect(fixture.diagnostics.acknowledgements).toBe(1);
      await expect(page.getByRole("dialog")).toBeHidden();
      fixture.diagnostics.assertNoUnexpected();
    } finally {
      await fixture.close();
    }
  });

  test(`expected display name cannot substitute for a wrong actual email at ${width}px`, async ({
    page,
    context,
  }) => {
    const actualEmail = "someone-else@example.test";
    const fixture = await loginFixture(context, {
      displayName: email,
      account: actualEmail,
    });
    try {
      await page.setViewportSize({ width, height: 900 });
      const rejected = await loginToWorkspace({
        page,
        origin: fixture.origin,
        email,
        password: "FictionalPass123!",
        expectedRedirect: "/dashboard;push",
        destination: { path: "/dashboard", heading: "Today" },
        diagnostics: fixture.diagnostics,
      }).then(
        () => false,
        () => true,
      );
      expect(fixture.submissions()).toBe(1);
      await expect(page).toHaveURL(new URL("/dashboard", fixture.origin).href);
      await expect(
        page.getByRole("heading", { name: "Today", exact: true }),
      ).toBeVisible();
      if (width === 390 && !(await page.getByRole("dialog").isVisible())) {
        await page
          .getByRole("button", { name: "Open workspace menu", exact: true })
          .click();
      }
      const account = page.locator(".hl-workspace-account:visible");
      await expect(account.locator(":scope > strong")).toHaveText(email);
      await expect(account.locator(":scope > span")).toHaveText(actualEmail);
      expect(fixture.diagnostics.acknowledgements).toBe(0);
      expect(rejected).toBe(true);
    } finally {
      await fixture.close();
    }
  });
}
