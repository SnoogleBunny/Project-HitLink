import { redirect } from "next/navigation";
import { getMemberSessionOrNull } from "../lib/member-auth";

export default async function Home() {
  const session = await getMemberSessionOrNull();

  redirect(session ? "/app" : "/login");
}
