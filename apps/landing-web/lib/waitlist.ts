import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface WaitlistSubmission {
  ownerName: string;
  gymName: string;
  email: string;
  style: string;
  note: string;
  submittedAt: string;
}

export interface WaitlistErrors {
  ownerName?: string;
  gymName?: string;
  email?: string;
  style?: string;
  note?: string;
  form?: string;
}

export interface WaitlistState {
  status: "idle" | "success" | "error";
  message: string;
  errors: WaitlistErrors;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function validateWaitlistSubmission(formData: FormData): {
  errors: WaitlistErrors;
  submission: WaitlistSubmission;
} {
  const submission = {
    ownerName: readValue(formData, "ownerName"),
    gymName: readValue(formData, "gymName"),
    email: readValue(formData, "email").toLowerCase(),
    style: readValue(formData, "style"),
    note: readValue(formData, "note"),
    submittedAt: new Date().toISOString(),
  };

  const errors: WaitlistErrors = {};

  if (!submission.ownerName) {
    errors.ownerName = "Enter your name.";
  }

  if (!submission.gymName) {
    errors.gymName = "Enter your gym name.";
  }

  if (!emailPattern.test(submission.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!submission.style) {
    errors.style = "Choose your martial arts style.";
  }

  if (submission.note.length > 500) {
    errors.note = "Keep the note under 500 characters.";
  }

  return {
    errors,
    submission,
  };
}

export async function saveWaitlistSubmission(
  submission: WaitlistSubmission,
): Promise<void> {
  const outputPath =
    process.env.FLOWSTATE_WAITLIST_PATH ??
    join(process.cwd(), "data", "waitlist-submissions.jsonl");

  await mkdir(dirname(outputPath), { recursive: true });
  await appendFile(outputPath, `${JSON.stringify(submission)}\n`, "utf8");
}
