import process from "node:process";
import { URL } from "node:url";

export const DEMO_DATABASE_ACKNOWLEDGEMENT =
  "I_ACKNOWLEDGE_THIS_DATABASE_IS_DISPOSABLE";

const LOCAL_DATABASE_HOSTS = new Set([
  "127.0.0.1",
  "[::1]",
  "::1",
  "localhost",
]);

const TARGET_CHANGING_CONNECTION_OPTIONS = new Set(["host"]);

export async function runGuardedDemoAction({
  actionName,
  env = process.env,
  action,
}) {
  if (env.NODE_ENV?.toLowerCase() === "production") {
    throw new Error(
      `Demo database action "${actionName}" is disabled in production.`,
    );
  }

  let databaseUrl;

  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    throw new Error(
      "DATABASE_URL must be a valid local PostgreSQL connection URL for demo database actions.",
    );
  }

  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error(
      "Demo database actions require a local PostgreSQL DATABASE_URL (localhost, 127.0.0.1, or ::1).",
    );
  }

  const hasTargetChangingConnectionOption = [
    ...databaseUrl.searchParams.keys(),
  ].some((optionName) =>
    TARGET_CHANGING_CONNECTION_OPTIONS.has(optionName.toLowerCase()),
  );

  if (hasTargetChangingConnectionOption) {
    throw new Error(
      "Demo database actions do not support target-changing PostgreSQL connection options.",
    );
  }

  if (!LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname.toLowerCase())) {
    throw new Error(
      "Demo database actions require a local PostgreSQL DATABASE_URL (localhost, 127.0.0.1, or ::1).",
    );
  }

  let databaseName;

  try {
    databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  } catch {
    databaseName = "";
  }

  if (!databaseName || env.FLOWSTATE_DEMO_DATABASE_NAME !== databaseName) {
    throw new Error(
      "FLOWSTATE_DEMO_DATABASE_NAME must exactly match the local DATABASE_URL database name.",
    );
  }

  if (!/(?:^|[_-])(?:demo|test|qa)(?:[_-]|$)/i.test(databaseName)) {
    throw new Error(
      "Demo database actions require a disposable demo or test database name (QA names are also allowed).",
    );
  }

  if (
    env.FLOWSTATE_DEMO_DATABASE_ACKNOWLEDGEMENT !==
    DEMO_DATABASE_ACKNOWLEDGEMENT
  ) {
    throw new Error(
      `Set FLOWSTATE_DEMO_DATABASE_ACKNOWLEDGEMENT=${DEMO_DATABASE_ACKNOWLEDGEMENT} to confirm this database is disposable.`,
    );
  }

  return action();
}
