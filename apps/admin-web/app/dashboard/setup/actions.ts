"use server";
import {
  activateNewBusiness,
  previewWorkspaceSetup,
  requestWorkspaceSetupVerification,
  verifyWorkspaceSetupOwner,
  WorkspaceSetupError,
  type WorkspaceSetupReview,
} from "@flowstate/db";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export interface SetupState {
  error: string | null;
  message: string | null;
  review: WorkspaceSetupReview | null;
}
export async function workspaceSetupAction(
  _state: SetupState,
  form: FormData,
): Promise<SetupState> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const actor = { workspaceId: workspace.id, userId: session.userId };
  let activated = false;
  try {
    if (form.get("step") === "request") {
      const origin =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.NEXT_PUBLIC_FLOWSTATE_APP_URL;
      if (!origin)
        throw new WorkspaceSetupError(
          "The owner portal address is not configured.",
        );
      const result = await requestWorkspaceSetupVerification(actor, origin);
      revalidatePath("/dashboard/setup");
      return { error: null, message: result.message, review: null };
    }
    if (form.get("step") === "activate") {
      await activateNewBusiness(actor, {
        version: Number(form.get("version")),
        snapshotHash: String(form.get("snapshotHash") ?? ""),
        confirmed: form.get("confirmSetup") === "on",
      });
      activated = true;
    } else
      return {
        error: null,
        message: null,
        review: await previewWorkspaceSetup(actor),
      };
  } catch (error) {
    return {
      error:
        error instanceof WorkspaceSetupError
          ? error.message
          : "Business setup could not be confirmed. Reload and review it again.",
      message: null,
      review: null,
    };
  }
  if (activated) {
    revalidatePath("/dashboard", "layout");
    redirect("/dashboard/setup?activated=1");
  }
  return { error: null, message: null, review: null };
}
export async function verifySetupOwnerAction(
  _state: { error: string | null; verified: boolean },
  form: FormData,
) {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  try {
    await verifyWorkspaceSetupOwner(
      { workspaceId: workspace.id, userId: session.userId },
      String(form.get("token") ?? ""),
    );
    revalidatePath("/dashboard/setup");
    return { error: null, verified: true };
  } catch (error) {
    return {
      error:
        error instanceof WorkspaceSetupError
          ? error.message
          : "Verification could not be confirmed. Request another link.",
      verified: false,
    };
  }
}
