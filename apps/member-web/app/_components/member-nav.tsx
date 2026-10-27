"use client";

import { Icon, type IconName } from "@flowstate/ui";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { coachingHref, coachingView } from "../app/coaching/navigation";

export interface CoachingNavigationContext {
  enrollmentId: string;
  hasAppointments: boolean;
}

const navItems: {
  href: string;
  label: string;
  icon: IconName;
  owns: string[];
}[] = [
  {
    href: "/app/schedule",
    label: "Classes",
    icon: "classes",
    owns: ["/app/bookings"],
  },
  {
    href: "/app/membership",
    label: "Membership",
    icon: "plans",
    owns: ["/app/forms"],
  },
  {
    href: "/app/billing",
    label: "Payments",
    icon: "billing",
    owns: ["/app/checkout"],
  },
  {
    href: "/app/account",
    label: "Account",
    icon: "account",
    owns: ["/app/family"],
  },
];

export function MemberNav({
  ariaLabel = "Member navigation",
  compact = false,
  hasCoaching = false,
  coachingNavigation,
}: {
  ariaLabel?: string;
  compact?: boolean;
  hasCoaching?: boolean;
  coachingNavigation?: CoachingNavigationContext;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const view = search.get("payment")
    ? "program"
    : coachingView(search.get("view"));
  const inCoaching = pathname.startsWith("/app/coaching");
  const coachingItems: {
    href: string;
    label: string;
    icon: IconName;
    active: boolean;
  }[] = coachingNavigation
    ? [
        {
          href: coachingHref(coachingNavigation.enrollmentId),
          label: "My day",
          icon: "today",
          active:
            pathname === `/app/coaching/${coachingNavigation.enrollmentId}` &&
            view === "notes",
        },
        {
          href: coachingHref(coachingNavigation.enrollmentId, "program"),
          label: "My program",
          icon: "plans",
          active:
            pathname === `/app/coaching/${coachingNavigation.enrollmentId}` &&
            view === "program",
        },
        ...(coachingNavigation.hasAppointments
          ? [
              {
                href: coachingHref(
                  coachingNavigation.enrollmentId,
                  "appointments",
                ),
                label: "My appointment",
                icon: "classes" as const,
                active:
                  pathname ===
                    `/app/coaching/${coachingNavigation.enrollmentId}` &&
                  view === "appointments",
              },
            ]
          : []),
      ]
    : [
        {
          href: "/app/coaching",
          label: "My coaching",
          icon: "today",
          active: inCoaching,
        },
      ];
  const items = compact
    ? inCoaching && coachingNavigation
      ? []
      : navItems.slice(0, 2)
    : navItems;
  const links = items.map((item) => {
    const active =
      (pathname === "/app" && item.href === "/app/schedule") ||
      [item.href, ...item.owns].some(
        (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
      );
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={compact ? "hl-bottom-link" : "hl-nav-link"}
      >
        <Icon name={item.icon} />
        <span>{item.label}</span>
      </Link>
    );
  });
  const coachingLinks = coachingItems.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className={compact ? "hl-bottom-link" : "hl-nav-link"}
      aria-current={item.active ? "page" : undefined}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  ));
  return compact ? (
    <div className="hl-bottom-links">
      {inCoaching && coachingNavigation ? coachingLinks : links}
    </div>
  ) : (
    <nav className="hl-nav" aria-label={ariaLabel}>
      <div className="hl-nav-group">{links}</div>
      {hasCoaching ? (
        <div className="hl-nav-group">
          <span className="hl-nav-group-label">Coaching</span>
          {coachingLinks}
        </div>
      ) : null}
    </nav>
  );
}

export function MemberIdentity({
  name,
  control,
}: {
  name: string;
  control?: ReactNode;
}) {
  const pathname = usePathname();
  const personScoped =
    pathname === "/app" ||
    ["/app/schedule", "/app/bookings", "/app/membership", "/app/forms"].some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
    );
  if (!personScoped)
    return <span className="hl-account-scope">Your account</span>;
  return (
    <div className="hl-member-identity">{control || <span>{name}</span>}</div>
  );
}
