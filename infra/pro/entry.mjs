import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readEnvironment, validateEnvironment } from "./config.mjs";
import { service } from "./service.mjs";
import {
  createShell as createServer,
  sessionCookie as serializeCookie,
} from "./shell.mjs";

export { readEnvironment, validateEnvironment };
export const createShell = (plane) => createServer(service, plane);
export const sessionCookie = (plane, value) =>
  serializeCookie(service, plane, value);

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const plane = process.env.FLOWSTATE_PRO_PLANE;
  const rawPort = process.env.FLOWSTATE_PRO_PORT ?? "0";
  const port = Number(rawPort);
  if (!/^(?:0|[1-9][0-9]{0,4})$/.test(rawPort) || port > 65535) {
    throw new Error("Invalid Pro shell port");
  }
  createShell(plane).listen(port, "127.0.0.1", function () {
    console.log(`Pro synthetic shell listening on port ${this.address().port}`);
  });
}
