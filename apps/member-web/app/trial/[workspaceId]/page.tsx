import { notFound } from "next/navigation";
import { listTrialBookingOptions } from "../../../lib/trial-booking";
import { TrialBookingForm } from "./trial-booking-form";

export default async function TrialBookingPage({
  params,
}: {
  params: Promise<{
    workspaceId: string;
  }>;
}) {
  const { workspaceId } = await params;
  const options = await listTrialBookingOptions({
    workspaceId,
  });

  if (!options) {
    notFound();
  }

  const templates = options.templates.map((template) => ({
    id: template.id,
    displayTitle: template.displayTitle,
    programName: template.programName,
    roomName: template.roomName,
    coachDisplayName: template.coachDisplayName,
    dateOptions: template.dateOptions.map((dateOption) => ({
      classTemplateId: dateOption.classTemplateId,
      scheduledForDate: dateOption.scheduledForDate,
      label: dateOption.label,
    })),
  }));

  return (
    <main className="trial-page">
      <section className="trial-card trial-intro">
        <p className="trial-eyebrow">{options.workspaceName}</p>
        <h1>Book a trial class</h1>
        <p>
          Choose a recurring class date, enter contact details, and the gym team
          will see the trial in member admin.
        </p>
      </section>

      {templates.length === 0 ? (
        <section className="trial-card">
          <p className="trial-eyebrow">No trial dates</p>
          <h2>Classes are not available right now</h2>
          <p>Check back after the gym publishes active recurring classes.</p>
        </section>
      ) : (
        <TrialBookingForm workspaceId={options.workspaceId} templates={templates} />
      )}
    </main>
  );
}
