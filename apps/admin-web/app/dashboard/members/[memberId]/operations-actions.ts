"use server";

import { createHash, randomUUID } from "node:crypto";
import {
  changeMemberOperations,
  MemberOperationsError,
  type ChangeMemberOperationsInput,
} from "@flowstate/db";
import { revalidatePath } from "next/cache";
import { requireMemberOperationsContext } from "./operations-context";

import type { MemberOperationsFormState } from "./operations-state";

export async function changeMemberOperationsAction(
  previous: MemberOperationsFormState,
  data: FormData,
): Promise<MemberOperationsFormState> {
  const { session, workspace } = await requireMemberOperationsContext();
  const value = (key: string) => String(data.get(key) ?? "");
  const submittedVersion = Number(value("expectedVersion"));
  const baseVersion =
    Number.isSafeInteger(submittedVersion) && submittedVersion >= 0
      ? submittedVersion
      : previous.baseVersion;
  try {
    const recordKind = value("recordKind"),
      action = value("operation");
    const visibility = value("visibility"),
      tagPurpose = value("tagPurpose");
    const memberId = value("memberId"),
      classTemplateId = value("classTemplateId"),
      date = value("date");
    if ((classTemplateId && !date) || (!classTemplateId && date))
      throw new MemberOperationsError(
        "Reload the exact class roster before saving.",
      );
    const base = {
      memberId,
      recordKey: value("recordKey"),
      expectedVersion: Number(value("expectedVersion")),
      operationId: value("operationId"),
      reason: value("reason"),
    };
    let input: ChangeMemberOperationsInput;
    if (recordKind === "NOTE" && action === "RETRACT") {
      input = { ...base, recordKind, action };
    } else if (
      recordKind === "NOTE" &&
      (action === "ADD" || action === "AMEND") &&
      (visibility === "OWNER_ONLY" || visibility === "ASSIGNED_OPERATIONS")
    ) {
      input = {
        ...base,
        recordKind,
        action,
        visibility,
        noteBody: value("noteBody"),
      };
    } else if (
      recordKind === "TAG" &&
      (tagPurpose === "OPERATIONAL" || tagPurpose === "COHORT_ELIGIBILITY")
    ) {
      const tagLabel = value("tagLabel").trim();
      if (action === "ADD" || action === "CLASSIFY")
        base.recordKey = `tag:${tagPurpose}:${createHash("sha256").update(tagLabel).digest("hex")}`;
      if (action === "RETRACT")
        input = { ...base, recordKind, action, tagLabel, tagPurpose };
      else if (
        (action === "ADD" || action === "AMEND" || action === "CLASSIFY") &&
        (visibility === "OWNER_ONLY" || visibility === "ASSIGNED_OPERATIONS")
      )
        input = {
          ...base,
          recordKind,
          action,
          tagLabel,
          tagPurpose,
          visibility,
        };
      else
        throw new MemberOperationsError(
          "Choose a supported label change and visibility.",
        );
    } else
      throw new MemberOperationsError(
        "Choose a supported operational change and visibility.",
      );
    const committed = await changeMemberOperations(
      {
        workspaceId: workspace.id,
        userId: session.userId,
        ...(classTemplateId ? { occurrence: { classTemplateId, date } } : {}),
      },
      input,
    );
    revalidatePath(`/dashboard/members/${memberId}`);
    revalidatePath(`/dashboard/members/${memberId}/operations`);
    if (classTemplateId)
      revalidatePath(`/dashboard/schedule/${classTemplateId}/roster`);
    return {
      baseVersion: input.action === "ADD" ? 0 : committed.version,
      confirmedVersion: committed.version,
      recordKey:
        input.action === "ADD"
          ? input.recordKind === "NOTE"
            ? `note:${randomUUID()}`
            : "new-internal-label"
          : committed.recordKey,
      operationId: randomUUID(),
      completedOperationId: input.operationId,
      completedAction: input.action,
      error: null,
      success: "Operational change saved with its author and history.",
    };
  } catch (error) {
    if (error instanceof MemberOperationsError)
      return {
        ...previous,
        baseVersion,
        error: error.message,
        success: null,
        completedAction: null,
      };
    throw error;
  }
}
