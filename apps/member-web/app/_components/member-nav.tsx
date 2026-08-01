"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/app",
    label: "Overview",
  },
  {
    href: "/app/schedule",
    label: "Schedule",
  },
  {
    href: "/app/bookings",
    label: "Bookings",
  },
  {
    href: "/app/membership",
    label: "Membership",
  },
  {
    href: "/app/forms",
    label: "Forms",
  },
  {
    href: "/app/billing",
    label: "Billing",
  },
];

interface MemberNavProps {
  ariaLabel?: string;
}

export function MemberNav({
  ariaLabel = "Member portal navigation",
}: MemberNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label={ariaLabel} className="member-nav">
      {navItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/app" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`member-nav-link${isActive ? " active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
