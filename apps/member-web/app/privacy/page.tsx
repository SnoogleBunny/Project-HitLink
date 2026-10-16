import type { Metadata } from "next";
import { LegalPage } from "../../lib/legal-page";
export const metadata: Metadata = { title: "Privacy Policy — draft", description: "Draft privacy policy for HitLink accounts, gym records and adult coaching programs.", robots: { index: false, follow: false } };
export default function PrivacyPage() { return <LegalPage kind="privacy" />; }
