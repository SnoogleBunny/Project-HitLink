import { ImageResponse } from "next/og";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "HitLink — memberships, bookings and gym operations";
export default function Image() { return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#153e30", color: "white", padding: 75, display: "flex", flexDirection: "column", justifyContent: "space-between", fontFamily: "sans-serif" }}><div style={{ fontSize: 92, fontWeight: 700 }}>HitLink</div><div style={{ fontSize: 45 }}>Memberships, bookings and gym operations.</div><div style={{ fontSize: 28 }}>Built for martial arts gyms</div></div>, size); }
