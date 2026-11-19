import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface WaitlistValues {
  ownerName: string;
  gymName: string;
  email: string;
  style: string;
  note: string;
}

export interface WaitlistSubmission extends WaitlistValues {
  attemptId: string;
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
  status: "idle" | "success" | "duplicate" | "error";
  message: string;
  errors: WaitlistErrors;
  attemptId?: string;
  values?: WaitlistValues;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const saveQueues = new Map<string, Promise<void>>();

function readValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function validateWaitlistSubmission(formData: FormData): {
  errors: WaitlistErrors;
  submission: WaitlistSubmission;
} {
  const submission = {
    attemptId: readValue(formData, "attemptId") || randomUUID(),
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
    errors.style = "Choose a primary style.";
  }

  if (submission.note.length > 500) {
    errors.note = "Keep your answer to 500 characters or fewer.";
  }

  return {
    errors,
    submission,
  };
}

export function waitlistValuesFromSubmission(
  submission: WaitlistSubmission,
): WaitlistValues {
  return {
    ownerName: submission.ownerName,
    gymName: submission.gymName,
    email: submission.email,
    style: submission.style,
    note: submission.note,
  };
}

function isSameAttempt(
  existing: Partial<WaitlistSubmission>,
  submission: WaitlistSubmission,
): boolean {
  return (
    existing.attemptId === submission.attemptId &&
    existing.ownerName === submission.ownerName &&
    existing.gymName === submission.gymName &&
    existing.email === submission.email &&
    existing.style === submission.style &&
    existing.note === submission.note
  );
}

async function hasMatchingAttempt(
  outputPath: string,
  submission: WaitlistSubmission,
): Promise<boolean> {
  let contents: string;

  try {
    contents = await readFile(outputPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }

  return contents
    .split("\n")
    .filter(Boolean)
    .some((line) => {
      const existing = JSON.parse(line) as Partial<WaitlistSubmission>;
      return isSameAttempt(existing, submission);
    });
}

async function runInSaveQueue<T>(
  outputPath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = saveQueues.get(outputPath) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  saveQueues.set(outputPath, queued);

  await previous;

  try {
    return await operation();
  } finally {
    release();
    if (saveQueues.get(outputPath) === queued) {
      saveQueues.delete(outputPath);
    }
  }
}

export async function saveWaitlistSubmission(
  submission: WaitlistSubmission,
): Promise<"saved" | "duplicate"> {
  const outputPath =
    process.env.FLOWSTATE_WAITLIST_PATH ??
    join(process.cwd(), "data", "waitlist-submissions.jsonl");

  return runInSaveQueue(outputPath, async () => {
    if (await hasMatchingAttempt(outputPath, submission)) {
      return "duplicate";
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await appendFile(outputPath, `${JSON.stringify(submission)}\n`, "utf8");
    return "saved";
  });
}
