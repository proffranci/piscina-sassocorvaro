"use server";

import { redirect } from "next/navigation";
import { richiediStaff } from "@/lib/sessione";
import { testo } from "@/lib/formato";
import { messaggioDb } from "@/lib/errori";

function esito(percorso: string, tipo: "ok" | "errore", messaggio: string): never {
  redirect(`${percorso}?${tipo}=${encodeURIComponent(messaggio)}`);
}

// Crea subito le lezioni mancanti (di notte lo fa comunque il database da solo)
export async function generaCalendario() {
  const { supabase } = await richiediStaff();
  const { data, error } = await supabase.rpc("genera_lezioni", { p_giorni: 28 });
  if (error) esito("/admin", "errore", messaggioDb(error, "Non sono riuscito ad aggiornare il calendario."));
  const nuove = Number(data ?? 0);
  esito("/admin", "ok", nuove > 0 ? `Calendario aggiornato: ${nuove} lezioni aggiunte.` : "Il calendario era già aggiornato.");
}

// La reception conferma al posto dell'abbonato (es. ha telefonato)
export async function confermaPerConto(formData: FormData) {
  const { supabase } = await richiediStaff();
  const lezione = testo(formData, "lezione_id");
  const pagina = `/admin/lezioni/${lezione}`;

  const { data, error } = await supabase
    .from("prenotazioni")
    .update({ stato: "confermata", confermata_il: new Date().toISOString() })
    .eq("id", testo(formData, "id"))
    .eq("stato", "riservata")
    .select("id");
  if (error) esito(pagina, "errore", messaggioDb(error, "Conferma non riuscita."));
  if (!data || data.length === 0) esito(pagina, "errore", "Il posto non era più in attesa di conferma.");
  esito(pagina, "ok", "Presenza confermata.");
}

// Toglie una persona dalla lezione: l'abbonato "libera" il posto, l'ingresso si annulla
export async function liberaPosto(formData: FormData) {
  const { supabase } = await richiediStaff();
  const lezione = testo(formData, "lezione_id");
  const pagina = `/admin/lezioni/${lezione}`;
  const nuovoStato = testo(formData, "tipo") === "abbonamento" ? "liberata" : "annullata";

  const { error } = await supabase
    .from("prenotazioni")
    .update({ stato: nuovoStato })
    .eq("id", testo(formData, "id"))
    .in("stato", ["riservata", "confermata"]);
  if (error) esito(pagina, "errore", messaggioDb(error, "Operazione non riuscita."));
  esito(pagina, "ok", nuovoStato === "liberata" ? "Posto liberato." : "Ingresso annullato.");
}

// Ingresso singolo dalla reception: cliente registrato oppure solo un nome
export async function aggiungiIngresso(formData: FormData) {
  const { supabase } = await richiediStaff();
  const lezione = testo(formData, "lezione_id");
  const pagina = `/admin/lezioni/${lezione}`;
  const utenteId = testo(formData, "utente_id");
  const nomeOspite = testo(formData, "nome_ospite");

  if (!utenteId && !nomeOspite) esito(pagina, "errore", "Scegli un cliente oppure scrivi il nome della persona.");

  const { data: l } = await supabase.from("lezioni").select("inizio, annullata").eq("id", lezione).single();
  if (!l || l.annullata) esito(pagina, "errore", "Lezione non disponibile.");
  if (new Date(l.inizio) <= new Date()) esito(pagina, "errore", "La lezione è già iniziata.");

  const adesso = new Date().toISOString();

  if (utenteId) {
    // Se era un suo posto liberato, lo riattiviamo invece di crearne un altro
    const { data: esistente } = await supabase
      .from("prenotazioni")
      .select("id, stato")
      .eq("lezione_id", lezione)
      .eq("utente_id", utenteId)
      .neq("stato", "annullata")
      .maybeSingle();
    if (esistente && esistente.stato !== "liberata") esito(pagina, "errore", "Questa persona ha già un posto in questa lezione.");
    if (esistente) {
      const { error } = await supabase
        .from("prenotazioni")
        .update({ stato: "confermata", confermata_il: adesso })
        .eq("id", esistente.id);
      if (error) esito(pagina, "errore", messaggioDb(error, "Prenotazione non riuscita."));
      esito(pagina, "ok", "Posto riassegnato.");
    }
  }

  const { error } = await supabase.from("prenotazioni").insert({
    lezione_id: lezione,
    utente_id: utenteId || null,
    nome_ospite: utenteId ? null : nomeOspite,
    tipo: "ingresso_singolo",
    stato: "confermata",
    confermata_il: adesso,
  });
  if (error) esito(pagina, "errore", messaggioDb(error, "Prenotazione non riuscita."));
  esito(pagina, "ok", "Ingresso singolo aggiunto.");
}
