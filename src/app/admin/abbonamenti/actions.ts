"use server";

import { redirect } from "next/navigation";
import { richiediStaff } from "@/lib/sessione";
import { leggiImporto, testo } from "@/lib/formato";
import { leggiPagamento } from "@/lib/pagamenti";
import { messaggioDb } from "@/lib/errori";

function errore(percorso: string, messaggio: string): never {
  const sep = percorso.includes("?") ? "&" : "?";
  redirect(`${percorso}${sep}errore=${encodeURIComponent(messaggio)}`);
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function creaAbbonamento(formData: FormData) {
  const { supabase } = await richiediStaff();
  const corsoId = testo(formData, "corso_id");
  const pagina = `/admin/abbonamenti/nuovo${corsoId ? `?corso=${corsoId}` : ""}`;

  const utenteId = testo(formData, "utente_id");
  const tipo = testo(formData, "tipo");
  const dataInizio = testo(formData, "data_inizio");
  const dataFine = testo(formData, "data_fine");
  const note = testo(formData, "note") || null;
  const pagareEntro = DATA.test(testo(formData, "pagare_entro")) ? testo(formData, "pagare_entro") : null; // vuoto = il primo giorno
  const prezzoScritto = testo(formData, "prezzo");
  const prezzo = prezzoScritto ? leggiImporto(prezzoScritto) : null;
  // Paga subito? Solo se ha scritto un importo
  const pagamento = testo(formData, "importo") ? leggiPagamento(formData) : null;
  const orariScelti = [...new Set(formData.getAll("orari").map(String))];

  const { data: corso } = await supabase.from("corsi").select("id, nome, giorni_abbonamento").eq("id", corsoId).maybeSingle();
  if (!corso) errore(pagina, "Scegli il corso.");
  const quanti = corso.giorni_abbonamento as number;

  if (!utenteId || !tipo) errore(pagina, "Scegli il cliente e scrivi il tipo di abbonamento.");
  if (!DATA.test(dataInizio) || !DATA.test(dataFine)) errore(pagina, "Date non valide.");
  if (dataFine < dataInizio) errore(pagina, "La data di fine viene prima di quella di inizio.");
  if (prezzo === null) errore(pagina, "Scrivi il prezzo dell'abbonamento: serve per sapere quando è saldato.");
  if (pagamento && "errore" in pagamento) errore(pagina, pagamento.errore);
  if (orariScelti.length !== quanti) {
    errore(pagina, `Per ${corso.nome} devi scegliere ${quanti === 1 ? "1 orario" : `${quanti} orari`} settimanali (ora: ${orariScelti.length}).`);
  }

  // Controllo sul database: orari attivi, dello stesso corso, uno per giorno
  const { data: orari } = await supabase
    .from("orari_corso")
    .select("id, giorno_settimana, corso_id")
    .in("id", orariScelti)
    .eq("attivo", true);
  if (!orari || orari.length !== orariScelti.length) errore(pagina, "Uno degli orari scelti non è più disponibile.");
  if (orari.some((o: { corso_id: string }) => o.corso_id !== corsoId)) errore(pagina, "Gli orari devono essere tutti dello stesso corso.");
  if (new Set(orari.map((o: { giorno_settimana: number }) => o.giorno_settimana)).size !== orari.length) {
    errore(pagina, "Scegli al massimo un orario per giorno.");
  }

  const { data: nuovo, error } = await supabase
    .from("abbonamenti")
    .insert({ utente_id: utenteId, tipo, data_inizio: dataInizio, data_fine: dataFine, note, prezzo, pagare_entro: pagareEntro })
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

  // Riserviamo subito i posti nelle lezioni già in calendario
  // (senza aspettare il giro notturno del database)
  const { error: erroreCalendario } = await supabase.rpc("genera_lezioni", { p_giorni: 28 });
  const messaggio = erroreCalendario
    ? "Abbonamento creato. I posti verranno riservati stanotte in automatico."
    : "Abbonamento creato e posti riservati nelle prossime lezioni.";

  if (pagamento && !("errore" in pagamento)) {
    const { data: idPagamento, error: errorePagamento } = await supabase.rpc("registra_pagamento", {
      p_utente: null,
      p_intestatario: null,
      p_abbonamento: nuovo.id,
      p_descrizione: null,
      p_importo: pagamento.importo,
      p_metodo: pagamento.metodo,
      p_data: pagamento.data,
      p_note: pagamento.note,
    });
    if (errorePagamento || !idPagamento) {
      errore(`/admin/abbonamenti/${nuovo.id}`, `${messaggio} Il pagamento però non è stato registrato: ${messaggioDb(errorePagamento, "riprova qui.")}`);
    }
    redirect(`/ricevuta/${idPagamento}?torna=${encodeURIComponent(`/admin/abbonamenti/${nuovo.id}`)}&nuova=1`);
  }

  redirect(`/admin/abbonamenti/${nuovo.id}?ok=${encodeURIComponent(messaggio)}`);
}

const RITORNI_CAMBIO = ["/admin", "/admin/abbonamenti"];

// Lo staff cambia direttamente uno dei 2 giorni fissi
export async function cambiaGiorno(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "abbonamento_id");
  const pagina = `/admin/abbonamenti/${id}`;
  const { error } = await supabase.rpc("cambia_orario_abbonamento", {
    p_abbonamento: id,
    p_vecchio: testo(formData, "vecchio"),
    p_nuovo: testo(formData, "nuovo"),
  });
  if (error) errore(pagina, messaggioDb(error, "Cambio non riuscito."));
  redirect(`${pagina}?ok=${encodeURIComponent("Giorno cambiato: i posti sono stati spostati sul nuovo orario.")}`);
}

// Approva o rifiuta la richiesta di un cliente
export async function gestisciRichiesta(formData: FormData) {
  const { supabase } = await richiediStaff();
  const approva = testo(formData, "esito") === "approva";
  const tornaScritto = testo(formData, "torna");
  const torna = RITORNI_CAMBIO.includes(tornaScritto) || /^\/admin\/abbonamenti\/[0-9a-f-]{36}$/.test(tornaScritto) ? tornaScritto : "/admin";

  const { error } = await supabase.rpc("gestisci_richiesta", {
    p_richiesta: testo(formData, "richiesta_id"),
    p_approva: approva,
    p_risposta: testo(formData, "risposta"),
  });
  if (error) errore(torna, messaggioDb(error, "Operazione non riuscita."));
  redirect(`${torna}?ok=${encodeURIComponent(approva ? "Cambio approvato: il cliente è stato avvisato." : "Richiesta rifiutata: il cliente è stato avvisato.")}`);
}
