"use client";

import type { UserRole } from "@flowstate/db";
import { Icon, type IconName } from "@flowstate/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  owns: string[];
}
const ownerGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Daily work",
    items: [
      { href: "/dashboard", label: "Today", icon: "today", owns: [] },
      {
        href: "/dashboard/schedule",
        label: "Classes",
        icon: "classes",
        owns: ["/dashboard/bookings", "/dashboard/coach/today"],
      },
      {
        href: "/dashboard/members",
        label: "Members",
        icon: "members",
        owns: ["/dashboard/coaching"],
      },
      {
        href: "/dashboard/billing",
        label: "Billing",
        icon: "billing",
        owns: [],
      },
    ],
  },
  {
    label: "Management",
    items: [
      {
        href: "/dashboard/membership-plans",
        label: "Plans",
        icon: "plans",
        owns: ["/dashboard/access-products"],
      },
      { href: "/dashboard/forms", label: "Forms", icon: "forms", owns: [] },
      {
        href: "/dashboard/website",
        label: "Website",
        icon: "website",
        owns: [],
      },
      {
        href: "/dashboard/settings",
        label: "Settings",
        icon: "settings",
        owns: [
          "/dashboard/programs",
          "/dashboard/rooms",
          "/dashboard/staff-invites",
          "/dashboard/migration",
        ],
      },
    ],
  },
];
const coachGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Coaching",
    items: [
      {
        href: "/dashboard/coaching",
        label: "Clients",
        icon: "members",
        owns: [],
      },
      {
        href: "/dashboard/coach/today",
        label: "Classes",
        icon: "classes",
        owns: ["/dashboard/schedule"],
      },
    ],
  },
];
function matches(pathname: string, item: NavItem) {
  if (item.href === "/dashboard") return pathname === item.href;
  return [item.href, ...item.owns].some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

export function AdminNav({
  role,
  compact = false,
  ariaLabel = "Workspace navigation",
}: {
  role: UserRole | null;
  compact?: boolean;
  ariaLabel?: string;
}) {
  const pathname = usePathname();
  const groups =
    role === "OWNER" ? ownerGroups : role === "COACH" ? coachGroups : [];
  const renderItem = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={matches(pathname, item) ? "page" : undefined}
      className={compact ? "hl-bottom-link" : "hl-nav-link"}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  );
  if (compact)
    return (
      <div className="hl-bottom-links">
        {role === "OWNER"
          ? ownerGroups[0]!.items.slice(0, 3).map(renderItem)
          : null}
      </div>
    );
  return (
    <nav className="hl-nav" aria-label={ariaLabel}>
      {groups.map((group) => (
        <div className="hl-nav-group" key={group.label}>
          <p className="hl-nav-label">{group.label}</p>
          {group.items.map(renderItem)}
        </div>
      ))}
    </nav>
  );
}
