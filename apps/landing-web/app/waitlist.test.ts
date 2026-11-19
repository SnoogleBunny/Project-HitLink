import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { joinWaitlistAction } from "./actions";
import type { WaitlistState } from "../lib/waitlist";

const idleState: WaitlistState = {
  status: "idle",
  message: "",
  errors: {},
};

function validFormData(attemptId = "attempt-1") {
  const formData = new FormData();
  formData.set("attemptId", attemptId);
  formData.set("ownerName", "  Jacky Owner  ");
  formData.set("gymName", "  Flow State Muay Thai  ");
  formData.set("email", "  OWNER@EXAMPLE.COM  ");
  formData.set("style", "Muay Thai");
  formData.set("note", "  Replace brittle gym software.  ");
  return formData;
}

describe.sequential("landing waitlist action", () => {
  let tempDirectory: string;
  let waitlistPath: string;

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "flowstate-waitlist-"));
    waitlistPath = join(tempDirectory, "waitlist.jsonl");
    process.env.FLOWSTATE_WAITLIST_PATH = waitlistPath;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(async () => {
    delete process.env.FLOWSTATE_WAITLIST_PATH;
    vi.unstubAllGlobals();
    await rm(tempDirectory, { recursive: true, force: true });
  });

  it("confirms only a verified local save and makes no network request", async () => {
    const result = await joinWaitlistAction(idleState, validFormData());

    expect(result).toMatchObject({
      status: "success",
      message:
        "Your Founding Gym waitlist request was saved locally. No email was sent.",
      errors: {},
    });
    expect(fetch).not.toHaveBeenCalled();

    const records = (await readFile(waitlistPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, string>);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      attemptId: "attempt-1",
      ownerName: "Jacky Owner",
      gymName: "Flow State Muay Thai",
      email: "owner@example.com",
      style: "Muay Thai",
      note: "Replace brittle gym software.",
    });
    expect(records[0]?.submittedAt).toEqual(expect.any(String));
  });

  it("returns exact validation guidance without writing or making a network request", async () => {
    const formData = validFormData();
    formData.set("ownerName", "");
    formData.set("style", "");
    formData.set("note", "x".repeat(501));

    const result = await joinWaitlistAction(idleState, formData);

    expect(result).toMatchObject({
      status: "error",
      message: "Check the fields with errors, then submit your request again.",
      errors: {
        ownerName: "Enter your name.",
        style: "Choose a primary style.",
        note: "Keep your answer to 500 characters or fewer.",
      },
    });
    await expect(readFile(waitlistPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("announces an unconfirmed local write once and preserves retry values", async () => {
    const blockingFile = join(tempDirectory, "not-a-directory");
    await writeFile(blockingFile, "blocked", "utf8");
    process.env.FLOWSTATE_WAITLIST_PATH = join(blockingFile, "waitlist.jsonl");

    const result = await joinWaitlistAction(idleState, validFormData());

    expect(result).toMatchObject({
      status: "error",
      message:
        "We couldn't confirm that your waitlist request was saved locally. Please try again.",
      errors: {},
      attemptId: "attempt-1",
      values: {
        ownerName: "Jacky Owner",
        gymName: "Flow State Muay Thai",
        email: "owner@example.com",
        style: "Muay Thai",
        note: "Replace brittle gym software.",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds a replay to the same attempt and does not append a second record", async () => {
    const firstResult = await joinWaitlistAction(idleState, validFormData());
    const duplicateResult = await joinWaitlistAction(
      firstResult,
      validFormData(),
    );

    expect(duplicateResult).toMatchObject({
      status: "duplicate",
      message:
        "This same waitlist request is already saved locally. You do not need to submit it again.",
      errors: {},
      attemptId: "attempt-1",
    });
    expect(
      (await readFile(waitlistPath, "utf8")).trim().split("\n"),
    ).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serializes simultaneous replays so only one local record is appended", async () => {
    const [firstResult, secondResult] = await Promise.all([
      joinWaitlistAction(idleState, validFormData()),
      joinWaitlistAction(idleState, validFormData()),
    ]);

    expect([firstResult.status, secondResult.status].sort()).toEqual([
      "duplicate",
      "success",
    ]);
    expect(
      (await readFile(waitlistPath, "utf8")).trim().split("\n"),
    ).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts the same entered values from a fresh form interaction", async () => {
    await joinWaitlistAction(idleState, validFormData("attempt-1"));
    const secondResult = await joinWaitlistAction(
      idleState,
      validFormData("attempt-2"),
    );

    expect(secondResult.status).toBe("success");
    expect(
      (await readFile(waitlistPath, "utf8")).trim().split("\n"),
    ).toHaveLength(2);
  });

  it("does not treat submittedAt as part of replay identity", async () => {
    const firstResult = await joinWaitlistAction(idleState, validFormData());
    await new Promise((resolve) => setTimeout(resolve, 5));
    const duplicateResult = await joinWaitlistAction(
      firstResult,
      validFormData(),
    );

    expect(duplicateResult.status).toBe("duplicate");
    expect(
      (await readFile(waitlistPath, "utf8")).trim().split("\n"),
    ).toHaveLength(1);
  });
});
