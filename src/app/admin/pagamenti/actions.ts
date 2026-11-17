"use server";

import { redirect } from "next/navigation";
import { richiediStaff } from "@/lib/sessione";
import { leggiImporto, testo } from "@/lib/formato";
import { messaggioDb } from "@/lib/errori";
import { leggiPagamento } from "@/lib/pagamenti";

// Torniamo solo su pagine dell'area admin (mai su indirizzi esterni)
function ritorno(formData: FormData) {
  const t = testo(formData, "torna");
  return /^\/admin(\/[\w/-]*)?$/.test(t) ? t : "/admin/pagamenti";
}

function vai(pagina: string, tipo: "ok" | "errore", messaggio: string): never {
  redirect(`${pagina}${pagina.includes("?") ? "&" : "?"}${tipo}=${encodeURIComponent(messaggio)}`);
}

// Registra il pagamento e apre subito la ricevuta da stampare
export async function registraPagamento(formData: FormData) {
  const { supabase } = await richiediStaff();
  const torna = ritorno(formData);
  const p = leggiPagamento(formData);
  if ("errore" in p) vai(torna, "errore", p.errore);

  const { data: id, error } = await supabase.rpc("registra_pagamento", {
    p_utente: testo(formData, "utente_id") || null,
    p_intestatario: testo(formData, "intestatario") || null,
    p_abbonamento: testo(formData, "abbonamento_id") || null,
    p_descrizione: testo(formData, "descrizione") || null,
    p_importo: p.importo,
    p_metodo: p.metodo,
    p_data: p.data,
    p_note: p.note,
  });
  if (error || !id) vai(torna, "errore", messaggioDb(error, "Pagamento non registrato."));
  redirect(`/ricevuta/${id}?torna=${encodeURIComponent(torna)}&nuova=1`);
}

// Un pagamento sbagliato non si cancella: si annulla con il motivo
export async function annullaPagamento(formData: FormData) {
  const { supabase } = await richiediStaff();
  const torna = ritorno(formData);
  const { error } = await supabase.rpc("annulla_pagamento", {
    p_pagamento: testo(formData, "id"),
    p_motivo: testo(formData, "motivo"),
  });
  if (error) vai(torna, "errore", messaggioDb(error, "Annullamento non riuscito."));
  vai(torna, "ok", "Ricevuta annullata.");
}

// Prezzo concordato di un abbonamento (serve per sapere quanto manca)
export async function salvaPrezzo(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "abbonamento_id");
  const torna = `/admin/abbonamenti/${id}`;
  const scritto = testo(formData, "prezzo");
  const prezzo = scritto ? leggiImporto(scritto) : null;
  if (scritto && prezzo === null) vai(torna, "errore", "Prezzo non valido.");

  const { error } = await supabase.from("abbonamenti").update({ prezzo }).eq("id", id);
  if (error) vai(torna, "errore", "Salvataggio non riuscito.");
  // Il "pagato" si ricalcola con il nuovo prezzo
  const { data: pagamenti } = await supabase.from("pagamenti").select("importo").eq("abbonamento_id", id).eq("annullato", false);
  const versato = (pagamenti ?? []).reduce((t: number, r: { importo: number | string }) => t + Number(r.importo), 0);
  if (versato > 0) await supabase.from("abbonamenti").update({ pagato: prezzo === null || versato >= prezzo }).eq("id", id);
  vai(torna, "ok", prezzo === null ? "Prezzo tolto." : "Prezzo salvato.");
}

// Intestazione e piè di pagina delle ricevute (solo admin)
export async function salvaIntestazione(formData: FormData) {
  const { supabase, profilo } = await richiediStaff();
  if (profilo.ruolo !== "admin") vai("/admin/pagamenti", "errore", "Solo un amministratore può cambiare l'intestazione.");
  const intestazione = String(formData.get("intestazione") ?? "").trim().slice(0, 600);
  const piede = String(formData.get("piede") ?? "").trim().slice(0, 600);
  if (!intestazione) vai("/admin/pagamenti", "errore", "L'intestazione non può essere vuota.");

  const { error } = await supabase.from("impostazioni").upsert([
    { chiave: "ricevuta_intestazione", valore: intestazione },
    { chiave: "ricevuta_piede", valore: piede },
  ]);
  if (error) vai("/admin/pagamenti", "errore", "Salvataggio non riuscito.");
  vai("/admin/pagamenti", "ok", "Intestazione delle ricevute salvata.");
}
