import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration files share one PostgreSQL database. Bound file workers to
    // avoid pool exhaustion and unrelated serializable predicate conflicts.
    // Tests still exercise their own simultaneous transactions with Promise.all.
    ...(process.env.TEST_DATABASE_URL ? { maxWorkers: 2 } : {}),
  },
});
