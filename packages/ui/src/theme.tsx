"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./icon";

const themeKey = "hitlink-theme";
const themeEvent = "hitlink-theme-change";

function preferredTheme(): "light" | "dark" {
  try {
    const saved = localStorage.getItem(themeKey);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* The theme remains usable when browser storage is unavailable. */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const system = matchMedia("(prefers-color-scheme: dark)");
  const update = () => {
    document.documentElement.dataset.theme = preferredTheme();
    onChange();
  };
  system.addEventListener("change", update);
  window.addEventListener("storage", update);
  window.addEventListener(themeEvent, onChange);
  return () => {
    system.removeEventListener("change", update);
    window.removeEventListener("storage", update);
    window.removeEventListener(themeEvent, onChange);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme || "light",
    () => "light",
  );
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="hl-theme-button"
      type="button"
      aria-label={`Switch to ${next} mode`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(themeKey, next);
        } catch {
          /* Apply the choice for this visit. */
        }
        window.dispatchEvent(new Event(themeEvent));
      }}
    >
      <Icon name={next === "dark" ? "moon" : "sun"} />
      <span>{next === "dark" ? "Dark mode" : "Light mode"}</span>
    </button>
  );
}

export function ThemeScript() {
  return (
    <script
      id="hitlink-theme"
      dangerouslySetInnerHTML={{
        __html: `(function(){var t;try{t=localStorage.getItem('hitlink-theme')}catch(e){}document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'})()`,
      }}
    />
  );
}
