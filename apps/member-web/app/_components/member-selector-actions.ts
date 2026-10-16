"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireMemberPortalContext } from "../../lib/member-auth";
import { setMemberSelectionCookie } from "../../lib/member-selection-cookie";

export async function selectFamilyMember(memberId: string): Promise<void> {
  const context = await requireMemberPortalContext({
    memberId,
    permission: "view",
  });
  const cookieStore = await cookies();
  setMemberSelectionCookie(
    cookieStore,
    context.workspace.id,
    context.member.id,
  );
  revalidatePath("/app", "layout");
}
