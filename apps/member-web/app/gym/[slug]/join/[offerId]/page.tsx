import type { Metadata } from "next";
import PublicRegistrationPage from "../../registration-page";
export const metadata: Metadata = { title: "Join the gym", robots: { index: false, follow: false } };
export default async function JoinPage({ params }: { params: Promise<{ slug: string; offerId: string }> }) { const { slug, offerId } = await params; return <PublicRegistrationPage slug={slug} kind="MEMBERSHIP" offerId={offerId} />; }
