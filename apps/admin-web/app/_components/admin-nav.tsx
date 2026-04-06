"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
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
    href: "/dashboard/staff-invites",
    label: "Staff invites",
  },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();

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
