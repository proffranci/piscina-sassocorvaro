import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { inviaPush } from "@/lib/push";

// Chiamata dal DATABASE (trigger su "notifiche") ogni volta che nasce un avviso.
// Non è per i browser: serve la parola segreta condivisa nell'intestazione.
export async function POST(request: Request) {
  const atteso = process.env.PUSH_SEGRETO ?? "";
  const ricevuto = request.headers.get("x-push-segreto") ?? "";

  // Confronto "a tempo costante": non rivela quanti caratteri sono giusti
  const a = Buffer.from(atteso);
  const b = Buffer.from(ricevuto);
  if (!atteso || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ errore: "non autorizzato" }, { status: 401 });
  }

  let notificaId = "";
  try {
    const corpo = (await request.json()) as { notifica_id?: string };
    notificaId = String(corpo.notifica_id ?? "");
  } catch {
    return NextResponse.json({ errore: "richiesta non valida" }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(notificaId)) {
    return NextResponse.json({ errore: "richiesta non valida" }, { status: 400 });
  }

  const admin = creaClientAdmin();
  const { data: n } = await admin
    .from("notifiche")
    .select("id, utente_id, titolo, testo, link")
    .eq("id", notificaId)
    .maybeSingle();
  if (!n) return NextResponse.json({ errore: "notifica non trovata" }, { status: 404 });

  const link = typeof n.link === "string" && n.link.startsWith("/area") ? n.link : "/area/avvisi";
  const inviate = await inviaPush([n.utente_id], { titolo: n.titolo, testo: n.testo, url: link, tag: n.id });
  return NextResponse.json({ inviate });
}
