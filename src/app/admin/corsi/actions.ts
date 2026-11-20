"use server";

import { redirect } from "next/navigation";
import { richiediStaff } from "@/lib/sessione";
import { leggiImporto, leggiScadenza, testo } from "@/lib/formato";
import { messaggioDb } from "@/lib/errori";

const PAGINA = "/admin/corsi";

// La pagina può avere già "?corso=…" e un "#ancora": il messaggio va prima dell'ancora
function esito(tipo: "ok" | "errore", messaggio: string, pagina = PAGINA): never {
  const [percorso, ancora] = pagina.split("#");
  const sep = percorso.includes("?") ? "&" : "?";
  redirect(`${percorso}${sep}${tipo}=${encodeURIComponent(messaggio)}${ancora ? `#${ancora}` : ""}`);
}

const ORA = /^\d{2}:\d{2}$/;
const minuti = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Legge tutte le impostazioni del corso dal modulo (vedi CampiCorso.tsx).
// Restituisce i dati da salvare, oppure il messaggio d'errore.
function leggiCorso(formData: FormData): { dati: Record<string, unknown> } | { errore: string } {
  const nome = testo(formData, "nome");
  const capienza = Number(testo(formData, "capienza"));
  const giorni = Number(testo(formData, "giorni_abbonamento") || 2);
  const durata = Number(testo(formData, "durata_predefinita") || 45);
  const disdetta = Number(testo(formData, "disdetta_ore_prima") || 0);
  const prenotabile = Number(testo(formData, "prenotabile_giorni") || 7);
  const ingressiDa = testo(formData, "ingressi_da") === "dopo_scadenza" ? "dopo_scadenza" : "subito";
  const scadenza = leggiScadenza(formData, true);
  const prezzoIngresso = testo(formData, "prezzo_ingresso");
  const prezzoAbbonamento = testo(formData, "prezzo_abbonamento");
  const pi = prezzoIngresso ? leggiImporto(prezzoIngresso) : null;
  const pa = prezzoAbbonamento ? leggiImporto(prezzoAbbonamento) : null;

  if (!nome || nome.length > 60) return { errore: "Scrivi il nome del corso (massimo 60 caratteri)." };
  if (!(Number.isInteger(capienza) && capienza > 0 && capienza <= 500)) return { errore: "Numero di posti non valido." };
  if (!(Number.isInteger(giorni) && giorni >= 1 && giorni <= 7)) return { errore: "Giorni dell'abbonamento: da 1 a 7." };
  if (!(Number.isInteger(durata) && durata >= 15 && durata <= 240)) return { errore: "Durata non valida (da 15 a 240 minuti)." };
  if (!(Number.isInteger(disdetta) && disdetta >= 0 && disdetta <= 72)) return { errore: "Limite per disdire: da 0 a 72 ore." };
  if (!(Number.isInteger(prenotabile) && prenotabile >= 1 && prenotabile <= 60)) return { errore: "Anticipo per gli ingressi: da 1 a 60 giorni." };
  if (!scadenza) return { errore: "Orario limite per confermare non valido." };
  const corsieMax = Number(testo(formData, "corsie_max") || 5);
  const perCorsia = Number(testo(formData, "persone_per_corsia") || 7);
  if (!(Number.isInteger(corsieMax) && corsieMax >= 1 && corsieMax <= 10)) return { errore: "Corsie: da 1 a 10." };
  if (!(Number.isInteger(perCorsia) && perCorsia >= 1 && perCorsia <= 10)) return { errore: "Persone per corsia: da 1 a 10." };
  if (prezzoIngresso && pi === null) return { errore: "Prezzo dell'ingresso non valido." };
  if (prezzoAbbonamento && pa === null) return { errore: "Prezzo dell'abbonamento non valido." };

  return {
    dati: {
      nome,
      descrizione: testo(formData, "descrizione") || null,
      capienza,
      giorni_abbonamento: giorni,
      durata_predefinita: durata,
      disdetta_ore_prima: disdetta,
      ingressi_clienti: formData.get("ingressi_clienti") === "on",
      ingressi_da: ingressiDa,
      prenotabile_giorni: prenotabile,
      prezzo_ingresso: pi,
      prezzo_abbonamento: pa,
      usa_corsie: formData.get("usa_corsie") === "on",
      corsie_max: corsieMax,
      persone_per_corsia: perCorsia,
      abbonabile: formData.get("abbonabile") === "on",
      ...scadenza,
    },
  };
}

// Impostazioni del corso: nome, posti, abbonati, scadenza, ingressi singoli, prezzi
export async function aggiornaCorso(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "corso_id");
  const pagina = `${PAGINA}?corso=${id}#corso-${id}`;
  const letto = leggiCorso(formData);
  if ("errore" in letto) esito("errore", letto.errore, pagina);

  const { error } = await supabase.from("corsi").update(letto.dati).eq("id", id);
  if (error?.code === "23505") esito("errore", "Esiste già un corso con questo nome.", pagina);
  if (error) esito("errore", messaggioDb(error, "Salvataggio non riuscito."), pagina);
  esito("ok", "Corso aggiornato: le lezioni in calendario si sono aggiornate.", pagina);
}

