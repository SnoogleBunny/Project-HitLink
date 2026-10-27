"use server";
import {
  changeMemberEmergencyContact,
  MemberProfileError,
} from "@flowstate/db";
import type { EmergencyContactFormState } from "@flowstate/ui";
import { revalidatePath } from "next/cache";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

export async function changeEmergencyContactAction(
  _previous: EmergencyContactFormState,
  data: FormData,
): Promise<EmergencyContactFormState> {
  const { workspace, session } = await requireOwnerWorkspaceContext();
  const memberId = String(data.get("memberId") ?? "");
  try {
    const result = await changeMemberEmergencyContact(
      { workspaceId: workspace.id, userId: session.userId },
      {
        memberId,
        contactId: String(data.get("contactId") ?? "") || undefined,
        expectedVersion: Number(data.get("expectedVersion")),
        expectedContactVersion: data.has("expectedContactVersion")
          ? Number(data.get("expectedContactVersion"))
          : undefined,
        operationId: String(data.get("operationId") ?? ""),
        operation: String(data.get("operation") ?? "") as
          | "ADD"
          | "UPDATE"
          | "RETIRE",
        fullName: String(data.get("fullName") ?? ""),
        relationshipLabel: String(data.get("relationshipLabel") ?? ""),
        phone: String(data.get("phone") ?? ""),
        email: String(data.get("email") ?? ""),
        reason: String(data.get("reason") ?? ""),
      },
    );
    revalidatePath(`/dashboard/members/${memberId}`);
    revalidatePath(`/app/account/emergency`);
    return {
      error: null,
      success: "Emergency contact saved. No family permissions changed.",
      profileVersion: result.profileVersion,
    };
  } catch (error) {
    if (error instanceof MemberProfileError)
      return { error: error.message, success: null };
    throw error;
  }
}
