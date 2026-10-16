import {
  readWorkspaceSupportDiagnostics,
  WorkspaceDataError,
} from "@flowstate/db";
import { getSessionOrNull } from "../../../lib/admin-access";
import { redirect } from "next/navigation";
export const metadata = {
  title: "Support diagnostics",
  robots: { index: false, follow: false },
};
export default async function SupportPage({
  params,
}: {
  params: Promise<{ grantId: string }>;
}) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  try {
    const data = await readWorkspaceSupportDiagnostics(
      session.userId,
      (await params).grantId,
    );
    return (
      <main className="auth-shell">
        <section className="management-card form-stack">
          <h1>{data.workspace.name}: support diagnostics</h1>
          <p>{data.purpose}</p>
          <p>
            Read-only access ends {data.expiresAt.toISOString()}. This read is
            recorded in the owner’s access log.
          </p>
          <h2>Workspace</h2>
          <p>{data.workspace.status}</p>
          <h2>Payment operations</h2>
          <ul>
            {data.operations.map((row) => (
              <li key={`${row.kind}-${row.status}`}>
                {row.kind} · {row.status} · {row._count}
              </li>
            ))}
          </ul>
          <h2>Notifications</h2>
          <ul>
            {data.notifications.map((row) => (
              <li key={row.status}>
                {row.status} · {row._count}
              </li>
            ))}
          </ul>
          <p>Open financial reviews: {data.openFinancialReviewCases}</p>
        </section>
      </main>
    );
  } catch (error) {
    if (!(error instanceof WorkspaceDataError)) throw error;
    return (
      <main className="auth-shell">
        <section className="management-card">
          <h1>Support access unavailable</h1>
          <p>{error.message}</p>
        </section>
      </main>
    );
  }
}
