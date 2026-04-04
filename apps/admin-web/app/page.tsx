import { redirect } from "next/navigation";
import { getHomeRouteDestination, getSessionOrNull } from "../lib/admin-access";

export default async function HomePage() {
  const session = await getSessionOrNull();

  redirect(getHomeRouteDestination(session));
}
