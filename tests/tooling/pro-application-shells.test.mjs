import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer, request } from "node:http";
import test from "node:test";
import { chromium } from "@playwright/test";

const root = new URL("../../", import.meta.url);
const services = {
  provider: "pro-provider-web",
  patient: "pro-patient-web",
  api: "pro-api",
};

function listen(t, server) {
  t.after(() => server.close());
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function read(port, host, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        headers: { host, ...headers },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8").on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("independent Pro builds enforce local hosts, origins, configuration and cookie isolation", async (t) => {
  const shells = {};
  for (const [service, workspace] of Object.entries(services)) {
    execFileSync(process.execPath, ["../../infra/pro/build.mjs", service], {
      cwd: new URL(`apps/${workspace}/`, root),
      stdio: "inherit",
    });
    shells[service] = await import(
      new URL(`apps/${workspace}/dist/server.mjs`, root)
    );
  }

  const us = shells.provider.readEnvironment("us");
  const ca = shells.provider.readEnvironment("ca");
  assert.throws(
    () =>
      shells.provider.validateEnvironment(
        { ...us, patientHost: us.providerHost },
        "us",
      ),
    /configuration/i,
  );
  assert.throws(
    () =>
      shells.provider.validateEnvironment(
        { ...us, databaseEnv: "DATABASE_URL" },
        "us",
      ),
    /configuration/i,
  );
  assert.throws(
    () => shells.provider.validateEnvironment(ca, "us"),
    /configuration/i,
  );
  assert.notEqual(us.databaseEnv, ca.databaseEnv);
  assert.notEqual(us.stripeEnv, ca.stripeEnv);
  assert.notEqual(us.keyEnv, ca.keyEnv);

  const targets = {};
  for (const [service, shell] of Object.entries(shells)) {
    const host = us[`${service}Host`];
    const server = shell.createShell("us");
    const port = await listen(t, server);
    const authority = `${host}:${port}`;
    targets[service] = `http://${authority}`;
    assert.deepEqual(await read(port, authority, "/health"), {
      status: 200,
      body: '{"status":"ok"}',
    });
    assert.deepEqual(await read(port, authority, "/ready"), {
      status: 200,
      body: '{"status":"ready"}',
    });
    assert.equal(
      (await read(port, `unknown.localhost:${port}`, "/")).status,
      421,
    );
    assert.equal(
      (
        await read(port, authority, "/", {
          origin: "http://standard.localhost",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await read(port, authority, service === "api" ? "/health" : "/", {
          origin: targets[service],
        })
      ).status,
      200,
    );
  }

  const browser = await chromium.launch({ args: ["--no-proxy-server"] });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [service, title] of [
    ["provider", "Flowstate Pro Provider"],
    ["patient", "Flowstate Pro Patient"],
  ]) {
    await page.goto(targets[service]);
    assert.equal(
      await page.getByRole("heading", { level: 1 }).textContent(),
      title,
    );
  }
  const cookieEvents = [];
  const fixtures = {};
  for (const surface of ["standard", "provider", "patient"]) {
    const host =
      surface === "standard" ? "standard.localhost" : us[`${surface}Host`];
    const cookie =
      surface === "standard"
        ? "flowstate_admin_session=standard-fixture; Path=/; HttpOnly; SameSite=Strict"
        : shells[surface].sessionCookie("us", "synthetic-fixture");
    const port = await listen(
      t,
      createServer((req, res) => {
        if (req.url === "/probe")
          cookieEvents.push([surface, req.headers.cookie]);
        if (req.url === "/seed") res.setHeader("Set-Cookie", cookie);
        res.end("synthetic");
      }),
    );
    fixtures[surface] = `http://${host}:${port}`;
  }
  for (const url of Object.values(fixtures)) await page.goto(`${url}/seed`);
  for (const url of Object.values(fixtures)) await page.goto(`${url}/probe`);
  assert.deepEqual(cookieEvents, [
    ["standard", "flowstate_admin_session=standard-fixture"],
    ["provider", "__Host-flowstate-pro-us-provider=synthetic-fixture"],
    ["patient", "__Host-flowstate-pro-us-patient=synthetic-fixture"],
  ]);
  const cookies = await context.cookies();
  for (const cookie of cookies.filter(({ name }) =>
    name.startsWith("__Host-"),
  )) {
    assert.equal(cookie.secure, true);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "Strict");
  }
});
