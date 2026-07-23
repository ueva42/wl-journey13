import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;

  // 1) Routen, die NIE durch Supabase/Middleware-Logik laufen sollen
  if (
    p.startsWith("/_next") ||
    p.startsWith("/_vercel") ||
    p === "/favicon.ico" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml" ||
    p === "/sw.js" ||
    p === "/manifest.webmanifest" ||
    p.startsWith("/icons/") ||
    p.startsWith("/workbox-") ||
    p.startsWith("/auth") || // z.B. /auth/callback
    p.startsWith("/login") ||
    p.startsWith("/signup") ||
    p.startsWith("/reset") ||
    p.startsWith("/api") // wenn du API-Routen hast, lieber getrennt behandeln
  ) {
    return NextResponse.next();
  }

  // 2) Wenn ENV fehlt: nicht crashen / nicht hängen bleiben
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.next();
  }

  // 3) Response vorbereiten (Cookies können hier gesetzt werden)
  let res = NextResponse.next();

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  // 4) Nur wenn überhaupt Supabase-Cookies vorhanden sind, Session "leicht" lesen
  const hasSbCookie = req.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));

  if (hasSbCookie) {
    try {
      // wichtig: NICHT getUser() in Middleware (kann Netzcall/timeout auslösen)
      await supabase.auth.getSession();
    } catch {
      // Middleware darf nicht sterben -> einfach durchlassen
    }
  }

  return res;
}

// Läuft auf allem außer statischen / PWA Assets
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|workbox-).*)",
  ],
};
