import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run shared-database files sequentially; individual concurrency
    // tests continue to issue simultaneous transactions inside each file.
    ...(process.env.TEST_DATABASE_URL ? { maxWorkers: 1 } : {}),
    // Exclude before collection: describe.skip still executes its registration body.
    ...(!process.env.TEST_DATABASE_URL
      ? { exclude: [...configDefaults.exclude, "**/*.integration.test.ts"] }
      : {}),
  },
});
