import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readEnvironment } from "./config.mjs";

const workspaces = {
  provider: "pro-provider-web",
  patient: "pro-patient-web",
  api: "pro-api",
};
const service = process.argv[2];
if (!Object.hasOwn(workspaces, service)) throw new Error("Unknown Pro shell");
for (const plane of ["us", "ca"]) readEnvironment(plane);

const target = new URL(
  `../../apps/${workspaces[service]}/dist/`,
  import.meta.url,
);
mkdirSync(target, { recursive: true });
for (const file of [
  "entry.mjs",
  "config.mjs",
  "shell.mjs",
  "us.json",
  "ca.json",
]) {
  const source = new URL(file, import.meta.url);
  if (file.endsWith(".mjs"))
    execFileSync(process.execPath, ["--check", fileURLToPath(source)]);
  copyFileSync(
    source,
    new URL(file === "entry.mjs" ? "server.mjs" : file, target),
  );
}
writeFileSync(
  new URL("service.mjs", target),
  `export const service = ${JSON.stringify(service)};\n`,
);
