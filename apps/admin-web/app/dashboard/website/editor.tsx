"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const sections = ["pricing", "discovery"] as const;
type Section = (typeof sections)[number];

export function WebsiteEditor({
  pricing,
  discovery,
}: {
  pricing: ReactNode;
  discovery: ReactNode;
}) {
  const [section, setSection] = useState<Section>("pricing");
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  useEffect(() => {
    const sync = () =>
      setSection(location.hash === "#discovery" ? "discovery" : "pricing");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  function choose(next: Section) {
    setSection(next);
    history.replaceState(history.state, "", `#${next}`);
  }
  return (
    <>
      <div
        className="hl-local-tabs"
        role="tablist"
        aria-label="Website sections"
      >
        {sections.map((value, index) => (
          <button
            key={value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-${value}`}
            aria-selected={section === value}
            aria-controls={`${id}-${value}-panel`}
            tabIndex={section === value ? 0 : -1}
            onClick={() => choose(value)}
            onKeyDown={(event) => {
              const offset =
                event.key === "ArrowRight"
                  ? 1
                  : event.key === "ArrowLeft"
                    ? -1
                    : 0;
              if (!offset && event.key !== "Home" && event.key !== "End")
                return;
              event.preventDefault();
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? sections.length - 1
                    : (index + offset + sections.length) % sections.length;
              choose(sections[nextIndex]!);
              buttons.current[nextIndex]?.focus();
            }}
          >
            {value === "pricing" ? "Pricing" : "Search and sharing"}
          </button>
        ))}
      </div>
      {sections.map((value) => (
        <div
          key={value}
          role="tabpanel"
          id={`${id}-${value}-panel`}
          aria-labelledby={`${id}-${value}`}
          hidden={section !== value}
          className="form-stack"
          tabIndex={0}
        >
          {value === "pricing" ? pricing : discovery}
        </div>
      ))}
    </>
  );
}
