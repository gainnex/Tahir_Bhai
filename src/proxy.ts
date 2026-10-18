import { NextResponse, type NextRequest } from "next/server";
import { unsealData } from "iron-session";
import { isRouteAllowed } from "@/lib/permissions";
import { SESSION_COOKIE, sessionOptions, type SessionData } from "@/lib/session";

// Optimistic checks only: no cookie -> /login, wrong role for the route -> /.
// The real checks (active user, role, project access) run on the server in every
// page and action via requireUser()/requireRole() and the service layer.

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const session = cookie
    ? await unsealData<SessionData>(cookie, { password: sessionOptions().password }).catch(
        () => ({}) as SessionData,
      )
    : ({} as SessionData);

  if (!session.userId || !session.role) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!isRouteAllowed(pathname, session.role)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and static files (incl. the installable-app files:
  // manifest, service worker, offline page — they must load without a login).
  matcher: ["/((?!_next/static|_next/image|manifest.webmanifest|sw.js|offline.html|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
