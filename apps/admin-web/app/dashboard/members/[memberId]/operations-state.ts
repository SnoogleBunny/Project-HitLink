export interface MemberOperationsFormState {
  baseVersion: number;
  confirmedVersion: number | null;
  recordKey: string;
  operationId: string;
  error: string | null;
  success: string | null;
  completedOperationId: string | null;
  completedAction: "ADD" | "AMEND" | "RETRACT" | "CLASSIFY" | null;
}
export function initialMemberOperationsFormState(args: {
  baseVersion: number;
  recordKey: string;
  operationId: string;
}): MemberOperationsFormState {
  return {
    ...args,
    confirmedVersion: null,
    error: null,
    success: null,
    completedOperationId: null,
    completedAction: null,
  };
}
export function memberOperationsScopeKey(scope: {
  memberId: string;
  classTemplateId?: string;
  date?: string;
}) {
  return JSON.stringify([
    scope.memberId,
    scope.classTemplateId ?? null,
    scope.date ?? null,
  ]);
}
