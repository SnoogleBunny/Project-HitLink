import {
  clearSessionCookie,
  getSessionFromToken,
  SESSION_COOKIE_NAME,
} from "@flowstate/auth";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_ROUTES = ["/login", "/signup"];
const PROTECTED_ROUTES = ["/dashboard", "/onboarding"];

function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const sessionToken =
    request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim() ?? "";
  const hasSessionCookie = Boolean(sessionToken);

  if (matchesRoute(pathname, PROTECTED_ROUTES) && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  if (hasSessionCookie) {
    const session = await getSessionFromToken({ token: sessionToken });

    if (!session) {
      const response = matchesRoute(pathname, PROTECTED_ROUTES)
        ? NextResponse.redirect(new URL("/login", request.nextUrl))
        : NextResponse.next();

      clearSessionCookie(response.cookies);
      return response;
    }
  }

  if (matchesRoute(pathname, AUTH_ROUTES) && hasSessionCookie) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
