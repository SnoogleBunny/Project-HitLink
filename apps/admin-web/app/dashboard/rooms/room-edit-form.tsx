"use client";

import type { Room } from "@hitlink/db";
import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/admin-access";
import { updateRoomAction } from "./actions";

interface RoomEditFormProps {
  room: Pick<Room, "id" | "name" | "capacity" | "isActive">;
}

export function RoomEditForm({ room }: RoomEditFormProps) {
  const [state, formAction] = useActionState(updateRoomAction, emptyFormState);

  return (
    <form action={formAction} className="form-stack">
      <input name="roomId" type="hidden" value={room.id} />

      <label className="field">
        <span>Room name</span>
        <input defaultValue={room.name} name="name" type="text" />
      </label>

      <label className="field">
        <span>Capacity</span>
        <input
          defaultValue={room.capacity ?? ""}
          name="capacity"
          type="number"
        />
      </label>

      <label className="field-checkbox">
        <input defaultChecked={room.isActive} name="isActive" type="checkbox" />
        <div>
          <strong>Room is active</strong>
          <p>Only active, unarchived rooms should appear in future schedules.</p>
        </div>
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving changes...">Save changes</SubmitButton>
    </form>
  );
}
