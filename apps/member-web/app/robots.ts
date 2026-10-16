import type { MetadataRoute } from "next";
import { publicMemberOrigin } from "../lib/gym-website";
export default function robots(): MetadataRoute.Robots { return { rules: { userAgent: "*", allow: "/gym/", disallow: ["/app/", "/login", "/unauthorized"] }, sitemap: `${publicMemberOrigin()}/sitemap.xml` }; }
