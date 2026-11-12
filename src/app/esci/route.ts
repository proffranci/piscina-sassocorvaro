import { NextResponse } from "next/server";
import { creaClientServer } from "@/lib/supabase/server";

// Uscita con POST (non con un semplice link): cosi un sito esterno
// non puo farti uscire a tua insaputa.
export async function POST(request: Request) {
  const supabase = await creaClientServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
