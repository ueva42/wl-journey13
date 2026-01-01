import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    // Kein Code -> zurück zur Login-Seite oder Start
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = createRouteHandlerClient({ cookies });

  // Wichtig: Code gegen Session tauschen
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  // Bei Fehler -> Login mit Hinweis
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
