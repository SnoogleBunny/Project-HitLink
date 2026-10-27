import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.FLOWSTATE_E2E_SERVER_MODE === "development-clean"
    ? { devIndicators: false }
    : {}),
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  turbopack: {
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  },
};

export default nextConfig;
