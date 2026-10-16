"use client";
import { useRef } from "react";
import type { ClassScheduleInput } from "../../../lib/class-schedule";
import type { ClassTemplateFormOptions } from "../../../lib/class-templates";
import { ScheduleEditor } from "./schedule-editor";

export function CoachAssignment({ initial, options, timezone, title, coachName, defaultCoachName }: { initial: ClassScheduleInput; options: ClassTemplateFormOptions; timezone: string; title: string; coachName: string | null; defaultCoachName?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  return <><button type="button" className="text-link" aria-label={`${coachName ? "Change" : "Assign"} coach for ${title} on ${initial.date}`} onClick={() => dialog.current?.showModal()}>{coachName ? "Change coach" : "Assign coach"}</button><dialog ref={dialog} className="class-assignment-dialog" aria-label={`Coach for ${title}`} onCancel={(event) => { if (dirty.current && !window.confirm("Discard your unsaved coach assignment?")) event.preventDefault(); }}><div className="form-stack"><h2>{title}</h2><ScheduleEditor key={`${initial.templateId}:${initial.date}`} initial={{ ...initial, scope: "coach" }} options={options} timezone={timezone} defaultCoachName={defaultCoachName} onDirtyChange={(value) => { dirty.current = value; }} onCancel={() => dialog.current?.close()} /></div></dialog></>;
}
