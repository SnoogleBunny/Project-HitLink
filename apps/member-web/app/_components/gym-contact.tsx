import { prisma } from "@flowstate/db";

export async function GymContact({ workspaceId }: { workspaceId: string }) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      name: true,
      settings: { select: { contactEmail: true, contactPhone: true } },
      location: {
        select: {
          addressLine1: true,
          addressLine2: true,
          city: true,
          region: true,
          postalCode: true,
          countryCode: true,
        },
      },
    },
  });
  if (!workspace) return null;
  const email = workspace.settings?.contactEmail;
  const phone = workspace.settings?.contactPhone;
  const address = workspace.location
    ? Object.values(workspace.location).filter(Boolean).join(", ")
    : "";
  if (!email && !phone && !address) return null;
  return (
    <section className="member-card">
      <h2>Contact {workspace.name}</h2>
      {email ? (
        <p>
          <a className="member-text-link" href={`mailto:${email}`}>
            {email}
          </a>
        </p>
      ) : null}
      {phone ? (
        <p>
          <a className="member-text-link" href={`tel:${phone}`}>
            {phone}
          </a>
        </p>
      ) : null}
      {address ? <p>{address}</p> : null}
    </section>
  );
}
