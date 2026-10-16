import { redirect } from "next/navigation";
import { requireMemberPortalContext } from "../../../lib/member-auth";
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMemberPortalContext();
  const query = await searchParams;
  const next = new URLSearchParams();
  for (const key of ["date", "booking", "notice"])
    if (typeof query[key] === "string") next.set(key, query[key]);
  redirect(`/app/schedule${next.size ? `?${next}` : ""}`);
}