// Nuovo corso con tutte le impostazioni e (facoltativi) i primi orari
export async function creaCorso(formData: FormData) {
  const { supabase } = await richiediStaff();
  const pagina = `${PAGINA}#nuovo-corso`;
  const letto = leggiCorso(formData);
  if ("errore" in letto) esito("errore", letto.errore, pagina);

  // Gli orari iniziali li controlliamo prima di creare il corso
  const conOrari = formData.getAll("giorni").length > 0 || testo(formData, "dalle") !== "";
  let turni: { giorni: number[]; inizi: string[]; durata: number } | null = null;
  if (conOrari) {
    const t = leggiTurni(formData, Number(letto.dati.durata_predefinita));
    if ("errore" in t) esito("errore", `Orari: ${t.errore}`, pagina);
    turni = t;
  }

  const { data: corso, error } = await supabase.from("corsi").insert(letto.dati).select("id, nome").single();
  if (error?.code === "23505") esito("errore", "Esiste già un corso con questo nome.", pagina);
  if (error || !corso) esito("errore", messaggioDb(error, "Non sono riuscito a creare il corso."), pagina);

  const qui = `${PAGINA}?corso=${corso.id}#corso-${corso.id}`;
  if (!turni) esito("ok", `Corso "${corso.nome}" creato: ora aggiungi i suoi orari.`, qui);
  const { giorni, inizi, durata } = turni;
  const corsoId = corso.id as string;

  const righe = giorni.flatMap((g) => inizi.map((o) => ({ corso_id: corsoId, giorno_settimana: g, ora_inizio: o, durata_minuti: durata })));
  const { error: erroreOrari } = await supabase.from("orari_corso").insert(righe);
  if (erroreOrari) esito("errore", `Corso "${corso.nome}" creato, ma gli orari non sono stati salvati: aggiungili qui sotto.`, qui);
  await supabase.rpc("genera_lezioni", { p_giorni: 28 });
  esito("ok", `Corso "${corso.nome}" creato con ${righe.length === 1 ? "1 orario" : `${righe.length} orari`} e lezioni in calendario.`, qui);
}

// Sospendi = annulla le lezioni future (avvisando i prenotati). Riattiva = le rimette.
export async function attivaCorso(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "corso_id");
  const attivo = testo(formData, "attivo") === "si";
  const pagina = `${PAGINA}?corso=${id}#corso-${id}`;
  const { data, error } = await supabase.rpc("attiva_corso", { p_corso: id, p_attivo: attivo });
  if (error) esito("errore", messaggioDb(error, "Operazione non riuscita."), pagina);
  const n = Number(data ?? 0);
  esito(
    "ok",
    attivo
      ? "Corso riattivato: le lezioni sono tornate in calendario."
      : `Corso sospeso: lezioni future annullate${n > 0 ? `, ${n} prenotati avvisati` : ""}.`,
    pagina,
  );
}

