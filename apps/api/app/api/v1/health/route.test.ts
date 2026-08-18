import { afterEach, describe, expect, it, vi } from "vitest";
import { createHealthHandler, GET } from "./route";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  vi.restoreAllMocks();

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe("GET /api/v1/health", () => {
  it("returns 503 when required database configuration is missing", async () => {
    delete process.env.DATABASE_URL;

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "unready",
      dependency: "database",
    });
  });

  it("returns 200 only after the required database probe responds", async () => {
    let probeCalls = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const handler = createHealthHandler({
      getDatabaseUrl: () => "postgresql://configured-database",
      probeDatabase: async () => {
        probeCalls += 1;
      },
    });

    const response = await handler();

    expect(probeCalls).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });

  it("returns a sanitized 503 when the required database probe fails", async () => {
    const secretDatabaseUrl =
      "postgresql://owner:super-secret@database.internal/tenant_alpha";
    const secretProbeError =
      "SELECT tenant_email FROM members failed for tenant_alpha";
    const handler = createHealthHandler({
      getDatabaseUrl: () => secretDatabaseUrl,
      probeDatabase: async () => {
        throw new Error(secretProbeError);
      },
    });

    const response = await handler();
    const responseBody = await response.json();
    const serializedResponse = JSON.stringify(responseBody);

    expect(response.status).toBe(503);
    expect(responseBody).toEqual({
      status: "unready",
      dependency: "database",
    });
    expect(serializedResponse).not.toContain(secretDatabaseUrl);
    expect(serializedResponse).not.toContain("super-secret");
    expect(serializedResponse).not.toContain(secretProbeError);
    expect(serializedResponse).not.toContain("tenant_alpha");
  });
});
