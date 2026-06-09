"use client";

import type { UserRole } from "@flowstate/db";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ownerNavItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
  },
  {
    href: "/dashboard/migration",
    label: "Migration",
  },
  {
    href: "/dashboard/programs",
    label: "Programs",
  },
  {
    href: "/dashboard/rooms",
    label: "Rooms",
  },
  {
    href: "/dashboard/schedule",
    label: "Schedule",
  },
  {
    href: "/dashboard/bookings",
    label: "Bookings",
  },
  {
    href: "/dashboard/coach/today",
    label: "Today roster",
  },
  {
    href: "/dashboard/members",
    label: "Members",
  },
  {
    href: "/dashboard/forms",
    label: "Forms",
  },
  {
    href: "/dashboard/membership-plans",
    label: "Membership plans",
  },
  {
    href: "/dashboard/access-products",
    label: "Access products",
  },
  {
    href: "/dashboard/billing",
    label: "Billing",
  },
  {
    href: "/dashboard/settings/billing",
    label: "Billing settings",
  },
  {
    href: "/dashboard/staff-invites",
    label: "Staff invites",
  },
];

const coachNavItems = [
  {
    href: "/dashboard/coach/today",
    label: "Today roster",
  },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ role }: { role: UserRole | null }) {
  const pathname = usePathname();
  const navItems = role === "COACH" ? coachNavItems : ownerNavItems;

  return (
    <nav className="shell-nav" aria-label="Admin navigation">
      {navItems.map((item) => (
        <Link
          key={item.href}
          className={`shell-nav-link ${isActivePath(pathname, item.href) ? "active" : ""}`}
          href={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
