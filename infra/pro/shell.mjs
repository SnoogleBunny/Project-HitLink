import { createServer } from "node:http";
import { readEnvironment } from "./config.mjs";

export const titles = Object.freeze({
  provider: "Flowstate Pro Provider",
  patient: "Flowstate Pro Patient",
  api: "Flowstate Pro API",
});

export function createShell(service, plane) {
  const config = readEnvironment(plane);
  const host = config[`${service}Host`];

  return createServer((req, res) => {
    const authority = `${host}:${req.socket.localPort}`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.headers.host !== authority) return send(res, 421, "unknown_host");
    if (
      req.headers.origin !== undefined &&
      req.headers.origin !== `http://${authority}`
    ) {
      return send(res, 403, "origin_denied");
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return send(res, 405, "method_denied");
    }
    if (req.url === "/health") return send(res, 200, "ok");
    if (req.url === "/ready") return send(res, 200, "ready");
    if (req.url === "/" && service !== "api") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(
        `<!doctype html><html lang="en"><meta charset="utf-8"><title>${titles[service]}</title><main><h1>${titles[service]}</h1></main></html>`,
      );
    }
    return send(res, 404, "not_found");
  });
}

function send(res, status, state) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ status: state }));
}

export function sessionCookie(service, plane, value) {
  readEnvironment(plane);
  if (
    (service !== "provider" && service !== "patient") ||
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error("Invalid Pro session cookie input");
  }
  return `__Host-flowstate-pro-${plane}-${service}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}