// Elimina tutto il corso (solo admin). Bisogna riscrivere il nome per conferma.
export async function eliminaCorso(formData: FormData) {
  const { supabase, profilo } = await richiediStaff();
  const id = testo(formData, "corso_id");
  const pagina = `${PAGINA}?corso=${id}#corso-${id}`;
  if (profilo.ruolo !== "admin") esito("errore", "Solo un amministratore può eliminare un corso.", pagina);

  const { data: corso } = await supabase.from("corsi").select("nome").eq("id", id).maybeSingle();
  if (!corso) esito("errore", "Corso non trovato.");
  if (testo(formData, "conferma").toLowerCase() !== String(corso.nome).toLowerCase()) {
    esito("errore", `Per eliminare scrivi esattamente il nome del corso: "${corso.nome}".`, pagina);
  }

  const { data, error } = await supabase.rpc("elimina_corso", { p_corso: id });
  if (error) esito("errore", messaggioDb(error, "Eliminazione non riuscita."), pagina);
  const n = Number(data ?? 0);
  esito("ok", `Corso "${corso.nome}" eliminato${n > 0 ? `: ${n} prenotati avvisati dell'annullamento` : ""}.`);
}

// "lun-sab, dalle 8 alle 21, ogni ora" -> giorni e ore di inizio
function leggiTurni(formData: FormData, durataPredefinita: number): { giorni: number[]; inizi: string[]; durata: number } | { errore: string } {
  const giorni = [...new Set(formData.getAll("giorni").map(Number))].filter((g) => g >= 1 && g <= 7);
  const dalle = testo(formData, "dalle");
  const alle = testo(formData, "alle");
  const durata = Number(testo(formData, "durata_minuti") || durataPredefinita || 60);
  const ogni = Number(testo(formData, "ogni") || durata);

  if (giorni.length === 0) return { errore: "Scegli almeno un giorno." };
  if (!ORA.test(dalle)) return { errore: "Scrivi l'ora di inizio." };
  if (!(durata >= 15 && durata <= 240)) return { errore: "Durata non valida (da 15 a 240 minuti)." };
  if (!(ogni >= 15 && ogni <= 720)) return { errore: "Intervallo non valido." };

  // Con "alle" vuoto si crea un solo orario; altrimenti tutti i turni che finiscono entro "alle"
  const inizi: string[] = [];
  if (!alle) inizi.push(dalle);
  else {
    if (!ORA.test(alle) || minuti(alle) <= minuti(dalle)) return { errore: "L'ora di fine deve venire dopo l'ora di inizio." };
    for (let m = minuti(dalle); m + durata <= minuti(alle); m += ogni) inizi.push(hhmm(m));
    if (inizi.length === 0) return { errore: "Nessun turno sta in questa fascia oraria: controlla durata e orari." };
  }
  if (giorni.length * inizi.length > 300) return { errore: "Troppi orari in una volta: riduci la fascia o i giorni." };
  return { giorni, inizi, durata };
}

// Uno o più orari in un colpo: "lun-sab, dalle 8 alle 21, ogni ora"
export async function aggiungiOrari(formData: FormData) {
  const { supabase } = await richiediStaff();
  const corsoId = testo(formData, "corso_id");
  const pagina = `${PAGINA}?corso=${corsoId}#corso-${corsoId}`;
  if (!corsoId) esito("errore", "Corso non trovato.");
  const t = leggiTurni(formData, 60);
  if ("errore" in t) esito("errore", t.errore, pagina);

  const righe = t.giorni.flatMap((g) =>
    t.inizi.map((o) => ({ corso_id: corsoId, giorno_settimana: g, ora_inizio: o, durata_minuti: t.durata })),
  );

  // ignoreDuplicates: gli orari già esistenti vengono saltati
  const { data, error } = await supabase
    .from("orari_corso")
    .upsert(righe, { onConflict: "corso_id,giorno_settimana,ora_inizio", ignoreDuplicates: true })
    .select("id");
  if (error) esito("errore", messaggioDb(error, "Non sono riuscito a salvare gli orari."), pagina);

  await supabase.rpc("genera_lezioni", { p_giorni: 28 });
  const nuovi = data?.length ?? 0;
  const saltati = righe.length - nuovi;
  esito(
    "ok",
    `${nuovi === 1 ? "1 orario aggiunto" : `${nuovi} orari aggiunti`}${saltati > 0 ? ` (${saltati} c'erano già)` : ""} e lezioni create in calendario.`,
    pagina,
  );
}

// Personalizzazioni di un singolo orario
export async function aggiornaOrario(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "id");
  const pagina = `/admin/corsi/orari/${id}`;
  const giorno = Number(testo(formData, "giorno_settimana"));
  const oraInizio = testo(formData, "ora_inizio");
  const durata = Number(testo(formData, "durata_minuti"));
  const capTesto = testo(formData, "capienza");
  const capienza = capTesto ? Number(capTesto) : null;
  const corsieTesto = testo(formData, "corsie");
  const corsie = corsieTesto ? Number(corsieTesto) : null;
  const scadenza = leggiScadenza(formData, false);

  if (!(giorno >= 1 && giorno <= 7) || !ORA.test(oraInizio)) esito("errore", "Giorno o ora non validi.", pagina);
  if (!(durata >= 15 && durata <= 240)) esito("errore", "Durata non valida (da 15 a 240 minuti).", pagina);
  if (capienza !== null && !(Number.isInteger(capienza) && capienza > 0 && capienza <= 500)) esito("errore", "Posti non validi.", pagina);
  if (corsie !== null && !(Number.isInteger(corsie) && corsie >= 1 && corsie <= 10)) esito("errore", "Corsie non valide.", pagina);
  if (!scadenza) esito("errore", "Scadenza non valida.", pagina);

  // Giorno o ora diversi: lo spostiamo (le lezioni future si rifanno al nuovo orario)
  const { data: prima } = await supabase.from("orari_corso").select("giorno_settimana, ora_inizio").eq("id", id).maybeSingle();
  if (!prima) esito("errore", "Orario non trovato.", PAGINA);
  let avvisati = 0;
  if (prima.giorno_settimana !== giorno || String(prima.ora_inizio).slice(0, 5) !== oraInizio) {
    const { data, error } = await supabase.rpc("sposta_orario", { p_orario: id, p_giorno: giorno, p_ora: oraInizio, p_durata: durata });
    if (error) esito("errore", messaggioDb(error, "Spostamento non riuscito."), pagina);
    avvisati = Number(data ?? 0);
  }

  const { error } = await supabase.from("orari_corso").update({ durata_minuti: durata, capienza, corsie, ...scadenza }).eq("id", id);
  if (error) esito("errore", messaggioDb(error, "Salvataggio non riuscito."), pagina);
  esito(
    "ok",
    avvisati > 0
      ? `Orario spostato e aggiornato: ${avvisati} prenotati avvisati del cambio.`
      : "Orario aggiornato: le sue lezioni in calendario si sono aggiornate.",
    pagina,
  );
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

// Elimina un orario: le lezioni future si annullano (avvisando i prenotati),
// quelle passate restano nello storico
export async function eliminaOrario(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "id");
  const { data: o } = await supabase.from("orari_corso").select("corso_id").eq("id", id).maybeSingle();
  const pagina = `/admin/corsi/orari/${id}`;
  if (!o) esito("errore", "Orario non trovato.");
  if (testo(formData, "conferma") !== "si") esito("errore", "Spunta la conferma per eliminare l'orario.", pagina);

  const { data, error } = await supabase.rpc("elimina_orario", { p_orario: id });
  if (error) esito("errore", messaggioDb(error, "Eliminazione non riuscita."), pagina);
  const n = Number(data ?? 0);
  esito("ok", `Orario eliminato${n > 0 ? `: ${n} prenotati avvisati` : ""}.`, `${PAGINA}?corso=${o.corso_id}#corso-${o.corso_id}`);
}
