"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { richiediUtente } from "@/lib/sessione";
import { testo } from "@/lib/formato";
import { messaggioDb } from "@/lib/errori";

function esito(tipo: "ok" | "errore", messaggio: string, pagina = "/area"): never {
  redirect(`${pagina}?${tipo}=${encodeURIComponent(messaggio)}`);
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
  if (error) esito("errore", messaggioDb(error, "Prenotazione non riuscita, riprova."), testo(formData, "torna") === "/area/prenota" ? "/area/prenota" : "/area");
  esito("ok", "Prenotazione confermata! La trovi qui tra le tue lezioni.");
}

// Chiamata in automatico quando il cliente apre la pagina Avvisi:
// segna tutto come letto e aggiorna il pallino rosso del menu
export async function segnaLette() {
  const { supabase } = await richiediUtente();
  await supabase.rpc("segna_notifiche_lette");
  revalidatePath("/area", "layout");
}

// ---------- Notifiche push sul telefono ----------

type DatiIscrizione = { endpoint: string; p256dh: string; auth: string; dispositivo: string };

// Il telefono ha accettato le notifiche: salviamo il suo "indirizzo"
export async function salvaIscrizione(dati: DatiIscrizione) {
  const { supabase } = await richiediUtente();
  const { error } = await supabase.rpc("salva_iscrizione_push", {
    p_endpoint: dati.endpoint,
    p_p256dh: dati.p256dh,
    p_auth: dati.auth,
    p_dispositivo: dati.dispositivo,
  });
  return { ok: !error, errore: error ? messaggioDb(error, "Non sono riuscito ad attivare le notifiche.") : null };
}

export async function rimuoviIscrizione(endpoint: string) {
  const { supabase } = await richiediUtente();
  await supabase.rpc("rimuovi_iscrizione_push", { p_endpoint: endpoint });
  return { ok: true };
}

// "Mandami una prova": una notifica solo a sé stessi
export async function notificaDiProva() {
  const { profilo } = await richiediUtente();
  const { inviaPush } = await import("@/lib/push");
  const inviate = await inviaPush([profilo.id], {
    titolo: "Notifiche attive 🏊",
    testo: "Da ora riceverai qui i promemoria della piscina.",
    url: "/area/avvisi",
    tag: "prova",
  });
  return { inviate };
}

// Il cliente sceglie come preferisce essere avvisato (app o WhatsApp)
export async function aggiornaPreferenze(formData: FormData) {
  const { supabase } = await richiediUtente();
  const { error } = await supabase.rpc("imposta_preferenze", {
    p_canale: testo(formData, "canale_notifica") === "whatsapp" ? "whatsapp" : "app",
    p_telefono: testo(formData, "telefono"),
    p_consenso_whatsapp: formData.get("consenso_whatsapp") === "on",
  });
  if (error) esito("errore", messaggioDb(error, "Non sono riuscito a salvare la preferenza."), "/area/profilo");
  esito("ok", "Preferenza salvata.", "/area/profilo");
}

// Il cliente chiede di cambiare uno dei suoi 2 giorni fissi
export async function richiediCambio(formData: FormData) {
  const { supabase } = await richiediUtente();
  const { error } = await supabase.rpc("richiedi_cambio_giorno", {
    p_abbonamento: testo(formData, "abbonamento_id"),
    p_vecchio: testo(formData, "vecchio"),
    p_nuovo: testo(formData, "nuovo"),
    p_nota: testo(formData, "nota"),
  });
  if (error) esito("errore", messaggioDb(error, "Non sono riuscito a inviare la richiesta."), "/area/profilo");
  esito("ok", "Richiesta inviata alla reception: riceverai la risposta tra gli Avvisi.", "/area/profilo");
}
