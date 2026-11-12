"use server";

import { redirect } from "next/navigation";
import { richiediStaff } from "@/lib/sessione";
import { testo } from "@/lib/formato";

function errore(percorso: string, messaggio: string): never {
  redirect(`${percorso}?errore=${encodeURIComponent(messaggio)}`);
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function creaAbbonamento(formData: FormData) {
  const { supabase } = await richiediStaff();
  const pagina = "/admin/abbonamenti/nuovo";

  const utenteId = testo(formData, "utente_id");
  const tipo = testo(formData, "tipo");
  const dataInizio = testo(formData, "data_inizio");
  const dataFine = testo(formData, "data_fine");
  const note = testo(formData, "note") || null;
  const pagato = formData.get("pagato") === "on";
  const orariScelti = [...new Set(formData.getAll("orari").map(String))];

  if (!utenteId || !tipo) errore(pagina, "Scegli il cliente e scrivi il tipo di abbonamento.");
  if (!DATA.test(dataInizio) || !DATA.test(dataFine)) errore(pagina, "Date non valide.");
  if (dataFine < dataInizio) errore(pagina, "La data di fine viene prima di quella di inizio.");
  if (orariScelti.length !== 2) errore(pagina, "Devi scegliere esattamente 2 appuntamenti settimanali.");

  // Controllo sul database che i 2 orari esistano, siano attivi e in giorni diversi
  const { data: orari } = await supabase
    .from("orari_corso")
    .select("id, giorno_settimana")
    .in("id", orariScelti)
    .eq("attivo", true);
  if (!orari || orari.length !== 2) errore(pagina, "Uno degli orari scelti non è più disponibile.");
  if (orari[0].giorno_settimana === orari[1].giorno_settimana) {
    errore(pagina, "I 2 appuntamenti devono essere in giorni diversi.");
  }

  const { data: nuovo, error } = await supabase
    .from("abbonamenti")
    .insert({ utente_id: utenteId, tipo, data_inizio: dataInizio, data_fine: dataFine, note, pagato })
    .select("id")
    .single();
  if (error || !nuovo) errore(pagina, "Non sono riuscito a salvare l'abbonamento.");

  const { error: erroreOrari } = await supabase
    .from("abbonamenti_orari")
    .insert(orariScelti.map((id) => ({ abbonamento_id: nuovo.id, orario_corso_id: id })));
  if (erroreOrari) {
    // Annullo tutto: meglio nessun abbonamento che uno a meta
    await supabase.from("abbonamenti").delete().eq("id", nuovo.id);
    errore(pagina, "Non sono riuscito a salvare gli orari dell'abbonamento.");
  }

  redirect(`/admin/abbonamenti?ok=${encodeURIComponent("Abbonamento creato.")}`);
}

export async function cambiaPagato(formData: FormData) {
  const { supabase } = await richiediStaff();
  const { error } = await supabase
    .from("abbonamenti")
    .update({ pagato: testo(formData, "pagato") === "si" })
    .eq("id", testo(formData, "id"));
  if (error) errore("/admin/abbonamenti", "Modifica non riuscita.");
  redirect(`/admin/abbonamenti?ok=${encodeURIComponent("Pagamento aggiornato.")}`);
}
