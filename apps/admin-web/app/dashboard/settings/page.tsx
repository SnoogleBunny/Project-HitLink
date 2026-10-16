import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

export default async function SettingsPage() {
  const context = await requireOwnerWorkspaceContext();
  const sections = [
    { title: "Training", links: [["Programs", "/dashboard/programs"], ["Rooms", "/dashboard/rooms"], ["Coaches and staff", "/dashboard/staff"]] },
    { title: "Payments", links: [["Payment connection and billing policies", "/dashboard/settings/billing"], ["Membership plans", "/dashboard/membership-plans"], ["Class packs and drop-ins", "/dashboard/access-products"]] },
    { title: "Gym setup", links: [["Migration and go-live", "/dashboard/migration"], ["Forms and waivers", "/dashboard/forms"], ["Website", "/dashboard/website"], ["Records and access", "/dashboard/settings/data"], ["Email delivery", "/dashboard/settings/email"]] },
  ];
  return <AdminShell session={context.session} workspaceName={context.workspace.name} title="Settings" description="Manage your gym's programs, team, and payment setup."><div className="management-grid">{sections.map((section) => <section className="management-card form-stack" key={section.title}><h2>{section.title}</h2>{section.links.map(([label, href]) => <Link key={href} className="text-link" href={href!}>{label}</Link>)}</section>)}</div><section className="management-card"><h2>Gym timezone</h2><p>{context.location.timezone}</p><p>Classes, booking deadlines, and membership periods use this timezone.</p></section></AdminShell>;
}
