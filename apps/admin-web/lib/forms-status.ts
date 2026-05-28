import {
  buildMagicLinkPath,
  buildSignatureRequestToken,
  type ActionableFormRequest,
  type RequiredFormStatusItem,
} from "@flowstate/db";
import { getMemberAppUrl } from "./forms";

export type AggregateRequiredFormState =
  | "NONE"
  | "MISSING"
  | "PENDING"
  | "SUPERSEDED"
  | "SIGNED";

export function getAggregateRequiredFormState(
  items: RequiredFormStatusItem[],
): AggregateRequiredFormState {
  if (items.length === 0) {
    return "NONE";
  }

  if (items.some((item) => item.status === "MISSING")) {
    return "MISSING";
  }

  if (items.some((item) => item.status === "PENDING")) {
    return "PENDING";
  }

  if (items.some((item) => item.status === "SUPERSEDED")) {
    return "SUPERSEDED";
  }

  return "SIGNED";
}

export function formatRequiredFormState(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function buildActionableFormRequestHref(
  request: ActionableFormRequest,
): string {
  if (request.accessMethod === "PORTAL") {
    return `${getMemberAppUrl()}/app/forms/${request.requestId}`;
  }

  return `${getMemberAppUrl()}${buildMagicLinkPath(
    buildSignatureRequestToken(request.requestId),
  )}`;
}

