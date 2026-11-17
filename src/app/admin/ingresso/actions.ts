"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { richiediStaff } from "@/lib/sessione";
import { messaggioDb } from "@/lib/errori";
import { testo } from "@/lib/formato";
import { ESITI, type EsitoIngresso } from "@/lib/ingresso";

// Chiamata dal lettore (fotocamera, lettore USB, NFC): tutti i controlli li fa il database
export async function registraIngresso(codice: string, forza = false): Promise<EsitoIngresso | { errore: string }> {
  const { supabase } = await richiediStaff();
  const pulito = String(codice ?? "").trim().slice(0, 120);
  if (pulito.length < 4) return { errore: "Codice troppo corto: riprova." };

  const { data, error } = await supabase.rpc("registra_ingresso", { p_codice: pulito, p_forza: forza });
  if (error) return { errore: messaggioDb(error, "Lettura non riuscita, riprova.") };
  revalidatePath("/admin/ingresso");
  return data as EsitoIngresso;
}

// Dalla scheda utente: "ha dimenticato QR e tessera"
export async function ingressoManuale(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "utente_id");
  const pagina = `/admin/utenti/${id}`;
  const { data: u } = await supabase.from("profili").select("codice_ingresso").eq("id", id).maybeSingle();
  if (!u?.codice_ingresso) redirect(`${pagina}?errore=${encodeURIComponent("Codice di ingresso mancante: esegui lo script 0013.")}`);

  const { data, error } = await supabase.rpc("registra_ingresso", { p_codice: u.codice_ingresso, p_forza: formData.get("forza") === "on" });
  if (error) redirect(`${pagina}?errore=${encodeURIComponent(messaggioDb(error, "Ingresso non registrato."))}`);
  const r = data as EsitoIngresso;
  const testoEsito = `${ESITI[r.esito].icona} ${ESITI[r.esito].titolo}${r.messaggi.length ? `: ${r.messaggi.join(" · ")}` : ""}`;
  redirect(`${pagina}?${r.esito === "negato" ? "errore" : "ok"}=${encodeURIComponent(testoEsito)}`);
}

// Collega o scollega la tessera / il braccialetto (numero letto dal lettore)
export async function assegnaTessera(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "utente_id");
  const pagina = `/admin/utenti/${id}`;
  const codice = testo(formData, "tessera");
  const { error } = await supabase.rpc("assegna_tessera", { p_utente: id, p_codice: codice });
  if (error) redirect(`${pagina}?errore=${encodeURIComponent(messaggioDb(error, "Tessera non salvata."))}`);
  redirect(`${pagina}?ok=${encodeURIComponent(codice ? "Tessera collegata." : "Tessera scollegata.")}`);
}

// Nuovo QR: quello vecchio smette subito di funzionare
export async function rigeneraQrUtente(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "utente_id");
  const pagina = `/admin/utenti/${id}`;
  const { error } = await supabase.rpc("rigenera_codice_ingresso", { p_utente: id });
  if (error) redirect(`${pagina}?errore=${encodeURIComponent(messaggioDb(error, "Operazione non riuscita."))}`);
  redirect(`${pagina}?ok=${encodeURIComponent("Nuovo QR creato: quello vecchio non funziona più.")}`);
}
