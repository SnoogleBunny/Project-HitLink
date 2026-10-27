"use server";
import {
  PaymentConfirmationError,
  ClassReminderSettingsError,
  classReminderSettingsMessage,
  updateClassReminderSettings,
  retryFailedNotification,
} from "@flowstate/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
export async function retryEmailDeliveryAction(form: FormData) {
  const context = await requireOwnerWorkspaceContext();
  let error: string | undefined;
  try {
    await retryFailedNotification({
      workspaceId: context.workspace.id,
      actorUserId: context.session.userId,
      notificationJobId: String(form.get("notificationJobId") ?? ""),
      operationId: String(form.get("operationId") ?? ""),
      expectedUpdatedAt: new Date(String(form.get("updatedAt") ?? "")),
      reason: String(form.get("reason") ?? ""),
    });
  } catch (caught) {
    error =
      caught instanceof PaymentConfirmationError
        ? caught.message
        : "The message could not be retried. Reload the current delivery record.";
  }
  redirect(
    `/dashboard/settings/email?${new URLSearchParams(error ? { error } : { queued: "1" })}`,
  );
}

export interface ClassReminderSettingsState {
  status: "idle" | "success" | "error";
  version: number;
  leadMinutes: number | null;
  message: string | null;
}
export async function updateClassReminderSettingsAction(previous: ClassReminderSettingsState, form: FormData): Promise<ClassReminderSettingsState> {
  const context = await requireOwnerWorkspaceContext();
  let saved: { version: number; leadMinutes: number | null };
  try {
    const one = (name: string) => {
      const values = form.getAll(name);
      if (values.length !== 1 || typeof values[0] !== "string") throw new ClassReminderSettingsError("Reload the current reminder editor before saving.");
      return values[0];
    };
    const version = one("expectedVersion"), mode = one("mode");
    if (!/^\d+$/.test(version) || !["ON", "OFF"].includes(mode)) throw new ClassReminderSettingsError("Reload the current reminder editor before saving.");
    saved = await updateClassReminderSettings({ actor: { workspaceId: context.workspace.id, userId: context.session.userId }, expectedVersion: Number(version), leadMinutes: mode === "OFF" ? null : one("leadMinutes"), reason: one("reason") });

  } catch (error) {
    return { ...previous, status: "error", message: classReminderSettingsMessage(error) };
  }
  revalidatePath("/dashboard/settings/email");
  return { status: "success", ...saved, message: saved.leadMinutes === null ? "Class and trial reminders are off. Booking confirmations remain enabled." : `Class and trial reminders are set for ${saved.leadMinutes.toLocaleString("en-CA")} minutes before class. Current eligible bookings will be checked by scheduled processing. Check the delivery log for actual status.` };
}
