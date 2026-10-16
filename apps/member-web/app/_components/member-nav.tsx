"use client";

import { Icon, type IconName } from "@flowstate/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
}: {
  ariaLabel?: string;
  compact?: boolean;
  hasCoaching?: boolean;
}) {
  const pathname = usePathname();
  const items = compact ? navItems.slice(0, 2) : navItems;
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
  return compact ? (
    <div className="hl-bottom-links">{links}</div>
  ) : (
    <nav className="hl-nav" aria-label={ariaLabel}>
      <div className="hl-nav-group">{links}</div>
      {hasCoaching ? (
        <div className="hl-nav-group">
          <span className="hl-nav-group-label">Coaching</span>
          <Link
            href="/app/coaching"
            className="hl-nav-link"
            aria-current={
              pathname.startsWith("/app/coaching") ? "page" : undefined
            }
          >
            <Icon name="today" />
            <span>My day</span>
          </Link>
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
