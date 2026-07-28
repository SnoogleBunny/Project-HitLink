"use client";

import type { UserRole } from "@flowstate/db";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ownerNavGroups = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard" }],
  },
  {
    label: "Migration setup",
    items: [{ href: "/dashboard/migration", label: "Migration" }],
  },
  {
    label: "Daily operations",
    items: [
      { href: "/dashboard/programs", label: "Programs" },
      { href: "/dashboard/rooms", label: "Rooms" },
      { href: "/dashboard/schedule", label: "Schedule" },
      { href: "/dashboard/bookings", label: "Bookings" },
      { href: "/dashboard/coach/today", label: "Today roster" },
      { href: "/dashboard/members", label: "Members" },
    ],
  },
  {
    label: "Products and forms",
    items: [
      { href: "/dashboard/forms", label: "Forms" },
      { href: "/dashboard/membership-plans", label: "Membership plans" },
      { href: "/dashboard/access-products", label: "Access products" },
    ],
  },
  {
    label: "Business settings",
    items: [
      { href: "/dashboard/billing", label: "Billing" },
      { href: "/dashboard/settings/billing", label: "Billing settings" },
      { href: "/dashboard/staff-invites", label: "Staff invites" },
    ],
  },
];

const coachNavGroups = [
  {
    label: "Daily operations",
    items: [{ href: "/dashboard/coach/today", label: "Today roster" }],
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
  const navGroups = role === "COACH" ? coachNavGroups : ownerNavGroups;

  return (
    <nav className="shell-nav" aria-label="Admin navigation">
      {navGroups.map((group) => (
        <div className="shell-nav-group" key={group.label}>
          <p className="shell-nav-group-label">{group.label}</p>
          <div className="shell-nav-group-links">
            {group.items.map((item) => (
              <Link
                key={item.href}
                aria-current={
                  isActivePath(pathname, item.href) ? "page" : undefined
                }
                className={`shell-nav-link ${isActivePath(pathname, item.href) ? "active" : ""}`}
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
