"use server";

import { redirect } from "next/navigation";
import { richiediStaff } from "@/lib/sessione";
import { testo } from "@/lib/formato";

const PAGINA = "/admin/corsi";

function esito(tipo: "ok" | "errore", messaggio: string): never {
  redirect(`${PAGINA}?${tipo}=${encodeURIComponent(messaggio)}`);
}

export async function aggiungiOrario(formData: FormData) {
  const { supabase } = await richiediStaff();
  const corsoId = testo(formData, "corso_id");
  const giorno = Number(testo(formData, "giorno_settimana"));
  const oraInizio = testo(formData, "ora_inizio");
  const durata = Number(testo(formData, "durata_minuti") || 45);

  if (!corsoId || !(giorno >= 1 && giorno <= 7)) esito("errore", "Giorno non valido.");
  if (!/^\d{2}:\d{2}$/.test(oraInizio)) esito("errore", "Ora non valida.");
  if (!(durata >= 15 && durata <= 240)) esito("errore", "Durata non valida.");

  const { error } = await supabase
    .from("orari_corso")
    .insert({ corso_id: corsoId, giorno_settimana: giorno, ora_inizio: oraInizio, durata_minuti: durata });

  // 23505 = il database ha bloccato un doppione (vincolo "unique")
  if (error?.code === "23505") esito("errore", "Questo orario esiste già.");
  if (error) esito("errore", "Non sono riuscito a salvare l'orario.");
  esito("ok", "Orario aggiunto.");
}

export async function cambiaAttivoOrario(formData: FormData) {
  const { supabase } = await richiediStaff();
  const { error } = await supabase
    .from("orari_corso")
    .update({ attivo: testo(formData, "attivo") === "si" })
    .eq("id", testo(formData, "id"));
  if (error) esito("errore", "Modifica non riuscita.");
  esito("ok", "Orario aggiornato.");
}

export async function aggiornaCapienza(formData: FormData) {
  const { supabase } = await richiediStaff();
  const capienza = Number(testo(formData, "capienza"));
  if (!(Number.isInteger(capienza) && capienza > 0 && capienza <= 500)) esito("errore", "Numero di posti non valido.");

  const { error } = await supabase.from("corsi").update({ capienza }).eq("id", testo(formData, "corso_id"));
  if (error) esito("errore", "Modifica non riuscita.");
  esito("ok", "Posti aggiornati.");
}
