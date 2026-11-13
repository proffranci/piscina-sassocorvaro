import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { inviaPush } from "@/lib/push";

// Chiamata dal DATABASE: quando nasce un avviso per un cliente (trigger su "notifiche")
// e quando un cliente fa un'operazione che lo staff deve sapere (trigger su "attivita").
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

  let corpo: { notifica_id?: string; attivita_id?: number | string } = {};
  try {
    corpo = (await request.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ errore: "richiesta non valida" }, { status: 400 });
  }

  const admin = creaClientAdmin();

  // A) Un'operazione di un cliente -> notifica a tutto lo staff
  if (corpo.attivita_id !== undefined) {
    const attivitaId = Number(corpo.attivita_id);
    if (!Number.isInteger(attivitaId) || attivitaId <= 0) {
      return NextResponse.json({ errore: "richiesta non valida" }, { status: 400 });
    }
    const { data: a } = await admin.from("attivita").select("id, descrizione").eq("id", attivitaId).maybeSingle();
    if (!a) return NextResponse.json({ errore: "attività non trovata" }, { status: 404 });

    const { data: staff } = await admin.from("profili").select("id").in("ruolo", ["staff", "admin"]).eq("attivo", true);
    const ids = ((staff ?? []) as { id: string }[]).map((s) => s.id);
    const inviate = await inviaPush(ids, {
      titolo: "Piscina · novità",
      testo: a.descrizione,
      url: "/admin/novita",
      tag: "novita", // più novità di fila si raggruppano in una sola notifica
    });
    return NextResponse.json({ inviate });
  }

  // B) Un avviso per un cliente -> notifica ai suoi telefoni
  const notificaId = String(corpo.notifica_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(notificaId)) {
    return NextResponse.json({ errore: "richiesta non valida" }, { status: 400 });
  }
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
