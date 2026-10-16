"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { Icon, useWorkspaceLoading } from "@flowstate/ui";
import { usePathname, useRouter } from "next/navigation";
import { selectFamilyMember } from "./member-selector-actions";

function containFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const controls = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    ),
  ];
  const first = controls[0],
    last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

export function MemberSelector({
  members,
  selectedMemberId,
}: {
  members: Array<{ id: string; fullName: string }>;
  selectedMemberId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nextId, setNextId] = useState("");
  const [open, setOpen] = useState(false);
  const dirty = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const setRecordLoading = useWorkspaceLoading();
  useEffect(() => {
    setRecordLoading(pending);
    return () => setRecordLoading(false);
  }, [pending, setRecordLoading]);
  useEffect(() => {
    dirty.current = false;
    const markDirty = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("main form") &&
        (pathname.startsWith("/app/forms/") ||
          target.closest("form[data-person-context]"))
      )
        dirty.current = true;
    };
    document.addEventListener("input", markDirty);
    document.addEventListener("change", markDirty);
    return () => {
      document.removeEventListener("input", markDirty);
      document.removeEventListener("change", markDirty);
    };
  }, [pathname, selectedMemberId]);
  useEffect(() => {
    const closePicker = () => picker.current?.close();
    window.addEventListener("resize", closePicker);
    return () => window.removeEventListener("resize", closePicker);
  }, []);
  if (members.length < 2 || pathname.startsWith("/app/coaching")) return null;
  const selectedName =
    members.find((member) => member.id === selectedMemberId)?.fullName ??
    "Select member";
  function anotherDialogOpen() {
    return [
      ...document.querySelectorAll(
        'dialog[open], [role="dialog"][aria-modal="true"]',
      ),
    ].some(
      (dialog) => dialog !== picker.current && dialog !== confirmation.current,
    );
  }
  function showPicker() {
    if (anotherDialogOpen()) {
      setError(
        "Finish or close the current booking or form before switching members.",
      );
      return;
    }
    setError(null);
    const rect = trigger.current?.getBoundingClientRect();
    if (rect && picker.current) {
      picker.current.style.setProperty("--picker-top", `${rect.bottom + 8}px`);
      picker.current.style.setProperty(
        "--picker-right",
        `${Math.max(16, window.innerWidth - rect.right)}px`,
      );
    }
    picker.current?.showModal();
    setOpen(true);
  }
  function switchMember(id: string) {
    confirmation.current?.close();
    setError(null);
    startTransition(async () => {
      try {
        await selectFamilyMember(id);
        dirty.current = false;
        // Filters and a signing draft belong to the previous person.
        if (pathname.startsWith("/app/forms/")) router.replace("/app/forms");
        else if (
          pathname.startsWith("/app/schedule") ||
          pathname.startsWith("/app/bookings")
        )
          router.replace("/app/schedule");
        router.refresh();
      } catch {
        setError(
          "Unable to switch members. Your access may have changed. Refresh and try again.",
        );
      }
    });
  }
  function chooseMember(id: string) {
    picker.current?.close();
    if (id === selectedMemberId) return;
    if (anotherDialogOpen()) {
      setError(
        "Finish or close the current booking or form before switching members.",
      );
      return;
    }
    if (dirty.current) {
      setNextId(id);
      confirmation.current?.showModal();
    } else switchMember(id);
  }
  return (
    <div className="hl-member-selector">
      <button
        ref={trigger}
        className="hl-person-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Select member, currently ${selectedName}`}
        disabled={pending}
        onClick={showPicker}
      >
        <span>{selectedName}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {pending ? (
        <span className="hl-sr-only" role="status">
          Loading member records
        </span>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <dialog
        ref={picker}
        className="hl-person-picker"
        aria-labelledby="member-picker-title"
        onClose={() => setOpen(false)}
        onKeyDown={containFocus}
        onClick={(event) => {
          if (event.target === event.currentTarget) picker.current?.close();
        }}
      >
        <div className="hl-person-picker-heading">
          <h2 id="member-picker-title">Choose a member</h2>
          <button
            className="hl-icon-button"
            aria-label="Close member picker"
            type="button"
            onClick={() => picker.current?.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="hl-person-options">
          {members.map((member) => (
            <button
              className="hl-person-option"
              type="button"
              key={member.id}
              aria-pressed={member.id === selectedMemberId}
              onClick={() => chooseMember(member.id)}
            >
              <span>{member.fullName}</span>
              {member.id === selectedMemberId ? (
                <span className="hl-person-selected">Selected</span>
              ) : null}
            </button>
          ))}
        </div>
      </dialog>
      <dialog
        ref={confirmation}
        className="hl-person-confirmation"
        aria-labelledby="member-switch-title"
        onKeyDown={containFocus}
      >
        <h2 id="member-switch-title">Discard this unfinished form?</h2>
        <p>
          Your changes have not been saved. Switching members will discard them.
        </p>
        <div className="dashboard-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => confirmation.current?.close()}
          >
            Keep editing
          </button>
          <button
            className="button"
            type="button"
            onClick={() => switchMember(nextId)}
          >
            Discard and switch
          </button>
        </div>
      </dialog>
    </div>
  );
}
