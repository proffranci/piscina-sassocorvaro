"use server";

import { redirect } from "next/navigation";
import { richiediUtente } from "@/lib/sessione";
import { testo } from "@/lib/formato";
import { messaggioDb } from "@/lib/errori";

function esito(tipo: "ok" | "errore", messaggio: string): never {
  redirect(`/area?${tipo}=${encodeURIComponent(messaggio)}`);
}

// Le regole (scadenza delle 17, posti liberi, "è davvero tua?") le controlla
// il database dentro le funzioni: qui ci limitiamo a chiamarle.

export async function conferma(formData: FormData) {
  const { supabase } = await richiediUtente();
  const { error } = await supabase.rpc("conferma_presenza", { p_prenotazione: testo(formData, "id") });
  if (error) esito("errore", messaggioDb(error, "Conferma non riuscita, riprova."));
  esito("ok", "Presenza confermata, ci vediamo in vasca! 🚴");
}

export async function disdici(formData: FormData) {
  const { supabase } = await richiediUtente();
  const { error } = await supabase.rpc("disdici_prenotazione", { p_prenotazione: testo(formData, "id") });
  if (error) esito("errore", messaggioDb(error, "Disdetta non riuscita, riprova."));
  esito("ok", "Fatto: il tuo posto è stato liberato per qualcun altro.");
}

export async function prenota(formData: FormData) {
  const { supabase } = await richiediUtente();
  const { error } = await supabase.rpc("prenota_ingresso", { p_lezione: testo(formData, "lezione_id") });
  if (error) esito("errore", messaggioDb(error, "Prenotazione non riuscita, riprova."));
  esito("ok", "Prenotazione confermata!");
}
