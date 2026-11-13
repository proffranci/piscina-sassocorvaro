"use server";

import { redirect } from "next/navigation";
import { richiediStaff } from "@/lib/sessione";
import { leggiScadenza, testo } from "@/lib/formato";
import { messaggioDb } from "@/lib/errori";

const PAGINA = "/admin/corsi";

function esito(tipo: "ok" | "errore", messaggio: string, pagina = PAGINA): never {
  redirect(`${pagina}?${tipo}=${encodeURIComponent(messaggio)}`);
}

const ORA = /^\d{2}:\d{2}$/;
const minuti = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Impostazioni del corso: posti, giorni dell'abbonamento, scadenza di conferma
export async function aggiornaCorso(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "corso_id");
  const capienza = Number(testo(formData, "capienza"));
  const giorni = Number(testo(formData, "giorni_abbonamento"));
  const scadenza = leggiScadenza(formData, true);

  if (!(Number.isInteger(capienza) && capienza > 0 && capienza <= 500)) esito("errore", "Numero di posti non valido.");
  if (!(Number.isInteger(giorni) && giorni >= 1 && giorni <= 7)) esito("errore", "Giorni dell'abbonamento: da 1 a 7.");
  if (!scadenza) esito("errore", "Scadenza di conferma non valida.");

  const { error } = await supabase
    .from("corsi")
    .update({ capienza, giorni_abbonamento: giorni, descrizione: testo(formData, "descrizione") || null, ...scadenza })
    .eq("id", id);
  if (error) esito("errore", messaggioDb(error, "Salvataggio non riuscito."));
  esito("ok", "Corso aggiornato: le lezioni in calendario si sono aggiornate.");
}

export async function creaCorso(formData: FormData) {
  const { supabase } = await richiediStaff();
  const nome = testo(formData, "nome");
  const capienza = Number(testo(formData, "capienza"));
  if (!nome) esito("errore", "Scrivi il nome del corso.");
  if (!(Number.isInteger(capienza) && capienza > 0 && capienza <= 500)) esito("errore", "Numero di posti non valido.");

  const { error } = await supabase.from("corsi").insert({ nome, capienza });
  if (error?.code === "23505") esito("errore", "Esiste già un corso con questo nome.");
  if (error) esito("errore", messaggioDb(error, "Non sono riuscito a creare il corso."));
  esito("ok", `Corso "${nome}" creato: ora aggiungi i suoi orari.`);
}

// Uno o più orari in un colpo: "lun-sab, dalle 8 alle 21, ogni ora"
export async function aggiungiOrari(formData: FormData) {
  const { supabase } = await richiediStaff();
  const corsoId = testo(formData, "corso_id");
  const giorni = [...new Set(formData.getAll("giorni").map(Number))].filter((g) => g >= 1 && g <= 7);
  const dalle = testo(formData, "dalle");
  const alle = testo(formData, "alle");
  const durata = Number(testo(formData, "durata_minuti") || 60);
  const ogni = Number(testo(formData, "ogni") || durata);

  if (!corsoId || giorni.length === 0) esito("errore", "Scegli almeno un giorno.");
  if (!ORA.test(dalle)) esito("errore", "Scrivi l'ora di inizio.");
  if (!(durata >= 15 && durata <= 240)) esito("errore", "Durata non valida (da 15 a 240 minuti).");
  if (!(ogni >= 15 && ogni <= 720)) esito("errore", "Intervallo non valido.");

  // Con "alle" vuoto si crea un solo orario; altrimenti tutti i turni che finiscono entro "alle"
  const inizi: string[] = [];
  if (!alle) inizi.push(dalle);
  else {
    if (!ORA.test(alle) || minuti(alle) <= minuti(dalle)) esito("errore", "L'ora di fine deve venire dopo l'ora di inizio.");
    for (let m = minuti(dalle); m + durata <= minuti(alle); m += ogni) inizi.push(hhmm(m));
    if (inizi.length === 0) esito("errore", "Nessun turno sta in questa fascia oraria: controlla durata e orari.");
  }

  const righe = giorni.flatMap((g) =>
    inizi.map((o) => ({ corso_id: corsoId, giorno_settimana: g, ora_inizio: o, durata_minuti: durata })),
  );
  if (righe.length > 300) esito("errore", "Troppi orari in una volta: riduci la fascia o i giorni.");

  // ignoreDuplicates: gli orari già esistenti vengono saltati
  const { data, error } = await supabase
    .from("orari_corso")
    .upsert(righe, { onConflict: "corso_id,giorno_settimana,ora_inizio", ignoreDuplicates: true })
    .select("id");
  if (error) esito("errore", messaggioDb(error, "Non sono riuscito a salvare gli orari."));

  await supabase.rpc("genera_lezioni", { p_giorni: 28 });
  const nuovi = data?.length ?? 0;
  const saltati = righe.length - nuovi;
  esito(
    "ok",
    `${nuovi === 1 ? "1 orario aggiunto" : `${nuovi} orari aggiunti`}${saltati > 0 ? ` (${saltati} c'erano già)` : ""} e lezioni create in calendario.`,
  );
}

// Personalizzazioni di un singolo orario
export async function aggiornaOrario(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "id");
  const pagina = `/admin/corsi/orari/${id}`;
  const durata = Number(testo(formData, "durata_minuti"));
  const capTesto = testo(formData, "capienza");
  const capienza = capTesto ? Number(capTesto) : null;
  const scadenza = leggiScadenza(formData, false);

  if (!(durata >= 15 && durata <= 240)) esito("errore", "Durata non valida (da 15 a 240 minuti).", pagina);
  if (capienza !== null && !(Number.isInteger(capienza) && capienza > 0 && capienza <= 500)) esito("errore", "Posti non validi.", pagina);
  if (!scadenza) esito("errore", "Scadenza non valida.", pagina);

  const { error } = await supabase.from("orari_corso").update({ durata_minuti: durata, capienza, ...scadenza }).eq("id", id);
  if (error) esito("errore", messaggioDb(error, "Salvataggio non riuscito."), pagina);
  esito("ok", "Orario aggiornato: le sue lezioni in calendario si sono aggiornate.", pagina);
}

// Sospendi = annulla le lezioni future (avvisando chi è prenotato). Riattiva = le rimette.
export async function sospendiOrario(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "id");
  const attivo = testo(formData, "attivo") === "si";
  const pagina = testo(formData, "torna") === "orario" ? `/admin/corsi/orari/${id}` : PAGINA;

  const { data, error } = await supabase.rpc("sospendi_orario", { p_orario: id, p_attivo: attivo });
  if (error) esito("errore", messaggioDb(error, "Operazione non riuscita."), pagina);
  const avvisati = Number(data ?? 0);
  esito(
    "ok",
    attivo
      ? "Orario riattivato: le lezioni sono tornate in calendario."
      : `Orario sospeso: lezioni future annullate${avvisati > 0 ? `, ${avvisati} prenotati avvisati` : ""}.`,
    pagina,
  );
}
