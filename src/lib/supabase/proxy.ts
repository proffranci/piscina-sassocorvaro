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

  // getClaims verifica il "pass" senza una chiamata di rete a ogni pagina
  // (e se sta per scadere lo rinnova, aggiornando i cookie qui sopra)
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub;

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
