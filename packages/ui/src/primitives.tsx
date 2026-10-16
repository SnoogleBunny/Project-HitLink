import type { HTMLAttributes, ReactNode } from "react";
import { formatMoney } from "./money";

export function HitLinkBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`hl-brand${compact ? " hl-brand-compact" : ""}`}>
      <span className="hl-brand-mark" aria-hidden="true">
        <b />
        <b />
        <b />
      </span>
      <span className="hl-brand-name">HitLink</span>
    </span>
  );
}

export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <span {...props} className={`hl-badge hl-badge-${tone} ${className}`} />
  );
}

export function Money({
  amountMinor,
  currency = "CAD",
  className = "",
}: {
  amountMinor: number;
  currency?: string;
  className?: string;
}) {
  return (
    <span className={`hl-money ${className}`}>
      {formatMoney(amountMinor, currency)}
    </span>
  );
}

export function Notice({
  children,
  actions,
  tone = "info",
}: {
  children: ReactNode;
  actions?: ReactNode;
  tone?: "info" | "warning" | "danger" | "success";
}) {
  return (
    <div className={`hl-notice hl-notice-${tone}`}>
      <div>{children}</div>
      {actions ? <div className="hl-notice-actions">{actions}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`hl-skeleton ${className}`} />;
}

export function PageSkeleton({ label = "Loading page" }: { label?: string }) {
  return (
    <div
      className="hl-page-skeleton"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="hl-sr-only">{label}</span>
      <div className="hl-skeleton-heading">
        <Skeleton className="hl-skeleton-title" />
        <Skeleton className="hl-skeleton-description" />
      </div>
      <div className="hl-skeleton-metrics">
        {[0, 1, 2].map((item) => (
          <div className="hl-card" key={item}>
            <Skeleton />
            <Skeleton className="hl-skeleton-value" />
          </div>
        ))}
      </div>
      <div className="hl-card hl-skeleton-records">
        {[0, 1, 2, 3].map((item) => (
          <div className="hl-skeleton-record" key={item}>
            <div>
              <Skeleton />
              <Skeleton className="hl-skeleton-description" />
            </div>
            <Skeleton className="hl-skeleton-control" />
          </div>
        ))}
      </div>
    </div>
  );
}
