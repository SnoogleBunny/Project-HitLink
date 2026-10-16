import {
  clearSessionCookie,
  getSessionFromToken,
  MEMBER_SESSION_COOKIE_NAME,
} from "@flowstate/auth";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@flowstate/db";

const AUTH_ROUTES = ["/login"];
const PROTECTED_ROUTES = ["/app"];

function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const gymSlug = /^\/gym\/([^/]+)(?:\/|$)/.exec(pathname)?.[1];
  if (gymSlug) {
    try {
      const site = await prisma.workspaceWebsite.findUnique({
        where: { slug: decodeURIComponent(gymSlug) },
        select: { publishedAt: true, workspace: { select: { status: true } } },
      });
      if (!site?.publishedAt || site.workspace.status !== "ACTIVE") {
        return NextResponse.rewrite(new URL("/404", request.url), {
          status: 404,
          headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
        });
      }
    } catch {
      return new NextResponse("This gym website is temporarily unavailable. Please try again shortly.", {
        status: 503,
        headers: { "Retry-After": "60", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
      });
    }
  }
  const sessionToken =
    request.cookies.get(MEMBER_SESSION_COOKIE_NAME)?.value?.trim() ?? "";
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

      clearSessionCookie(response.cookies, {
        cookieName: MEMBER_SESSION_COOKIE_NAME,
      });
      return response;
    }
  }

  if (matchesRoute(pathname, AUTH_ROUTES) && hasSessionCookie) {
    return NextResponse.redirect(new URL("/app", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
