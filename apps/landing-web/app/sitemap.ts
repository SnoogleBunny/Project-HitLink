import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap { const origin = new URL(process.env.NEXT_PUBLIC_FLOWSTATE_APP_URL ?? "http://localhost:3003").origin; return [{ url: origin }]; }
