import Link from "next/link";

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

export function MemberNav() {
  return (
    <nav className="member-nav">
      {navItems.map((item) => (
        <Link key={item.href} className="member-nav-link" href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
