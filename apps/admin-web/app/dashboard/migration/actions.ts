"use server";

import { enqueueNotificationJob, prisma } from "@flowstate/db";
import { redirect } from "next/navigation";
import { emptyFormState, type BasicFormState } from "../../../lib/admin-access";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import {
  markMigrationOperationallyReady,
  runMigrationImport,
  updateMigrationStage,
  uploadAndStageMigrationCsv,
} from "../../../lib/workspace-migration";

async function getCsvUpload(formData: FormData) {
  const file = formData.get("csv");

  if (!(file instanceof File)) {
    return null;
  }

  return {
    fileName: file.name,
    mimeType: file.type || null,
    fileSizeBytes: file.size,
    fileData: new Uint8Array(await file.arrayBuffer()),
  };
}

export async function uploadMigrationCsvAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const upload = await getCsvUpload(formData);

  if (!upload) {
    return {
      error: "Upload a CSV file.",
    };
  }

  const result = await uploadAndStageMigrationCsv({
    workspaceId: workspace.id,
    input: {
      recordKind: String(formData.get("recordKind") ?? ""),
      ...upload,
    },
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/migration");

  return emptyFormState;
}

export async function updateMigrationStageAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const result = await updateMigrationStage({
    workspaceId: workspace.id,
    input: {
      stage: String(formData.get("stage") ?? ""),
      nextOwnerAction: String(formData.get("nextOwnerAction") ?? ""),
      flowstateResponsibility: String(
        formData.get("flowstateResponsibility") ?? "",
      ),
      expectedNextMilestone: String(
        formData.get("expectedNextMilestone") ?? "",
      ),
      expectedNextMilestoneAt: String(
        formData.get("expectedNextMilestoneAt") ?? "",
      ),
      goLiveScheduledFor: String(formData.get("goLiveScheduledFor") ?? ""),
    },
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/migration");

  return emptyFormState;
}

export async function runMigrationImportAction(
  formData: FormData,
): Promise<void> {
  const { workspace, location } = await requireOwnerWorkspaceContext();
  const result = await runMigrationImport({
    workspaceId: workspace.id,
    locationId: location.id,
    importJobId: String(formData.get("importJobId") ?? ""),
  });

  if (result.status === "error") {
    console.warn({
      event: "migration_import_blocked",
      workspaceId: workspace.id,
      message: result.message,
    });
  }

  redirect("/dashboard/migration");
}

export async function markMigrationReadyAction(): Promise<void> {
  const { session, workspace } = await requireOwnerWorkspaceContext();

  await markMigrationOperationallyReady({
    workspaceId: workspace.id,
    userId: session.userId,
  });
  await enqueueNotificationJob({
    db: prisma,
    input: {
      workspaceId: workspace.id,
      templateKind: "ANNOUNCEMENT",
      recipientEmail: session.email,
      recipientName: session.displayName,
      subject: `${workspace.name} migration is ready for review`,
      body: [
        `Hi ${session.displayName},`,
        "",
        `Flowstate has completed the migration handoff for ${workspace.name} and activated daily operations for launch readiness.`,
        "",
        "Please review the imported members, schedule, memberships, billing context, and forms. If anything needs an amendment, reply to your Flowstate migration contact before go-live.",
        "",
        "Flowstate",
      ].join("\n"),
    },
  });

  redirect("/dashboard");
}
