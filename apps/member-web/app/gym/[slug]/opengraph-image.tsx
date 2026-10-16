import { ImageResponse } from "next/og";
import { getPublishedGymWebsite } from "@flowstate/db";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default async function Image({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const site = await getPublishedGymWebsite(slug); return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#153e30", color: "#fff", padding: 70, display: "flex", flexDirection: "column", justifyContent: "space-between", fontFamily: "sans-serif" }}><div style={{ fontSize: 35 }}>Martial arts · HitLink</div><div style={{ fontSize: 74, fontWeight: 700 }}>{site?.content.title ?? "HitLink"}</div><div style={{ fontSize: 31 }}>{site?.content.description ?? "Gym memberships and bookings"}</div></div>, size); }
