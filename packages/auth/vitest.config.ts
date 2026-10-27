import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    ...(process.env.TEST_DATABASE_URL ? { maxWorkers: 2 } : {}),
    // Exclude before collection: describe.skip still executes its registration body.
    ...(!process.env.TEST_DATABASE_URL
      ? { exclude: [...configDefaults.exclude, "**/*.integration.test.ts"] }
      : {}),
  },
});
