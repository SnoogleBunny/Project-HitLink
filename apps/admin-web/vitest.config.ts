import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration files share one PostgreSQL database. Run those files in order
    // to isolate unrelated fixtures and serializable predicate conflicts.
    // Tests still exercise their own simultaneous transactions with Promise.all.
    ...(process.env.TEST_DATABASE_URL ? { maxWorkers: 1 } : {}),
    // Exclude before collection: describe.skip still executes its registration body.
    ...(!process.env.TEST_DATABASE_URL
      ? { exclude: [...configDefaults.exclude, "**/*.integration.test.ts"] }
      : {}),
  },
});
