import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots { const origin = new URL(process.env.NEXT_PUBLIC_FLOWSTATE_APP_URL ?? "http://localhost:3003").origin; return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/preview/"] }, sitemap: `${origin}/sitemap.xml` }; }
