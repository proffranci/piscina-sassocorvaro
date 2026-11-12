import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase usato nelle pagine e nelle azioni lato server.
// Agisce COME l'utente loggato: la Row Level Security decide cosa puo vedere.
export async function creaClientServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chiamato da una pagina (che non puo scrivere cookie):
            // ci pensa il proxy a rinnovare la sessione.
          }
        },
      },
    },
  );
}
