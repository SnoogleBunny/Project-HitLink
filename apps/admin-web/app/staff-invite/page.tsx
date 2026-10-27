import { EntryShell } from "../_components/entry-shell";
import { StaffInviteAcceptanceForm } from "./form";
export const metadata = {
  title: "Coach invitation | HitLink",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function StaffInvitePage() {
  return (
    <EntryShell
      eyebrow="Coach invitation"
      title="Join your workspace"
      description="Use the account email named in your invitation."
      identityEyebrow="HitLink"
      identityTitle="Your own coach access"
      identityDescription="The owner invites you. Your account stays under your control."
    >
      <StaffInviteAcceptanceForm />
    </EntryShell>
  );
}
