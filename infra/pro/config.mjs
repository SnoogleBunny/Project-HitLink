import { readFileSync } from "node:fs";

const regions = {
  us: ["us-east4", "us-east1"],
  ca: ["northamerica-northeast2", "northamerica-northeast1"],
};

export function validateEnvironment(config, plane) {
  if (!Object.hasOwn(regions, plane))
    throw new Error("Unknown Pro configuration plane");
  const [primaryRegion, recoveryRegion] = regions[plane];
  const namespace = `FLOWSTATE_PRO_${plane.toUpperCase()}`;
  const fixed = {
    plane,
    mode: "synthetic",
    primaryRegion,
    recoveryRegion,
    databaseEnv: `${namespace}_DATABASE_URL`,
    stripeEnv: `${namespace}_STRIPE_SECRET_KEY`,
    keyEnv: `${namespace}_KEY_REFERENCE`,
  };
  const hosts = ["providerHost", "patientHost", "apiHost"];
  const hostPattern = new RegExp(
    `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${plane}\\.pro\\.localhost$`,
  );
  if (
    !config ||
    Array.isArray(config) ||
    typeof config !== "object" ||
    Object.keys(config).length !== Object.keys(fixed).length + hosts.length ||
    Object.entries(fixed).some(([key, value]) => config[key] !== value) ||
    hosts.some(
      (key) =>
        typeof config[key] !== "string" || !hostPattern.test(config[key]),
    ) ||
    new Set(hosts.map((key) => config[key])).size !== hosts.length
  ) {
    throw new Error("Invalid Pro environment configuration");
  }
  return Object.freeze(config);
}

export function readEnvironment(plane) {
  if (!Object.hasOwn(regions, plane))
    throw new Error("Unknown Pro configuration plane");
  return validateEnvironment(
    JSON.parse(
      readFileSync(new URL(`./${plane}.json`, import.meta.url), "utf8"),
    ),
    plane,
  );
}
