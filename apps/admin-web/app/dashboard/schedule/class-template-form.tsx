"use client";

import type { Weekday } from "@flowstate/db";
import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import {
  WEEKDAY_ORDER,
  type ClassTemplateFormOptions,
} from "../../../lib/class-templates";
import {
  createClassTemplateAction,
  updateClassTemplateAction,
} from "./actions";

interface ClassTemplateFormProps {
  mode: "create" | "edit";
  options: ClassTemplateFormOptions;
  submitDisabled?: boolean;
  template?: {
    id: string;
    title: string | null;
    programId: string;
    roomId: string;
    coachWorkspaceUserId: string;
    weekday: Weekday;
    startTimeMinutes: number;
    endTimeMinutes: number;
    capacityOverride: number | null;
    bookingCutoffMinutes: number;
    cancellationCutoffMinutes: number;
  };
}

function formatMinutesForInput(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function getWeekdayLabel(weekday: Weekday): string {
  return weekday.charAt(0) + weekday.slice(1).toLowerCase();
}

export function ClassTemplateForm({
  mode,
  options,
  submitDisabled = false,
  template,
}: ClassTemplateFormProps) {
  const formActionForMode =
    mode === "create" ? createClassTemplateAction : updateClassTemplateAction;
  const [state, formAction] = useActionState(formActionForMode, emptyFormState);
  const coachStillSelectable =
    !template ||
    options.coaches.some((coach) => coach.id === template.coachWorkspaceUserId);
  const defaultCoachValue =
    template && coachStillSelectable ? template.coachWorkspaceUserId : "";

  return (
    <form action={formAction} className="form-stack">
      {template ? (
        <input name="templateId" type="hidden" value={template.id} />
      ) : null}

      <div className="field-row">
        <label className="field">
          <span>Program</span>
          <select
            defaultValue={template?.programId ?? ""}
            disabled={submitDisabled}
            name="programId"
          >
            <option value="">Select a program</option>
            {options.programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Weekday</span>
          <select
            defaultValue={template?.weekday ?? "MONDAY"}
            disabled={submitDisabled}
            name="weekday"
          >
            {WEEKDAY_ORDER.map((weekday) => (
              <option key={weekday} value={weekday}>
                {getWeekdayLabel(weekday)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Class title</span>
        <input
          defaultValue={template?.title ?? ""}
          disabled={submitDisabled}
          name="title"
          placeholder="Optional custom title"
          type="text"
        />
        <p className="field-help">
          Leave blank to use the program name in the schedule.
        </p>
      </label>

      <div className="field-row">
        <label className="field">
          <span>Start time</span>
          <input
            defaultValue={
              template
                ? formatMinutesForInput(template.startTimeMinutes)
                : "09:00"
            }
            disabled={submitDisabled}
            name="startTime"
            type="time"
          />
        </label>

        <label className="field">
          <span>End time</span>
          <input
            defaultValue={
              template
                ? formatMinutesForInput(template.endTimeMinutes)
                : "10:00"
            }
            disabled={submitDisabled}
            name="endTime"
            type="time"
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Room</span>
          <select
            defaultValue={template?.roomId ?? ""}
            disabled={submitDisabled}
            name="roomId"
          >
            <option value="">Select a room</option>
            {options.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {room.capacity ? ` (${room.capacity})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Coach</span>
          <select
            defaultValue={defaultCoachValue}
            disabled={submitDisabled}
            name="coachWorkspaceUserId"
          >
            <option value="">
              {template && !coachStillSelectable
                ? "Select an active owner or coach"
                : "Select a coach"}
            </option>
            {options.coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Capacity override</span>
          <input
            defaultValue={template?.capacityOverride ?? ""}
            disabled={submitDisabled}
            min={1}
            name="capacityOverride"
            placeholder="Optional"
            step={1}
            type="number"
          />
        </label>

        <label className="field">
          <span>Booking cutoff (minutes)</span>
          <input
            defaultValue={template?.bookingCutoffMinutes ?? 0}
            disabled={submitDisabled}
            min={0}
            name="bookingCutoffMinutes"
            step={1}
            type="number"
          />
        </label>
      </div>

      <label className="field">
        <span>Cancellation cutoff (minutes)</span>
        <input
          defaultValue={template?.cancellationCutoffMinutes ?? 0}
          disabled={submitDisabled}
          min={0}
          name="cancellationCutoffMinutes"
          step={1}
          type="number"
        />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton
        disabled={submitDisabled}
        pendingLabel={
          mode === "create" ? "Saving class template..." : "Saving changes..."
        }
      >
        {mode === "create" ? "Create class template" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
