"use server";

import { redirect } from "next/navigation";
import { richiediStaff } from "@/lib/sessione";
import { data as formattaData, testo } from "@/lib/formato";
import { messaggioDb } from "@/lib/errori";

// Le pagine da cui si può tornare dopo un invio (mai un indirizzo arbitrario)
const RITORNI = ["/admin", "/admin/avvisi", "/admin/abbonamenti"];

function esito(torna: string, tipo: "ok" | "errore", messaggio: string): never {
  const pagina = RITORNI.includes(torna) ? torna : "/admin";
  redirect(`${pagina}?${tipo}=${encodeURIComponent(messaggio)}`);
}

type Supabase = Awaited<ReturnType<typeof richiediStaff>>["supabase"];

async function invia(supabase: Supabase, utenti: string[], titolo: string, corpo: string, tipo: string, link: string | null) {
  return supabase.rpc("invia_notifica", {
    p_utenti: utenti,
    p_titolo: titolo,
    p_testo: corpo,
    p_tipo: tipo,
    p_link: link,
  });
}

// "Sollecita": promemoria di pagamento per un abbonamento (o per tutti quelli da pagare)
export async function sollecitaPagamento(formData: FormData) {
  const { supabase } = await richiediStaff();
  const torna = testo(formData, "torna");
  const id = testo(formData, "abbonamento_id");
  const oggi = new Date().toISOString().slice(0, 10);

  let query = supabase.from("abbonamenti").select("utente_id, tipo").eq("pagato", false).gte("data_fine", oggi);
  if (id !== "tutti") query = query.eq("id", id);
  const { data: abbonamenti } = await query;
  if (!abbonamenti || abbonamenti.length === 0) esito(torna, "errore", "Nessun abbonamento da sollecitare.");

  let inviati = 0;
  for (const a of abbonamenti) {
    const { data, error } = await invia(
      supabase,
      [a.utente_id],
      "Promemoria pagamento",
      `Ti ricordiamo di saldare l'abbonamento "${a.tipo}" in reception. Grazie!`,
      "pagamento",
      "/area/profilo",
    );
    if (error) esito(torna, "errore", messaggioDb(error, "Invio non riuscito."));
    inviati += Number(data ?? 0);
  }
  esito(torna, "ok", inviati === 1 ? "Promemoria di pagamento inviato." : `Promemoria di pagamento inviati: ${inviati}.`);
}

// "Avvisa": abbonamento in scadenza
export async function avvisaScadenza(formData: FormData) {
  const { supabase } = await richiediStaff();
  const torna = testo(formData, "torna");
  const { data: a } = await supabase
    .from("abbonamenti")
    .select("utente_id, tipo, data_fine")
    .eq("id", testo(formData, "abbonamento_id"))
    .maybeSingle();
  if (!a) esito(torna, "errore", "Abbonamento non trovato.");

  const { error } = await invia(
    supabase,
    [a.utente_id],
    "Il tuo abbonamento sta per scadere",
    `"${a.tipo}" è valido fino al ${formattaData(a.data_fine)}. Passa in reception per rinnovarlo.`,
    "scadenza",
    "/area/profilo",
  );
  if (error) esito(torna, "errore", messaggioDb(error, "Invio non riuscito."));
  esito(torna, "ok", "Avviso di scadenza inviato.");
}

// Il modulo libero della pagina Avvisi
export async function inviaAvviso(formData: FormData) {
  const { supabase } = await richiediStaff();
  const torna = "/admin/avvisi";
  const gruppo = testo(formData, "destinatari");
  const titolo = testo(formData, "titolo");
  const corpo = testo(formData, "testo");
  const tipo = ["promemoria", "pagamento", "scadenza", "lezione", "sistema"].includes(testo(formData, "tipo"))
    ? testo(formData, "tipo")
    : "promemoria";
  const oggi = new Date().toISOString().slice(0, 10);
  const fra14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  if (!titolo) esito(torna, "errore", "Scrivi un titolo per l'avviso.");

  let utenti: string[] = [];
  if (gruppo === "uno") {
    const id = testo(formData, "utente_id");
    if (!id) esito(torna, "errore", "Scegli il cliente a cui mandare l'avviso.");
    utenti = [id];
  } else if (gruppo === "tutti") {
    const { data } = await supabase.from("profili").select("id").eq("ruolo", "utente").eq("attivo", true);
    utenti = (data ?? []).map((r: { id: string }) => r.id);
  } else {
    let q = supabase.from("abbonamenti").select("utente_id").gte("data_fine", oggi);
    if (gruppo === "da_pagare") q = q.eq("pagato", false);
    if (gruppo === "in_scadenza") q = q.lte("data_fine", fra14);
    const { data } = await q;
    utenti = (data ?? []).map((r: { utente_id: string }) => r.utente_id);
  }

  if (utenti.length === 0) esito(torna, "errore", "Nessun destinatario in questo gruppo.");

  const { data, error } = await invia(supabase, utenti, titolo, corpo, tipo, null);
  if (error) esito(torna, "errore", messaggioDb(error, "Invio non riuscito."));
  const n = Number(data ?? 0);
  esito(torna, "ok", n === 1 ? "Avviso inviato a 1 persona." : `Avviso inviato a ${n} persone.`);
}
