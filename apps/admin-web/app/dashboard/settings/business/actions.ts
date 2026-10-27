"use server";

import { revalidatePath } from "next/cache";
import {
  BusinessSettingsError,
  saveBusinessSettings,
  type BusinessSettingsInput,
} from "../../../../lib/business-settings";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { commitWorkspaceTimezoneChange, previewWorkspaceTimezoneChange, WorkspaceTimezoneError, type WorkspaceTimezoneReview } from "../../../../lib/workspace-timezone-settings";

export interface BusinessSettingsState {
  error: string | null;
  success: string | null;
}

export async function workspaceTimezoneAction(
  _state: { error: string | null; success: string | null; review: WorkspaceTimezoneReview | null },
  form: FormData,
): Promise<{ error: string | null; success: string | null; review: WorkspaceTimezoneReview | null }> {
  const context = await requireOwnerWorkspaceContext();
  const actor = { workspaceId: context.workspace.id, userId: context.session.userId };
  const input = { timezone: String(form.get("timezone") ?? ""), effectiveFromDate: String(form.get("effectiveFromDate") ?? ""), expectedVersion: Number(form.get("timezoneVersion")) };
  try {
    if (form.get("step") === "confirm") {
      const revision = await commitWorkspaceTimezoneChange({ actor, input, previewHash: String(form.get("previewHash") ?? ""), confirmed: form.get("confirmTimezone") === "on" });
      revalidatePath("/dashboard", "layout");
      return { error: null, success: `Timezone change to ${revision.timezone} scheduled for ${input.effectiveFromDate}.`, review: null };
    }
    return { error: null, success: null, review: await previewWorkspaceTimezoneChange({ actor, input }) };
  } catch (error) {
    return { error: error instanceof WorkspaceTimezoneError ? error.message : "The timezone change could not be confirmed. Reload and preview it again.", success: null, review: null };
  }
}
export async function saveBusinessSettingsAction(
  _state: BusinessSettingsState,
  form: FormData,
): Promise<BusinessSettingsState> {
  const context = await requireOwnerWorkspaceContext();
  const keys: Array<keyof BusinessSettingsInput> = [
    "name",
    "businessType",
    "contactEmail",
    "contactPhone",
    "currency",
    "locale",
    "addressLine1",
    "addressLine2",
    "city",
    "region",
    "postalCode",
    "countryCode",
  ];
  const input = Object.fromEntries(
    keys.map((key) => [key, String(form.get(key) ?? "")]),
  ) as unknown as BusinessSettingsInput;
  try {
    await saveBusinessSettings(
      { workspaceId: context.workspace.id, userId: context.session.userId },
      Number(form.get("version")),
      input,
    );
    revalidatePath("/dashboard", "layout");
    return { error: null, success: "Business settings saved." };
  } catch (error) {
    return {
      error:
        error instanceof BusinessSettingsError
          ? error.message
          : "The settings could not be saved. Reload them and try again.",
      success: null,
    };
  }
}
