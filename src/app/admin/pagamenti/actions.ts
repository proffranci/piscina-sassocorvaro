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
  const { supabase, profilo } = await richiediStaff();
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
  // "Ha saldato" veloce dalla scheda: si resta sulla pagina (la ricevuta è comunque nell'elenco)
  if (testo(formData, "resta") === "1") {
    vai(
      torna,
      "ok",
      profilo.ruolo === "admin"
        ? "Pagamento registrato e verificato."
        : "Pagamento registrato: diventa \"pagato\" appena l'admin lo verifica.",
    );
  }
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

  // Il database salva il prezzo e ricalcola se l'abbonamento è saldato
  const { error } = await supabase.rpc("imposta_prezzo", { p_abbonamento: id, p_prezzo: prezzo });
  if (error) vai(torna, "errore", messaggioDb(error, "Salvataggio non riuscito."));
  vai(torna, "ok", prezzo === null ? "Prezzo tolto." : "Prezzo salvato.");
}

// L'admin conferma un pagamento registrato dallo staff (o lo rifiuta con il motivo)
export async function verificaPagamento(formData: FormData) {
  const { supabase, profilo } = await richiediStaff();
  const torna = ritorno(formData);
  if (profilo.ruolo !== "admin") vai(torna, "errore", "Solo un amministratore può verificare i pagamenti.");
  const ok = testo(formData, "esito") !== "rifiuta";
  const { error } = await supabase.rpc("verifica_pagamento", {
    p_pagamento: testo(formData, "id"),
    p_ok: ok,
    p_motivo: testo(formData, "motivo") || null,
  });
  if (error) vai(torna, "errore", messaggioDb(error, "Verifica non riuscita."));
  vai(torna, "ok", ok ? "Pagamento verificato: lo stato dell'abbonamento è aggiornato." : "Pagamento rifiutato e annullato.");
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
