import type { Metadata } from "next";
import { LegalPage } from "../../lib/legal-page";
export const metadata: Metadata = { title: "Terms of Service — draft | HitLink", description: "Draft terms for the HitLink software service. Business and operational details require confirmation.", alternates: { canonical: "/terms" }, robots: { index: false, follow: false } };
export default function TermsPage() { return <LegalPage kind="terms" />; }
