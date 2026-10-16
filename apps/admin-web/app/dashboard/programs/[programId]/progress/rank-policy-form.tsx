"use client";
import { useActionState, useState } from "react";
import type { ProgramRankPolicy } from "@flowstate/db/program-progress-policy";
import { programRankAction, type RankPolicyState } from "./actions";
export function RankPolicyForm({
  programId,
  initial,
}: {
  programId: string;
  initial: ProgramRankPolicy;
}) {
  const [state, action, pending] = useActionState(
      programRankAction,
      {} as RankPolicyState,
    ),
    [draft, setDraft] = useState(initial),
    [key] = useState(() => crypto.randomUUID()),
    [reviewing, setReviewing] = useState(false);
  const change = (value: ProgramRankPolicy) => {
    setReviewing(false);
    setDraft(value);
  };
  return (
    <div className="form-stack">
      <form
        action={action}
        className="form-stack"
        onSubmit={() => setReviewing(true)}
      >
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="policy" value={JSON.stringify(draft)} />
        <label className="field">
          <span>Rank tracking</span>
          <select
            aria-label="Rank tracking"
            value={draft.mode}
            onChange={(event) =>
              change({
                ...draft,
                mode: event.target.value as ProgramRankPolicy["mode"],
              })
            }
          >
            <option value="OFF">Off</option>
            <option value="HISTORY">Promotion history only</option>
            <option value="PREREQUISITES">
              History and class booking requirements
            </option>
          </select>
        </label>
        <p>
          Put ranks in order, starting with the first rank. Each program has its
          own system. Existing history is kept when tracking is off.
        </p>
        {draft.ranks.map((rank, index) => (
          <div className="field-row" key={rank.key}>
            <label className="field">
              <span>Rank {index + 1}</span>
              <input
                maxLength={80}
                required
                value={rank.name}
                onChange={(event) =>
                  change({
                    ...draft,
                    ranks: draft.ranks.map((item, i) =>
                      i === index
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Maximum stripes</span>
              <input
                type="number"
                min="0"
                max="20"
                value={rank.maxStripes}
                onChange={(event) =>
                  change({
                    ...draft,
                    ranks: draft.ranks.map((item, i) =>
                      i === index
                        ? { ...item, maxStripes: Number(event.target.value) }
                        : item,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="text-link"
              disabled={index === 0}
              onClick={() => {
                const ranks = [...draft.ranks];
                [ranks[index - 1], ranks[index]] = [
                  ranks[index]!,
                  ranks[index - 1]!,
                ];
                change({ ...draft, ranks });
              }}
            >
              Move up
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                change({
                  ...draft,
                  ranks: draft.ranks.filter((_, i) => i !== index),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button button-secondary"
          onClick={() =>
            change({
              ...draft,
              ranks: [
                ...draft.ranks,
                { key: crypto.randomUUID(), name: "", maxStripes: 0 },
              ],
            })
          }
        >
          Add rank
        </button>
        <button className="button" disabled={pending}>
          {pending ? "Reviewing…" : "Review rank settings"}
        </button>
      </form>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p role="status">{state.message}</p> : null}
      {reviewing && state.review ? (
        <form action={action} className="management-card form-stack">
          <h3>Review rank settings</h3>
          <input type="hidden" name="programId" value={programId} />
          <input type="hidden" name="command" value="save" />
          <input type="hidden" name="operationKey" value={key} />
          <input
            type="hidden"
            name="policy"
            value={JSON.stringify(state.review.policy)}
          />
          <input type="hidden" name="reviewToken" value={state.review.token} />
          <p>
            {state.review.affected.length} existing bookings need a decision.
          </p>
          {state.review.affected.map((item) => (
            <p key={item.bookingId}>
              {item.date} · {item.memberName} · {item.title}: {item.reason}
            </p>
          ))}
          {state.review.affected.length ? (
            <label className="field">
              <span>Affected bookings</span>
              <select required name="resolution">
                <option value="">Choose an action</option>
                <option value="EXCEPTION">
                  Keep each booking with a recorded exception
                </option>
                <option value="CANCEL">
                  Cancel each booking without penalty
                </option>
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>Reason for this change</span>
            <textarea name="reason" minLength={5} maxLength={1000} required />
          </label>
          <button className="button" disabled={pending}>
            {pending ? "Saving…" : "Save rank settings"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
export function ProgressCapabilityForm({
  programId,
  coach,
}: {
  programId: string;
  coach: {
    id: string;
    name: string;
    canManageProgress: boolean;
    canOverridePrerequisites: boolean;
  };
}) {
  const [state, action, pending] = useActionState(
    programRankAction,
    {} as RankPolicyState,
  );
  return (
    <form action={action} className="stack-item form-stack">
      <h3>{coach.name}</h3>
      <input type="hidden" name="programId" value={programId} />
      <input type="hidden" name="command" value="capabilities" />
      <input type="hidden" name="workspaceUserId" value={coach.id} />
      <label>
        <input
          type="checkbox"
          name="canManageProgress"
          defaultChecked={coach.canManageProgress}
        />{" "}
        Record promotions and read internal rank notes
      </label>
      <label>
        <input
          type="checkbox"
          name="canOverridePrerequisites"
          defaultChecked={coach.canOverridePrerequisites}
        />{" "}
        Grant reasoned class eligibility exceptions
      </label>
      <p>These permissions apply across the gym’s programs.</p>
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.message ? <p role="status">{state.message}</p> : null}
      <button className="button button-secondary" disabled={pending}>
        Save permissions
      </button>
    </form>
  );
}
