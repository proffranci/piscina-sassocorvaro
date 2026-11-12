import { createServerClient } from "@supabase/ssr";
import { supabaseChiavePubblica, supabaseUrl } from "./config";
import { NextResponse, type NextRequest } from "next/server";

// Gira prima di ogni pagina: rinnova la sessione (i token scadono dopo un'ora)
// e manda al login chi prova ad aprire un'area protetta senza essere entrato.
export async function aggiornaSessione(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl(),
    supabaseChiavePubblica(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const percorso = request.nextUrl.pathname;
  const protetta = percorso.startsWith("/admin") || percorso.startsWith("/area");

  if (!user && protetta) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
