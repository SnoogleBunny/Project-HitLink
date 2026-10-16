import type { Metadata } from "next";
import PublicRegistrationPage from "../registration-page";
export const metadata: Metadata = { title: "Book a trial", robots: { index: false, follow: false } };
export default async function TrialPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <PublicRegistrationPage slug={slug} kind="TRIAL" />; }
