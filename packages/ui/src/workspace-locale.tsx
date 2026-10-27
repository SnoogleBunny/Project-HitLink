"use client";
import { createContext, useContext, type ReactNode } from "react";
import { formatMoney } from "./money";
import {
  DEFAULT_DISPLAY_LOCALE,
  formatDisplayDate,
  resolveDisplayLocale,
} from "./locale";
const WorkspaceLocale = createContext(DEFAULT_DISPLAY_LOCALE);
export function WorkspaceLocaleProvider({
  locale,
  children,
}: {
  locale?: string | null;
  children: ReactNode;
}) {
  return (
    <WorkspaceLocale.Provider value={resolveDisplayLocale(locale)}>
      {children}
    </WorkspaceLocale.Provider>
  );
}
export function useWorkspaceLocale() {
  return useContext(WorkspaceLocale);
}
export function Money({
  amountMinor,
  currency = "CAD",
  className = "",
  locale,
}: {
  amountMinor: number;
  currency?: string;
  className?: string;
  locale?: string | null;
}) {
  const configuredLocale = useWorkspaceLocale();
  return (
    <span className={`hl-money ${className}`}>
      {formatMoney(
        amountMinor,
        currency,
        locale ? resolveDisplayLocale(locale) : configuredLocale,
      )}
    </span>
  );
}
export function LocaleDate({
  value,
  options,
  locale,
}: {
  value: Date | string;
  options: Intl.DateTimeFormatOptions;
  locale?: string | null;
}) {
  const configuredLocale = useWorkspaceLocale();
  return formatDisplayDate(value, options, locale ?? configuredLocale);
}
