import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep shared-database file concurrency bounded; individual concurrency
    // tests continue to issue simultaneous transactions inside each file.
    ...(process.env.TEST_DATABASE_URL ? { maxWorkers: 2 } : {}),
  },
});
