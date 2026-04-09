"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import { createRoomAction } from "./actions";

export function RoomCreateForm() {
  const [state, formAction] = useActionState(createRoomAction, emptyFormState);

  return (
    <form action={formAction} className="form-stack">
      <label className="field">
        <span>Room name</span>
        <input name="name" placeholder="Main Mat" type="text" />
      </label>

      <label className="field">
        <span>Capacity</span>
        <input name="capacity" placeholder="24" type="number" />
      </label>

      <label className="field-checkbox">
        <input defaultChecked name="isActive" type="checkbox" />
        <div>
          <strong>Room is active</strong>
          <p>Inactive rooms stay visible to admins but should not be scheduled.</p>
        </div>
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving room...">Create room</SubmitButton>
    </form>
  );
}
