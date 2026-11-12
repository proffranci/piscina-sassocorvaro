import { type NextRequest } from "next/server";
import { aggiornaSessione } from "@/lib/supabase/proxy";

// In Next.js 16 il "middleware" si chiama "proxy": codice che gira
// prima di ogni richiesta, utile per sessione e protezione delle pagine.
export async function proxy(request: NextRequest) {
  return await aggiornaSessione(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
